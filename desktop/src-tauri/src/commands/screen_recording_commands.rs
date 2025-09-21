use tauri::{AppHandle, Emitter, Manager, command};

#[command]
pub fn stop_screen_recording(app_handle: AppHandle) -> Result<(), String> {
    if let Err(e) = app_handle.emit("stop-recording-request", ()) {
        log::error!("Failed to emit stop-recording-request event: {}", e);
        return Err(format!(
            "Failed to emit stop-recording-request event: {}",
            e
        ));
    }
    Ok(())
}
