use serde::Serialize;
use serde_json;
use tauri::{AppHandle, Emitter};

/// Emitted when session files are updated (unified event for all file selection changes)
/// event: "session-files-updated"
/// payload: { sessionId, includedFiles, forceExcludedFiles }
pub fn emit_session_files_updated(
    app: &tauri::AppHandle,
    session_id: &str,
    included_files: &Vec<String>,
    force_excluded_files: &Vec<String>,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "sessionId": session_id,
        "includedFiles": included_files,
        "forceExcludedFiles": force_excluded_files
    });

    app.emit("session-files-updated", &payload)
        .map_err(|e| format!("local emit failed: {e}"))?;

    app.emit("device-link-event", serde_json::json!({
        "type": "session-files-updated",
        "payload": payload
    })).map_err(|e| format!("relay emit failed: {e}"))?;

    Ok(())
}

pub fn emit_session_updated(app: &AppHandle, session_id: &str, session_obj: &serde_json::Value) -> Result<(), String> {
    app.emit("session-updated", serde_json::json!({ "sessionId": session_id, "session": session_obj }))
        .map_err(|e| format!("local emit failed: {e}"))?;
    app.emit("device-link-event", serde_json::json!({
        "type": "session-updated",
        "payload": { "sessionId": session_id, "session": session_obj }
    })).map_err(|e| format!("relay emit failed: {e}"))?;
    Ok(())
}

pub fn emit_session_deleted(app: &AppHandle, session_id: &str) -> Result<(), String> {
    app.emit("session-deleted", serde_json::json!({ "sessionId": session_id }))
        .map_err(|e| format!("local emit failed: {e}"))?;
    app.emit("device-link-event", serde_json::json!({
        "type": "session-deleted",
        "payload": { "sessionId": session_id }
    })).map_err(|e| format!("relay emit failed: {e}"))?;
    Ok(())
}
