// SERVER RELAY ONLY - NO PERSISTENCE
// The server acts as a transparent relay for device-link events including
// "history-state-changed". All history state is stored on the desktop client;
// the server maintains zero persistence and simply forwards messages between
// connected devices.

use actix::prelude::*;
use actix_web_actors::{ws, ws::Message, ws::CloseCode, ws::CloseReason};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use serde::Deserialize;

use crate::db::repositories::device_repository::{DeviceRepository, HeartbeatRequest};
use crate::error::AppError;
use crate::services::apns_service::ApnsService;
use crate::services::device_connection_manager::{DeviceConnectionManager, DeviceMessage};
use crate::services::pending_command_queue::queue;
use crate::services::relay_session_store::RelaySessionStore;
use sqlx::types::BigDecimal;
use std::str::FromStr;

/// How often heartbeat pings are sent
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

/// How long before lack of client response causes a timeout
const CLIENT_TIMEOUT: Duration = Duration::from_secs(60);

/// Rate limiter for binary routing warnings: tracks last warning time per producer
lazy_static::lazy_static! {
    static ref BINARY_ROUTE_WARNINGS: Mutex<HashMap<String, Instant>> = Mutex::new(HashMap::new());
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

    /// Send error message to client
    fn send_error(&self, code: &str, message: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let error_response = serde_json::json!({
            "type": "error",
            "code": code,
            "message": message,
            "timestamp": chrono::Utc::now()
        });

        ctx.text(error_response.to_string());
    }

    /// Parse and handle incoming message
    fn handle_message(&mut self, msg: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let parsed: JsonValue = match serde_json::from_str(msg) {
            Ok(json) => json,
            Err(e) => {
                warn!(
                    connection_id = %self.connection_id,
                    "Failed to parse WebSocket message"
                );
                self.send_error("invalid_json", "Invalid JSON format", ctx);
                return;
            }
        };

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
            "relay" => {
                let msg = HandleRelayMessageInternal { payload: parsed };
                addr.do_send(msg);
            }
            "relay_response" => {
                let msg = HandleRelayResponseMessage { payload: parsed };
                addr.do_send(msg);
            }
            "event" => {
                let msg = HandleEventMessage { payload: parsed };
                addr.do_send(msg);
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
                let error_response = serde_json::json!({
                    "type": "error",
                    "code": "unknown_message_type",
                    "message": format!("Unknown message type: {}", message_type),
                    "timestamp": chrono::Utc::now()
                });
                ctx.text(error_response.to_string());
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

        // Invalidate relay session if present
        if let (Some(session_id), Some(relay_store)) = (&self.session_id, &self.relay_store) {
            relay_store.invalidate_session(session_id);
        }

        // Clear binary routes for this device
        if let (Some(user_id), Some(device_id), Some(connection_manager)) =
            (self.user_id, &self.device_id, &self.connection_manager)
        {
            connection_manager.clear_binary_routes_for_device(&user_id, device_id);
        }

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

        // Broadcast device-status offline event before cleanup
        if let (Some(user_id), Some(device_id), Some(connection_manager)) =
            (self.user_id, &self.device_id, &self.connection_manager)
        {
            let status_event = serde_json::json!({
                "type": "device-status",
                "payload": {
                    "deviceId": device_id,
                    "status": "offline"
                }
            });

            let device_message = DeviceMessage {
                message_type: "device-status".to_string(),
                payload: status_event.get("payload").cloned().unwrap_or(serde_json::json!({})),
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
                            "Broadcasted device-status:offline event"
                        );
                    }
                    Err(e) => {
                        warn!(
                            user_id = %uid,
                            error = %e,
                            "Failed to broadcast device-status offline event"
                        );
                    }
                }
            });
        }

        // Clean up connection from manager
        if let (Some(user_id), Some(device_id), Some(connection_manager)) =
            (self.user_id, &self.device_id, &self.connection_manager)
        {
            connection_manager.remove_connection(&user_id, device_id);
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

        // Parse and validate message structure
        if let Ok(mut obj) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&msg.message) {
            let mut final_value = serde_json::Value::Object(obj.clone());

            // Only wrap messages that lack both "type" and "messageType" fields
            if !obj.contains_key("type") && !obj.contains_key("messageType") {
                warn!(
                    connection_id = %self.connection_id,
                    log_stage = "relay:missing_type",
                    "Wrapping untyped relay message"
                );
                final_value = serde_json::json!({
                    "type": "relayPassthrough",
                    "data": obj
                });
                obj = final_value.as_object().unwrap().clone();
            }

            // Check for snake_case keys at transport edge (rate-limited diagnostic)
            let has_snake_case = obj.keys().any(|k| k.contains('_'));
            if has_snake_case {
                // Rate limit: only warn once per minute
                static LAST_SNAKE_WARN: AtomicU64 = AtomicU64::new(0);
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                let last = LAST_SNAKE_WARN.load(Ordering::Relaxed);
                if now - last > 60 {
                    warn!(
                        connection_id = %self.connection_id,
                        log_stage = "relay:contract_violation",
                        "Transport contract violation: snake_case keys at edge"
                    );
                    LAST_SNAKE_WARN.store(now, Ordering::Relaxed);
                }
            }

            ctx.text(final_value.to_string());
        } else {
            // Fallback: send original if parse fails
            ctx.text(msg.message.clone());
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
                        "Rate limit exceeded; closing WebSocket"
                    );
                    ctx.close(Some(CloseReason {
                        code: CloseCode::Policy,
                        description: Some("rate limit exceeded".into()),
                    }));
                    ctx.stop();
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

                // Headerless binary forwarding via pairing
                if let (Some(user_id), Some(device_id), Some(connection_manager)) =
                    (self.user_id.as_ref(), self.device_id.as_deref(), &self.connection_manager) {
                    let bin_len = bin.len();

                    if let Some(target) = connection_manager.get_binary_consumer(user_id, device_id) {
                        let _ = connection_manager.send_binary_to_device(user_id, &target, bin.to_vec());
                    } else {
                        // Rate-limited warning: max 1 per minute per producer
                        let should_warn = {
                            let mut warnings = BINARY_ROUTE_WARNINGS.lock().unwrap();
                            let now = Instant::now();
                            let last_warn = warnings.get(device_id);

                            match last_warn {
                                Some(last) if now.duration_since(*last) < Duration::from_secs(60) => false,
                                _ => {
                                    warnings.insert(device_id.to_string(), now);
                                    true
                                }
                            }
                        };

                        if should_warn {
                            warn!(
                                producer = %device_id,
                                user_id = %user_id,
                                len = bin_len,
                                "No binary consumer found for producer={}, user={}, len={}. Verify bind message sent and device ID normalization.",
                                device_id, user_id, bin_len
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
struct HandleRelayMessageInternal {
    payload: JsonValue,
}

#[derive(Message)]
#[rtype(result = "()")]
struct HandleRelayResponseMessage {
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
                // Payload is at root level - use root directly
                match msg.payload.as_object() {
                    Some(p) => p,
                    None => {
                        warn!(
                            connection_id = %self.connection_id,
                            log_stage = "register:early_return",
                            code = "invalid_payload",
                            "Registration failed: invalid payload structure"
                        );
                        self.send_error("invalid_payload", "Invalid payload structure in register message", ctx);
                        return;
                    }
                }
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
                self.send_error("missing_device_id", "Device ID is required", ctx);
                // STEP 3.4: Explicit return after error
                return;
            }
        };

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
                self.send_error("auth_required", "Authentication required", ctx);
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
                    self.send_error("invalid_device_id", "Invalid device ID format", ctx);
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
                                        "code": "device_ownership_failed",
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

        // Track whether session was resumed for consolidated response
        let was_resumed = if let (Some(sid), Some(token), Some(relay_store)) =
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
            if let Some(expires_at) = relay_store.validate_resume(&user_id, &device_id, sid, token)
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
                true
            } else {
                // Resume failed, create new session
                if let Some(relay_store) = &self.relay_store {
                    let (new_session_id, new_resume_token, expires_at) =
                        relay_store.create_session(&user_id, &device_id);
                    self.session_id = Some(new_session_id);
                    self.resume_token = Some(new_resume_token);
                    self.expires_at = Some(expires_at);

                    // STEP 1.5: Log session creation in resume path
                    info!(
                        connection_id = %self.connection_id,
                        user_id = %user_id,
                        device_id = %device_id,
                        log_stage = "register:session_created",
                        "New session created after failed resume"
                    );
                } else {
                    warn!(
                        connection_id = %self.connection_id,
                        user_id = %user_id,
                        "Relay store unavailable, proceeding without session"
                    );
                }
                false
            }
        } else {
            // Normal registration flow - create new session
            if let Some(relay_store) = &self.relay_store {
                let (session_id, resume_token, expires_at) =
                    relay_store.create_session(&user_id, &device_id);
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
            false
        };

        info!(
            connection_id = %self.connection_id,
            user_id = %user_id,
            device_id = %device_id,
            log_stage = "register:pre_response",
            "Preparing registration response"
        );

        // Normalize device_id to lowercase for consistent lookups
        let normalized_device_id = device_id.to_lowercase();
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
                    "serialization_error",
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
            let status_event = serde_json::json!({
                "type": "device-status",
                "payload": {
                    "deviceId": device_id,
                    "status": "online"
                }
            });

            let device_message = DeviceMessage {
                message_type: "device-status".to_string(),
                payload: status_event.get("payload").cloned().unwrap_or(serde_json::json!({})),
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
        // Touch relay session to extend TTL
        if let (Some(session_id), Some(relay_store)) = (&self.session_id, &self.relay_store) {
            relay_store.touch(session_id);
        }

        // Extract and broadcast activeSessionId hint to peers
        if let Some(active_session_id) = msg.payload.get("activeSessionId").and_then(|v| v.as_str()) {
            if !active_session_id.is_empty() {
                if let (Some(user_id), Some(connection_manager)) = (self.user_id, &self.connection_manager) {
                    let hint_msg = DeviceMessage {
                        message_type: "active-session-changed".to_string(),
                        payload: serde_json::json!({ "sessionId": active_session_id }),
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
                cpu_usage: msg
                    .payload
                    .get("cpuUsage")
                    .and_then(|v| v.as_f64())
                    .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
                memory_usage: msg
                    .payload
                    .get("memoryUsage")
                    .and_then(|v| v.as_f64())
                    .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
                disk_space_gb: msg.payload.get("diskSpaceGb").and_then(|v| v.as_i64()),
                active_jobs: msg
                    .payload
                    .get("activeJobs")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32,
                status: msg
                    .payload
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
    }
}

/// Expected Message Schemas:
///
/// Mobile → Server (Relay):
/// {
///   "type": "relay",
///   "payload": {
///     "targetDeviceId": "<desktop-uuid>",
///     "messageType": "rpc",
///     "payload": {
///       "method": "<method-name>",
///       "params": {...},
///       "id": "<correlation-id>"
///     }
///   }
/// }
///
/// Server → Desktop (Relay):
/// {
///   "type": "relay",
///   "clientId": "<mobile-uuid>",
///   "request": {
///     "method": "<method-name>",
///     "params": {...},
///     "correlationId": "<correlation-id>"
///   }
/// }
///
/// Desktop → Server (RelayResponse):
/// {
///   "type": "relay_response",
///   "clientId": "<desktop-uuid>",
///   "response": {
///     "correlationId": "<correlation-id>",
///     "result": {...} | null,
///     "error": "<error-message>" | null,
///     "isFinal": true
///   }
/// }
impl Handler<HandleRelayMessageInternal> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleRelayMessageInternal, ctx: &mut Self::Context) -> Self::Result {
        // Touch relay session to extend TTL on each RPC frame
        if let (Some(session_id), Some(relay_store)) = (&self.session_id, &self.relay_store) {
            relay_store.touch(session_id);
        }

        // STEP 16: Strict relay envelope parsing (optional/staged)
        let strict_envelope = std::env::var("STRICT_RELAY_ENVELOPE").ok().as_deref() == Some("1");
        if strict_envelope {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct RelayRpcRequest {
                method: String,
                params: serde_json::Value,
                correlation_id: String,
                idempotency_key: Option<String>,
            }

            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct RelayRequestPayload {
                target_device_id: String,
                user_id: String,
                request: RelayRpcRequest,
            }

            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct RelayMessageEnvelope {
                payload: RelayRequestPayload,
            }

            // Attempt strict deserialization
            if let Err(e) = serde_json::from_value::<RelayMessageEnvelope>(msg.payload.clone()) {
                warn!(
                    connection_id = %self.connection_id,
                    error = %e,
                    "Strict relay envelope validation failed"
                );
                self.send_error(
                    "invalid_relay_envelope",
                    &format!("Relay envelope does not match expected schema: {}", e),
                    ctx,
                );
                return;
            }
        }

        // 1. Resolve outer payload object
        let root_obj = msg.payload.as_object();
        if root_obj.is_none() {
            self.send_error("invalid_payload", "Missing or invalid root object", ctx);
            return;
        }
        let root_obj = root_obj.unwrap();

        let outer = msg.payload.get("payload")
            .and_then(|v| v.as_object())
            .or_else(|| msg.payload.as_object());

        if outer.is_none() {
            self.send_error("invalid_payload", "Relay envelope must contain a payload object", ctx);
            return;
        }
        let outer = outer.unwrap();

        // 2. Extract targetDeviceId with canonical path and fallbacks
        let target_device_id = outer.get("targetDeviceId")
            .and_then(|v| v.as_str())
            .or_else(|| root_obj.get("targetDeviceId").and_then(|v| v.as_str()))
            .or_else(|| {
                // snake_case fallback with warning
                let snake = outer.get("target_device_id")
                    .or(root_obj.get("target_device_id"))
                    .and_then(|v| v.as_str());
                if snake.is_some() {
                    // Rate-limited warning
                    static LAST_SNAKE_WARN: AtomicU64 = AtomicU64::new(0);
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs();
                    let last = LAST_SNAKE_WARN.load(Ordering::Relaxed);
                    if now - last > 60 {
                        warn!(
                            log_stage = "relay:contract_violation",
                            code = "non_canonical_field",
                            field = "target_device_id",
                            "snake_case target_device_id detected"
                        );
                        LAST_SNAKE_WARN.store(now, Ordering::Relaxed);
                    }
                }
                snake
            });

        if target_device_id.is_none() || target_device_id.unwrap().trim().is_empty() {
            let available_root_keys: Vec<String> = root_obj.keys().cloned().collect();
            let available_payload_keys: Vec<String> = outer.keys().cloned().collect();
            let error_msg = format!(
                "Missing targetDeviceId in relay message (expected at payload.targetDeviceId). Available root keys: {:?}, Available payload keys: {:?}",
                available_root_keys, available_payload_keys
            );
            warn!(
                connection_id = %self.connection_id,
                user_id = ?self.user_id,
                log_stage = "relay:validation_failed",
                code = "missing_target_device_id",
                available_root_keys = ?available_root_keys,
                available_payload_keys = ?available_payload_keys,
                "Missing targetDeviceId"
            );
            self.send_error("missing_target_device_id", &error_msg, ctx);
            return;
        }
        let target_device_id = target_device_id.unwrap();

        // 3. Extract RPC inner payload
        let inner = outer.get("payload")
            .and_then(|v| v.as_object())
            .or_else(|| outer.get("request").and_then(|v| v.as_object()));

        if inner.is_none() {
            let error_msg = format!(
                "Missing or invalid payload.payload object. Available outer keys: {:?}",
                outer.keys().collect::<Vec<_>>()
            );
            warn!(
                connection_id = %self.connection_id,
                log_stage = "relay:validation_failed",
                code = "invalid_rpc_payload",
                "Missing RPC payload"
            );
            self.send_error("invalid_rpc_payload", &error_msg, ctx);
            return;
        }
        let inner = inner.unwrap();

        // 4. Validate required fields
        let method = inner.get("method")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty());

        if method.is_none() {
            let error_msg = format!(
                "Missing or invalid payload.payload.method. Available inner keys: {:?}",
                inner.keys().collect::<Vec<_>>()
            );
            warn!(
                connection_id = %self.connection_id,
                log_stage = "relay:validation_failed",
                code = "missing_method",
                "Missing method"
            );
            self.send_error("missing_method", &error_msg, ctx);
            return;
        }
        let method = method.unwrap();

        let mut params = inner.get("params").cloned().unwrap_or(serde_json::json!({}));

        // Validate params is valid JSON
        if !params.is_object() && !params.is_array() && !params.is_null() && !params.is_string() && !params.is_number() && !params.is_boolean() {
            self.send_error("invalid_params", "Params must be valid JSON", ctx);
            return;
        }

        // Defensive coercion for session.syncHistoryState expectedVersion
        if method == "session.syncHistoryState" {
            if let Some(params_obj) = params.as_object_mut() {
                if let Some(ev) = params_obj.remove("expectedVersion") {
                    let coerced = match ev {
                        serde_json::Value::Bool(b) => serde_json::Value::from(if b { 1i64 } else { 0i64 }),
                        serde_json::Value::String(s) => {
                            s.parse::<i64>()
                                .map(serde_json::Value::from)
                                .unwrap_or_else(|_| serde_json::Value::from(0i64))
                        }
                        serde_json::Value::Number(n) => {
                            n.as_i64()
                                .map(serde_json::Value::from)
                                .unwrap_or_else(|| serde_json::Value::from(0i64))
                        }
                        v => {
                            // Try best-effort double -> i64
                            v.as_f64()
                                .map(|f| serde_json::Value::from(f as i64))
                                .unwrap_or_else(|| serde_json::Value::from(0i64))
                        }
                    };
                    params_obj.insert("expectedVersion".to_string(), coerced);
                } else {
                    // If missing, default to 0
                    params_obj.insert("expectedVersion".to_string(), serde_json::Value::from(0i64));
                }
            }
        }

        let correlation_id = inner.get("correlationId")
            .and_then(|v| v.as_str())
            .or_else(|| inner.get("id").and_then(|v| v.as_str()))
            .map(|s| s.to_string())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        // Extract idempotencyKey for forwarding
        let idempotency_key = inner.get("idempotencyKey")
            .or_else(|| inner.get("idempotency_key"))
            .cloned();

        // 5. Build and forward desktop envelope
        let authenticated_user_id = self.user_id.map(|id| id.to_string()).unwrap_or_default();

        let mut request_obj = serde_json::json!({
            "method": method,
            "params": params,
            "correlationId": correlation_id
        });

        // Preserve idempotencyKey in request if present
        if let Some(key) = idempotency_key {
            if let Some(req_obj) = request_obj.as_object_mut() {
                req_obj.insert("idempotencyKey".to_string(), key);
            }
        }

        let mut forward = serde_json::json!({
            "type": "relay",
            "clientId": self.device_id.clone().unwrap_or_default(),
            "request": request_obj
        });

        // Inject authenticated userId into the message payload
        if let Some(obj) = forward.as_object_mut() {
            obj.insert("userId".to_string(), serde_json::Value::String(authenticated_user_id));
        }

        let envelope_str = forward.to_string();

        // 6. Forward via send_raw_to_device
        if let Some(connection_manager) = &self.connection_manager {
            let user_id = match self.user_id {
                Some(id) => id,
                None => {
                    self.send_error("auth_required", "Authentication required", ctx);
                    return;
                }
            };

            let connection_manager_clone = connection_manager.clone();
            let target_id = target_device_id.to_string();
            let addr = ctx.address();
            let correlation_id_clone = correlation_id.clone();
            let device_id_clone = self.device_id.clone().unwrap_or_default();

            ctx.spawn(
                async move {
                    match connection_manager_clone.send_raw_to_device(
                        &user_id,
                        &target_id,
                        &envelope_str,
                    ) {
                        Ok(_) => {
                            debug!("Relay envelope forwarded successfully to {}", target_id);
                        }
                        Err(e) => {
                            warn!(
                                error = %e,
                                target_device = %target_id,
                                user_id = %user_id,
                                "Failed to forward relay message to target device, queueing for later delivery"
                            );

                            // Queue the message for later delivery when desktop comes online
                            let key = (user_id.to_string(), target_id.clone());
                            if let Ok(envelope_value) = serde_json::from_str::<serde_json::Value>(&envelope_str) {
                                queue().enqueue(key, envelope_value);

                                // Send queued response back to mobile
                                let queued_response = serde_json::json!({
                                    "type": "relay_response",
                                    "clientId": device_id_clone,
                                    "response": {
                                        "correlationId": correlation_id_clone,
                                        "result": {
                                            "queued": true,
                                            "message": "Desktop is offline. Command will be delivered when it comes online."
                                        },
                                        "error": null,
                                        "isFinal": true
                                    }
                                });
                                addr.do_send(RelayMessage {
                                    message: queued_response.to_string(),
                                });
                            } else {
                                // Fallback to error response if we can't parse the envelope
                                let error_response = serde_json::json!({
                                    "type": "relay_response",
                                    "clientId": device_id_clone,
                                    "response": {
                                        "correlationId": correlation_id_clone,
                                        "result": null,
                                        "error": "relay_failed",
                                        "isFinal": true
                                    }
                                });
                                addr.do_send(RelayMessage {
                                    message: error_response.to_string(),
                                });
                            }
                        }
                    }
                }
                .into_actor(self),
            );
        }
    }
}

impl Handler<HandleRelayResponseMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleRelayResponseMessage, ctx: &mut Self::Context) -> Self::Result {
        // Validate authentication
        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                self.send_error("auth_required", "Authentication required", ctx);
                return;
            }
        };

        if self.device_id.is_none() {
            self.send_error("auth_required", "Authentication required", ctx);
            return;
        }

        let client_id = match msg.payload.get("clientId").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error(
                    "missing_client_id",
                    "Missing clientId in relay_response message",
                    ctx,
                );
                return;
            }
        };

        let response_payload = msg
            .payload
            .get("response")
            .cloned()
            .unwrap_or(JsonValue::Null);

        if let Some(connection_manager) = &self.connection_manager {
            // Forward to the target mobile device
            let relay_response = serde_json::json!({
                "type": "relay_response",
                "clientId": client_id,
                "response": response_payload
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
                    self.send_error(
                        "relay_failed",
                        &format!("Failed to forward relay response: {}", e),
                        ctx,
                    );
                }
            }
        }
    }
}

impl Handler<HandleEventMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleEventMessage, ctx: &mut Self::Context) -> Self::Result {
        // Accept both eventType (new) and messageType (legacy) for compatibility
        let event_type = msg
            .payload
            .get("eventType")
            .or_else(|| msg.payload.get("messageType"))
            .and_then(|v| v.as_str())
            .unwrap_or("event")
            .to_string();

        let mut event_payload = msg
            .payload
            .get("payload")
            .cloned()
            .unwrap_or(JsonValue::Null);

        // Ensure jobId and sessionId are forwarded at top level for mobile client
        // Extract from root if present and not in payload
        if event_type.starts_with("job:") {
            let root_job_id = msg.payload.get("jobId").cloned();
            let root_session_id = msg.payload.get("sessionId").cloned();
            
            // Normalize to ensure these fields exist at payload level
            if let Some(payload_obj) = event_payload.as_object_mut() {
                // Lift jobId to top level if it exists in root but not in payload
                if let Some(job_id) = root_job_id {
                    if !payload_obj.contains_key("jobId") {
                        payload_obj.insert("jobId".to_string(), job_id);
                    }
                }
                // Lift sessionId to top level if it exists in root but not in payload
                if let Some(session_id) = root_session_id {
                    if !payload_obj.contains_key("sessionId") {
                        payload_obj.insert("sessionId".to_string(), session_id);
                    }
                }
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
                        if let Some(connection_manager) = &self.connection_manager {
                            let hint_msg = DeviceMessage {
                                message_type: "active-session-changed".to_string(),
                                payload: serde_json::json!({ "sessionId": session_id }),
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
                    if let Some(connection_manager) = &self.connection_manager {
                        let hint_msg = DeviceMessage {
                            message_type: "active-session-changed".to_string(),
                            payload: serde_json::json!({ "sessionId": session_id }),
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
                message_type: event_type.clone(),
                payload: event_payload,
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
                self.send_error("auth_required", "Authentication required", ctx);
                return;
            }
        };

        // Extract payload - try nested structure first, fall back to root (flexible like HandleRelayMessageInternal)
        let payload = msg.payload.get("payload")
            .and_then(|v| v.as_object())
            .or_else(|| msg.payload.as_object());

        let payload = match payload {
            Some(p) => p,
            None => {
                self.send_error("missing_payload", "Missing or invalid payload in terminal.binary.bind message", ctx);
                return;
            }
        };

        let producer_device_id_original = match payload.get("producerDeviceId").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => {
                self.send_error("missing_producer_device_id", "Missing producerDeviceId in bind request", ctx);
                return;
            }
        };

        let producer_device_id = producer_device_id_original.to_lowercase();

        // Extract sessionId parameter (required - tells desktop which session to stream)
        let session_id = match payload.get("sessionId").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error("missing_session_id", "Missing sessionId in bind request", ctx);
                return;
            }
        };

        // Extract includeSnapshot parameter (defaults to true for backward compatibility)
        let include_snapshot = payload.get("includeSnapshot")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        // Verify producer belongs to same user and is connected
        if let Some(connection_manager) = &self.connection_manager {
            if !connection_manager.is_device_connected(&user_id, &producer_device_id) {
                self.send_error("producer_not_connected", "Producer device not connected", ctx);
                return;
            }

            // Verify producer belongs to same user by checking connection
            if let Some(producer_conn) = connection_manager.get_connection(&user_id, &producer_device_id) {
                if producer_conn.user_id != user_id {
                    self.send_error("unauthorized", "Producer device belongs to different user", ctx);
                    return;
                }
            } else {
                self.send_error("producer_not_found", "Producer device not found", ctx);
                return;
            }

            // Set the binary route
            if let Some(consumer_device_id) = &self.device_id {
                let consumer_device_id_normalized = consumer_device_id.to_lowercase();

                connection_manager.set_binary_route(&user_id, &producer_device_id, consumer_device_id);
                info!(
                    user_id = %user_id,
                    producer = %producer_device_id,
                    consumer = %consumer_device_id,
                    session_id = %session_id,
                    "Binary route established: {} -> {} (session: {})",
                    producer_device_id, consumer_device_id, session_id
                );

                // Forward the bind request to the producer (desktop) with sessionId and includeSnapshot
                // Desktop expects RelayEnvelope format with nested payload
                let bind_message = serde_json::json!({
                    "type": "terminal.binary.bind",
                    "payload": {
                        "consumerDeviceId": consumer_device_id,
                        "sessionId": session_id,
                        "includeSnapshot": include_snapshot
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
                    self.send_error("forward_failed", "Failed to forward bind request to producer", ctx);
                }
            }
        }
    }
}

impl Handler<HandleTerminalBinaryUnbind> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, _msg: HandleTerminalBinaryUnbind, _ctx: &mut Self::Context) -> Self::Result {
        if let (Some(user_id), Some(device_id), Some(connection_manager)) =
            (self.user_id, &self.device_id, &self.connection_manager) {

            // Before clearing routes, notify all affected producers (desktops) to unbind
            // This ensures desktop clears its bound_session_id state
            let affected_routes = connection_manager.get_binary_routes_for_device(&user_id, device_id);
            for (producer, consumer) in affected_routes {
                // Send unbind notification to the producer
                let unbind_msg = serde_json::json!({
                    "type": "terminal.binary.unbind",
                    "payload": {}
                });
                if let Err(e) = connection_manager.send_raw_to_device(
                    &user_id,
                    &producer,
                    &unbind_msg.to_string(),
                ) {
                    warn!(
                        producer = %producer,
                        error = %e,
                        "Failed to forward unbind notification to producer"
                    );
                } else {
                    debug!(
                        producer = %producer,
                        consumer = %consumer,
                        "Forwarded unbind notification to producer"
                    );
                }
            }

            // Now clear the routes
            connection_manager.clear_binary_routes_for_device(&user_id, device_id);
            info!(
                user_id = %user_id,
                device_id = %device_id,
                "Binary routes cleared for device"
            );
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
