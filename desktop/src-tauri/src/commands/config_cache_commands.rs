use tauri::{AppHandle, Manager, State};
use std::collections::HashMap;
use serde_json::Value as JsonValue;
use crate::error::AppResult;
use crate::services::config_cache_service::{
    fetch_and_cache_server_configurations, 
    get_cached_config_value as get_cached_config_value_service, 
    get_all_cached_config_values,
    refresh_config_cache
};
use tracing::{info, instrument};

/// Refresh the configuration cache
#[tauri::command]
#[instrument(skip(app_handle))]
pub async fn refresh_config_cache_command(
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Command: refresh_config_cache_command");
    refresh_config_cache(&app_handle).await
}

/// Get a specific cached configuration value by key
#[tauri::command]
#[instrument(skip(app_handle))]
pub async fn get_cached_config_value(
    key: String,
    app_handle: AppHandle,
) -> AppResult<Option<JsonValue>> {
    info!("Command: get_cached_config_value for key: {}", key);
    Ok(get_cached_config_value_service(&key, &app_handle))
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


