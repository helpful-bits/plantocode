use log::warn;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

// Event name constants
pub const TERMINAL_STATUS_CHANGED: &str = "terminal:status-changed";
pub const TERMINAL_DELETED: &str = "terminal:deleted";

// Typed event payload structs
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStatusChangedPayload {
    pub job_id: String,
    pub status: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDeletedPayload {
    pub job_id: String,
}

// Helper emit functions
pub fn emit_terminal_status_changed(app_handle: &AppHandle, payload: TerminalStatusChangedPayload) {
    if let Err(e) = app_handle.emit(TERMINAL_STATUS_CHANGED, payload) {
        warn!("Failed to emit {} event: {}", TERMINAL_STATUS_CHANGED, e);
    }
}

pub fn emit_terminal_deleted(app_handle: &AppHandle, payload: TerminalDeletedPayload) {
    if let Err(e) = app_handle.emit(TERMINAL_DELETED, payload) {
        warn!("Failed to emit {} event: {}", TERMINAL_DELETED, e);
    }
}