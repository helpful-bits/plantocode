use std::time::{Duration, Instant};
use uuid::Uuid;
use actix::prelude::*;
use actix_web_actors::{ws, ws::Message};
use serde_json::Value as JsonValue;
use tracing::{info, warn, error, debug};

use crate::services::device_connection_manager::{DeviceConnectionManager, DeviceMessage};
use crate::db::repositories::device_repository::{DeviceRepository, HeartbeatRequest};
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
    /// Last heartbeat time
    pub last_heartbeat: Instant,
    /// Connection manager reference
    pub connection_manager: Option<actix_web::web::Data<DeviceConnectionManager>>,
    /// Device repository reference
    pub device_repository: Option<actix_web::web::Data<DeviceRepository>>,
}

impl DeviceLinkWs {
    pub fn new() -> Self {
        Self {
            connection_id: Uuid::new_v4(),
            user_id: None,
            device_id: None,
            device_name: None,
            last_heartbeat: Instant::now(),
            connection_manager: None,
            device_repository: None,
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

    /// Handle device registration
    async fn handle_register_message(&mut self, payload: JsonValue, ctx: &mut ws::WebsocketContext<Self>) {
        let device_id = match payload.get("device_id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => {
                self.send_error("Missing device_id in registration", ctx);
                return;
            }
        };

        let device_name = payload.get("device_name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Device")
            .to_string();

        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                self.send_error("Authentication required", ctx);
                return;
            }
        };

        // Register with connection manager
        if let Some(connection_manager) = &self.connection_manager {
            connection_manager.register_connection(
                user_id,
                device_id.clone(),
                device_name.clone(),
                ctx.address(),
            );
        }

        self.device_id = Some(device_id.clone());
        self.device_name = Some(device_name.clone());

        info!(
            connection_id = %self.connection_id,
            user_id = %user_id,
            device_id = %device_id,
            device_name = %device_name,
            "Device registered via WebSocket"
        );

        // Send registration confirmation
        let response = serde_json::json!({
            "type": "registered"
        });

        ctx.text(response.to_string());
    }

    /// Handle device heartbeat
    async fn handle_heartbeat_message(&mut self, payload: JsonValue) {
        if let (Some(device_id), Some(device_repo)) = (&self.device_id, &self.device_repository) {
            let heartbeat = HeartbeatRequest {
                cpu_usage: payload.get("cpu_usage")
                    .and_then(|v| v.as_f64())
                    .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
                memory_usage: payload.get("memory_usage")
                    .and_then(|v| v.as_f64())
                    .and_then(|v| BigDecimal::from_str(&v.to_string()).ok()),
                disk_space_gb: payload.get("disk_space_gb").and_then(|v| v.as_i64()),
                active_jobs: payload.get("active_jobs").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                status: payload.get("status").and_then(|v| v.as_str()).map(|s| s.to_string()),
            };

            if let Ok(device_uuid) = device_id.parse::<Uuid>() {
                if let Err(e) = device_repo.update_heartbeat(&device_uuid, heartbeat).await {
                    warn!(
                        device_id = %device_id,
                        error = %e,
                        "Failed to update device heartbeat in database"
                    );
                }
            }

            // Update last seen in connection manager
            if let (Some(user_id), Some(connection_manager)) = (self.user_id, &self.connection_manager) {
                connection_manager.update_last_seen(&user_id, device_id);
            }
        }
    }

    /// Handle message relay to another device
    async fn handle_relay_message(&mut self, payload: JsonValue, ctx: &mut ws::WebsocketContext<Self>) {
        let target_device_id = match payload.get("target_device_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error("Missing target_device_id in relay message", ctx);
                return;
            }
        };

        let message_type = payload.get("message_type")
            .and_then(|v| v.as_str())
            .unwrap_or("relay")
            .to_string();

        let message_payload = payload.get("payload").cloned().unwrap_or(JsonValue::Null);

        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                self.send_error("Authentication required", ctx);
                return;
            }
        };

        if let Some(connection_manager) = &self.connection_manager {
            let relay_message = DeviceMessage {
                message_type,
                payload: message_payload,
                target_device_id: Some(target_device_id.to_string()),
                timestamp: chrono::Utc::now(),
            };

            match connection_manager.send_to_device(&user_id, target_device_id, relay_message).await {
                Ok(()) => {
                    debug!(
                        source_device = ?self.device_id,
                        target_device = %target_device_id,
                        user_id = %user_id,
                        "Message relayed successfully"
                    );
                }
                Err(e) => {
                    warn!(
                        source_device = ?self.device_id,
                        target_device = %target_device_id,
                        user_id = %user_id,
                        error = %e,
                        "Failed to relay message"
                    );
                    self.send_error(&format!("Failed to relay message: {}", e), ctx);
                }
            }
        }
    }

    /// Handle broadcast event to all user devices
    async fn handle_event_message(&mut self, payload: JsonValue) {
        let event_type = payload.get("event_type")
            .and_then(|v| v.as_str())
            .unwrap_or("event")
            .to_string();

        let event_payload = payload.get("payload").cloned().unwrap_or(JsonValue::Null);

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

            match connection_manager.broadcast_to_user(&user_id, event_message).await {
                Ok(count) => {
                    info!(
                        source_device = ?self.device_id,
                        user_id = %user_id,
                        event_type = %event_type,
                        devices_reached = count,
                        "Event broadcasted to user devices"
                    );
                }
                Err(e) => {
                    warn!(
                        source_device = ?self.device_id,
                        user_id = %user_id,
                        event_type = %event_type,
                        error = %e,
                        "Failed to broadcast event"
                    );
                }
            }
        }
    }

    /// Handle relay response message from desktop to mobile
    async fn handle_relay_response_message(&mut self, payload: JsonValue, ctx: &mut ws::WebsocketContext<Self>) {
        // Validate authentication
        let user_id = match self.user_id {
            Some(id) => id,
            None => {
                self.send_error("Authentication required", ctx);
                return;
            }
        };

        if self.device_id.is_none() {
            self.send_error("Authentication required", ctx);
            return;
        }

        let client_id = match payload.get("client_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                self.send_error("Missing client_id in relay_response message", ctx);
                return;
            }
        };

        let response_payload = payload.get("response").cloned().unwrap_or(JsonValue::Null);

        if let Some(connection_manager) = &self.connection_manager {
            // Forward to the target mobile device
            let relay_response = serde_json::json!({
                "type": "relay_response",
                "client_id": client_id,
                "response": response_payload
            });

            match connection_manager.send_raw_to_device(&user_id, client_id, &relay_response.to_string()) {
                Ok(()) => {
                    debug!(
                        source_device = ?self.device_id,
                        target_device = %client_id,
                        user_id = %user_id,
                        "Relay response forwarded successfully"
                    );
                }
                Err(e) => {
                    warn!(
                        source_device = ?self.device_id,
                        target_device = %client_id,
                        user_id = %user_id,
                        error = %e,
                        "Failed to forward relay response"
                    );
                    self.send_error(&format!("Failed to forward relay response: {}", e), ctx);
                }
            }
        }
    }

    /// Send error message to client
    fn send_error(&self, message: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let error_response = serde_json::json!({
            "type": "error",
            "message": message,
            "timestamp": chrono::Utc::now()
        });

        ctx.text(error_response.to_string());
    }

    /// Parse and handle incoming message
    async fn handle_message(&mut self, msg: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let parsed: JsonValue = match serde_json::from_str(msg) {
            Ok(json) => json,
            Err(e) => {
                warn!(
                    connection_id = %self.connection_id,
                    error = %e,
                    message = %msg,
                    "Failed to parse WebSocket message"
                );
                self.send_error("Invalid JSON format", ctx);
                return;
            }
        };

        let message_type = parsed.get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        debug!(
            connection_id = %self.connection_id,
            message_type = %message_type,
            user_id = ?self.user_id,
            device_id = ?self.device_id,
            "Received WebSocket message"
        );

        match message_type {
            "register" => {
                self.handle_register_message(parsed, ctx).await;
            }
            "heartbeat" => {
                self.handle_heartbeat_message(parsed).await;
            }
            "relay" => {
                self.handle_relay_message(parsed, ctx).await;
            }
            "relay_response" => {
                self.handle_relay_response_message(parsed, ctx).await;
            }
            "event" => {
                self.handle_event_message(parsed).await;
            }
            _ => {
                warn!(
                    connection_id = %self.connection_id,
                    message_type = %message_type,
                    "Unknown message type received"
                );
                self.send_error(&format!("Unknown message type: {}", message_type), ctx);
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
            "WebSocket connection started"
        );
        self.start_heartbeat(ctx);
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        info!(
            connection_id = %self.connection_id,
            user_id = ?self.user_id,
            device_id = ?self.device_id,
            "WebSocket connection stopped"
        );

        // Clean up connection from manager
        if let (Some(user_id), Some(device_id), Some(connection_manager)) =
            (self.user_id, &self.device_id, &self.connection_manager) {
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

impl Handler<RelayMessage> for DeviceLinkWs {
    type Result = ();

    fn handle(&mut self, msg: RelayMessage, ctx: &mut Self::Context) {
        ctx.text(msg.message);
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
                let text_clone = text.clone();
                let addr = ctx.address();

                ctx.spawn(async move {
                    // We need to send a message to self to handle the async operation
                    addr.send(HandleTextMessage { text: text_clone.to_string() }).await.ok();
                }.into_actor(self));
            }
            Ok(Message::Binary(bin)) => {
                warn!(
                    connection_id = %self.connection_id,
                    "Received unexpected binary message: {} bytes",
                    bin.len()
                );
            }
            Ok(Message::Close(reason)) => {
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

impl Handler<HandleTextMessage> for DeviceLinkWs {
    type Result = ResponseActFuture<Self, ()>;

    fn handle(&mut self, msg: HandleTextMessage, ctx: &mut Self::Context) -> Self::Result {
        let fut = self.handle_message(&msg.text, ctx);

        Box::pin(fut.into_actor(self).map(|_, _, _| ()))
    }
}

/// Create a new WebSocket handler with dependencies injected
pub fn create_device_link_ws(
    user_id: Option<Uuid>,
    connection_manager: actix_web::web::Data<DeviceConnectionManager>,
    device_repository: actix_web::web::Data<DeviceRepository>,
) -> DeviceLinkWs {
    DeviceLinkWs {
        connection_id: Uuid::new_v4(),
        user_id,
        device_id: None,
        device_name: None,
        last_heartbeat: Instant::now(),
        connection_manager: Some(connection_manager),
        device_repository: Some(device_repository),
    }
}