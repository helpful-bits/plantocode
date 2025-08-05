use log::{error, info, warn};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, command};

use crate::error::{AppError, AppResult};
use crate::models::{RuntimeAIConfig, TaskSpecificModelConfig};
use crate::services::config_cache_service::ConfigCache;
use crate::utils::{read_env, read_env_bool, read_env_f64, read_env_i64};

/// Retrieves the list of providers with their models from the RuntimeAIConfig
#[tauri::command]
pub async fn get_providers_with_models(
    app_handle: AppHandle,
) -> AppResult<Vec<crate::models::ProviderWithModels>> {
    let config_cache = app_handle.state::<ConfigCache>();

    match config_cache.lock() {
        Ok(cache_guard) => {
            if let Some(config_value) = cache_guard.get("runtime_ai_config") {
                match serde_json::from_value::<RuntimeAIConfig>(config_value.clone()) {
                    Ok(config) => Ok(config.providers),
                    Err(e) => {
                        error!("Failed to deserialize runtime AI config from cache: {}", e);
                        Err(AppError::SerializationError(e.to_string()))
                    }
                }
            } else {
                Err(AppError::ConfigError(
                    "Runtime AI configuration not found in cache. Please refresh configuration."
                        .to_string(),
                ))
            }
        }
        Err(e) => {
            error!("Failed to acquire cache lock: {}", e);
            Err(AppError::InternalError(format!(
                "Failed to read configuration cache: {}",
                e
            )))
        }
    }
}

/// Retrieves the default task configurations from the RuntimeAIConfig
#[tauri::command]
pub async fn get_default_task_configurations(
    app_handle: AppHandle,
) -> AppResult<HashMap<String, TaskSpecificModelConfig>> {
    let config_cache = app_handle.state::<ConfigCache>();

    match config_cache.lock() {
        Ok(cache_guard) => {
            if let Some(config_value) = cache_guard.get("runtime_ai_config") {
                match serde_json::from_value::<RuntimeAIConfig>(config_value.clone()) {
                    Ok(config) => Ok(config.tasks),
                    Err(e) => {
                        error!("Failed to deserialize runtime AI config from cache: {}", e);
                        Err(AppError::SerializationError(e.to_string()))
                    }
                }
            } else {
                Err(AppError::ConfigError(
                    "Runtime AI configuration not found in cache. Please refresh configuration."
                        .to_string(),
                ))
            }
        }
        Err(e) => {
            error!("Failed to acquire cache lock: {}", e);
            Err(AppError::InternalError(format!(
                "Failed to read configuration cache: {}",
                e
            )))
        }
    }
}

/// Fetches the runtime AI configuration from the server and updates the local cache
#[tauri::command]
pub async fn fetch_runtime_ai_config(app_handle: AppHandle) -> AppResult<RuntimeAIConfig> {
    info!("Fetching runtime AI configuration from server via command");

    // Use our new config module to fetch and update the runtime AI configuration
    crate::app_setup::config::fetch_and_update_runtime_ai_config(&app_handle).await?;

    // Return the updated configuration from cache
    let config_cache = app_handle.state::<ConfigCache>();

    match config_cache.lock() {
        Ok(cache_guard) => {
            if let Some(config_value) = cache_guard.get("runtime_ai_config") {
                match serde_json::from_value::<RuntimeAIConfig>(config_value.clone()) {
                    Ok(config) => {
                        info!("Runtime AI configuration fetched and updated successfully");
                        Ok(config)
                    }
                    Err(e) => {
                        error!("Failed to deserialize runtime AI config from cache: {}", e);
                        Err(AppError::SerializationError(e.to_string()))
                    }
                }
            } else {
                Err(AppError::ConfigError(
                    "Runtime AI configuration not found in cache after update.".to_string(),
                ))
            }
        }
        Err(e) => {
            error!("Failed to acquire cache lock: {}", e);
            Err(AppError::InternalError(format!(
                "Failed to read configuration cache: {}",
                e
            )))
        }
    }
}

/// Retrieves the server URL from runtime configuration
///
/// This ensures consistent server URL configuration between backend and frontend
#[tauri::command]
pub async fn get_server_url(app_handle: AppHandle) -> AppResult<String> {
    info!("Retrieving server URL configuration");

    let app_state = app_handle.state::<crate::AppState>();
    let server_url = app_state.get_server_url()
        .ok_or_else(|| AppError::ConfigError("No server URL configured. Please select a server region first.".to_string()))?;

    info!("Server URL configuration retrieved: {}", server_url);
    Ok(server_url)
}
