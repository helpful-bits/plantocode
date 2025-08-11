use serde::Deserialize;
use tauri::{AppHandle, Manager};
use crate::db_utils::ErrorLogRepository;
use crate::error::AppResult;

#[derive(Deserialize)]
pub struct ClientErrorArgs {
  pub error: String,
  #[serde(rename = "errorType")]
  pub error_type: Option<String>,
  pub context: Option<String>,
  pub metadata: Option<serde_json::Value>,
  pub stack: Option<String>,
}

#[tauri::command]
pub async fn log_client_error(app_handle: AppHandle, args: ClientErrorArgs) -> AppResult<()> {
  let repo = app_handle.state::<ErrorLogRepository>().inner().clone();
  let app_version = app_handle.package_info().version.to_string();
  let platform = std::env::consts::OS.to_string();
  let metadata_json = args.metadata.as_ref().map(|v| v.to_string());

  repo.insert_error(
    "ERROR",
    args.error_type.as_deref(),
    &args.error,
    args.context.as_deref(),
    args.stack.as_deref(),
    metadata_json.as_deref(),
    Some(&app_version),
    Some(&platform),
  ).await
}