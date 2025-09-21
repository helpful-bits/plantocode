use crate::error::AppResult;
use std::path::PathBuf;
use tauri::Manager;
use tokio::fs::{OpenOptions, create_dir_all};
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn append_to_log_file(
    app: tauri::AppHandle,
    rel_path: String,
    content: String,
) -> AppResult<()> {
    // Resolve under AppData directory
    let mut full: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::FileSystemError(format!("app_data_dir error: {e}")))?;
    full.push(rel_path);

    if let Some(parent) = full.parent() {
        create_dir_all(parent)
            .await
            .map_err(|e| crate::error::AppError::IoError(format!("create_dir_all: {e}")))?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&full)
        .await
        .map_err(|e| crate::error::AppError::IoError(format!("open(append): {e}")))?;

    // Write the line and a newline terminator to keep JSONL/CSV tailable
    file.write_all(content.as_bytes())
        .await
        .map_err(|e| crate::error::AppError::IoError(format!("write_all: {e}")))?;
    file.write_all(b"\n")
        .await
        .map_err(|e| crate::error::AppError::IoError(format!("write_all newline: {e}")))?;
    file.flush()
        .await
        .map_err(|e| crate::error::AppError::IoError(format!("flush: {e}")))?;
    Ok(())
}

#[tauri::command]
pub async fn log_client_error(
    app_handle: tauri::AppHandle,
    level: String,
    error_type: String,
    message: String,
    context: Option<String>,
    stack: Option<String>,
    metadata: Option<String>,
    app_version: Option<String>,
    platform: Option<String>,
) -> Result<(), crate::error::AppError> {
    use std::sync::Arc;

    if let Some(repo_state) = app_handle.try_state::<Arc<crate::db_utils::ErrorLogRepository>>() {
        repo_state
            .insert_error(
                &level,
                Some(&error_type),
                &message,
                context.as_deref(),
                stack.as_deref(),
                metadata.as_deref(),
                app_version.as_deref(),
                platform.as_deref(),
            )
            .await?;
    } else {
        tracing::warn!("ErrorLogRepository not available yet; dropping client error log.");
    }
    Ok(())
}
