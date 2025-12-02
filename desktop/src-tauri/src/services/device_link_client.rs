use crate::auth::{device_id_manager, header_utils, token_manager::TokenManager};
use crate::db_utils::SettingsRepository;
use crate::error::AppError;
use crate::remote_api::desktop_command_handler;
use crate::remote_api::types::{RpcRequest, RpcResponse, UserContext};
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
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

// Maximum pending bytes per terminal session before trimming
const MAX_PENDING_BYTES: usize = 1_048_576; // 1 MiB cap

const MAX_TERMINAL_SNAPSHOT_BYTES: usize = 256 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayEnvelope {
    #[serde(rename = "type")]
    pub kind: String,
    pub payload: serde_json::Value,
    #[serde(default)]
    pub target_device_id: Option<String>,
    #[serde(default)]
    pub timestamp: Option<String>,
}

/// Session data to persist across restarts for connection resumption
#[derive(Debug, Serialize, Deserialize)]
struct DeviceLinkSession {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "resumeToken")]
    resume_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterPayload {
    #[serde(rename = "deviceId")]
    pub device_id: String,
    #[serde(rename = "deviceName")]
    pub device_name: String,
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(rename = "resumeToken", skip_serializing_if = "Option::is_none")]
    pub resume_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatPayload {
    pub status: String,
    pub cpu_usage: Option<f64>,
    pub memory_usage: Option<f64>,
    pub disk_space_gb: Option<i64>,
    pub active_jobs: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DeviceLinkMessage {
    #[serde(rename = "register")]
    Register {
        payload: RegisterPayload,
    },
    #[serde(rename = "relay_response")]
    RelayResponse {
        #[serde(rename = "clientId")]
        client_id: String,
        response: RpcResponse,
    },
    #[serde(rename = "event")]
    Event {
        #[serde(rename = "eventType")]
        event_type: String,
        payload: Value,
    },
    #[serde(rename = "heartbeat")]
    Heartbeat {
        payload: HeartbeatPayload,
    },
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
        #[serde(default, rename = "sessionId")]
        session_id: Option<String>,
        #[serde(default, rename = "resumeToken")]
        resume_token: Option<String>,
        #[serde(default, rename = "expiresAt")]
        expires_at: Option<String>,
    },
    #[serde(rename = "resumed")]
    Resumed {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(default, rename = "expiresAt")]
        expires_at: Option<String>,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
        #[serde(default)]
        code: Option<String>,
    },
    #[serde(rename = "relay")]
    Relay {
        #[serde(rename = "clientId")]
        client_id: String,
        #[serde(rename = "userId")]
        user_id: Option<String>,
        request: RpcRequest,
    },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
}

// ========== Session Persistence Helpers ==========

/// Get the path to the session file
fn session_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Ensure directory exists
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    Ok(app_data_dir.join("device_link_session.json"))
}

/// Load a persisted session if available
fn load_session(app_handle: &tauri::AppHandle) -> Option<DeviceLinkSession> {
    let session_path = session_file_path(app_handle).ok()?;

    if !session_path.exists() {
        debug!("No persisted session file found at {:?}", session_path);
        return None;
    }

    match std::fs::read_to_string(&session_path) {
        Ok(content) => match serde_json::from_str::<DeviceLinkSession>(&content) {
            Ok(session) => {
                info!("Loaded persisted session: session_id={}", session.session_id);
                Some(session)
            }
            Err(e) => {
                warn!("Failed to parse session file: {}. Deleting invalid file.", e);
                let _ = std::fs::remove_file(&session_path);
                None
            }
        },
        Err(e) => {
            warn!("Failed to read session file: {}", e);
            None
        }
    }
}

/// Clear the persisted session file (called on logout)
pub fn clear_session(app_handle: &tauri::AppHandle) {
    match session_file_path(app_handle) {
        Ok(session_path) => {
            if session_path.exists() {
                if let Err(e) = std::fs::remove_file(&session_path) {
                    warn!("Failed to delete session file: {}", e);
                } else {
                    info!("Cleared device link session file for logout");
                }
            }
        }
        Err(e) => {
            warn!("Failed to get session file path: {}", e);
        }
    }
}

/// Save session data to disk for resumption
fn save_session(app_handle: &tauri::AppHandle, sess: &DeviceLinkSession) {
    match session_file_path(app_handle) {
        Ok(session_path) => {
            match serde_json::to_string_pretty(sess) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&session_path, json) {
                        error!("Failed to write session file: {}", e);
                    } else {
                        info!("Saved session to disk: session_id={}", sess.session_id);
                    }
                }
                Err(e) => {
                    error!("Failed to serialize session: {}", e);
                }
            }
        }
        Err(e) => {
            error!("Failed to get session file path: {}", e);
        }
    }
}

/// Delete persisted session file (e.g., on invalid_resume error)
fn delete_session(app_handle: &tauri::AppHandle) {
    if let Ok(session_path) = session_file_path(app_handle) {
        if session_path.exists() {
            match std::fs::remove_file(&session_path) {
                Ok(_) => info!("Deleted persisted session file"),
                Err(e) => warn!("Failed to delete session file: {}", e),
            }
        }
    }
}

// ==================================================

/// Global bound session ID - shared across all DeviceLinkClient instances
/// This is necessary because restart_device_link_client creates a new client instance
/// but terminal_manager may still reference the old one from app state
static BOUND_SESSION_ID: std::sync::OnceLock<Mutex<Option<String>>> = std::sync::OnceLock::new();

fn get_bound_session_id() -> &'static Mutex<Option<String>> {
    BOUND_SESSION_ID.get_or_init(|| Mutex::new(None))
}

pub struct DeviceLinkClient {
    app_handle: AppHandle,
    server_url: String,
    sender: Mutex<Option<mpsc::UnboundedSender<DeviceLinkMessage>>>,
    binary_sender: Mutex<Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>,
    event_listener_id: Mutex<Option<tauri::EventId>>,
    pending_binary_by_session: Mutex<std::collections::HashMap<String, Vec<u8>>>,
}

impl DeviceLinkClient {
    pub fn new(app_handle: AppHandle, server_url: String) -> Self {
        Self {
            app_handle,
            server_url,
            sender: Mutex::new(None),
            binary_sender: Mutex::new(None),
            event_listener_id: Mutex::new(None),
            pending_binary_by_session: Mutex::new(std::collections::HashMap::new()),
        }
    }

    /// Start the device link client and connect to the server
    pub async fn start(self: Arc<Self>) -> Result<(), AppError> {
        info!(
            "Starting DeviceLinkClient connection to {}",
            self.server_url
        );

        // Check if device is discoverable
        let pool = match self
            .app_handle
            .try_state::<Arc<sqlx::SqlitePool>>()
        {
            Some(p) => p.inner().clone(),
            None => {
                tracing::info!("SqlitePool not yet available; deferring DeviceLinkClient start");
                return Ok(());
            }
        };
        let settings_repo = SettingsRepository::new(pool.clone());
        let device_settings = settings_repo.get_device_settings().await?;

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

        // Check if remote access is enabled AFTER registration
        if !device_settings.allow_remote_access {
            info!("Remote access disabled: enable 'Allow Remote Access' in Settings to connect via relay");
            return Ok(());
        }

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
        *self.sender.lock().unwrap() = Some(tx.clone());

        // Create binary channel for terminal output
        let (bin_tx, mut bin_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        *self.binary_sender.lock().unwrap() = Some(bin_tx.clone());

        // Unlisten any previous listener to prevent leaks
        if let Ok(mut listener_guard) = self.event_listener_id.lock() {
            if let Some(id) = listener_guard.take() {
                self.app_handle.unlisten(id);
            }
        }

        // Forward terminal.output and terminal.exit events to relay with event_type field
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

                // VALIDATION: Check event_type is non-empty and payload is JSON-encodable
                let event_type = event_data.get("type").and_then(|v| v.as_str());
                let event_payload = event_data.get("payload");

                if event_type.is_none() || event_type.unwrap().trim().is_empty() {
                    warn!("Dropping device-link-event: missing or empty event_type");
                    return;
                }

                if event_payload.is_none() {
                    warn!("Dropping device-link-event: missing payload");
                    return;
                }

                // Validate JSON encodability
                if serde_json::to_string(event_payload.unwrap()).is_err() {
                    warn!("Dropping device-link-event: payload not JSON-encodable");
                    return;
                }

                let msg = DeviceLinkMessage::Event {
                    event_type: event_type.unwrap().to_string(),
                    payload: event_payload.unwrap().clone(),
                };

                if let Err(e) = tx_for_events.send(msg) {
                    warn!("Failed to forward event to device link: {}", e);
                }
            }
        });

        // Store the listener ID
        if let Ok(mut listener_guard) = self.event_listener_id.lock() {
            *listener_guard = Some(listener_id);
        }

        let device_name = crate::utils::get_device_display_name();

        // Load persisted session if available for resumption
        let persisted_session = load_session(&self.app_handle);

        // Send register message with optional session resumption data
        let register_msg = DeviceLinkMessage::Register {
            payload: RegisterPayload {
                device_id: device_id.clone(),
                device_name,
                session_id: persisted_session.as_ref().map(|s| s.session_id.clone()),
                resume_token: persisted_session.as_ref().map(|s| s.resume_token.clone()),
            },
        };

        if persisted_session.is_some() {
            info!("Attempting to resume previous session");
        }

        let register_json = serde_json::to_string(&register_msg).map_err(|e| {
            AppError::SerializationError(format!("Failed to serialize register message: {}", e))
        })?;

        ws_sender
            .send(Message::Text(register_json.into()))
            .await
            .map_err(|e| {
                AppError::NetworkError(format!("Failed to send register message: {}", e))
            })?;

        info!("Sent registration message for device: {}", device_id);

        // Spawn sender task with dual-channel support
        let ws_sender_handle = {
            let mut ws_sender = ws_sender;
            tokio::spawn(async move {
                loop {
                    tokio::select! {
                        // Text messages
                        Some(msg) = rx.recv() => {
                            match serde_json::to_string(&msg) {
                                Ok(json) => {
                                    if let Err(e) = ws_sender.send(Message::Text(json.into())).await {
                                        error!("Failed to send WebSocket text message: {}", e);
                                        break;
                                    }
                                }
                                Err(e) => {
                                    error!("Failed to serialize message: {}", e);
                                }
                            }
                        }
                        // Binary messages (terminal output)
                        Some(bytes) = bin_rx.recv() => {
                            let len = bytes.len();
                            if let Err(e) = ws_sender.send(Message::Binary(bytes.into())).await {
                                error!("Failed to send WebSocket binary message: {}", e);
                                break;
                            }
                            debug!("WebSocket: sent {} bytes as binary frame", len);
                        }
                        else => {
                            // Both channels closed
                            break;
                        }
                    }
                }
                debug!("WebSocket sender task terminated");
            })
        };

        // Spawn receiver task
        let app_handle = self.app_handle.clone();
        let tx_for_receiver = tx.clone();
        let bin_tx_for_receiver = bin_tx.clone();
        let this = Arc::clone(&self);
        let receiver_handle = tokio::spawn(async move {
            while let Some(msg) = ws_receiver.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        // Log message type for debugging (rate limited)
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(msg_type) = parsed.get("type").and_then(|v| v.as_str()) {
                                if msg_type.contains("terminal") || msg_type.contains("binary") {
                                    debug!("WebSocket received message type: {}", msg_type);
                                }
                            }
                        }

                        if let Ok(server_msg) = serde_json::from_str::<ServerMessage>(&text) {
                            if let Err(e) = Self::handle_server_message(
                                &app_handle,
                                server_msg,
                                &tx_for_receiver,
                            )
                            .await
                            {
                                error!("Failed to handle server message: {}", e);
                            }
                            continue;
                        }

                        if let Ok(env) = serde_json::from_str::<RelayEnvelope>(&text) {
                            if env.kind == "terminal.binary.bind" {
                                info!("Received terminal.binary.bind message: {:?}", env.payload);
                                let session_id_opt = env.payload.get("sessionId").and_then(|v| v.as_str());
                                let include_snapshot = env.payload.get("includeSnapshot").and_then(|v| v.as_bool()).unwrap_or(true);

                                if let Some(session_id_str) = session_id_opt {
                                    let session_id = session_id_str.to_string();

                                    if let Ok(mut bound) = get_bound_session_id().lock() {
                                        info!("Setting bound_session_id from {:?} to {}", *bound, session_id);
                                        *bound = Some(session_id.clone());
                                        info!("Bound terminal output to session: {}", session_id);
                                    } else {
                                        error!("Failed to lock bound_session_id mutex");
                                    }

                                    if include_snapshot {
                                        if let Some(terminal_mgr) = app_handle.try_state::<std::sync::Arc<crate::services::TerminalManager>>() {
                                            if let Some(snapshot) = terminal_mgr.get_buffer_snapshot(&session_id, Some(MAX_TERMINAL_SNAPSHOT_BYTES)) {
                                                if !snapshot.is_empty() {
                                                    info!("Binary uplink: sending snapshot for session {}, {} bytes", session_id, snapshot.len());
                                                    let _ = bin_tx_for_receiver.send(snapshot);
                                                }
                                            }
                                        }
                                    }

                                    // Always drop pending data on bind - mobile should only receive live output
                                    // This prevents "endless scrolling" from accumulated historical data
                                    let mut pending = this.pending_binary_by_session.lock().unwrap();
                                    if let Some(buffer) = pending.remove(&session_id) {
                                        if !buffer.is_empty() {
                                            info!("Binary uplink: dropping {} pending bytes for session {} (mobile bind)", buffer.len(), session_id);
                                        }
                                    }
                                } else {
                                    warn!("Binary uplink: no sessionId provided in bind request");
                                }
                            } else if env.kind == "terminal.binary.unbind" {
                                // Handle terminal binary unbind request
                                let session_id = env.payload.get("sessionId").and_then(|v| v.as_str());
                                info!("Bound terminal: unbind requested for sessionId={:?}", session_id);

                                if let Ok(mut bound) = get_bound_session_id().lock() {
                                    *bound = None;
                                    info!("Bound terminal: cleared bound session");
                                }
                            } else if env.kind == "device-status" {
                                // Forward device status changes to local event bus
                                if let Err(e) = app_handle.emit("device-link-event", json!({
                                    "type": "device-status",
                                    "payload": env.payload,
                                    "relayOrigin": "remote"
                                })) {
                                    error!("Failed to emit device-status event: {}", e);
                                }
                            } else if env.kind == "device-unlinked" {
                                // Forward device unlinked events to local event bus
                                if let Err(e) = app_handle.emit("device-link-event", json!({
                                    "type": "device-unlinked",
                                    "payload": env.payload,
                                    "relayOrigin": "remote"
                                })) {
                                    error!("Failed to emit device-unlinked event: {}", e);
                                }
                            } else if env.kind.starts_with("job:") {
                                // Forward job events to local event bus
                                if let Err(e) = app_handle.emit("device-link-event", json!({
                                    "type": env.kind,
                                    "payload": env.payload,
                                    "relayOrigin": "remote"
                                })) {
                                    error!("Failed to emit job event: {}", e);
                                }

                                // Also emit canonical job:* event locally so frontend listeners receive it
                                let _ = app_handle.emit(&env.kind, env.payload.clone());
                            } else if ["session-updated", "session-files-updated", "session-file-browser-state-updated",
                                       "session-history-synced", "session-created", "session-deleted", "session:auto-files-applied"]
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
                            } else if env.kind == "project-directory-updated" {
                                // Forward project directory changes from relay to frontend
                                if let Err(e) = app_handle.emit("device-link-event", json!({
                                    "type": "project-directory-updated",
                                    "payload": env.payload,
                                    "relayOrigin": "remote"
                                })) {
                                    error!("Failed to emit project-directory-updated device-link-event: {}", e);
                                }
                            } else if env.kind == "history-state-changed" {
                                // Forward history state changes from relay to frontend
                                if let Err(e) = app_handle.emit("device-link-event", json!({
                                    "type": "history-state-changed",
                                    "payload": env.payload,
                                    "relayOrigin": "remote"
                                })) {
                                    error!("Failed to relay history-state-changed: {}", e);
                                }
                            }
                            // Continue to next message
                            continue;
                        }

                        // Legacy compatibility shim: handle messageType-based messages
                        if let Ok(root) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(mt) = root.get("messageType").and_then(|v| v.as_str()) {
                                let payload = root.get("payload").cloned().unwrap_or_else(|| root.clone());

                                match mt {
                                    "device-status" => {
                                        let _ = app_handle.emit("device-link-event", json!({
                                            "type": "device-status",
                                            "payload": payload,
                                            "relayOrigin": "remote"
                                        }));
                                        continue;
                                    }
                                    "event" => {
                                        // unwrap payload.eventType / payload.payload
                                        if let Some(event_type) = payload.get("eventType").and_then(|v| v.as_str()) {
                                            let inner_payload = payload.get("payload").cloned().unwrap_or_else(|| serde_json::Value::Null);

                                            let _ = app_handle.emit("device-link-event", json!({
                                                "type": event_type,
                                                "payload": inner_payload,
                                                "relayOrigin": "remote"
                                            }));
                                            continue;
                                        }
                                    }
                                    _ => {
                                        // Fallback: treat messageType itself as an event type
                                        let _ = app_handle.emit("device-link-event", json!({
                                            "type": mt,
                                            "payload": payload,
                                            "relayOrigin": "remote"
                                        }));
                                        continue;
                                    }
                                }
                            }
                        }

                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64;
                        let last = LAST_WARN_MS.load(Ordering::Relaxed);
                        if now - last > 10000 {
                            warn!("DeviceLinkClient: Unrecognized server message: {}", text);
                            LAST_WARN_MS.store(now, Ordering::Relaxed);
                        }
                        continue;
                    },
                    Ok(Message::Close(_)) => {
                        info!("WebSocket connection closed by server");
                        let _ = app_handle.emit("device-link-status", serde_json::json!({
                            "status": "disconnected"
                        }));
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

                // Check if remote access is still enabled
                if let Some(pool) =
                    app_handle_for_heartbeat.try_state::<Arc<sqlx::SqlitePool>>()
                {
                    let pool = pool.inner().clone();
                    let settings_repo = SettingsRepository::new(pool.clone());
                    if let Ok(device_settings) = settings_repo.get_device_settings().await {
                        if !device_settings.allow_remote_access {
                            info!("Remote access disabled, emitting device-link-status: disabled");
                            let _ = app_handle_for_heartbeat.emit("device-link-status", serde_json::json!({
                                "status": "disabled",
                                "message": "Remote access has been disabled in settings."
                            }));
                            break;
                        }
                    }
                }

                // Compute active_session_id from most recently updated active job
                let active_session_id = if let Some(pool) = app_handle_for_heartbeat.try_state::<Arc<sqlx::SqlitePool>>() {
                    let job_repo = crate::db_utils::BackgroundJobRepository::new((*pool).clone());
                    match job_repo.get_active_jobs().await {
                        Ok(jobs) => {
                            jobs.iter()
                                .max_by_key(|job| job.updated_at.unwrap_or(0))
                                .map(|job| job.session_id.clone())
                        }
                        Err(_) => None,
                    }
                } else {
                    None
                };

                if tx_for_heartbeat.send(DeviceLinkMessage::Heartbeat {
                    payload: HeartbeatPayload {
                        status: "online".to_string(),
                        cpu_usage: None,
                        memory_usage: None,
                        disk_space_gb: None,
                        active_jobs: Some(0),
                        active_session_id,
                    },
                }).is_err() {
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

                // Save session to disk if both session_id and resume_token are present
                if let (Some(sid), Some(token)) = (&session_id, &resume_token) {
                    if !sid.is_empty() && !token.is_empty() {
                        let session = DeviceLinkSession {
                            session_id: sid.clone(),
                            resume_token: token.clone(),
                        };
                        save_session(app_handle, &session);
                    }
                }

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

                // Session was successfully resumed, no need to update persistence
                // The existing session file remains valid

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
            ServerMessage::Error { message, code } => {
                error!("Server error: {}", message);

                // Check if this is an invalid_resume error and delete persisted session
                let is_invalid_resume = code.as_deref() == Some("invalid_resume")
                    || message.contains("invalid_resume")
                    || message.contains("Invalid resume token");

                if is_invalid_resume {
                    warn!("Session resume failed, deleting persisted session");
                    delete_session(app_handle);
                }

                Err(AppError::NetworkError(format!("Server error: {}", message)))
            }
            // Expected server → desktop relay schema:
            // {
            //   "type": "relay",
            //   "clientId": "<mobile-uuid>",
            //   "request": {
            //     "method": "<method-name>",
            //     "params": {...},
            //     "correlationId": "<correlation-id>"
            //   }
            // }
            ServerMessage::Relay { client_id, user_id, request } => {
                debug!("Received relay request from client {}: method={}", client_id, request.method);

                let _ = app_handle.emit("relay-request-received", serde_json::json!({
                    "method": request.method
                }));

                if client_id.trim().is_empty() {
                    warn!("Invalid client_id in relay request; dropping response");
                    return Ok(());
                }

                let app_handle_clone = app_handle.clone();
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                    let user_ctx_id = user_id.unwrap_or_else(|| "remote_user".to_string());
                    let device_id = device_id_manager::get_or_create(&app_handle_clone)
                        .unwrap_or_else(|_| "unknown".to_string());
                    let user_context = UserContext {
                        user_id: user_ctx_id,
                        device_id,
                        permissions: vec!["rpc".to_string()],
                    };

                    let response = desktop_command_handler::dispatch_remote_command(
                        &app_handle_clone,
                        request,
                        &user_context
                    ).await;

                    let relay_response = DeviceLinkMessage::RelayResponse { client_id, response };
                    if let Err(e) = tx_clone.send(relay_response) {
                        error!("Failed to send relay response: {}", e);
                    }
                });
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
        info!("Registering device with server - device_id: {}, server: {}", device_id, self.server_url);

        let device_name = crate::utils::get_device_display_name();

        let platform = std::env::consts::OS.to_string();
        let app_version = self.app_handle.package_info().version.to_string();

        // Get project directory if available
        let mut capabilities_map = serde_json::Map::new();
        capabilities_map.insert("supports_terminal".to_string(), serde_json::Value::Bool(true));
        capabilities_map.insert("supports_file_browser".to_string(), serde_json::Value::Bool(true));
        capabilities_map.insert("supports_implementation_plans".to_string(), serde_json::Value::Bool(true));

        // Include project directory in capabilities if available
        if let Some(sqlite_pool) = self.app_handle.try_state::<Arc<sqlx::SqlitePool>>() {
            let settings_repo = crate::db_utils::SettingsRepository::new((*sqlite_pool).clone());
            if let Ok(Some(dir)) = settings_repo.get_project_directory().await {
                capabilities_map.insert(
                    "activeProjectDirectory".to_string(),
                    serde_json::Value::String(dir),
                );
            }
        }

        // Get device settings to determine relay_eligible
        let relay_eligible = if let Some(pool) = self.app_handle.try_state::<Arc<sqlx::SqlitePool>>() {
            let settings_repo = crate::db_utils::SettingsRepository::new((*pool).clone());
            settings_repo.get_device_settings().await
                .map(|settings| settings.allow_remote_access)
                .unwrap_or(false)
        } else {
            false
        };

        // Build registration request
        let registration_body = serde_json::json!({
            "device_name": device_name,
            "device_type": "desktop",
            "platform": platform,
            "platform_version": std::env::consts::OS,
            "app_version": app_version,
            "relay_eligible": relay_eligible,
            "capabilities": serde_json::Value::Object(capabilities_map)
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
        } else if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            // Authentication failed in background service - DO NOT clear token
            // Background services should never manage auth state
            // The token manager will handle token refresh/clearing based on user-initiated requests
            warn!(
                "Authentication failed during device registration: {}. \
                Device link will stop attempting to connect until token is refreshed. \
                This is a background service and will not clear your token.",
                status
            );

            // Return a specific auth error that tells the caller to stop retrying
            Err(AppError::AuthError(
                "Authentication failed in background service. Device link connection suspended until token refresh.".to_string()
            ))
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

    /// Check if a session is bound for binary streaming
    pub fn is_session_bound(&self, session_id: &str) -> bool {
        let bound = get_bound_session_id().lock().unwrap();
        let result = bound.as_deref() == Some(session_id);
        if !result && bound.is_some() {
            // Log mismatch for debugging
            debug!(
                "is_session_bound mismatch: bound={:?} requested={}",
                bound.as_deref(),
                session_id
            );
        }
        result
    }

    /// Send raw terminal output bytes without any header or encoding
    /// Only sends when connected AND the session is bound
    pub fn send_terminal_output_binary(&self, session_id: &str, data: &[u8]) -> Result<(), AppError> {
        // Early return if not connected
        if !self.is_connected() {
            // Not connected and session not bound - buffer pending data with cap
            if !self.is_session_bound(session_id) {
                let mut pending = self.pending_binary_by_session.lock().unwrap();
                let buf = pending.entry(session_id.to_string()).or_default();
                buf.extend_from_slice(data);
                if buf.len() > MAX_PENDING_BYTES {
                    let overflow = buf.len() - MAX_PENDING_BYTES;
                    buf.drain(0..overflow);
                }
            }
            return Ok(());
        }

        // Early return if session is not bound
        if !self.is_session_bound(session_id) {
            // Connected but session not bound - buffer pending data with cap
            let mut pending = self.pending_binary_by_session.lock().unwrap();
            let buf = pending.entry(session_id.to_string()).or_default();
            buf.extend_from_slice(data);
            if buf.len() > MAX_PENDING_BYTES {
                let overflow = buf.len() - MAX_PENDING_BYTES;
                buf.drain(0..overflow);
            }
            return Ok(());
        }

        // Session is bound and connected - send immediately
        let sender = self.binary_sender.lock().unwrap();
        match sender.as_ref() {
            Some(tx) => {
                tx.send(data.to_vec())
                    .map_err(|_| {
                        warn!("Binary uplink: channel closed for session {}", session_id);
                        AppError::NetworkError("Binary uplink channel closed".into())
                    })?;
                debug!("Binary uplink: enqueued {} bytes for session {}", data.len(), session_id);
                Ok(())
            }
            None => {
                warn!("Binary uplink: no sender available for session {}", session_id);
                Ok(())
            }
        }
    }

    /// Send an event to the server
    pub async fn send_event(&self, event_type: String, payload: Value) -> Result<(), AppError> {
        let sender = self.sender.lock().unwrap();
        if let Some(tx) = sender.as_ref() {
            let msg = DeviceLinkMessage::Event {
                event_type: event_type,
                payload,
            };

            tx
                .send(msg)
                .map_err(|_| AppError::NetworkError("Device link channel closed".to_string()))?;

            Ok(())
        } else {
            Err(AppError::NetworkError(
                "Device link client not connected".to_string(),
            ))
        }
    }

    /// Send a visibility event to the server
    pub async fn send_visibility_event(&self, visible: bool) -> Result<(), AppError> {
        self.send_event(
            "device-visibility-updated".to_string(),
            serde_json::json!({ "visible": visible })
        ).await
    }

    /// Check if the client is connected
    pub fn is_connected(&self) -> bool {
        self.sender.lock().unwrap().is_some()
    }

    /// Check if device allows remote access
    pub async fn is_device_visible(&self) -> bool {
        if let Some(pool) = self
            .app_handle
            .try_state::<Arc<sqlx::SqlitePool>>()
        {
            let pool = pool.inner().clone();
            let settings_repo = SettingsRepository::new(pool.clone());
            if let Ok(device_settings) = settings_repo.get_device_settings().await {
                return device_settings.allow_remote_access;
            }
        }
        false
    }

    pub async fn shutdown(&self) {
        tracing::info!("Shutting down DeviceLinkClient");

        if let Ok(mut listener_guard) = self.event_listener_id.lock() {
            if let Some(id) = listener_guard.take() {
                self.app_handle.unlisten(id);
            }
        }

        if let Ok(mut sender) = self.sender.lock() {
            if let Some(tx) = sender.take() {
                drop(tx);
            }
        }

        if let Ok(mut binary_sender) = self.binary_sender.lock() {
            if let Some(tx) = binary_sender.take() {
                drop(tx);
            }
        }

        if let Ok(mut bound) = get_bound_session_id().lock() {
            *bound = None;
        }

        if let Ok(mut pending) = self.pending_binary_by_session.lock() {
            pending.clear();
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

    // IMPORTANT: Reuse existing client from app state if available.
    // Tauri's manage() doesn't replace existing state, so creating a new client
    // when one already exists would cause a mismatch: the new client would have
    // the active WebSocket connection, but TerminalManager would still reference
    // the old client from app state (with sender=None after shutdown).
    let client = if let Some(existing) = app_handle.try_state::<Arc<DeviceLinkClient>>() {
        info!("Reusing existing DeviceLinkClient from app state");
        existing.inner().clone()
    } else {
        info!("Creating new DeviceLinkClient");
        let new_client = Arc::new(DeviceLinkClient::new(app_handle.clone(), server_url));
        app_handle.manage(new_client.clone());
        new_client
    };

    let mut attempt: u32 = 0;

    // This will run indefinitely, reconnecting as needed with exponential backoff
    loop {
        // Pre-check: ensure we still have an auth token before attempting connection
        let token_manager = app_handle.state::<Arc<TokenManager>>();
        if token_manager.get().await.is_none() {
            info!("DeviceLinkClient: no auth token available, stopping reconnection loop");
            let _ = app_handle.emit("device-link-status", serde_json::json!({
                "status": "disconnected",
                "message": "No authentication token available"
            }));
            break;
        }

        match client.clone().start().await {
            Ok(_) => {
                info!("Device link client completed normally");
                // Emit connected status
                let _ = app_handle.emit("device-link-status", serde_json::json!({
                    "status": "connected"
                }));
                attempt = 0; // Reset on success
                break;
            }
            Err(e) => {
                // Check if this is an auth error - if so, stop retrying
                // Background services should not keep hammering the server with invalid tokens
                if matches!(e, AppError::AuthError(_)) {
                    warn!(
                        "Device link client authentication failed: {}. \
                        Stopping reconnection attempts. Device link will restart automatically \
                        when token is refreshed.",
                        e
                    );

                    // Emit an event to notify UI that device link stopped due to auth
                    let _ = app_handle.emit("device-link-status", serde_json::json!({
                        "status": "auth_failed",
                        "message": "Device link suspended due to authentication issue. Will resume after token refresh."
                    }));

                    break; // Stop the loop - don't retry on auth failures
                }

                error!("Device link client error: {}", e);

                // Emit error status
                let _ = app_handle.emit("device-link-status", serde_json::json!({
                    "status": "error",
                    "message": e.to_string()
                }));

                // Calculate exponential backoff: min(30, 2^attempt) seconds, capped at 30s
                let backoff_secs = std::cmp::min(30, 1u64 << attempt.min(5));
                let backoff_ms = backoff_secs * 1000;

                // Emit reconnecting status with backoff info
                let _ = app_handle.emit("device-link-status", serde_json::json!({
                    "status": "reconnecting",
                    "attempt": attempt,
                    "backoffMs": backoff_ms
                }));

                info!("Attempting to reconnect device link client in {} seconds (attempt {})...", backoff_secs, attempt);

                attempt = attempt.saturating_add(1);
                tokio::time::sleep(tokio::time::Duration::from_secs(backoff_secs)).await;
            }
        }
    }

    Ok(())
}
