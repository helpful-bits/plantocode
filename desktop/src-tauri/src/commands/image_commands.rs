use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, command};
use tokio::fs;

/// Derive file extension from filename or MIME type
fn derive_extension(file_name: &Option<String>, mime_type: &Option<String>) -> String {
    if let Some(name) = file_name {
        if let Some(dot_pos) = name.rfind('.') {
            return name[dot_pos + 1..].to_lowercase();
        }
    }

    match mime_type.as_deref() {
        Some("image/png") => "png".to_string(),
        Some("image/jpeg") => "jpg".to_string(),
        Some("image/gif") => "gif".to_string(),
        Some("image/webp") => "webp".to_string(),
        Some("image/bmp") => "bmp".to_string(),
        Some("image/svg+xml") => "svg".to_string(),
        _ => "png".to_string(), // Default fallback
    }
}

/// Build a unique filename with timestamp
fn build_image_filename(extension: &str) -> String {
    let timestamp = chrono::Utc::now().timestamp_millis();
    format!("plantocode-image-{}.{}", timestamp, extension)
}

#[command]
pub async fn save_pasted_image_command(
    app_handle: AppHandle,
    session_id: String,
    file_name: Option<String>,
    mime_type: Option<String>,
    data: Vec<u8>,
) -> AppResult<String> {
    if data.is_empty() {
        return Err(AppError::TerminalError(
            "Clipboard image data was empty".into(),
        ));
    }

    // Get terminal manager to find session's working directory
    let terminal_manager = app_handle
        .state::<std::sync::Arc<crate::services::TerminalManager>>()
        .inner()
        .clone();

    // Try to get working directory from current terminal session
    let working_directory = if let Some(session_wd) =
        terminal_manager.get_session_working_directory(&session_id)
    {
        PathBuf::from(session_wd)
    } else {
        // Fallback to home directory if session not found
        dirs::home_dir().ok_or_else(|| {
            AppError::TerminalError("Unable to resolve working directory for image paste".into())
        })?
    };

    let images_dir = working_directory
        .join(".plantocode")
        .join("pasted-images");

    fs::create_dir_all(&images_dir).await.map_err(|e| {
        AppError::TerminalError(format!(
            "Failed to create images directory {:?}: {}",
            images_dir, e
        ))
    })?;

    let extension = derive_extension(&file_name, &mime_type);
    let file_name = build_image_filename(&extension);
    let file_path = images_dir.join(file_name);

    fs::write(&file_path, data).await.map_err(|e| {
        AppError::TerminalError(format!("Failed to write image {:?}: {}", file_path, e))
    })?;

    file_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::TerminalError("Image path contained invalid UTF-8".into()))
}
