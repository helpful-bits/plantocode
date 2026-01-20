// SERVER RELAY ONLY - NO PERSISTENCE
// The server acts as a transparent relay for device-link events including
// "history-state-changed". All history state is stored on the desktop client;
// the server maintains zero persistence and simply forwards messages between
// connected devices.

use actix::prelude::*;
use actix_web_actors::{ws, ws::Message, ws::CloseCode, ws::CloseReason};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use serde::{Deserialize, Serialize};

use crate::db::repositories::device_repository::{DeviceRepository, HeartbeatRequest};
use crate::error::AppError;
use crate::services::apns_service::ApnsService;
use crate::services::device_connection_manager::{DeviceConnectionManager, DeviceMessage};
use crate::services::pending_command_queue::queue;
use crate::services::relay_session_store::RelaySessionStore;
use sqlx::types::BigDecimal;
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPayload {
    pub device_id: String,
    #[serde(default)]
    pub device_name: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub resume_token: Option<String>,
    #[serde(default)]
    pub last_event_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    #[serde(default)]
    pub payload: Option<RegisterPayload>,
    #[serde(flatten)]
    pub root_payload: Option<RegisterPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequestPayload {
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: JsonValue,
    #[serde(default)]
    pub idempotency_key: Option<String>,
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequestMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: RpcRequestPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcResponsePayload {
    pub id: String,
    #[serde(default)]
    pub result: Option<JsonValue>,
    #[serde(default)]
    pub error: Option<JsonValue>,
    #[serde(default = "default_true")]
    pub is_final: bool,
    #[serde(default)]
    pub client_id: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcResponseMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: RpcResponsePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub code: String,
    pub message: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl ErrorMessage {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            message_type: "error".to_string(),
            code: code.to_string(),
            message: message.to_string(),
            timestamp: chrono::Utc::now(),
        }
    }
}

/// How often heartbeat pings are sent
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

/// How long before lack of client response causes a timeout
const CLIENT_TIMEOUT: Duration = Duration::from_secs(60);

lazy_static::lazy_static! {
    static ref BINARY_ROUTE_WARNINGS: Mutex<HashMap<String, Instant>> = Mutex::new(HashMap::new());
}

fn parse_framed_terminal_event(data: &[u8]) -> Option<(&str, &[u8])> {
    if data.len() < 6 {
        return None;
    }
    if &data[0..4] != b"PTC1" {
        return None;
    }
    let session_id_len = u16::from_be_bytes([data[4], data[5]]) as usize;
    if data.len() < 6 + session_id_len {
        return None;
    }
    let session_id_bytes = &data[6..6 + session_id_len];
    let session_id = std::str::from_utf8(session_id_bytes).ok()?;
    Some((session_id, data))
}

fn extract_project_directory(payload: &JsonValue) -> Option<String> {
    payload
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            payload
                .get("job")
                .and_then(|job| job.get("projectDirectory"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
}

fn find_snake_case_key(value: &JsonValue) -> Option<String> {
    fn visit(value: &JsonValue, path: &str) -> Option<String> {
        match value {
            JsonValue::Object(map) => {
                for (key, nested) in map {
                    let next_path = if path.is_empty() {
                        key.to_string()
                    } else {
                        format!("{}.{}", path, key)
                    };
                    if key.contains('_') {
                        return Some(next_path);
                    }
                    if let Some(found) = visit(nested, &next_path) {
                        return Some(found);
                    }
                }
                None
            }
            JsonValue::Array(items) => {
                for (idx, nested) in items.iter().enumerate() {
                    let next_path = if path.is_empty() {
                        format!("[{}]", idx)
                    } else {
                        format!("{}[{}]", path, idx)
                    };
                    if let Some(found) = visit(nested, &next_path) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }

    visit(value, "")
}

/// Token bucket rate limiter for per-connection rate limiting
struct TokenBucket {
    tokens: u32,
    capacity: u32,
    refill_per_sec: u32,
    last_refill: Instant,
}

impl TokenBucket {
    fn new(capacity: u32, refill_per_sec: u32) -> Self {
        Self {
            tokens: capacity,
            capacity,
            refill_per_sec,
            last_refill: Instant::now(),
        }
    }

    fn allow(&mut self) -> bool {
        let elapsed = self.last_refill.elapsed().as_secs();
        if elapsed > 0 {
            let add = (elapsed as u32) * self.refill_per_sec;
            self.tokens = self.tokens.saturating_add(add).min(self.capacity);
            self.last_refill = Instant::now();
        }
        if self.tokens > 0 {
            self.tokens -= 1;
            true
        } else {
            false
        }
    }
}

/// WebSocket actor for device communication
pub struct DeviceLinkWs {
    /// Unique identifier for this WebSocket connection
    pub connection_id: Uuid,
    /// User ID (extracted from JWT)
    pub user_id: Option<Uuid>,
    /// Device ID (set during registration)
    pub device_id: Option<String>,
    /// Device name
    pub device_name: Option<String>,
    /// Client type (desktop, mobile, etc.)
    pub client_type: Option<String>,
    /// Session ID for relay session management
    pub session_id: Option<String>,
    /// Resume token for session resumption
    pub resume_token: Option<String>,
    /// Session expiration timestamp
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Last heartbeat time
    pub last_heartbeat: Instant,
    /// Connection manager reference
    pub connection_manager: Option<actix_web::web::Data<DeviceConnectionManager>>,
    /// Device repository reference
    pub device_repository: Option<actix_web::web::Data<DeviceRepository>>,
    /// Relay session store reference
    pub relay_store: Option<actix_web::web::Data<RelaySessionStore>>,
    /// APNS service for push notifications
    pub apns_service: Option<actix_web::web::Data<ApnsService>>,
    /// Per-connection rate limiter
    pub rate: TokenBucket,
}

impl DeviceLinkWs {
    pub fn new() -> Self {
        Self {
            connection_id: Uuid::new_v4(),
            user_id: None,
            device_id: None,
            device_name: None,
            client_type: None,
            session_id: None,
            resume_token: None,
            expires_at: None,
            last_heartbeat: Instant::now(),
            connection_manager: None,
            device_repository: None,
            relay_store: None,
            apns_service: None,
            rate: TokenBucket::new(50, 25),
        }
    }

    /// Start heartbeat process for this connection
    fn start_heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            // Check client heartbeat
            if Instant::now().duration_since(act.last_heartbeat) > CLIENT_TIMEOUT {
                warn!(
                    connection_id = %act.connection_id,
                    user_id = ?act.user_id,
                    device_id = ?act.device_id,
                    "WebSocket client heartbeat failed, disconnecting"
                );
                ctx.stop();
                return;
            }

            ctx.ping(b"heartbeat");
        });
    }

    fn send_error(&self, code: &str, message: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let error = ErrorMessage::new(code, message);
        if let Ok(json) = serde_json::to_string(&error) {
            ctx.text(json);
        }
    }

    /// Parse and handle incoming message
    fn handle_message(&mut self, msg: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let parsed: JsonValue = match serde_json::from_str(msg) {
            Ok(json) => json,
            Err(_) => {
                warn!(
                    connection_id = %self.connection_id,
                    "Failed to parse WebSocket message"
                );
                self.send_error("invalidJson", "Invalid JSON format", ctx);
                return;
            }
        };

        if let Some(path) = find_snake_case_key(&parsed) {
            warn!(
                connection_id = %self.connection_id,
                user_id = ?self.user_id,
                device_id = ?self.device_id,
                offending_key = %path,
                "Rejecting message with snake_case keys"
            );
            self.send_error("invalidPayload", "Payload keys must be camelCase", ctx);
            return;
        }

        let message_type = parsed
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        debug!(
            connection_id = %self.connection_id,
            message_type = %message_type,
            user_id = ?self.user_id,
            device_id = ?self.device_id,
            "Received WebSocket message"
        );

        let addr = ctx.address();

        match message_type {
            "register" => {
                let msg = HandleRegisterMessage { payload: parsed };
                addr.do_send(msg);
            }
            "heartbeat" => {
                let msg = HandleHeartbeatMessage { payload: parsed };
                addr.do_send(msg);
            }
            "ping" => {
                debug!(
                    connection_id = %self.connection_id,
                    log_stage = "ws:client_ping",
                    "Received ping message from client"
                );
                let pong = serde_json::json!({ "type": "pong" });
                ctx.text(pong.to_string());
            }
            "pong" => {
                debug!(
                    connection_id = %self.connection_id,
                    log_stage = "ws:client_pong",
                    "Received pong message from client"
                );
            }
            "rpc.request" => {
                let msg = HandleRpcRequestInternal { payload: parsed };
                addr.do_send(msg);
            }
            "rpc.response" => {
                let msg = HandleRpcResponseMessage { payload: parsed };
                addr.do_send(msg);
            }
            "event" => {
                let msg = HandleEventMessage { payload: parsed };
                addr.do_send(msg);
            }
            "event-ack" => {
                let last_event_id = parsed
                    .get("payload")
                    .and_then(|v| v.get("lastEventId"))
                    .and_then(|v| v.as_u64());

                if let (Some(event_id), Some(user_id), Some(device_id), Some(connection_manager)) =
                    (last_event_id, self.user_id, self.device_id.as_deref(), &self.connection_manager)
                {
                    connection_manager.update_last_event_ack(&user_id, device_id, event_id);
                }
            }
            "terminal.binary.bind" => {
                let msg = HandleTerminalBinaryBind { payload: parsed };
                addr.do_send(msg);
            }
            "terminal.binary.unbind" => {
                let msg = HandleTerminalBinaryUnbind { payload: parsed };
                addr.do_send(msg);
            }
            _ => {
                warn!(
                    connection_id = %self.connection_id,
                    message_type = %message_type,
                    "Unknown message type received"
                );
                self.send_error("unknownMessageType", &format!("Unknown message type: {}", message_type), ctx);
            }
        }
    }
}

impl Default for DeviceLinkWs {
    fn default() -> Self {
        Self::new()
    }
}

impl Actor for DeviceLinkWs {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        info!(
            connection_id = %self.connection_id,
            user_id = ?self.user_id,
            "WebSocket connection started for user"
        );
        self.start_heartbeat(ctx);
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        info!(
            connection_id = %self.connection_id,
            user_id = ?self.user_id,
            device_id = ?self.device_id,
            "WebSocket connection stopped for user"
        );

        // STEP 1: Preserve relay session across disconnects
        // Session will be cleaned up by TTL expiration if not resumed
        // relay_store.invalidate_session() is NO LONGER called here

        // Set device offline
        if let (Some(device_id), Some(device_repo)) = (&self.device_id, &self.device_repository) {
            if let Ok(device_uuid) = Uuid::parse_str(device_id) {
                let device_repo_clone = device_repo.clone();
                actix::spawn(async move {
                    if let Err(e) = device_repo_clone.set_offline(&device_uuid).await {
                        warn!("Failed to set device offline: {}", e);
                    }
                });
            }
        }

        // Broadcast device-status disconnected event before cleanup
        if let (Some(user_id), Some(device_id), Some(connection_manager)) =
            (self.user_id, &self.device_id, &self.connection_manager)
        {
            let status_payload = serde_json::json!({
                "deviceId": device_id,
                "status": "disconnected",
                "reason": "ws_closed"
            });

            let device_message = DeviceMessage {
                message_type: "event".to_string(),
                payload: serde_json::json!({
                    "eventType": "device-status",
                    "payload": status_payload
                }),
                event_id: None,
                target_device_id: None,
                source_device_id: Some(device_id.clone()),
                timestamp: chrono::Utc::now(),
            };

            let cm = connection_manager.clone();
            let uid = user_id;
            let src_dev = Some(device_id.clone());

            actix::spawn(async move {
                match cm.broadcast_to_user_excluding(&uid, device_message, src_dev.as_deref()).await {
                    Ok(count) => {
                        info!(
                            user_id = %uid,
                            device_id = %src_dev.as_deref().unwrap_or("unknown"),
                            devices_reached = count,
                            "Broadcasted device-status:disconnected event"
                        );
                    }
                    Err(e) => {
                        warn!(
                            user_id = %uid,
                            error = %e,
                            "Failed to broadcast device-status disconnected event"
                        );
                    }
                }
            });
        }

        // Clean up connection from manager
        // Pass connection_id to prevent race condition where new connection gets removed
        if let (Some(user_id), Some(device_id), Some(connection_manager)) =
            (self.user_id, &self.device_id, &self.connection_manager)
        {
            connection_manager.remove_connection(&self.connection_id, &user_id, device_id);
        }
    }
}

/// Message for relaying data to the WebSocket client
#[derive(Message)]
#[rtype(result = "()")]
pub struct RelayMessage {
    pub message: String,
}

/// Message for relaying binary data to the WebSocket client (for terminal I/O)
#[derive(Message)]
#[rtype(result = "()")]
pub struct BinaryMessage {
    pub data: Vec<u8>,
}

/// Message to gracefully close the WebSocket connection
#[derive(Message)]
#[rtype(result = "()")]
pub struct CloseConnection;

impl Handler<RelayMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: RelayMessage, ctx: &mut Self::Context) {
        debug!(
            connection_id = %self.connection_id,
            user_id = ?self.user_id,
            device_id = ?self.device_id,
            log_stage = "relay:send",
            "Delivering relay message to client"
        );

        if let Ok(obj) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&msg.message) {
            if !obj.contains_key("type") {
                warn!(
                    connection_id = %self.connection_id,
                    log_stage = "relay:invalid_message",
                    "Rejecting message without type field"
                );
                let error = ErrorMessage::new("invalid_message", "Message must have a type field");
                if let Ok(json) = serde_json::to_string(&error) {
                    ctx.text(json);
                }
                return;
            }
            ctx.text(msg.message);
        } else {
            warn!(
                connection_id = %self.connection_id,
                log_stage = "relay:invalid_json",
                "Rejecting invalid JSON in relay message"
            );
            let error = ErrorMessage::new("invalid_json", "Invalid JSON in relay message");
            if let Ok(json) = serde_json::to_string(&error) {
                ctx.text(json);
            }
        }
    }
}

impl Handler<BinaryMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: BinaryMessage, ctx: &mut Self::Context) {
        ctx.binary(msg.data);
    }
}

impl Handler<CloseConnection> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, _msg: CloseConnection, ctx: &mut Self::Context) {
        info!(
            connection_id = %self.connection_id,
            user_id = ?self.user_id,
            device_id = ?self.device_id,
            "Closing WebSocket connection due to new connection from same device"
        );
        ctx.close(None);
        ctx.stop();
    }
}

impl StreamHandler<Result<Message, ws::ProtocolError>> for DeviceLinkWs {
    fn handle(&mut self, msg: Result<Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(Message::Ping(msg)) => {
                self.last_heartbeat = Instant::now();
                ctx.pong(&msg);
            }
            Ok(Message::Pong(_)) => {
                self.last_heartbeat = Instant::now();
            }
            Ok(Message::Text(text)) => {
                self.last_heartbeat = Instant::now();

                // Check rate limit before processing
                if !self.rate.allow() {
                    warn!(
                        connection_id = %self.connection_id,
                        user_id = ?self.user_id,
                        device_id = ?self.device_id,
                        "Rate limit exceeded; dropping message"
                    );
                    return;
                }

                // Handle the message asynchronously
                let addr = ctx.address();
                addr.do_send(HandleTextMessage {
                    text: text.to_string(),
                });
            }
            Ok(Message::Binary(bin)) => {
                self.last_heartbeat = Instant::now();

                if let (Some(user_id), Some(device_id), Some(connection_manager)) =
                    (self.user_id.as_ref(), self.device_id.as_deref(), &self.connection_manager) {

                    let parsed = parse_framed_terminal_event(&bin);
                    if parsed.is_none() {
                        return;
                    }
                    let (session_id, frame) = parsed.unwrap();

                    if let Some(target) = connection_manager.get_binary_consumer_for_session(user_id, device_id, session_id) {
                        let _ = connection_manager.send_binary_to_device(user_id, &target, frame.to_vec());
                    } else {
                        let should_warn = {
                            let mut warnings = BINARY_ROUTE_WARNINGS.lock().unwrap();
                            let now = Instant::now();
                            let key = format!("{}:{}", device_id, session_id);
                            let last_warn = warnings.get(&key);

                            match last_warn {
                                Some(last) if now.duration_since(*last) < Duration::from_secs(60) => false,
                                _ => {
                                    warnings.insert(key, now);
                                    true
                                }
                            }
                        };

                        if should_warn {
                            warn!(
                                producer = %device_id,
                                user_id = %user_id,
                                session_id = %session_id,
                                len = bin.len(),
                                "No binary consumer found for producer={}, session={}, user={}",
                                device_id, session_id, user_id
                            );
                        }
                    }
                }
            }
            Ok(Message::Close(reason)) => {
                if self.device_id.is_some() && self.user_id.is_none() {
                    warn!(
                        connection_id = %self.connection_id,
                        log_stage = "register:aborted_before_response",
                        "Connection closed before completing registration"
                    );
                }
                info!(
                    connection_id = %self.connection_id,
                    reason = ?reason,
                    "WebSocket close message received"
                );
                ctx.stop();
            }
            Err(e) => {
                error!(
                    connection_id = %self.connection_id,
                    error = %e,
                    "WebSocket protocol error"
                );
                ctx.stop();
            }
            _ => {}
        }
    }
}

/// Internal message for handling text messages asynchronously
#[derive(Message)]
#[rtype(result = "()")]
struct HandleTextMessage {
    text: String,
}

/// Internal messages for handling different message types asynchronously
#[derive(Message)]
#[rtype(result = "()")]
struct HandleRegisterMessage {
    payload: JsonValue,
}

#[derive(Message)]
#[rtype(result = "()")]
struct HandleHeartbeatMessage {
    payload: JsonValue,
}

#[derive(Message)]
#[rtype(result = "()")]
struct HandleRpcRequestInternal {
    payload: JsonValue,
}

#[derive(Message)]
#[rtype(result = "()")]
struct HandleRpcResponseMessage {
    payload: JsonValue,
}

#[derive(Message)]
#[rtype(result = "()")]
struct HandleEventMessage {
    payload: JsonValue,
}

#[derive(Message)]
#[rtype(result = "()")]
struct HandleTerminalBinaryBind {
    payload: JsonValue,
}

#[derive(Message)]
#[rtype(result = "()")]
struct HandleTerminalBinaryUnbind {
    payload: JsonValue,
}

impl Handler<HandleTextMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleTextMessage, ctx: &mut Self::Context) -> Self::Result {
        // Handle the message synchronously
        self.handle_message(&msg.text, ctx);
    }
}

impl Handler<HandleRegisterMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleRegisterMessage, ctx: &mut Self::Context) -> Self::Result {
        // Access payload fields directly (single-level structure)
        let payload = match msg.payload.get("payload").and_then(|v| v.as_object()) {
            Some(p) => p,
            None => {
                warn!(
                    connection_id = %self.connection_id,
                    log_stage = "register:early_return",
                    code = "invalid_payload",
                    "Registration failed: missing payload object"
                );
                self.send_error("invalidPayload", "Missing payload object in register message", ctx);
                return;
            }
        };

        // STEP 1.1: Log registration start
        info!(
            connection_id = %self.connection_id,
            user_id = ?self.user_id,
            has_device_id = %payload.get("deviceId").is_some(),
            log_stage = "register:begin",
            "Starting device registration"
        );

        // Extract what we need from the payload
        let device_id = match payload.get("deviceId").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => {
                // STEP 1.8: Log early return for missing device_id
                warn!(
                    connection_id = %self.connection_id,
                    log_stage = "register:early_return",
                    code = "missing_device_id",
                    "Registration failed: missing deviceId"
                );
                // STEP 3.2: Send proper error with message field
                self.send_error("missingDeviceId", "Device ID is required", ctx);
                // STEP 3.4: Explicit return after error
                return;
            }
        };
        let normalized_device_id = device_id.to_lowercase();

        let device_name = payload
            .get("deviceName")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Device")
            .to_string();

        // STEP 1.2: Log payload extraction (avoiding PII)
        debug!(
            connection_id = %self.connection_id,
            has_device_id = true,
            has_device_name = !device_name.is_empty(),
            log_stage = "register:payload_extracted",
            "Registration payload extracted"
        );

        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                // STEP 1.8: Log early return for missing user_id
                warn!(
                    connection_id = %self.connection_id,
                    log_stage = "register:early_return",
                    code = "auth_required",
                    "Registration failed: authentication required"
                );
                // STEP 3.3: Send proper error with message field
                self.send_error("authRequired", "Authentication required", ctx);
                // STEP 3.4: Explicit return after error
                return;
            }
        };

        // Device ownership validation
        if let Some(device_repo) = &self.device_repository {
            let device_uuid = match Uuid::parse_str(&device_id) {
                Ok(id) => id,
                Err(_) => {
                    warn!(
                        connection_id = %self.connection_id,
                        log_stage = "register:early_return",
                        code = "invalid_device_id",
                        "Registration failed: invalid device ID format"
                    );
                    self.send_error("invalidDeviceId", "Invalid device ID format", ctx);
                    return;
                }
            };

            let device_repo_clone = device_repo.clone();
            let device_id_str = device_id.clone();
            let addr = ctx.address();
            let connection_id = self.connection_id;

            ctx.spawn(
                async move {
                    match device_repo_clone.get_device_by_id(&device_uuid).await {
                        Ok(device) => {
                            if device.user_id != user_id {
                                error!(
                                    connection_id = %connection_id,
                                    user_id = %user_id,
                                    device_id = %device_id_str,
                                    actual_owner = %device.user_id,
                                    log_stage = "register:validation_failed",
                                    "Device ownership mismatch"
                                );
                                addr.do_send(RelayMessage {
                                    message: serde_json::json!({
                                        "type": "error",
                                        "code": "deviceOwnershipFailed",
                                        "message": "Device does not belong to authenticated user",
                                        "timestamp": chrono::Utc::now()
                                    })
                                    .to_string(),
                                });
                            } else {
                                debug!(
                                    connection_id = %connection_id,
                                    user_id = %user_id,
                                    device_id = %device_id_str,
                                    log_stage = "register:validation_passed",
                                    "Device ownership validated"
                                );
                            }
                        }
                        Err(AppError::NotFound(_)) => {
                            debug!(
                                connection_id = %connection_id,
                                user_id = %user_id,
                                device_id = %device_id_str,
                                log_stage = "register:validation_new_device_ok",
                                "Device not found; treating as new device"
                            );
                        }
                        Err(e) => {
                            error!(
                                connection_id = %connection_id,
                                user_id = %user_id,
                                device_id = %device_id_str,
                                %e,
                                log_stage = "register:validation_db_error",
                                "Database error during device validation"
                            );
                            addr.do_send(RelayMessage {
                                message: serde_json::json!({
                                    "type": "error",
                                    "code": "validation_db_error",
                                    "message": "Failed to validate device ownership",
                                    "timestamp": chrono::Utc::now()
                                })
                                .to_string(),
                            });
                        }
                    }
                }
                .into_actor(self),
            );
        }

        // Check for resume attempt
        let resume_session_id = payload.get("sessionId").and_then(|v| v.as_str());
        let resume_token_param = payload.get("resumeToken").and_then(|v| v.as_str());
        let last_event_id = payload.get("lastEventId").and_then(|v| v.as_u64()).unwrap_or(0);

        // Track whether session was resumed for consolidated response
        let mut was_resumed = false;
        if let (Some(sid), Some(token), Some(relay_store)) =
            (resume_session_id, resume_token_param, &self.relay_store)
        {
            // STEP 1.3: Log resume attempt
            debug!(
                connection_id = %self.connection_id,
                user_id = %user_id,
                session_id_truncated = %&sid[..sid.len().min(8)],
                log_stage = "register:resume_attempt",
                "Attempting to resume existing session"
            );

            // Attempt to resume existing session
            if let Some(expires_at) = relay_store.validate_resume(&user_id, &normalized_device_id, sid, token)
            {
                // Resume successful - store session metadata
                self.session_id = Some(sid.to_string());
                self.resume_token = Some(token.to_string());
                self.expires_at = Some(expires_at);

                // STEP 1.4: Log successful resume
                info!(
                    connection_id = %self.connection_id,
                    user_id = %user_id,
                    device_id = %device_id,
                    session_id_truncated = %&sid[..sid.len().min(8)],
                    log_stage = "register:session_resumed",
                    "Device session resumed successfully"
                );
                was_resumed = true;
            } else {
                // Resume failed - send explicit error and require fresh registration
                warn!(
                    connection_id = %self.connection_id,
                    user_id = %user_id,
                    device_id = %device_id,
                    log_stage = "register:resume_failed",
                    "Session resume failed, sending error and awaiting re-registration"
                );
                self.send_error("invalidResume", "Session resume failed, please re-register", ctx);
                self.session_id = None;
                self.resume_token = None;
                self.expires_at = None;
                return;
            }
        } else {
            // Normal registration flow - create new session
            if let Some(relay_store) = &self.relay_store {
                let (session_id, resume_token, expires_at) =
                    relay_store.create_session(&user_id, &normalized_device_id);
                self.session_id = Some(session_id);
                self.resume_token = Some(resume_token);
                self.expires_at = Some(expires_at);

                // STEP 1.6: Log session creation in normal path
                info!(
                    connection_id = %self.connection_id,
                    user_id = %user_id,
                    device_id = %device_id,
                    log_stage = "register:session_created",
                    "New session created for device"
                );
            } else {
                warn!(
                    connection_id = %self.connection_id,
                    user_id = %user_id,
                    "Relay store unavailable, proceeding without session"
                );
            }
        };

        info!(
            connection_id = %self.connection_id,
            user_id = %user_id,
            device_id = %device_id,
            log_stage = "register:pre_response",
            "Preparing registration response"
        );

        // Normalize device_id to lowercase for consistent lookups
        self.device_id = Some(normalized_device_id.clone());
        self.device_name = Some(device_name.clone());

        // Set device online (device should already be registered via HTTP)
        if let Some(device_repo) = &self.device_repository {
            if let Ok(device_uuid) = Uuid::parse_str(&device_id) {
                let device_repo_clone = device_repo.clone();
                ctx.spawn(
                    async move {
                        // Just set online - HTTP registration already happened with correct device info
                        if let Err(e) = device_repo_clone.set_online(&device_uuid).await {
                            warn!("Failed to set device online: {}", e);
                        }
                    }
                    .into_actor(self),
                );
            }
        }

        info!(
            connection_id = %self.connection_id,
            user_id = %user_id,
            device_id = %device_id,
            device_name = %device_name,
            session_id = ?self.session_id,
            "Device registered via WebSocket"
        );

        // Send consolidated registration response
        let response = if was_resumed {
            // For resumed sessions, send "resumed" type with session_id and expires_at
            if let (Some(session_id), Some(expires_at)) = (&self.session_id, &self.expires_at) {
                serde_json::json!({
                    "type": "resumed",
                    "sessionId": session_id,
                    "expiresAt": expires_at.to_rfc3339()
                })
            } else {
                // Fallback if session data missing (shouldn't happen)
                serde_json::json!({
                    "type": "registered"
                })
            }
        } else {
            // For new sessions, send "registered" type with credentials
            if let (Some(session_id), Some(resume_token), Some(expires_at)) =
                (&self.session_id, &self.resume_token, &self.expires_at)
            {
                serde_json::json!({
                    "type": "registered",
                    "sessionId": session_id,
                    "resumeToken": resume_token,
                    "expiresAt": expires_at.to_rfc3339()
                })
            } else {
                // Fallback for when relay_store was unavailable
                serde_json::json!({
                    "type": "registered"
                })
            }
        };

        debug!(
            connection_id = %self.connection_id,
            user_id = %user_id,
            device_id = %device_id,
            log_stage = "register:about_to_send",
            "About to serialize and send registration response"
        );

        let payload = match serde_json::to_string(&response) {
            Ok(payload) => payload,
            Err(err) => {
                error!(
                    connection_id = %self.connection_id,
                    user_id = %user_id,
                    device_id = %device_id,
                    code = "register_response_serialize_failed",
                    %err,
                    log_stage = "register:response_serialize_failed",
                    "Failed to serialize registration response"
                );

                self.send_error(
                    "serializationError",
                    "Failed to serialize registration response",
                    ctx,
                );
                return;
            }
        };

        info!(
            connection_id = %self.connection_id,
            user_id = %user_id,
            device_id = %device_id,
            log_stage = "register:response_enqueued",
            "Enqueuing registration response via RelayMessage"
        );

        ctx.address().do_send(RelayMessage {
            message: payload.clone(),
        });

        // Register with connection manager
        // STEP 3.6: Handle connection_manager failure gracefully
        if let Some(connection_manager) = &self.connection_manager {
            // Normalize UUID to lowercase for consistent lookups
            let normalized_device_id = device_id.to_lowercase();
            let mapped_client_type = match self.client_type.as_deref() {
                Some("desktop") => crate::services::device_connection_manager::ClientType::Desktop,
                Some("mobile") => crate::services::device_connection_manager::ClientType::Mobile,
                Some(other) => crate::services::device_connection_manager::ClientType::Other(other.to_string()),
                None => crate::services::device_connection_manager::ClientType::Other("unknown".into()),
            };
            connection_manager.register_connection(
                self.connection_id,
                user_id,
                normalized_device_id.clone(),
                device_name.clone(),
                ctx.address(),
                mapped_client_type,
            );

            // STEP 1.7: Log connection manager registration
            debug!(
                connection_id = %self.connection_id,
                user_id = %user_id,
                device_id = %device_id,
                log_stage = "register:connection_manager_registered",
                "Connection registered with connection manager"
            );

            let cm = connection_manager.clone();
            let uid = user_id;
            let device_id_for_replay = normalized_device_id.clone();
            ctx.spawn(
                async move {
                    let sent = cm
                        .send_buffered_events_since(&uid, &device_id_for_replay, last_event_id)
                        .await;
                    if sent > 0 {
                        info!(
                            user_id = %uid,
                            device_id = %device_id_for_replay,
                            last_event_id = last_event_id,
                            replay_count = sent,
                            "Replayed buffered relay events"
                        );
                    }
                }
                .into_actor(self),
            );

            // Drain pending commands for desktop devices
            if self.client_type.as_deref() == Some("desktop") {
                let key = (user_id.to_string(), normalized_device_id.clone());
                let pending_commands = queue().drain(&key);

                if !pending_commands.is_empty() {
                    info!(
                        user_id = %user_id,
                        device_id = %normalized_device_id,
                        command_count = pending_commands.len(),
                        "Delivering queued commands to desktop that just came online"
                    );

                    let cm_for_queue = connection_manager.clone();
                    let user_id_for_queue = user_id;
                    let device_id_for_queue = normalized_device_id.clone();

                    ctx.spawn(
                        async move {
                            for msg in pending_commands {
                                if let Ok(msg_str) = serde_json::to_string(&msg) {
                                    if let Err(e) = cm_for_queue.send_raw_to_device(
                                        &user_id_for_queue,
                                        &device_id_for_queue,
                                        &msg_str,
                                    ) {
                                        warn!(
                                            user_id = %user_id_for_queue,
                                            device_id = %device_id_for_queue,
                                            error = %e,
                                            "Failed to deliver queued command to desktop"
                                        );
                                    }
                                }
                            }
                        }
                        .into_actor(self),
                    );
                }
            }

            // Send push notification to mobile when desktop comes online
            if self.client_type.as_deref() == Some("desktop") {
                if let Some(apns) = &self.apns_service {
                    let apns_clone = apns.clone();
                    let user_id_for_push = user_id;

                    ctx.spawn(
                        async move {
                            let notification_data = serde_json::json!({
                                "type": "desktop_online",
                                "timestamp": chrono::Utc::now().to_rfc3339()
                            });

                            match apns_clone.send_silent_notification(&user_id_for_push, notification_data).await {
                                Ok(_) => {
                                    debug!(
                                        user_id = %user_id_for_push,
                                        "Sent push notification to mobile about desktop coming online"
                                    );
                                }
                                Err(e) => {
                                    warn!(
                                        user_id = %user_id_for_push,
                                        error = %e,
                                        "Failed to send push notification about desktop online"
                                    );
                                }
                            }
                        }
                        .into_actor(self),
                    );
                }
            }

            // After connection manager registration, broadcast device-status event
            let status_payload = serde_json::json!({
                "deviceId": device_id,
                "status": "online"
            });

            let device_message = DeviceMessage {
                message_type: "event".to_string(),
                payload: serde_json::json!({
                    "eventType": "device-status",
                    "payload": status_payload
                }),
                event_id: None,
                target_device_id: None,
                source_device_id: Some(device_id.clone()),
                timestamp: chrono::Utc::now(),
            };

            let cm = connection_manager.clone();
            let uid = user_id;
            let src_dev = Some(device_id.clone());

            ctx.spawn(
                async move {
                    match cm.broadcast_to_user_excluding(&uid, device_message, src_dev.as_deref()).await {
                        Ok(count) => {
                            info!(
                                user_id = %uid,
                                device_id = %src_dev.as_deref().unwrap_or("unknown"),
                                devices_reached = count,
                                "Broadcasted device-status:online event"
                            );
                        }
                        Err(e) => {
                            warn!(
                                user_id = %uid,
                                error = %e,
                                "Failed to broadcast device-status event"
                            );
                        }
                    }
                }
                .into_actor(self),
            );
        } else {
            error!(
                connection_id = %self.connection_id,
                user_id = %user_id,
                "Connection manager unavailable"
            );
        }
    }
}

impl Handler<HandleHeartbeatMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleHeartbeatMessage, ctx: &mut Self::Context) -> Self::Result {
        let payload = match msg.payload.get("payload").and_then(|v| v.as_object()) {
            Some(p) => p,
            None => {
                self.send_error("invalidPayload", "Missing heartbeat payload object", ctx);
                return;
            }
        };

        // Touch relay session to extend TTL
        if let (Some(session_id), Some(relay_store)) = (&self.session_id, &self.relay_store) {
            relay_store.touch(session_id);
        }

        // Extract and broadcast activeSessionId hint to peers
        if let Some(active_session_id) = payload.get("activeSessionId").and_then(|v| v.as_str()) {
            if !active_session_id.is_empty() {
                if let (Some(user_id), Some(connection_manager)) = (self.user_id, &self.connection_manager) {
                    let hint_msg = DeviceMessage {
                        message_type: "event".to_string(),
                        payload: serde_json::json!({
                            "eventType": "active-session-changed",
                            "payload": { "sessionId": active_session_id }
                        }),
                        event_id: None,
                        target_device_id: None,
                        source_device_id: self.device_id.clone(),
                        timestamp: chrono::Utc::now(),
                    };
                    let cm = connection_manager.clone();
                    let uid = user_id;
                    let src_dev = self.device_id.clone();
                    ctx.spawn(
                        async move {
                            let _ = cm.broadcast_to_user_excluding(&uid, hint_msg, src_dev.as_deref()).await;
                        }
                        .into_actor(self),
                    );
                }
            }
        }

        if let (Some(device_id), Some(device_repo)) = (&self.device_id, &self.device_repository) {
            let heartbeat = HeartbeatRequest {
                cpu_usage: payload
                    .get("cpuUsage")
                    .and_then(|v| v.as_f64())
                    .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
                memory_usage: payload
                    .get("memoryUsage")
                    .and_then(|v| v.as_f64())
                    .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
                disk_space_gb: payload.get("diskSpaceGb").and_then(|v| v.as_i64()),
                active_jobs: payload
                    .get("activeJobs")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32,
                status: payload
                    .get("status")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            };

            if let Ok(device_uuid) = device_id.parse::<Uuid>() {
                let device_repo = device_repo.clone();
                let device_id_str = device_id.clone();
                // Spawn the async database update
                ctx.spawn(
                    async move {
                        if let Err(e) = device_repo.update_heartbeat(&device_uuid, heartbeat).await
                        {
                            warn!(
                                device_id = %device_id_str,
                                error = %e,
                                "Failed to update device heartbeat in database"
                            );
                        }
                    }
                    .into_actor(self),
                );
            }

            // Update last seen in connection manager (this is synchronous)
            if let (Some(user_id), Some(connection_manager)) =
                (self.user_id, &self.connection_manager)
            {
                connection_manager.update_last_seen(&user_id, device_id);
            }
        }

        // Lightweight keepalive response for clients without WS ping visibility
        ctx.text(serde_json::json!({ "type": "pong" }).to_string());
    }
}

/// Expected Message Schemas:
///
/// Mobile → Server (RPC Request):
/// {
///   "type": "rpc.request",
///   "payload": {
///     "id": "<request-id>",
///     "method": "<method-name>",
///     "params": {...},
///     "idempotencyKey": "<optional>"
///   }
/// }
///
/// Server → Desktop (RPC Request):
/// {
///   "type": "rpc.request",
///   "payload": {
///     "clientId": "<mobile-uuid>",
///     "userId": "<user-id>",
///     "id": "<request-id>",
///     "method": "<method-name>",
///     "params": {...},
///     "idempotencyKey": "<optional>"
///   }
/// }
///
/// Desktop → Server (RPC Response):
/// {
///   "type": "rpc.response",
///   "payload": {
///     "clientId": "<mobile-uuid>",
///     "id": "<request-id>",
///     "result": {...} | null,
///     "error": { "code": <int>, "message": "<string>" } | null,
///     "isFinal": true
///   }
/// }
impl Handler<HandleRpcRequestInternal> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleRpcRequestInternal, ctx: &mut Self::Context) -> Self::Result {
        if let (Some(session_id), Some(relay_store)) = (&self.session_id, &self.relay_store) {
            relay_store.touch(session_id);
        }

        let outer = match msg.payload.get("payload").and_then(|v| v.as_object()) {
            Some(obj) => obj,
            None => {
                self.send_error("invalidPayload", "Missing payload object", ctx);
                return;
            }
        };

        let method = match outer.get("method").and_then(|v| v.as_str()) {
            Some(m) if !m.trim().is_empty() => m,
            _ => {
                self.send_error("missingMethod", "Missing or empty method", ctx);
                return;
            }
        };

        let mut params = outer.get("params").cloned().unwrap_or_else(|| serde_json::json!({}));

        let request_id = outer
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let idempotency_key = outer.get("idempotencyKey").cloned();

        if method == "session.syncHistoryState" {
            let params_obj = match params.as_object() {
                Some(obj) => obj,
                None => {
                    self.send_error("invalidRpcPayload", "params must be an object for session.syncHistoryState", ctx);
                    return;
                }
            };

            let state_value = match params_obj.get("state") {
                Some(val) => val,
                None => {
                    self.send_error("invalidRpcPayload", "Missing state field", ctx);
                    return;
                }
            };

            if !state_value.is_object() {
                self.send_error("invalidRpcPayload", "state must be an object", ctx);
                return;
            }

            if let Some(params_obj_mut) = params.as_object_mut() {
                let expected_version = params_obj_mut.get("expectedVersion").cloned();
                let coerced = match expected_version {
                    Some(serde_json::Value::Bool(b)) => serde_json::Value::from(if b { 1i64 } else { 0i64 }),
                    Some(serde_json::Value::String(s)) => {
                        s.parse::<i64>()
                            .map(serde_json::Value::from)
                            .unwrap_or_else(|_| serde_json::Value::from(0i64))
                    }
                    Some(serde_json::Value::Number(n)) => {
                        n.as_i64()
                            .map(serde_json::Value::from)
                            .unwrap_or_else(|| serde_json::Value::from(0i64))
                    }
                    Some(v) => {
                        v.as_f64()
                            .map(|f| serde_json::Value::from(f as i64))
                            .unwrap_or_else(|| serde_json::Value::from(0i64))
                    }
                    None => serde_json::Value::from(0i64),
                };
                params_obj_mut.insert("expectedVersion".to_string(), coerced);
            }
        }

        if let Some(connection_manager) = &self.connection_manager {
            let user_id = match self.user_id {
                Some(id) => id,
                None => {
                    self.send_error("authRequired", "Authentication required", ctx);
                    return;
                }
            };

            let target_id = match connection_manager.get_primary_desktop_device_id(&user_id) {
                Some(id) => id,
                None => {
                    let error_response = serde_json::json!({
                        "type": "rpc.response",
                        "payload": {
                            "id": request_id,
                            "result": null,
                            "error": {
                                "code": -32010,
                                "message": "Desktop is offline"
                            },
                            "isFinal": true
                        }
                    });
                    ctx.text(error_response.to_string());
                    return;
                }
            };

            let mut request_payload = serde_json::json!({
                "id": request_id,
                "method": method,
                "params": params,
                "clientId": self.device_id.clone().unwrap_or_default(),
                "userId": user_id.to_string()
            });

            if let Some(key) = idempotency_key {
                if let Some(obj) = request_payload.as_object_mut() {
                    obj.insert("idempotencyKey".to_string(), key);
                }
            }

            let forward = serde_json::json!({
                "type": "rpc.request",
                "payload": request_payload
            });

            let envelope_str = forward.to_string();

            if let Err(e) = connection_manager.send_raw_to_device(
                &user_id,
                &target_id,
                &envelope_str,
            ) {
                warn!(
                    error = %e,
                    target_device = %target_id,
                    user_id = %user_id,
                    "Failed to forward rpc.request to desktop"
                );

                let error_response = serde_json::json!({
                    "type": "rpc.response",
                    "payload": {
                        "id": request_id,
                        "result": null,
                        "error": {
                            "code": -32010,
                            "message": "Desktop is offline"
                        },
                        "isFinal": true
                    }
                });
                ctx.text(error_response.to_string());
            }
        }
    }
}

impl Handler<HandleRpcResponseMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleRpcResponseMessage, ctx: &mut Self::Context) -> Self::Result {
        // Validate authentication
        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                self.send_error("authRequired", "Authentication required", ctx);
                return;
            }
        };

        if self.device_id.is_none() {
            self.send_error("authRequired", "Authentication required", ctx);
            return;
        }

        let payload_obj = match msg.payload.get("payload").and_then(|v| v.as_object()) {
            Some(obj) => obj,
            None => {
                self.send_error(
                    "invalidPayload",
                    "Missing payload in rpc.response message",
                    ctx,
                );
                return;
            }
        };

        let client_id = match payload_obj.get("clientId").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error(
                    "missingClientId",
                    "Missing clientId in rpc.response message",
                    ctx,
                );
                return;
            }
        };

        let mut response_payload = JsonValue::Object(payload_obj.clone());
        if let Some(obj) = response_payload.as_object_mut() {
            obj.remove("clientId");
        }

        if let Some(connection_manager) = &self.connection_manager {
            let relay_response = serde_json::json!({
                "type": "rpc.response",
                "payload": response_payload
            });

            let client_id_str = client_id.to_string();
            let source_device_id = self.device_id.clone();
            match connection_manager.send_raw_to_device(
                &user_id,
                &client_id_str,
                &relay_response.to_string(),
            ) {
                Ok(()) => {
                    debug!(
                        source_device = ?source_device_id,
                        target_device = %client_id_str,
                        user_id = %user_id,
                        "Relay response forwarded successfully"
                    );
                }
                Err(e) => {
                    warn!(
                        source_device = ?source_device_id,
                        target_device = %client_id_str,
                        user_id = %user_id,
                        error = %e,
                        "Failed to forward relay response"
                    );
                }
            }
        }
    }
}

impl Handler<HandleEventMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleEventMessage, ctx: &mut Self::Context) -> Self::Result {
        let root_payload = match msg.payload.get("payload").and_then(|v| v.as_object()) {
            Some(obj) => obj,
            None => {
                self.send_error("invalidPayload", "Missing event payload object", ctx);
                return;
            }
        };

        let event_type = match root_payload.get("eventType").and_then(|v| v.as_str()) {
            Some(value) if !value.trim().is_empty() => value.to_string(),
            _ => {
                self.send_error("invalidPayload", "Missing eventType", ctx);
                return;
            }
        };

        let event_payload = root_payload
            .get("payload")
            .cloned()
            .unwrap_or(JsonValue::Null);

        // Enforce canonical payload identity for job events
        if event_type.starts_with("job:") {
            let payload_obj = match event_payload.as_object() {
                Some(obj) => obj,
                None => {
                    self.send_error("invalidPayload", "Job events require an object payload", ctx);
                    return;
                }
            };

            let job_id_ok = payload_obj
                .get("jobId")
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            let session_id_ok = payload_obj
                .get("sessionId")
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);

            if !job_id_ok || !session_id_ok {
                self.send_error("invalidPayload", "Job events must include jobId and sessionId", ctx);
                return;
            }
        }

        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                warn!("Cannot broadcast event: user not authenticated");
                return;
            }
        };

        // Broadcast active-session-changed hint when jobs become active
        if event_type == "job:status-changed" {
            if let Some(status) = event_payload.get("status").and_then(|v| v.as_str()) {
                let active_status = matches!(
                    status,
                    "running" | "preparing" | "queued" | "acknowledged_by_worker" | "created"
                );
                if active_status {
                    if let Some(session_id) = event_payload.get("sessionId").and_then(|v| v.as_str()) {
                        let project_directory = extract_project_directory(&event_payload);
                        if let Some(connection_manager) = &self.connection_manager {
                            let mut hint_payload = serde_json::json!({ "sessionId": session_id });
                            if let Some(project_directory) = project_directory {
                                if let Some(obj) = hint_payload.as_object_mut() {
                                    obj.insert("projectDirectory".to_string(), JsonValue::String(project_directory));
                                }
                            }
                            let hint_msg = DeviceMessage {
                                message_type: "event".to_string(),
                                payload: serde_json::json!({
                                    "eventType": "active-session-changed",
                                    "payload": hint_payload
                                }),
                                event_id: None,
                                target_device_id: None,
                                source_device_id: self.device_id.clone(),
                                timestamp: chrono::Utc::now(),
                            };
                            let cm = connection_manager.clone();
                            let uid = user_id;
                            let src_dev = self.device_id.clone();
                            ctx.spawn(
                                async move {
                                    let _ = cm.broadcast_to_user_excluding(&uid, hint_msg, src_dev.as_deref()).await;
                                }
                                .into_actor(self),
                            );
                        }
                    }
                }
            }
        } else if event_type == "job:created" {
            if let Some(job) = event_payload.get("job") {
                if let Some(session_id) = job.get("sessionId").and_then(|v| v.as_str()) {
                    let project_directory = extract_project_directory(&event_payload);
                    if let Some(connection_manager) = &self.connection_manager {
                        let mut hint_payload = serde_json::json!({ "sessionId": session_id });
                        if let Some(project_directory) = project_directory {
                            if let Some(obj) = hint_payload.as_object_mut() {
                                obj.insert("projectDirectory".to_string(), JsonValue::String(project_directory));
                            }
                        }
                        let hint_msg = DeviceMessage {
                            message_type: "event".to_string(),
                            payload: serde_json::json!({
                                "eventType": "active-session-changed",
                                "payload": hint_payload
                            }),
                            event_id: None,
                            target_device_id: None,
                            source_device_id: self.device_id.clone(),
                            timestamp: chrono::Utc::now(),
                        };
                        let cm = connection_manager.clone();
                        let uid = user_id;
                        let src_dev = self.device_id.clone();
                        ctx.spawn(
                            async move {
                                let _ = cm.broadcast_to_user_excluding(&uid, hint_msg, src_dev.as_deref()).await;
                            }
                            .into_actor(self),
                        );
                    }
                }
            }
        }

        // Handle device visibility updates
        if event_type == "device-visibility-updated" {
            if let Some(visible) = event_payload.get("visible").and_then(|v| v.as_bool()) {
                if let (Some(device_id_str), Some(device_repo)) = (&self.device_id, &self.device_repository) {
                    if let Ok(dev_id) = Uuid::parse_str(device_id_str) {
                        let repo = device_repo.clone();
                        actix::spawn(async move {
                            if let Err(e) = repo.set_relay_eligible(&dev_id, visible).await {
                                warn!("Failed to update relay_eligible: {:?}", e);
                            } else {
                                info!("Updated relay_eligible to {} for device {}", visible, dev_id);
                            }
                        });
                    }
                }
            }
        }

        // Persist project directory updates to database
        if event_type == "project-directory-updated" {
            if let Some(dir) = event_payload.get("projectDirectory").and_then(|v| v.as_str()) {
                if let (Some(device_id_str), Some(device_repo)) = (&self.device_id, &self.device_repository) {
                    if let Ok(dev_id) = Uuid::parse_str(device_id_str) {
                        let repo = device_repo.clone();
                        let directory = dir.to_string();
                        actix::spawn(async move {
                            if let Err(e) = repo.set_active_project_directory(&dev_id, &directory).await {
                                tracing::warn!("Failed to persist activeProjectDirectory: {:?}", e);
                            }
                        });
                    }
                }
            }
        }

        if let Some(connection_manager) = &self.connection_manager {
            let source_device_id = self.device_id.clone();
            let event_message = DeviceMessage {
                message_type: "event".to_string(),
                payload: serde_json::json!({
                    "eventType": event_type.clone(),
                    "payload": event_payload
                }),
                event_id: None,
                target_device_id: None,
                source_device_id: source_device_id.clone(),
                timestamp: chrono::Utc::now(),
            };

            let connection_manager = connection_manager.clone();

            ctx.spawn(
                async move {
                    match connection_manager
                        .broadcast_to_user_excluding(&user_id, event_message, source_device_id.as_deref())
                        .await
                    {
                        Ok(count) => {
                            if event_type == "job:response-appended" {
                                debug!(
                                    source_device = ?source_device_id,
                                    user_id = %user_id,
                                    event_type = %event_type,
                                    devices_reached = count,
                                    "Event broadcasted to user devices"
                                );
                            } else {
                                info!(
                                    source_device = ?source_device_id,
                                    user_id = %user_id,
                                    event_type = %event_type,
                                    devices_reached = count,
                                    "Event broadcasted to user devices"
                                );
                            }
                        }
                        Err(e) => {
                            warn!(
                                source_device = ?source_device_id,
                                user_id = %user_id,
                                event_type = %event_type,
                                error = %e,
                                "Failed to broadcast event"
                            );
                        }
                    }
                }
                .into_actor(self),
            );
        }
    }
}

impl Handler<HandleTerminalBinaryBind> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleTerminalBinaryBind, ctx: &mut Self::Context) -> Self::Result {
        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                self.send_error("authRequired", "Authentication required", ctx);
                return;
            }
        };

        let payload = match msg.payload.get("payload").and_then(|v| v.as_object()) {
            Some(p) => p,
            None => {
                self.send_error("missingPayload", "Missing payload in terminal.binary.bind message", ctx);
                return;
            }
        };

        let session_id = match payload.get("sessionId").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error("missingSessionId", "Missing sessionId in bind request", ctx);
                return;
            }
        };

        let include_snapshot = payload.get("includeSnapshot")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let force_snapshot = payload.get("forceSnapshot")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if let Some(connection_manager) = &self.connection_manager {
            let producer_device_id = match connection_manager.get_primary_desktop_device_id(&user_id) {
                Some(id) => id,
                None => {
                    self.send_error("producerNotConnected", "Desktop is not connected", ctx);
                    return;
                }
            };

            if let Some(consumer_device_id) = &self.device_id {
                let consumer_device_id_normalized = consumer_device_id.to_lowercase();

                connection_manager.set_binary_route_for_session(&user_id, &producer_device_id, session_id, &consumer_device_id_normalized);
                info!(
                    user_id = %user_id,
                    producer = %producer_device_id,
                    consumer = %consumer_device_id_normalized,
                    session_id = %session_id,
                    "Binary route established: {} -> {} (session: {})",
                    producer_device_id, consumer_device_id_normalized, session_id
                );

                let bind_message = serde_json::json!({
                    "type": "terminal.binary.bind",
                    "payload": {
                        "sessionId": session_id,
                        "includeSnapshot": include_snapshot,
                        "forceSnapshot": force_snapshot
                    }
                });

                if let Err(e) = connection_manager.send_raw_to_device(
                    &user_id,
                    &producer_device_id,
                    &bind_message.to_string(),
                ) {
                    warn!(
                        error = %e,
                        producer = %producer_device_id,
                        "Failed to forward bind request to producer"
                    );
                    self.send_error("forwardFailed", "Failed to forward bind request to producer", ctx);
                    return;
                }

                let ack = serde_json::json!({
                    "type": "terminal.binary.bound",
                    "payload": {
                        "sessionId": session_id
                    }
                });
                ctx.text(ack.to_string());
            }
        }
    }
}

impl Handler<HandleTerminalBinaryUnbind> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleTerminalBinaryUnbind, ctx: &mut Self::Context) -> Self::Result {
        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                self.send_error("authRequired", "Authentication required", ctx);
                return;
            }
        };

        let payload = match msg.payload.get("payload").and_then(|v| v.as_object()) {
            Some(p) => p,
            None => {
                self.send_error("missingPayload", "Missing payload in terminal.binary.unbind message", ctx);
                return;
            }
        };

        let session_id = match payload.get("sessionId").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error("missingSessionId", "Missing sessionId in unbind request", ctx);
                return;
            }
        };

        if let Some(connection_manager) = &self.connection_manager {
            if let Some(producer_device_id) = connection_manager.get_primary_desktop_device_id(&user_id) {
                connection_manager.clear_binary_route_for_session(&user_id, &producer_device_id, session_id);
                info!(
                    user_id = %user_id,
                    producer = %producer_device_id,
                    session_id = %session_id,
                    "Binary route cleared for session"
                );

                let unbind_msg = serde_json::json!({
                    "type": "terminal.binary.unbind",
                    "payload": {
                        "sessionId": session_id
                    }
                });
                if let Err(e) = connection_manager.send_raw_to_device(
                    &user_id,
                    &producer_device_id,
                    &unbind_msg.to_string(),
                ) {
                    warn!(
                        producer = %producer_device_id,
                        session_id = %session_id,
                        error = %e,
                        "Failed to forward unbind notification to producer"
                    );
                }
            } else {
                self.send_error("producerNotConnected", "Desktop is not connected", ctx);
            }
        }
    }
}

/// Create a new WebSocket handler with dependencies injected
pub fn create_device_link_ws(
    user_id: Option<Uuid>,
    connection_manager: actix_web::web::Data<DeviceConnectionManager>,
    device_repository: actix_web::web::Data<DeviceRepository>,
    relay_store: actix_web::web::Data<RelaySessionStore>,
    apns_service: Option<actix_web::web::Data<ApnsService>>,
    client_type: Option<String>,
) -> DeviceLinkWs {
    DeviceLinkWs {
        connection_id: Uuid::new_v4(),
        user_id,
        device_id: None,
        device_name: None,
        client_type,
        session_id: None,
        resume_token: None,
        expires_at: None,
        last_heartbeat: Instant::now(),
        connection_manager: Some(connection_manager),
        device_repository: Some(device_repository),
        relay_store: Some(relay_store),
        apns_service,
        rate: TokenBucket::new(50, 25),
    }
}
