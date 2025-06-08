use tauri::{AppHandle, Manager, State};
use std::collections::HashMap;
use serde_json::Value as JsonValue;
use crate::error::AppResult;
use crate::services::server_config_service::{
    fetch_and_cache_server_configurations, 
    get_cached_config_value, 
    get_all_cached_config_values,
    refresh_server_config_cache
};
use tracing::{info, instrument};

/// Fetch server configurations and cache them
#[tauri::command]
#[instrument(skip(app_handle))]
pub async fn fetch_server_configurations_command(
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Command: fetch_server_configurations_command");
    fetch_and_cache_server_configurations(&app_handle).await
}

/// Get a specific cached configuration value by key
#[tauri::command]
#[instrument(skip(app_handle))]
pub async fn get_cached_config_value_command(
    key: String,
    app_handle: AppHandle,
) -> AppResult<Option<JsonValue>> {
    info!("Command: get_cached_config_value_command for key: {}", key);
    Ok(get_cached_config_value(&key, &app_handle))
}

/// Get all cached configuration values
#[tauri::command]
#[instrument(skip(app_handle))]
pub async fn get_all_cached_config_values_command(
    app_handle: AppHandle,
) -> AppResult<HashMap<String, JsonValue>> {
    info!("Command: get_all_cached_config_values_command");
    get_all_cached_config_values(&app_handle)
}

/// Refresh the server configuration cache
#[tauri::command]
#[instrument(skip(app_handle))]
pub async fn refresh_server_config_cache_command(
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Command: refresh_server_config_cache_command");
    refresh_server_config_cache(&app_handle).await
}

/// Get the server URL from runtime configuration
#[tauri::command]
#[instrument(skip(app_handle))]
pub async fn get_server_url_command(
    app_handle: AppHandle,
) -> AppResult<String> {
    info!("Command: get_server_url_command");
    
    let runtime_config = app_handle.try_state::<crate::config::RuntimeConfig>()
        .ok_or_else(|| crate::error::AppError::ConfigError("Runtime configuration not available".to_string()))?;
    
    Ok(runtime_config.server_url.clone())
}