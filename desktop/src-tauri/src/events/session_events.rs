use serde::Serialize;
use serde_json;
use tauri::{AppHandle, Emitter};

/// Emitted after backend auto-applies discovered files to a session:
/// event: "session:auto-files-applied"
/// payload: { session_id, job_id, task_type, files }
#[derive(Debug, Serialize)]
pub struct SessionAutoFilesAppliedPayload {
    pub session_id: String,
    pub job_id: String,
    pub task_type: String,
    pub files: Vec<String>,
}

pub fn emit_session_auto_files_applied(app: &AppHandle, payload: SessionAutoFilesAppliedPayload) {
    let _ = app.emit("session:auto-files-applied", &payload);

    // Also emit device-link-event for remote devices
    let _ = app.emit(
        "device-link-event",
        serde_json::json!({
            "type": "session:auto-files-applied",
            "payload": payload
        }),
    );
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
