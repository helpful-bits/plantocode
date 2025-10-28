use crate::AppState;
use crate::constants::DB_FILENAME;
use crate::db_utils;
use crate::error::{AppError, AppResult};
use crate::models::DatabaseInfo;
use log::info;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, command};

#[command]
pub fn get_app_info() -> String {
    "PlanToCode Desktop".to_string()
}

#[command]
pub fn get_config_load_error(app_state: State<'_, AppState>) -> AppResult<Option<String>> {
    let error = app_state.config_load_error.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to acquire config_load_error lock: {}", e))
    })?;
    Ok(error.clone())
}

#[command]
pub async fn get_database_info_command(app_handle: AppHandle) -> AppResult<DatabaseInfo> {
    info!("Fetching database information");
    let db_arc = app_handle
        .state::<Arc<sqlx::SqlitePool>>()
        .inner()
        .clone();

    db_utils::get_database_info(db_arc)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get database info: {}", e)))
}

#[command]
pub fn get_database_path_command(app_handle: AppHandle) -> AppResult<String> {
    info!("Getting database file path");
    let app_data_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::InternalError(format!("Failed to get app local data dir: {}", e)))?;

    let db_path = app_data_dir.join(DB_FILENAME);
    Ok(db_path.to_string_lossy().to_string())
}

#[derive(Serialize)]
pub struct ResourceInfo {
    pub memory_mb: u64,
    pub cpu_percent: f32,
    pub ws_connected: bool,
}

#[command]
pub async fn get_resource_info_command(app_handle: AppHandle) -> AppResult<ResourceInfo> {
    info!("Getting resource information");

    // Check WebSocket connection status
    let ws_connected = if let Some(client) = app_handle.try_state::<Arc<crate::services::device_link_client::DeviceLinkClient>>() {
        client.is_connected()
    } else {
        false
    };

    // NOTE: This is a placeholder implementation
    // To get actual CPU and memory metrics, add sysinfo = "0.30" to Cargo.toml
    // and use the following code:
    //
    // use sysinfo::{System, SystemExt, CpuExt};
    // let mut sys = System::new_all();
    // sys.refresh_all();
    // let total_mem = sys.total_memory() / 1024 / 1024;
    // let cpu_percent = sys.global_cpu_info().cpu_usage();

    Ok(ResourceInfo {
        memory_mb: 0, // Placeholder - requires sysinfo crate
        cpu_percent: 0.0, // Placeholder - requires sysinfo crate
        ws_connected,
    })
}
