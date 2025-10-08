use crate::auth::{device_id_manager, header_utils, token_manager::TokenManager};
use crate::db_utils::SettingsRepository;
use crate::error::AppError;
use crate::remote_api::desktop_command_handler;
use crate::remote_api::types::{RpcRequest, RpcResponse, UserContext};
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Listener, Manager};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{Message, client::IntoClientRequest},
};
use url::Url;

// Rate limiting for warnings
static LAST_WARN_MS: AtomicU64 = AtomicU64::new(0);

#[derive(Deserialize)]
struct RelayEnvelope {
    #[serde(alias = "type", alias = "message_type")]
    pub kind: String,
    pub payload: serde_json::Value,
    #[serde(default)]
    pub target_device_id: Option<String>,
    #[serde(default)]
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DeviceLinkMessage {
    #[serde(rename = "register")]
    Register {
        device_id: String,
        device_name: String,
    },
    #[serde(rename = "relay_response")]
    RelayResponse {
        client_id: String,
        response: RpcResponse,
    },
    #[serde(rename = "event")]
    Event { event_type: String, payload: Value },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "registered")]
    Registered {
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        resume_token: Option<String>,
        #[serde(default)]
        expires_at: Option<String>,
    },
    #[serde(rename = "resumed")]
    Resumed {
        session_id: String,
        #[serde(default)]
        expires_at: Option<String>,
    },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "relay")]
    Relay {
        client_id: String,
        request: RpcRequest,
    },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
}

pub struct DeviceLinkClient {
    app_handle: AppHandle,
    server_url: String,
    sender: Option<mpsc::UnboundedSender<DeviceLinkMessage>>,
    event_listener_id: std::sync::Mutex<Option<tauri::EventId>>,
}

impl DeviceLinkClient {
    pub fn new(app_handle: AppHandle, server_url: String) -> Self {
        Self {
            app_handle,
            server_url,
            sender: None,
            event_listener_id: std::sync::Mutex::new(None),
        }
    }

    /// Start the device link client and connect to the server
    pub async fn start(&mut self) -> Result<(), AppError> {
        info!(
            "Starting DeviceLinkClient connection to {}",
            self.server_url
        );

        // Check if device is discoverable
        let pool = self.app_handle.state::<sqlx::SqlitePool>().inner().clone();
        let settings_repo = SettingsRepository::new(std::sync::Arc::new(pool));
        let device_settings = settings_repo.get_device_settings().await?;

        if !device_settings.is_discoverable {
            info!("Desktop not discoverable: enable 'Allow Remote Access' in Settings");
            return Ok(());
        }

        if !device_settings.allow_remote_access {
            info!(
                "Remote access disabled: enable 'Allow Remote Access' in Settings to connect via relay"
            );
            return Ok(());
        }

        // Get device ID and token
        let device_id = device_id_manager::get_or_create(&self.app_handle)
            .map_err(|e| AppError::AuthError(format!("Failed to get device ID: {}", e)))?;

        let token_manager = self.app_handle.state::<Arc<TokenManager>>();
        let token = token_manager
            .get()
            .await
            .ok_or_else(|| AppError::AuthError("No authentication token available".to_string()))?;

        // Register device with server before connecting WebSocket
        self.register_device(&device_id, &token).await?;

        // Build WebSocket URL
        let ws_url = format!("{}/ws/device-link", self.server_url.replace("http", "ws"));
        let url = Url::parse(&ws_url)
            .map_err(|e| AppError::ConfigError(format!("Invalid WebSocket URL: {}", e)))?;

        info!("Connecting to WebSocket at: {}", ws_url);

        // Create WebSocket request with custom headers
        let mut request = ws_url.into_client_request().map_err(|e| {
            AppError::NetworkError(format!("Failed to build WebSocket request: {}", e))
        })?;

        // Add custom headers to the existing request (which already has the WebSocket headers)
        request.headers_mut().insert(
            "Authorization",
            format!("Bearer {}", token).parse().map_err(|e| {
                AppError::NetworkError(format!("Invalid Authorization header: {}", e))
            })?,
        );
        request.headers_mut().insert(
            "X-Device-ID",
            device_id
                .clone()
                .parse()
                .map_err(|e| AppError::NetworkError(format!("Invalid Device ID header: {}", e)))?,
        );
        request.headers_mut().insert(
            "X-Token-Binding",
            device_id.parse().map_err(|e| {
                AppError::NetworkError(format!("Invalid Token Binding header: {}", e))
            })?,
        );
        request.headers_mut().insert(
            "X-Client-Type",
            "desktop".parse().map_err(|e| {
                AppError::NetworkError(format!("Invalid Client Type header: {}", e))
            })?,
        );

        // Connect to WebSocket with custom headers
        let (ws_stream, _) = connect_async_with_config(request, None, false)
            .await
            .map_err(|e| AppError::NetworkError(format!("WebSocket connection failed: {}", e)))?;

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Create message channel
        let (tx, mut rx) = mpsc::unbounded_channel::<DeviceLinkMessage>();
        self.sender = Some(tx.clone());

        // Unlisten any previous listener to prevent leaks
        if let Ok(mut listener_guard) = self.event_listener_id.lock() {
            if let Some(id) = listener_guard.take() {
                self.app_handle.unlisten(id);
            }
        }

        // Set up event listener for device-link-event emissions
        let tx_for_events = tx.clone();
        let app_handle_for_events = self.app_handle.clone();
        let listener_id = app_handle_for_events.listen("device-link-event", move |event| {
            let payload = event.payload();
            if let Ok(event_data) = serde_json::from_str::<Value>(payload) {
                if let Some(relay_origin) = event_data.get("relayOrigin").and_then(|v| v.as_str()) {
                    if relay_origin == "remote" {
                        return;
                    }
                }

                if let (Some(event_type), Some(event_payload)) = (
                    event_data.get("type").and_then(|v| v.as_str()),
                    event_data.get("payload"),
                ) {
                    let msg = DeviceLinkMessage::Event {
                        event_type: event_type.to_string(),
                        payload: event_payload.clone(),
                    };

                    if let Err(e) = tx_for_events.send(msg) {
                        warn!("Failed to forward event to device link: {}", e);
                    } else {
                        debug!("Forwarded event to device link: {}", event_type);
                    }
                }
            }
        });

        // Store the listener ID
        if let Ok(mut listener_guard) = self.event_listener_id.lock() {
            *listener_guard = Some(listener_id);
        }

        // Get hostname for device name
        let hostname = std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("COMPUTERNAME"))
            .unwrap_or_else(|_| "Desktop".to_string());

        // Send register message
        let register_msg = DeviceLinkMessage::Register {
            device_id: device_id.clone(),
            device_name: hostname,
        };

        let register_json = serde_json::to_string(&register_msg).map_err(|e| {
            AppError::SerializationError(format!("Failed to serialize register message: {}", e))
        })?;

        ws_sender
            .send(Message::Text(register_json))
            .await
            .map_err(|e| {
                AppError::NetworkError(format!("Failed to send register message: {}", e))
            })?;

        info!("Sent registration message for device: {}", device_id);

        // Spawn sender task
        let ws_sender_handle = {
            let mut ws_sender = ws_sender;
            tokio::spawn(async move {
                while let Some(msg) = rx.recv().await {
                    match serde_json::to_string(&msg) {
                        Ok(json) => {
                            if let Err(e) = ws_sender.send(Message::Text(json)).await {
                                error!("Failed to send WebSocket message: {}", e);
                                break;
                            }
                        }
                        Err(e) => {
                            error!("Failed to serialize message: {}", e);
                        }
                    }
                }
                debug!("WebSocket sender task terminated");
            })
        };

        // Spawn receiver task
        let app_handle = self.app_handle.clone();
        let tx_for_receiver = tx.clone();
        let receiver_handle = tokio::spawn(async move {
            while let Some(msg) = ws_receiver.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        // Try parsing as RelayEnvelope first (handles both "type" and "message_type")
                        if let Ok(env) = serde_json::from_str::<RelayEnvelope>(&text) {
                            // Route based on event type
                            if env.kind.starts_with("job:") {
                                // Forward job events to local event bus
                                if let Err(e) = app_handle.emit("device-link-event", json!({
                                    "type": env.kind,
                                    "payload": env.payload,
                                    "relayOrigin": "remote"
                                })) {
                                    error!("Failed to emit job event: {}", e);
                                }
                            } else if ["session-updated", "session-files-updated", "session-file-browser-state-updated",
                                       "session-history-synced"]
                                       .contains(&env.kind.as_str()) {
                                if let Err(e) = app_handle.emit("device-link-event", json!({
                                    "type": env.kind,
                                    "payload": env.payload,
                                    "relayOrigin": "remote"
                                })) {
                                    error!("Failed to emit session event: {}", e);
                                }
                            } else if env.kind == "active-session-changed" {
                                // Emit device-link-event with relayOrigin marker
                                if let Err(e) = app_handle.emit("device-link-event", json!({
                                    "type": "active-session-changed",
                                    "payload": env.payload,
                                    "relayOrigin": "remote"
                                })) {
                                    error!("Failed to emit active-session-changed device-link-event: {}", e);
                                }
                                // Emit canonical active-session-changed event
                                if let Err(e) = app_handle.emit("active-session-changed", env.payload) {
                                    error!("Failed to emit active-session-changed event: {}", e);
                                }
                            }
                            // Continue to next message
                            continue;
                        }

                        // Fall back to ServerMessage parsing for connection management messages
                        match serde_json::from_str::<ServerMessage>(&text) {
                            Ok(server_msg) => {
                                if let Err(e) = Self::handle_server_message(
                                    &app_handle,
                                    server_msg,
                                    &tx_for_receiver,
                                )
                                .await
                                {
                                    error!("Failed to handle server message: {}", e);
                                }
                            }
                            Err(e) => {
                                // Rate-limited warning
                                let now = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis() as u64;
                                let last = LAST_WARN_MS.load(Ordering::Relaxed);
                                if now - last > 200 {
                                    warn!("Failed to parse server message: {} - Raw: {}", e, &text[..text.len().min(200)]);
                                    LAST_WARN_MS.store(now, Ordering::Relaxed);
                                }
                            }
                        }
                    },
                    Ok(Message::Close(_)) => {
                        info!("WebSocket connection closed by server");
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        debug!("Received ping, sending pong");
                        if let Err(e) = tx_for_receiver.send(DeviceLinkMessage::Pong) {
                            error!("Failed to send pong: {}", e);
                        }
                    }
                    Ok(_) => {
                        // Handle other message types if needed
                        debug!("Received non-text WebSocket message");
                    }
                    Err(e) => {
                        error!("WebSocket error: {}", e);
                        break;
                    }
                }
            }
            debug!("WebSocket receiver task terminated");
        });

        // Spawn heartbeat task with visibility checking
        let tx_for_heartbeat = tx.clone();
        let app_handle_for_heartbeat = self.app_handle.clone();
        let heartbeat_handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
            loop {
                interval.tick().await;

                // Check if device is still visible
                if let Some(pool) = app_handle_for_heartbeat.try_state::<sqlx::SqlitePool>() {
                    let pool = pool.inner().clone();
                    let settings_repo = SettingsRepository::new(std::sync::Arc::new(pool));
                    if let Ok(device_settings) = settings_repo.get_device_settings().await {
                        if !device_settings.is_discoverable || !device_settings.allow_remote_access
                        {
                            info!("Device visibility settings changed, terminating connection");
                            break;
                        }
                    }
                }

                if tx_for_heartbeat.send(DeviceLinkMessage::Ping).is_err() {
                    debug!("Heartbeat channel closed, terminating heartbeat task");
                    break;
                }
            }
        });

        // Wait for any task to complete (which indicates a problem)
        tokio::select! {
            _ = ws_sender_handle => {
                warn!("WebSocket sender task completed");
            }
            _ = receiver_handle => {
                warn!("WebSocket receiver task completed");
            }
            _ = heartbeat_handle => {
                warn!("Heartbeat task completed");
            }
        }

        Err(AppError::NetworkError(
            "Device link tasks completed, reconnecting".to_string(),
        ))
    }

    /// Handle incoming server messages
    async fn handle_server_message(
        app_handle: &AppHandle,
        msg: ServerMessage,
        tx: &mpsc::UnboundedSender<DeviceLinkMessage>,
    ) -> Result<(), AppError> {
        match msg {
            ServerMessage::Registered {
                session_id,
                resume_token,
                expires_at,
            } => {
                info!(
                    "Successfully registered with device link server; session_id={:?} resume_token_present={} expires_at={:?}",
                    session_id,
                    resume_token.as_ref().map(|token| !token.is_empty()).unwrap_or(false),
                    expires_at
                );
                let payload = serde_json::json!({
                    "status": "registered",
                    "session_id": session_id,
                    "resume_token": resume_token,
                    "expires_at": expires_at,
                });
                debug!("device-link-status event about to be emitted: registered");
                if let Err(e) = app_handle.emit("device-link-status", payload) {
                    warn!("Failed to emit device link status event: {}", e);
                }
                Ok(())
            }
            ServerMessage::Resumed { session_id, expires_at } => {
                info!("Resumed device link session; session_id={} expires_at={:?}", session_id, expires_at);
                let payload = serde_json::json!({
                    "status": "resumed",
                    "session_id": session_id,
                    "expires_at": expires_at,
                });
                debug!("device-link-status event about to be emitted: resumed");
                if let Err(e) = app_handle.emit("device-link-status", payload) {
                    warn!("Failed to emit device link status event: {}", e);
                }
                Ok(())
            }
            ServerMessage::Error { message } => {
                error!("Server error: {}", message);
                Err(AppError::NetworkError(format!("Server error: {}", message)))
            }
            ServerMessage::Relay { client_id, request } => {
                debug!("Received relay request from client {}: method={}", client_id, request.method);
                let user_context = UserContext {
                    user_id: "remote_user".to_string(),
                    device_id: device_id_manager::get_or_create(app_handle).unwrap_or_else(|_| "unknown".to_string()),
                    permissions: vec!["rpc".to_string()],
                };
                let response = desktop_command_handler::dispatch_remote_command(app_handle, request, &user_context).await;
                let relay_response = DeviceLinkMessage::RelayResponse { client_id, response };
                if let Err(e) = tx.send(relay_response) {
                    error!("Failed to send relay response: {}", e);
                }
                Ok(())
            }
            ServerMessage::Ping => {
                debug!("Received ping from server");
                Ok(())
            }
            ServerMessage::Pong => {
                debug!("Received pong from server");
                Ok(())
            }
        }
    }

    /// Register device with the server's device registry
    async fn register_device(&self, device_id: &str, token: &str) -> Result<(), AppError> {
        info!("Registering device with server: {}", device_id);

        // Get device information
        let device_name = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "Desktop Device".to_string());

        let platform = std::env::consts::OS.to_string();
        let app_version = self.app_handle.package_info().version.to_string();

        // Build registration request
        let registration_body = serde_json::json!({
            "device_name": device_name,
            "device_type": "desktop",
            "platform": platform,
            "platform_version": std::env::consts::OS,
            "app_version": app_version,
            "relay_eligible": true,
            "capabilities": {
                "supports_terminal": true,
                "supports_file_browser": true,
                "supports_implementation_plans": true
            }
        });

        // Make HTTP POST request to register device
        let register_url = format!("{}/api/devices/register", self.server_url);
        let client = reqwest::Client::new();

        let request_builder = client
            .post(&register_url)
            .header("X-Client-Type", "desktop")
            .header("Content-Type", "application/json");

        let request_builder =
            header_utils::apply_auth_headers(request_builder, token, &self.app_handle)?;

        let response = request_builder
            .json(&registration_body)
            .send()
            .await
            .map_err(|e| {
                AppError::NetworkError(format!("Device registration request failed: {}", e))
            })?;

        let status = response.status();
        if status.is_success() || status == reqwest::StatusCode::CONFLICT {
            // 201 Created = new registration
            // 409 Conflict = already registered (this is fine)
            info!("Device registered successfully (status: {})", status);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            let body_snippet: String = error_text.chars().take(512).collect();
            error!("Register failed: status={} body={}", status, body_snippet);
            Err(AppError::NetworkError(format!(
                "Device registration failed with status {}: {}",
                status, error_text
            )))
        }
    }

    /// Send an event to the server
    pub async fn send_event(&self, event_type: String, payload: Value) -> Result<(), AppError> {
        if let Some(sender) = &self.sender {
            let msg = DeviceLinkMessage::Event {
                event_type,
                payload,
            };

            sender
                .send(msg)
                .map_err(|_| AppError::NetworkError("Device link channel closed".to_string()))?;

            Ok(())
        } else {
            Err(AppError::NetworkError(
                "Device link client not connected".to_string(),
            ))
        }
    }

    /// Check if the client is connected
    pub fn is_connected(&self) -> bool {
        self.sender.is_some()
    }

    /// Check if device is visible (discoverable and allows remote access)
    pub async fn is_device_visible(&self) -> bool {
        if let Some(pool) = self.app_handle.try_state::<sqlx::SqlitePool>() {
            let pool = pool.inner().clone();
            let settings_repo = SettingsRepository::new(std::sync::Arc::new(pool));
            if let Ok(device_settings) = settings_repo.get_device_settings().await {
                return device_settings.is_discoverable && device_settings.allow_remote_access;
            }
        }
        false
    }

    pub async fn shutdown(&mut self) {
        tracing::info!("Shutting down DeviceLinkClient");

        if let Ok(mut listener_guard) = self.event_listener_id.lock() {
            if let Some(id) = listener_guard.take() {
                self.app_handle.unlisten(id);
            }
        }

        if let Some(sender) = self.sender.take() {
            drop(sender);
        }
    }

    pub fn connection_state(&self) -> bool {
        self.is_connected()
    }
}

/// Start the device link client with the given server URL
pub async fn start_device_link_client(
    app_handle: AppHandle,
    server_url: String,
) -> Result<(), AppError> {
    info!("Starting device link client for server: {}", server_url);

    let mut client = DeviceLinkClient::new(app_handle, server_url);

    // This will run indefinitely, reconnecting as needed
    loop {
        match client.start().await {
            Ok(_) => {
                info!("Device link client completed normally");
                break;
            }
            Err(e) => {
                error!("Device link client error: {}", e);

                // Wait before reconnecting
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                info!("Attempting to reconnect device link client...");
            }
        }
    }

    Ok(())
}
