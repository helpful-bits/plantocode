use crate::error::AppResult;
use crate::utils::disk_utils;
use log::info;
use std::path::Path;
use tauri::command;

#[command]
pub async fn get_disk_space_command(path: String) -> AppResult<serde_json::Value> {
    info!("Getting disk space for path: {}", path);

    let target_path = Path::new(&path);
    let available_bytes = disk_utils::get_available_bytes_for_path(target_path)?;

    Ok(serde_json::json!({
        "availableBytes": available_bytes
    }))
}
