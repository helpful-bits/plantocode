use serde::Serialize;
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

pub fn emit_session_auto_files_applied(
    app: &AppHandle,
    payload: SessionAutoFilesAppliedPayload,
) {
    let _ = app.emit("session:auto-files-applied", &payload);
}