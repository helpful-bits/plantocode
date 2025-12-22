use crate::utils::ffmpeg_utils;
use log::info;
use std::path::PathBuf;
use tauri::command;

#[command]
pub async fn check_ffmpeg_available_command() -> Result<serde_json::Value, String> {
    info!("Checking FFmpeg availability");

    match ffmpeg_utils::verify_sidecars_available().await {
        Ok(()) => {
            info!("FFmpeg is available");
            Ok(serde_json::json!({
                "available": true
            }))
        }
        Err(e) => {
            info!("FFmpeg is not available: {}", e);
            Ok(serde_json::json!({
                "available": false,
                "message": e.to_string()
            }))
        }
    }
}

/// Remux a video file in place to fix container metadata (duration, bitrate).
/// This is used after streaming MediaRecorder chunks directly to disk.
#[command]
pub async fn remux_video_command(path: String) -> Result<(), String> {
    info!("Remuxing video file: {}", path);

    let video_path = PathBuf::from(&path);

    if !video_path.exists() {
        return Err(format!("Video file does not exist: {}", path));
    }

    ffmpeg_utils::remux_video_in_place(&video_path)
        .await
        .map_err(|e| format!("Failed to remux video: {}", e))?;

    info!("Successfully remuxed video file: {}", path);
    Ok(())
}
