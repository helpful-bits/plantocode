use crate::AppState;
use crate::constants::DB_FILENAME;
use crate::db_utils;
use crate::error::{AppError, AppResult};
use crate::models::DatabaseInfo;
use log::info;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, command};

#[command]
pub fn get_app_info() -> String {
    "Vibe Manager Desktop".to_string()
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
    let db: sqlx::SqlitePool = app_handle.state::<sqlx::SqlitePool>().inner().clone();
    let db_arc = Arc::new(db);

    db_utils::get_database_info(db_arc)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get database info: {}", e)))
}

#[command]
pub fn get_database_path_command(app_handle: AppHandle) -> AppResult<String> {
    info!("Getting database file path");
    let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        AppError::InternalError(format!("Failed to get app local data dir: {}", e))
    })?;
    
    let db_path = app_data_dir.join(DB_FILENAME);
    Ok(db_path.to_string_lossy().to_string())
}
