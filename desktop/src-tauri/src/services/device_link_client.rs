use crate::auth::{device_id_manager, header_utils, token_manager::TokenManager};
use crate::db_utils::SettingsRepository;
use crate::db_utils::session_repository::SessionRepository;
use crate::error::AppError;
use crate::remote_api::desktop_command_handler;
use crate::remote_api::error::RpcError;
use crate::remote_api::types::{RpcRequest, RpcResponse, UserContext};
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
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
const MAX_PENDING_BYTES: usize = 8 * 1_048_576; // 8 MiB cap

const MAX_TERMINAL_SNAPSHOT_BYTES: usize = 64 * 1024;

// Batching configuration for terminal output
// Lower frame rate reduces network churn and improves stability on flaky links
const BATCH_FLUSH_INTERVAL_MS: u64 = 4000; // Flush every 4000ms (~0.25 fps max)
const BATCH_SIZE_THRESHOLD: usize = 256 * 1024; // Flush immediately if buffer exceeds 256KB

// Low-bandwidth heuristics for terminal streaming
const LOW_BANDWIDTH_WINDOW_SECS: u64 = 120;
const LOW_BANDWIDTH_THRESHOLD: usize = 2;
const LOW_BANDWIDTH_SKIP_SNAPSHOT_THRESHOLD: usize = 3;
const LOW_BANDWIDTH_BATCH_FLUSH_INTERVAL_MS: u64 = 6000;
const LOW_BANDWIDTH_SNAPSHOT_BYTES: usize = 32 * 1024;
const EVENT_ACK_DEBOUNCE_MS: u64 = 1000;
const EVENT_ACK_BATCH_SIZE: u64 = 10;

/// PTC1 binary framing sentinel: "PTC1" in ASCII
/// Format: [0x50, 0x54, 0x43, 0x31][session_id_length: u16 big-endian][session_id bytes][payload]
/// This allows the mobile client to demux binary data for multiple terminal sessions
const PTC1_SENTINEL: [u8; 4] = [0x50, 0x54, 0x43, 0x31];

/// Wrap binary data with PTC1 framing that includes the session_id
/// This enables multi-session support where mobile can route data to correct terminal view
/// Format matches iOS parseFramedTerminalEvent: sentinel (4) + length (2 BE) + sessionId + payload
fn wrap_with_ptc1_frame(session_id: &str, data: &[u8]) -> Vec<u8> {
    let session_bytes = session_id.as_bytes();
    let session_len = session_bytes.len().min(65535) as u16; // Cap at 65535 bytes (u16 max)

    let mut frame = Vec::with_capacity(4 + 2 + session_len as usize + data.len());
    frame.extend_from_slice(&PTC1_SENTINEL);
    frame.extend_from_slice(&session_len.to_be_bytes()); // 2-byte big-endian length
    frame.extend_from_slice(&session_bytes[..session_len as usize]);
    frame.extend_from_slice(data);
    frame
}

fn find_snake_case_key(value: &Value) -> Option<String> {
    fn visit(value: &Value, path: &str) -> Option<String> {
        match value {
            Value::Object(map) => {
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
            Value::Array(items) => {
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayEnvelope {
    #[serde(rename = "type")]
    pub kind: String,
    pub payload: serde_json::Value,
    #[serde(default, rename = "eventId")]
    pub event_id: Option<u64>,
    #[serde(default, rename = "sourceDeviceId")]
    pub source_device_id: Option<String>,
    #[serde(default)]
    pub timestamp: Option<String>,
}

/// Session data to persist across restarts for connection resumption
#[derive(Debug, Serialize, Deserialize)]
struct DeviceLinkSession {
    #[serde(default, rename = "sessionId", skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(default, rename = "resumeToken", skip_serializing_if = "Option::is_none")]
    resume_token: Option<String>,
    #[serde(default, rename = "lastEventId", skip_serializing_if = "Option::is_none")]
    last_event_id: Option<u64>,
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
    #[serde(rename = "lastEventId", skip_serializing_if = "Option::is_none")]
    pub last_event_id: Option<u64>,
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
    #[serde(rename = "event-ack")]
    EventAck {
        payload: EventAckPayload,
    },
    #[serde(rename = "rpc.response")]
    RpcResponse {
        payload: RpcResponsePayload,
    },
    #[serde(rename = "event")]
    Event {
        payload: EventPayload,
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
#[serde(rename_all = "camelCase")]
pub struct EventPayload {
    #[serde(rename = "eventType")]
    pub event_type: String,
    pub payload: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventAckPayload {
    #[serde(rename = "lastEventId")]
    pub last_event_id: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequestPayload {
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(rename = "userId")]
    pub user_id: Option<String>,
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
    #[serde(rename = "idempotencyKey")]
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcResponsePayload {
    #[serde(rename = "clientId")]
    pub client_id: String,
    pub id: String,
    #[serde(default)]
    pub result: Option<Value>,
    #[serde(default)]
    pub error: Option<crate::remote_api::error::RpcError>,
    #[serde(default)]
    pub is_final: bool,
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
    #[serde(rename = "rpc.request")]
    RpcRequest {
        payload: RpcRequestPayload,
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
                let session_id = session.session_id.clone().unwrap_or_default();
                if session_id.is_empty() {
                    info!("Loaded persisted session metadata without resume credentials");
                } else {
                    info!("Loaded persisted session: session_id={}", session_id);
                }
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
                        let session_id = sess.session_id.clone().unwrap_or_default();
                        if session_id.is_empty() {
                            info!("Saved session metadata without resume credentials");
                        } else {
                            info!("Saved session to disk: session_id={}", session_id);
                        }
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

fn clear_session_credentials(app_handle: &tauri::AppHandle) {
    let session_path = match session_file_path(app_handle) {
        Ok(path) => path,
        Err(_) => return,
    };

    if !session_path.exists() {
        return;
    }

    let content = match std::fs::read_to_string(&session_path) {
        Ok(content) => content,
        Err(_) => return,
    };

    let mut session: DeviceLinkSession = match serde_json::from_str(&content) {
        Ok(session) => session,
        Err(_) => return,
    };

    session.session_id = None;
    session.resume_token = None;
    if let Ok(json) = serde_json::to_string_pretty(&session) {
        let _ = std::fs::write(&session_path, json);
    }
}

fn persist_last_event_id(app_handle: &tauri::AppHandle, event_id: u64) {
    if event_id == 0 {
        return;
    }

    let session_path = match session_file_path(app_handle) {
        Ok(path) => path,
        Err(_) => return,
    };

    if !session_path.exists() {
        return;
    }

    let content = match std::fs::read_to_string(&session_path) {
        Ok(content) => content,
        Err(_) => return,
    };

    let mut session: DeviceLinkSession = match serde_json::from_str(&content) {
        Ok(session) => session,
        Err(_) => return,
    };

    let last_event_id = session.last_event_id.unwrap_or(0);
    if last_event_id >= event_id {
        return;
    }

    session.last_event_id = Some(event_id);
    if let Ok(json) = serde_json::to_string_pretty(&session) {
        let _ = std::fs::write(&session_path, json);
    }
}

/// Delete persisted session file (e.g., on invalidResume error)
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

/// Global bound session IDs - shared across all DeviceLinkClient instances
/// Supports multiple concurrent terminal sessions streaming to mobile
/// This is necessary because restart_device_link_client creates a new client instance
/// but terminal_manager may still reference the old one from app state
static BOUND_SESSION_IDS: std::sync::OnceLock<Mutex<std::collections::HashSet<String>>> = std::sync::OnceLock::new();

fn get_bound_session_ids() -> &'static Mutex<std::collections::HashSet<String>> {
    BOUND_SESSION_IDS.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

pub struct DeviceLinkClient {
    app_handle: AppHandle,
    server_url: Mutex<String>,
    sender: Mutex<Option<mpsc::UnboundedSender<DeviceLinkMessage>>>,
    binary_sender: Mutex<Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>,
    event_listener_id: Mutex<Option<tauri::EventId>>,
    pending_binary_by_session: Mutex<std::collections::HashMap<String, Vec<u8>>>,
    pending_trimmed_by_session: Mutex<std::collections::HashSet<String>>,
    binding_sessions: Mutex<std::collections::HashSet<String>>,
    /// Batch buffer for terminal output - accumulates data before sending to reduce frame count
    /// This is separate from pending_binary_by_session which holds data for unbound sessions
    batch_buffer_by_session: Arc<Mutex<std::collections::HashMap<String, Vec<u8>>>>,
    recent_disconnects: Mutex<Vec<Instant>>,
    last_event_id: AtomicU64,
    last_ack_sent_id: AtomicU64,
    last_ack_sent_at: Mutex<Instant>,
    last_event_persisted_id: AtomicU64,
}

impl DeviceLinkClient {
    pub fn new(app_handle: AppHandle, server_url: String) -> Self {
        Self {
            app_handle,
            server_url: Mutex::new(server_url),
            sender: Mutex::new(None),
            binary_sender: Mutex::new(None),
            event_listener_id: Mutex::new(None),
            pending_binary_by_session: Mutex::new(std::collections::HashMap::new()),
            pending_trimmed_by_session: Mutex::new(std::collections::HashSet::new()),
            binding_sessions: Mutex::new(std::collections::HashSet::new()),
            batch_buffer_by_session: Arc::new(Mutex::new(std::collections::HashMap::new())),
            recent_disconnects: Mutex::new(Vec::new()),
            last_event_id: AtomicU64::new(0),
            last_ack_sent_id: AtomicU64::new(0),
            last_ack_sent_at: Mutex::new(Instant::now()),
            last_event_persisted_id: AtomicU64::new(0),
        }
    }

    fn lock_server_url(&self) -> std::sync::MutexGuard<'_, String> {
        match self.server_url.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                warn!("DeviceLinkClient server_url lock poisoned, recovering");
                poisoned.into_inner()
            }
        }
    }

    pub fn get_server_url(&self) -> String {
        self.lock_server_url().clone()
    }

    pub fn set_server_url(&self, server_url: String) {
        let mut guard = self.lock_server_url();
        if *guard != server_url {
            info!("Updating DeviceLinkClient server URL to {}", server_url);
            *guard = server_url;
        }
    }

    fn record_disconnect(&self) {
        let now = Instant::now();
        let mut disconnects = self.recent_disconnects.lock().unwrap();
        disconnects.retain(|t| now.duration_since(*t) <= Duration::from_secs(LOW_BANDWIDTH_WINDOW_SECS));
        disconnects.push(now);
    }

    fn buffer_pending_bytes(&self, session_id: &str, data: &[u8]) {
        let trimmed = {
            let mut pending = self.pending_binary_by_session.lock().unwrap();
            let buf = pending.entry(session_id.to_string()).or_default();
            buf.extend_from_slice(data);
            if buf.len() > MAX_PENDING_BYTES {
                let overflow = buf.len() - MAX_PENDING_BYTES;
                buf.drain(0..overflow);
                true
            } else {
                false
            }
        };

        if trimmed {
            if let Ok(mut trimmed_map) = self.pending_trimmed_by_session.lock() {
                trimmed_map.insert(session_id.to_string());
            }
        }
    }

    fn recent_disconnect_count(&self) -> usize {
        let now = Instant::now();
        let mut disconnects = self.recent_disconnects.lock().unwrap();
        disconnects.retain(|t| now.duration_since(*t) <= Duration::from_secs(LOW_BANDWIDTH_WINDOW_SECS));
        disconnects.len()
    }

    fn note_event_id(
        &self,
        event_id: u64,
        tx: &mpsc::UnboundedSender<DeviceLinkMessage>,
    ) {
        let current = self.last_event_id.load(Ordering::Relaxed);
        if event_id > current {
            self.last_event_id.store(event_id, Ordering::Relaxed);
        }

        let last_ack = self.last_ack_sent_id.load(Ordering::Relaxed);
        if event_id <= last_ack {
            return;
        }

        let now = Instant::now();
        let mut last_ack_at = self.last_ack_sent_at.lock().unwrap();
        let should_send = event_id.saturating_sub(last_ack) >= EVENT_ACK_BATCH_SIZE
            || now.duration_since(*last_ack_at) >= Duration::from_millis(EVENT_ACK_DEBOUNCE_MS);

        if should_send {
            self.last_ack_sent_id.store(event_id, Ordering::Relaxed);
            *last_ack_at = now;
            let _ = tx.send(DeviceLinkMessage::EventAck {
                payload: EventAckPayload {
                    last_event_id: event_id,
                },
            });

            let last_persisted = self.last_event_persisted_id.load(Ordering::Relaxed);
            if event_id > last_persisted {
                self.last_event_persisted_id.store(event_id, Ordering::Relaxed);
                persist_last_event_id(&self.app_handle, event_id);
            }
        }
    }

    async fn build_session_snapshot(app_handle: &AppHandle) -> Option<Value> {
        let pool = app_handle.try_state::<Arc<sqlx::SqlitePool>>()?.inner().clone();
        let settings_repo = SettingsRepository::new(pool.clone());
        let session_repo = SessionRepository::new(pool);

        let active_session_id = settings_repo.get_active_session_id().await.ok().flatten()?;
        let session = session_repo.get_session_by_id(&active_session_id).await.ok().flatten()?;
        let session_json = serde_json::to_value(&session).ok()?;

        let mut snapshot = serde_json::Map::new();
        snapshot.insert("sessionId".to_string(), serde_json::Value::String(session.id.clone()));
        snapshot.insert("session".to_string(), session_json);

        if let Ok(task_state) = session_repo.get_task_history_state(&active_session_id).await {
            snapshot.insert(
                "taskHistory".to_string(),
                serde_json::json!({
                    "version": task_state.version,
                    "checksum": task_state.checksum
                }),
            );
        }

        if let Ok(file_state) = session_repo.get_file_history_state(&active_session_id).await {
            snapshot.insert(
                "fileHistory".to_string(),
                serde_json::json!({
                    "version": file_state.version,
                    "checksum": file_state.checksum
                }),
            );
        }

        Some(serde_json::Value::Object(snapshot))
    }

    async fn send_session_snapshot(
        app_handle: &AppHandle,
        tx: &mpsc::UnboundedSender<DeviceLinkMessage>,
    ) {
        let Some(payload) = Self::build_session_snapshot(app_handle).await else {
            return;
        };

        let msg = DeviceLinkMessage::Event {
            payload: EventPayload {
                event_type: "session-snapshot".to_string(),
                payload,
            },
        };

        let _ = tx.send(msg);
    }

    /// Start the device link client and connect to the server
    pub async fn start(self: Arc<Self>) -> Result<(), AppError> {
        let server_url = self.get_server_url();
        info!(
            "Starting DeviceLinkClient connection to {}",
            server_url
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
        let ws_url = format!("{}/ws/device-link", server_url.replace("http", "ws"));
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
        let disconnect_count = self.recent_disconnect_count();
        let low_bandwidth_mode = disconnect_count >= LOW_BANDWIDTH_THRESHOLD;
        let skip_snapshot = disconnect_count >= LOW_BANDWIDTH_SKIP_SNAPSHOT_THRESHOLD;
        let flush_interval_ms = if low_bandwidth_mode {
            LOW_BANDWIDTH_BATCH_FLUSH_INTERVAL_MS
        } else {
            BATCH_FLUSH_INTERVAL_MS
        };
        let snapshot_limit = if low_bandwidth_mode {
            LOW_BANDWIDTH_SNAPSHOT_BYTES
        } else {
            MAX_TERMINAL_SNAPSHOT_BYTES
        };

        if low_bandwidth_mode {
            info!(
                "Low-bandwidth mode enabled for terminal streaming (recent_disconnects={})",
                disconnect_count
            );
        }

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

                let payload_value = event_payload.unwrap().clone();

                // Validate JSON encodability
                if serde_json::to_string(&payload_value).is_err() {
                    warn!("Dropping device-link-event: payload not JSON-encodable");
                    return;
                }

                if let Some(path) = find_snake_case_key(&payload_value) {
                    error!(
                        "Dropping device-link-event: snake_case key detected at {}",
                        path
                    );
                    return;
                }

                let msg = DeviceLinkMessage::Event {
                    payload: EventPayload {
                        event_type: event_type.unwrap().to_string(),
                        payload: payload_value,
                    },
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
        if let Some(last_event_id) = persisted_session.as_ref().and_then(|s| s.last_event_id) {
            self.last_event_id.store(last_event_id, Ordering::Relaxed);
            self.last_ack_sent_id.store(last_event_id, Ordering::Relaxed);
            self.last_event_persisted_id.store(last_event_id, Ordering::Relaxed);
        }
        let last_event_id = self.last_event_id.load(Ordering::Relaxed);
        let resume_credentials = persisted_session.as_ref().and_then(|session| {
            let session_id = session.session_id.as_ref().and_then(|id| {
                let trimmed = id.trim();
                if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
            });
            let resume_token = session.resume_token.as_ref().and_then(|token| {
                let trimmed = token.trim();
                if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
            });
            match (session_id, resume_token) {
                (Some(session_id), Some(resume_token)) => Some((session_id, resume_token)),
                _ => None,
            }
        });

        // Send register message with optional session resumption data
        let register_msg = DeviceLinkMessage::Register {
            payload: RegisterPayload {
                device_id: device_id.clone(),
                device_name,
                session_id: resume_credentials.as_ref().map(|(session_id, _)| session_id.clone()),
                resume_token: resume_credentials.as_ref().map(|(_, resume_token)| resume_token.clone()),
                last_event_id: if last_event_id > 0 { Some(last_event_id) } else { None },
            },
        };

        if resume_credentials.is_some() {
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

        // Spawn sender task with dual-channel support and batch flushing
        let ws_sender_handle = {
            let mut ws_sender = ws_sender;
            let batch_buffers = Arc::clone(&self.batch_buffer_by_session);
            tokio::spawn(async move {
                let mut flush_interval = tokio::time::interval(
                    tokio::time::Duration::from_millis(flush_interval_ms)
                );
                // Don't tick immediately on start
                flush_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

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
                        // Binary messages (terminal output) - immediate send for priority data
                        Some(bytes) = bin_rx.recv() => {
                            let len = bytes.len();
                            if let Err(e) = ws_sender.send(Message::Binary(bytes.into())).await {
                                error!("Failed to send WebSocket binary message: {}", e);
                                break;
                            }
                            debug!("WebSocket: sent {} bytes as binary frame (immediate)", len);
                        }
                        // Periodic batch flush
                        _ = flush_interval.tick() => {
                            // Flush all non-empty batch buffers
                            let buffers_to_flush: Vec<(String, Vec<u8>)> = {
                                let mut buffers = batch_buffers.lock().unwrap();
                                let bound_sessions = get_bound_session_ids().lock().unwrap();

                                buffers.drain()
                                    .filter(|(session_id, data)| {
                                        !data.is_empty() && bound_sessions.contains(session_id)
                                    })
                                    .collect()
                            };

                            for (session_id, data) in buffers_to_flush {
                                let framed = wrap_with_ptc1_frame(&session_id, &data);
                                let len = framed.len();
                                if let Err(e) = ws_sender.send(Message::Binary(framed.into())).await {
                                    error!("Failed to send batched binary frame: {}", e);
                                    break;
                                }
                                debug!("WebSocket: flushed batch {} bytes for session {} (raw: {})", len, session_id, data.len());
                            }
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

                                    if let Ok(mut binding) = this.binding_sessions.lock() {
                                        binding.insert(session_id.clone());
                                    }

                                    if let Ok(mut bound_sessions) = get_bound_session_ids().lock() {
                                        let was_new = bound_sessions.insert(session_id.clone());
                                        if was_new {
                                            info!("Added session {} to bound set (total: {})", session_id, bound_sessions.len());
                                        } else {
                                            info!("Session {} already in bound set (rebind)", session_id);
                                        }
                                    } else {
                                        error!("Failed to lock bound_session_ids mutex");
                                    }

                                    let pending_trimmed = {
                                        let trimmed = this.pending_trimmed_by_session.lock().unwrap();
                                        trimmed.contains(&session_id)
                                    };

                                    let has_pending = {
                                        let pending = this.pending_binary_by_session.lock().unwrap();
                                        pending.get(&session_id).map(|buf| !buf.is_empty()).unwrap_or(false)
                                    };

                                    if pending_trimmed {
                                        if let Ok(mut pending) = this.pending_binary_by_session.lock() {
                                            pending.remove(&session_id);
                                        }
                                        if let Ok(mut trimmed) = this.pending_trimmed_by_session.lock() {
                                            trimmed.remove(&session_id);
                                        }
                                    }

                                    let should_send_snapshot = if pending_trimmed {
                                        true
                                    } else {
                                        include_snapshot && !has_pending && !skip_snapshot
                                    };
                                    if should_send_snapshot {
                                        if let Some(terminal_mgr) = app_handle.try_state::<std::sync::Arc<crate::services::TerminalManager>>() {
                                            if let Some(snapshot) = terminal_mgr.get_buffer_snapshot(&session_id, Some(snapshot_limit)) {
                                                if !snapshot.is_empty() {
                                                    let framed_snapshot = wrap_with_ptc1_frame(&session_id, &snapshot);
                                                    info!("Binary uplink: sending snapshot for session {}, {} bytes (framed: {})", session_id, snapshot.len(), framed_snapshot.len());
                                                    let _ = bin_tx_for_receiver.send(framed_snapshot);
                                                }
                                            }
                                        }
                                    } else if include_snapshot && skip_snapshot && !pending_trimmed {
                                        info!(
                                            "Binary uplink: skipping snapshot for session {} (low-bandwidth mode)",
                                            session_id
                                        );
                                    }

                                    if !pending_trimmed {
                                        this.flush_pending_for_session(&session_id, &bin_tx_for_receiver);
                                    }

                                    if let Ok(mut binding) = this.binding_sessions.lock() {
                                        binding.remove(&session_id);
                                    }
                                } else {
                                    warn!("Binary uplink: no sessionId provided in bind request");
                                }
                            } else if env.kind == "terminal.binary.unbind" {
                                let session_id = env.payload.get("sessionId").and_then(|v| v.as_str());
                                info!("Bound terminal: unbind requested for sessionId={:?}", session_id);

                                if let Ok(mut bound_sessions) = get_bound_session_ids().lock() {
                                    if let Some(sid) = session_id {
                                        if bound_sessions.remove(sid) {
                                            info!("Removed session {} from bound set (remaining: {})", sid, bound_sessions.len());
                                        } else {
                                            info!("Session {} was not in bound set", sid);
                                        }
                                    } else {
                                        let count = bound_sessions.len();
                                        bound_sessions.clear();
                                        info!("Cleared all {} bound sessions", count);
                                    }
                                }

                                if let Ok(mut binding) = this.binding_sessions.lock() {
                                    if let Some(sid) = session_id {
                                        binding.remove(sid);
                                    } else {
                                        binding.clear();
                                    }
                                }

                                this.clear_terminal_buffers_for_session(session_id);
                            } else if env.kind == "event" {
                                let event_type = env.payload.get("eventType").and_then(|v| v.as_str()).unwrap_or("");
                                let inner_payload = env.payload.get("payload").cloned().unwrap_or_else(|| serde_json::Value::Null);

                                if let Some(event_id) = env.event_id {
                                    this.note_event_id(event_id, &tx_for_receiver);
                                }

                                if event_type.is_empty() {
                                    warn!("Received event without eventType");
                                    continue;
                                }

                                if let Some(path) = find_snake_case_key(&inner_payload) {
                                    error!(
                                        "Dropping relay event with snake_case key at {} (eventType={})",
                                        path,
                                        event_type
                                    );
                                    continue;
                                }

                                if event_type == "event-replay-gap" {
                                    warn!("Relay replay gap detected: {}", inner_payload);
                                    let _ = app_handle.emit("device-link-event", json!({
                                        "type": "event-replay-gap",
                                        "payload": inner_payload,
                                        "relayOrigin": "remote"
                                    }));
                                } else if event_type == "device-status" || event_type == "device-unlinked" {
                                    if let Err(e) = app_handle.emit("device-link-event", json!({
                                        "type": event_type,
                                        "payload": inner_payload,
                                        "relayOrigin": "remote"
                                    })) {
                                        error!("Failed to emit {} event: {}", event_type, e);
                                    }
                                } else if event_type.starts_with("job:") {
                                    if let Err(e) = app_handle.emit("device-link-event", json!({
                                        "type": event_type,
                                        "payload": inner_payload,
                                        "relayOrigin": "remote"
                                    })) {
                                        error!("Failed to emit job event: {}", e);
                                    }
                                    let _ = app_handle.emit(event_type, inner_payload.clone());
                                } else if ["session-updated", "session-files-updated", "session-task-updated",
                                           "session-file-browser-state-updated", "session-created", "session-deleted",
                                           "session-snapshot"]
                                           .contains(&event_type) {
                                    if let Err(e) = app_handle.emit("device-link-event", json!({
                                        "type": event_type,
                                        "payload": inner_payload,
                                        "relayOrigin": "remote"
                                    })) {
                                        error!("Failed to emit session event: {}", e);
                                    }
                                } else if event_type == "active-session-changed" {
                                    if let Err(e) = app_handle.emit("device-link-event", json!({
                                        "type": "active-session-changed",
                                        "payload": inner_payload,
                                        "relayOrigin": "remote"
                                    })) {
                                        error!("Failed to emit active-session-changed device-link-event: {}", e);
                                    }
                                    if let Err(e) = app_handle.emit("active-session-changed", inner_payload) {
                                        error!("Failed to emit active-session-changed event: {}", e);
                                    }
                                } else if event_type == "project-directory-updated" {
                                    if let Err(e) = app_handle.emit("device-link-event", json!({
                                        "type": "project-directory-updated",
                                        "payload": inner_payload,
                                        "relayOrigin": "remote"
                                    })) {
                                        error!("Failed to emit project-directory-updated device-link-event: {}", e);
                                    }
                                } else if event_type == "history-state-changed" {
                                    if let Err(e) = app_handle.emit("device-link-event", json!({
                                        "type": "history-state-changed",
                                        "payload": inner_payload,
                                        "relayOrigin": "remote"
                                    })) {
                                        error!("Failed to relay history-state-changed: {}", e);
                                    }
                                } else {
                                    let _ = app_handle.emit("device-link-event", json!({
                                        "type": event_type,
                                        "payload": inner_payload,
                                        "relayOrigin": "remote"
                                    }));
                                }
                            }
                            continue;
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

        if let Ok(mut sender) = self.sender.lock() {
            sender.take();
        }

        if let Ok(mut binary_sender) = self.binary_sender.lock() {
            binary_sender.take();
        }

        if let Ok(mut bound_sessions) = get_bound_session_ids().lock() {
            bound_sessions.clear();
        }

        if let Ok(mut binding) = self.binding_sessions.lock() {
            binding.clear();
        }

        self.record_disconnect();

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
                        let existing_last_event_id = load_session(app_handle)
                            .and_then(|sess| sess.last_event_id);
                        let session = DeviceLinkSession {
                            session_id: Some(sid.clone()),
                            resume_token: Some(token.clone()),
                            last_event_id: existing_last_event_id,
                        };
                        save_session(app_handle, &session);
                    }
                }

                let payload = serde_json::json!({
                    "status": "registered",
                    "sessionId": session_id,
                    "resumeToken": resume_token,
                    "expiresAt": expires_at,
                });
                debug!("device-link-status event about to be emitted: registered");
                if let Err(e) = app_handle.emit("device-link-status", payload) {
                    warn!("Failed to emit device link status event: {}", e);
                }
                Self::send_session_snapshot(app_handle, tx).await;
                Ok(())
            }
            ServerMessage::Resumed { session_id, expires_at } => {
                info!("Resumed device link session; session_id={} expires_at={:?}", session_id, expires_at);

                // Session was successfully resumed, no need to update persistence
                // The existing session file remains valid

                let payload = serde_json::json!({
                    "status": "resumed",
                    "sessionId": session_id,
                    "expiresAt": expires_at,
                });
                debug!("device-link-status event about to be emitted: resumed");
                if let Err(e) = app_handle.emit("device-link-status", payload) {
                    warn!("Failed to emit device link status event: {}", e);
                }
                Self::send_session_snapshot(app_handle, tx).await;
                Ok(())
            }
            ServerMessage::Error { message, code } => {
                error!("Server error: {}", message);

                let error_code = code.as_deref().unwrap_or("");
                // Check if this is an invalidResume error and re-register without resume token
                let is_invalid_resume = error_code == "invalidResume";

                if is_invalid_resume {
                    warn!("Session resume failed, clearing resume credentials and re-registering");
                    clear_session_credentials(app_handle);

                    let device_id = device_id_manager::get_or_create(app_handle)
                        .map_err(|e| AppError::AuthError(format!("Failed to get device ID: {}", e)))?;
                    let device_name = crate::utils::get_device_display_name();
                    let persisted_last_event_id = load_session(app_handle)
                        .and_then(|sess| sess.last_event_id)
                        .unwrap_or(0);

                    let register_msg = DeviceLinkMessage::Register {
                        payload: RegisterPayload {
                            device_id,
                            device_name,
                            session_id: None,
                            resume_token: None,
                            last_event_id: if persisted_last_event_id > 0 {
                                Some(persisted_last_event_id)
                            } else {
                                None
                            },
                        },
                    };

                    if let Err(e) = tx.send(register_msg) {
                        error!("Failed to send re-register message: {}", e);
                    }

                    return Ok(());
                }

                Err(AppError::NetworkError(format!("Server error: {}", message)))
            }
            // Expected server → desktop RPC schema:
            // {
            //   "type": "rpc.request",
            //   "payload": {
            //     "clientId": "<mobile-uuid>",
            //     "userId": "<user-id>",
            //     "id": "<request-id>",
            //     "method": "<method-name>",
            //     "params": {...},
            //     "idempotencyKey": "<optional>"
            //   }
            // }
            ServerMessage::RpcRequest { payload } => {
                debug!(
                    "Received rpc.request from client {}: method={}",
                    payload.client_id,
                    payload.method
                );

                let _ = app_handle.emit("relay-request-received", serde_json::json!({
                    "method": payload.method
                }));

                if payload.client_id.trim().is_empty() {
                    warn!("Invalid client_id in relay request; dropping response");
                    return Ok(());
                }

                let request = RpcRequest {
                    method: payload.method.clone(),
                    params: payload.params.clone(),
                    correlation_id: payload.id.clone(),
                    idempotency_key: payload.idempotency_key.clone(),
                };

                let app_handle_clone = app_handle.clone();
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                    let user_ctx_id = payload.user_id.unwrap_or_else(|| "remote_user".to_string());
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

                    let mut result = response.result.clone();
                    if let Some(value) = result.as_ref() {
                        if let Some(path) = find_snake_case_key(value) {
                            error!(
                                "RPC response contains snake_case key at {} (method={})",
                                path,
                                payload.method
                            );
                            let rpc_response = DeviceLinkMessage::RpcResponse {
                                payload: RpcResponsePayload {
                                    client_id: payload.client_id.clone(),
                                    id: response.correlation_id.clone(),
                                    result: None,
                                    error: Some(RpcError::validation_error(
                                        "RPC response contains snake_case keys"
                                    )),
                                    is_final: true,
                                },
                            };
                            if let Err(e) = tx_clone.send(rpc_response) {
                                error!("Failed to send relay response: {}", e);
                            }
                            return;
                        }
                    }

                    let mut error = response.error.clone();
                    if let Some(err) = error.as_mut() {
                        if let Some(data) = err.data.as_ref() {
                            if let Some(path) = find_snake_case_key(data) {
                                error!(
                                    "RPC error data contains snake_case key at {} (method={})",
                                    path,
                                    payload.method
                                );
                                err.data = None;
                            }
                        }
                    }

                    let rpc_response = DeviceLinkMessage::RpcResponse {
                        payload: RpcResponsePayload {
                            client_id: payload.client_id.clone(),
                            id: response.correlation_id.clone(),
                            result,
                            error,
                            is_final: response.is_final,
                        },
                    };
                    if let Err(e) = tx_clone.send(rpc_response) {
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
        let server_url = self.get_server_url();
        info!(
            "Registering device with server - device_id: {}, server: {}",
            device_id,
            server_url
        );

        let device_name = crate::utils::get_device_display_name();

        let platform = std::env::consts::OS.to_string();
        let app_version = self.app_handle.package_info().version.to_string();

        // Get project directory if available
        let mut capabilities_map = serde_json::Map::new();
        capabilities_map.insert("supportsTerminal".to_string(), serde_json::Value::Bool(true));
        capabilities_map.insert("supportsFileBrowser".to_string(), serde_json::Value::Bool(true));
        capabilities_map.insert("supportsImplementationPlans".to_string(), serde_json::Value::Bool(true));

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

        // Build registration request (camelCase to match server API contract)
        let registration_body = serde_json::json!({
            "deviceName": device_name,
            "deviceType": "desktop",
            "platform": platform,
            "platformVersion": std::env::consts::OS,
            "appVersion": app_version,
            "relayEligible": relay_eligible,
            "capabilities": serde_json::Value::Object(capabilities_map)
        });

        // Make HTTP POST request to register device
        let register_url = format!("{}/api/devices/register", server_url);
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
    /// Supports multiple concurrent bound sessions for multi-terminal streaming
    pub fn is_session_bound(&self, session_id: &str) -> bool {
        if let Ok(binding) = self.binding_sessions.lock() {
            if binding.contains(session_id) {
                return false;
            }
        }
        let bound_sessions = get_bound_session_ids().lock().unwrap();
        let result = bound_sessions.contains(session_id);
        if !result && !bound_sessions.is_empty() {
            // Log for debugging - not an error, just a different session
            debug!(
                "is_session_bound: session {} not in bound set {:?}",
                session_id,
                bound_sessions
            );
        }
        result
    }

    /// Send raw terminal output bytes.
    /// Bound sessions are flushed immediately to avoid TUI redraw artifacts; unbound sessions buffer.
    pub fn send_terminal_output_binary(&self, session_id: &str, data: &[u8]) -> Result<(), AppError> {
        // Early return if not connected
        if !self.is_connected() {
            // Not connected - buffer to pending data with cap
            self.buffer_pending_bytes(session_id, data);
            return Ok(());
        }

        // Early return if session is not bound
        if !self.is_session_bound(session_id) {
            // Connected but session not bound - buffer to pending data with cap
            self.buffer_pending_bytes(session_id, data);
            return Ok(());
        }

        // Session is bound and connected - flush immediately for smoother terminal rendering
        // (avoid large bursty frames that can duplicate/garble TUI output).
        let sender = self.binary_sender.lock().unwrap().clone();
        let Some(tx) = sender.as_ref() else {
            self.buffer_pending_bytes(session_id, data);
            return Ok(());
        };

        // Flush any stale batch buffer for this session to preserve ordering.
        if let Ok(mut batch_buffers) = self.batch_buffer_by_session.lock() {
            if let Some(buffered) = batch_buffers.remove(session_id) {
                if !buffered.is_empty() {
                    let framed = wrap_with_ptc1_frame(session_id, &buffered);
                    if tx.send(framed).is_err() {
                        warn!("Binary uplink: channel closed while flushing buffered data for session {}", session_id);
                        let mut pending = self.pending_binary_by_session.lock().unwrap();
                        let buf = pending.entry(session_id.to_string()).or_default();
                        buf.extend_from_slice(&buffered);
                        if buf.len() > MAX_PENDING_BYTES {
                            let overflow = buf.len() - MAX_PENDING_BYTES;
                            buf.drain(0..overflow);
                        }
                        return Ok(());
                    }
                }
            }
        }

        let framed_data = wrap_with_ptc1_frame(session_id, data);
        if tx.send(framed_data).is_err() {
            warn!("Binary uplink: channel closed for session {}", session_id);
            self.buffer_pending_bytes(session_id, data);
        }

        Ok(())
    }

    /// Send an event to the server
    pub async fn send_event(&self, event_type: String, payload: Value) -> Result<(), AppError> {
        if let Some(path) = find_snake_case_key(&payload) {
            return Err(AppError::InvalidArgument(format!(
                "Event payload contains snake_case key at {}",
                path
            )));
        }

        let sender = self.sender.lock().unwrap();
        if let Some(tx) = sender.as_ref() {
            let msg = DeviceLinkMessage::Event {
                payload: EventPayload {
                    event_type,
                    payload,
                },
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

        if let Ok(mut bound_sessions) = get_bound_session_ids().lock() {
            bound_sessions.clear();
        }

        if let Ok(mut pending) = self.pending_binary_by_session.lock() {
            pending.clear();
        }

        if let Ok(mut trimmed) = self.pending_trimmed_by_session.lock() {
            trimmed.clear();
        }

        if let Ok(mut binding) = self.binding_sessions.lock() {
            binding.clear();
        }

        if let Ok(mut batch) = self.batch_buffer_by_session.lock() {
            batch.clear();
        }
    }

    fn flush_pending_for_session(
        &self,
        session_id: &str,
        bin_tx: &mpsc::UnboundedSender<Vec<u8>>,
    ) {
        let pending = {
            let mut pending_map = self.pending_binary_by_session.lock().unwrap();
            pending_map.remove(session_id).unwrap_or_default()
        };

        if pending.is_empty() {
            if let Ok(mut trimmed) = self.pending_trimmed_by_session.lock() {
                trimmed.remove(session_id);
            }
            return;
        }

        let mut sent_bytes = 0usize;
        for chunk in pending.chunks(BATCH_SIZE_THRESHOLD) {
            let framed = wrap_with_ptc1_frame(session_id, chunk);
            if bin_tx.send(framed).is_err() {
                warn!("Binary uplink: failed to flush pending bytes for session {}", session_id);
                break;
            }
            sent_bytes += chunk.len();
        }

        if sent_bytes < pending.len() {
            let remaining = pending[sent_bytes..].to_vec();
            if let Ok(mut pending_map) = self.pending_binary_by_session.lock() {
                pending_map
                    .entry(session_id.to_string())
                    .and_modify(|buf| {
                        buf.splice(0..0, remaining.iter().cloned());
                        if buf.len() > MAX_PENDING_BYTES {
                            let overflow = buf.len() - MAX_PENDING_BYTES;
                            buf.drain(0..overflow);
                        }
                    })
                    .or_insert_with(|| {
                        let mut buf = remaining;
                        if buf.len() > MAX_PENDING_BYTES {
                            let overflow = buf.len() - MAX_PENDING_BYTES;
                            buf.drain(0..overflow);
                        }
                        buf
                    });
            }
        }

        info!(
            "Binary uplink: flushed {} pending bytes for session {}",
            sent_bytes, session_id
        );

        if let Ok(mut trimmed) = self.pending_trimmed_by_session.lock() {
            trimmed.remove(session_id);
        }
    }

    fn clear_terminal_buffers_for_session(&self, session_id: Option<&str>) {
        if let Ok(mut pending) = self.pending_binary_by_session.lock() {
            if let Some(sid) = session_id {
                pending.remove(sid);
            } else {
                pending.clear();
            }
        }

        if let Ok(mut trimmed) = self.pending_trimmed_by_session.lock() {
            if let Some(sid) = session_id {
                trimmed.remove(sid);
            } else {
                trimmed.clear();
            }
        }

        if let Ok(mut batch) = self.batch_buffer_by_session.lock() {
            if let Some(sid) = session_id {
                batch.remove(sid);
            } else {
                batch.clear();
            }
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
        let new_client = Arc::new(DeviceLinkClient::new(app_handle.clone(), server_url.clone()));
        app_handle.manage(new_client.clone());
        new_client
    };

    client.set_server_url(server_url);

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
