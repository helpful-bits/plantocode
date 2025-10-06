use crate::auth::device_id_manager;
use crate::error::AppResult;
use tauri::{AppHandle, command};

/// Get the device ID
#[command]
pub async fn get_device_id(app_handle: AppHandle) -> AppResult<String> {
    device_id_manager::get_or_create(&app_handle)
}
