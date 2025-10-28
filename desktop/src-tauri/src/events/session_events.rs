use serde::Serialize;
use serde_json;
use tauri::{AppHandle, Emitter};

/// Explicit payload structs guarantee camelCase serialization end-to-end
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionUpdatedEventPayload<'a> {
    session_id: &'a str,
    session: &'a serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionDeletedEventPayload<'a> {
    session_id: &'a str,
}

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
    let payload = SessionUpdatedEventPayload {
        session_id,
        session: session_obj,
    };
    let payload_value = serde_json::to_value(&payload).map_err(|e| format!("serialization failed: {e}"))?;

    app.emit("session-updated", &payload_value)
        .map_err(|e| format!("local emit failed: {e}"))?;
    app.emit("device-link-event", serde_json::json!({
        "type": "session-updated",
        "payload": payload_value
    })).map_err(|e| format!("relay emit failed: {e}"))?;
    Ok(())
}

pub fn emit_session_updated_from_model(app: &AppHandle, session: &crate::models::Session) -> Result<(), String> {
    let session_json = serde_json::to_value(session).map_err(|e| format!("serialization failed: {e}"))?;
    emit_session_updated(app, &session.id, &session_json)
}

pub fn emit_session_field_validated(
    app: &AppHandle,
    session_id: &str,
    field: &str,
    checksum: &str,
    length: usize,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "sessionId": session_id,
        "field": field,
        "checksum": checksum,
        "length": length
    });

    app.emit("session-field-validated", &payload)
        .map_err(|e| format!("local emit failed: {e}"))?;

    app.emit("device-link-event", serde_json::json!({
        "type": "session-field-validated",
        "payload": payload
    })).map_err(|e| format!("relay emit failed: {e}"))?;

    Ok(())
}

pub fn emit_session_deleted(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let payload = SessionDeletedEventPayload {
        session_id,
    };
    let payload_value = serde_json::to_value(&payload).map_err(|e| format!("serialization failed: {e}"))?;

    app.emit("session-deleted", &payload_value)
        .map_err(|e| format!("local emit failed: {e}"))?;
    app.emit("device-link-event", serde_json::json!({
        "type": "session-deleted",
        "payload": payload_value
    })).map_err(|e| format!("relay emit failed: {e}"))?;
    Ok(())
}

pub fn emit_history_state_changed<T: Serialize>(
    app: &AppHandle,
    session_id: &str,
    kind: &str,
    state: &T,
) {
    let payload = serde_json::json!({
        "sessionId": session_id,
        "kind": kind,
        "state": state,
    });

    if let Err(e) = app.emit("history-state-changed", payload.clone()) {
        eprintln!("Failed to emit history-state-changed locally: {}", e);
    }

    let device_link_payload = serde_json::json!({
        "type": "history-state-changed",
        "payload": payload,
    });

    if let Err(e) = app.emit("device-link-event", device_link_payload) {
        eprintln!("Failed to emit history-state-changed to device-link: {}", e);
    }
}

pub fn emit_history_state_validated(
    app: &AppHandle,
    session_id: &str,
    kind: &str,
    checksum: &str,
    entries_count: usize,
    current_index: i64,
) {
    let payload = serde_json::json!({
        "sessionId": session_id,
        "kind": kind,
        "checksum": checksum,
        "entriesCount": entries_count,
        "currentIndex": current_index,
    });

    if let Err(e) = app.emit("history-state-validated", payload) {
        eprintln!("Failed to emit history-state-validated: {}", e);
    }
}
