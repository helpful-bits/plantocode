use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn broadcast_project_directory_changed_command(
    app_handle: AppHandle,
    project_directory: String,
) -> Result<(), String> {
    use serde_json::json;

    let payload = json!({
        "type": "project-directory-updated",
        "payload": {
            "projectDirectory": project_directory
        },
        "relayOrigin": "local"
    });

    app_handle
        .emit("device-link-event", payload)
        .map_err(|e| format!("emit failed: {e}"))?;

    Ok(())
}
