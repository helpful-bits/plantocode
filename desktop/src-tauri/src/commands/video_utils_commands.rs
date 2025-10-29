use crate::error::AppResult;
use crate::utils::ffmpeg_utils;
use std::path::PathBuf;

#[tauri::command]
pub async fn get_video_metadata_command(path: String) -> Result<serde_json::Value, String> {
    let path_buf = PathBuf::from(&path);

    // Verify path exists
    if !path_buf.exists() {
        return Err("Video file not found".to_string());
    }

    // Probe duration
    let duration_ms = ffmpeg_utils::probe_duration_ms(&path_buf)
        .await
        .map_err(|e| format!("Failed to probe video duration: {}", e))?;

    // Get file size
    let metadata = tokio::fs::metadata(&path_buf)
        .await
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let size = metadata.len();

    Ok(serde_json::json!({
        "durationMs": duration_ms,
        "size": size,
        "path": path,
    }))
}
