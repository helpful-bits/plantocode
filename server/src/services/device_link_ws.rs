use actix::prelude::*;
use actix_web_actors::{ws, ws::Message};
use serde_json::Value as JsonValue;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::db::repositories::device_repository::{DeviceRepository, HeartbeatRequest};
use crate::error::AppError;
use crate::services::device_connection_manager::{DeviceConnectionManager, DeviceMessage};
use crate::services::relay_session_store::RelaySessionStore;
use sqlx::types::BigDecimal;
use std::str::FromStr;

/// How often heartbeat pings are sent
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

/// How long before lack of client response causes a timeout
const CLIENT_TIMEOUT: Duration = Duration::from_secs(60);

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
}

impl DeviceLinkWs {
    pub fn new() -> Self {
        Self {
            connection_id: Uuid::new_v4(),
            user_id: None,
            device_id: None,
            device_name: None,
            session_id: None,
            resume_token: None,
            expires_at: None,
            last_heartbeat: Instant::now(),
            connection_manager: None,
            device_repository: None,
            relay_store: None,
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
                    error = %e,
                    message = %msg,
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
        ctx.text(msg.message.clone());

        debug!(
            connection_id = %self.connection_id,
            user_id = ?self.user_id,
            device_id = ?self.device_id,
            payload = %msg.message,
            log_stage = "relay:sent",
            "Relay message delivered to client"
        );
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

                // Handle the message asynchronously
                let addr = ctx.address();
                addr.do_send(HandleTextMessage {
                    text: text.to_string(),
                });
            }
            Ok(Message::Binary(bin)) => {
                warn!(
                    connection_id = %self.connection_id,
                    "Received unexpected binary message: {} bytes",
                    bin.len()
                );
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
        // STEP 1.1: Log registration start
        info!(
            connection_id = %self.connection_id,
            user_id = ?self.user_id,
            has_device_id = %msg.payload.get("device_id").is_some(),
            log_stage = "register:begin",
            "Starting device registration"
        );

        // Extract what we need from the payload
        let device_id = match msg.payload.get("device_id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => {
                // STEP 1.8: Log early return for missing device_id
                warn!(
                    connection_id = %self.connection_id,
                    log_stage = "register:early_return",
                    code = "missing_device_id",
                    "Registration failed: missing device_id"
                );
                // STEP 3.2: Send proper error with message field
                self.send_error("missing_device_id", "Device ID is required", ctx);
                // STEP 3.4: Explicit return after error
                return;
            }
        };

        let device_name = msg
            .payload
            .get("device_name")
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
        let resume_session_id = msg.payload.get("session_id").and_then(|v| v.as_str());
        let resume_token_param = msg.payload.get("resume_token").and_then(|v| v.as_str());

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

        self.device_id = Some(device_id.clone());
        self.device_name = Some(device_name.clone());

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
                    "session_id": session_id,
                    "expires_at": expires_at.to_rfc3339()
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
                    "session_id": session_id,
                    "resume_token": resume_token,
                    "expires_at": expires_at.to_rfc3339()
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
            connection_manager.register_connection(
                user_id,
                device_id.clone(),
                device_name.clone(),
                ctx.address(),
            );

            // STEP 1.7: Log connection manager registration
            debug!(
                connection_id = %self.connection_id,
                user_id = %user_id,
                device_id = %device_id,
                log_stage = "register:connection_manager_registered",
                "Connection registered with connection manager"
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

        if let (Some(device_id), Some(device_repo)) = (&self.device_id, &self.device_repository) {
            let heartbeat = HeartbeatRequest {
                cpu_usage: msg
                    .payload
                    .get("cpu_usage")
                    .and_then(|v| v.as_f64())
                    .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
                memory_usage: msg
                    .payload
                    .get("memory_usage")
                    .and_then(|v| v.as_f64())
                    .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
                disk_space_gb: msg.payload.get("disk_space_gb").and_then(|v| v.as_i64()),
                active_jobs: msg
                    .payload
                    .get("active_jobs")
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

impl Handler<HandleRelayMessageInternal> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: HandleRelayMessageInternal, ctx: &mut Self::Context) -> Self::Result {
        let target_device_id = match msg.payload.get("target_device_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error(
                    "missing_target_device_id",
                    "Missing target_device_id in relay message",
                    ctx,
                );
                return;
            }
        };

        info!(
            source_device = ?self.device_id,
            target_device = %target_device_id,
            user_id = ?self.user_id,
            "Relay message received - attempting to forward"
        );

        // Extract and validate payload structure
        let payload_obj = msg.payload.get("payload").and_then(|v| v.as_object());
        if payload_obj.is_none() {
            self.send_error("invalid_payload", "Missing or invalid payload field", ctx);
            return;
        }

        let method = payload_obj
            .and_then(|o| o.get("method"))
            .and_then(|v| v.as_str());
        if method.is_none() {
            self.send_error("invalid_payload", "Missing method in RPC payload", ctx);
            return;
        }

        let params = payload_obj
            .and_then(|o| o.get("params"))
            .cloned()
            .unwrap_or(serde_json::json!({}));

        // Extract correlation_id from payload.id or payload.correlation_id, or generate one
        let correlation_id = payload_obj
            .and_then(|o| o.get("correlation_id"))
            .or_else(|| payload_obj.and_then(|o| o.get("id")))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        // Build desktop-expected envelope
        let envelope = serde_json::json!({
            "type": "relay",
            "client_id": self.device_id.clone().unwrap_or_default(), // mobile device_id as string
            "request": {
                "method": method.unwrap(),
                "params": params,
                "correlation_id": correlation_id
            }
        });

        let envelope_str = envelope.to_string();

        // Forward via send_raw_to_device
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
                                "Failed to forward relay message to target device"
                            );
                            let error_response = serde_json::json!({
                                "type": "relay_response",
                                "client_id": device_id_clone,
                                "response": {
                                    "correlation_id": correlation_id_clone,
                                    "result": null,
                                    "error": "relay_failed",
                                    "is_final": true
                                }
                            });
                            addr.do_send(RelayMessage {
                                message: error_response.to_string(),
                            });
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

        let client_id = match msg.payload.get("client_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error(
                    "missing_client_id",
                    "Missing client_id in relay_response message",
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
                "client_id": client_id,
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
        let event_type = msg
            .payload
            .get("event_type")
            .and_then(|v| v.as_str())
            .unwrap_or("event")
            .to_string();

        let event_payload = msg
            .payload
            .get("payload")
            .cloned()
            .unwrap_or(JsonValue::Null);

        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                warn!("Cannot broadcast event: user not authenticated");
                return;
            }
        };

        if let Some(connection_manager) = &self.connection_manager {
            let event_message = DeviceMessage {
                message_type: event_type.clone(),
                payload: event_payload,
                target_device_id: None,
                timestamp: chrono::Utc::now(),
            };

            let connection_manager = connection_manager.clone();
            let source_device_id = self.device_id.clone();

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

/// Create a new WebSocket handler with dependencies injected
pub fn create_device_link_ws(
    user_id: Option<Uuid>,
    connection_manager: actix_web::web::Data<DeviceConnectionManager>,
    device_repository: actix_web::web::Data<DeviceRepository>,
    relay_store: actix_web::web::Data<RelaySessionStore>,
) -> DeviceLinkWs {
    DeviceLinkWs {
        connection_id: Uuid::new_v4(),
        user_id,
        device_id: None,
        device_name: None,
        session_id: None,
        resume_token: None,
        expires_at: None,
        last_heartbeat: Instant::now(),
        connection_manager: Some(connection_manager),
        device_repository: Some(device_repository),
        relay_store: Some(relay_store),
    }
}
