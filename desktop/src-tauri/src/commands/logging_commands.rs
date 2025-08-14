use tauri::Manager;

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
  platform: Option<String>
) -> Result<(), crate::error::AppError> {
  use std::sync::Arc;
  
  if let Some(repo_state) = app_handle.try_state::<Arc<crate::db_utils::ErrorLogRepository>>() {
    repo_state.insert_error(
      &level,
      Some(&error_type),
      &message,
      context.as_deref(),
      stack.as_deref(),
      metadata.as_deref(),
      app_version.as_deref(),
      platform.as_deref()
    ).await?;
  } else {
    tracing::warn!("ErrorLogRepository not available yet; dropping client error log.");
  }
  Ok(())
}