use tauri::{AppHandle, Manager, State, command};
use std::collections::HashMap;
use std::sync::Arc;
use log::{info, error, warn};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::models::{ModelInfo, RuntimeAIConfig, TaskSpecificModelConfig};
use crate::utils::{read_env, read_env_bool, read_env_i64, read_env_f64};

/// Retrieves the list of available AI models from the RuntimeAIConfig
#[tauri::command]
pub async fn get_available_ai_models(app_handle: AppHandle) -> AppResult<Vec<ModelInfo>> {
    match crate::config::get_runtime_ai_config() {
        Ok(Some(config)) => Ok(config.available_models),
        Ok(None) => Err(AppError::ConfigError("Runtime AI configuration not found".to_string())),
        Err(e) => Err(AppError::ConfigError(format!("Failed to get runtime AI configuration: {}", e))),
    }
}

/// Retrieves the default task configurations from the RuntimeAIConfig
#[tauri::command]
pub async fn get_default_task_configurations(app_handle: AppHandle) -> AppResult<HashMap<String, TaskSpecificModelConfig>> {
    match crate::config::get_runtime_ai_config() {
        Ok(Some(config)) => Ok(config.tasks),
        Ok(None) => Err(AppError::ConfigError("Runtime AI configuration not found".to_string())),
        Err(e) => Err(AppError::ConfigError(format!("Failed to get runtime AI configuration: {}", e))),
    }
}

/// Fetches the runtime AI configuration from the server and updates the local cache
#[tauri::command]
pub async fn fetch_runtime_ai_config(
    app_handle: AppHandle,
) -> AppResult<RuntimeAIConfig> {
    info!("Fetching runtime AI configuration from server via command");
    
    // Use our new config module to fetch and update the runtime AI configuration
    crate::app_setup::config::fetch_and_update_runtime_ai_config(&app_handle).await?;
    
    // Return the updated configuration
    match crate::config::get_runtime_ai_config() {
        Ok(Some(config)) => {
            info!("Runtime AI configuration fetched and updated successfully");
            Ok(config)
        },
        Ok(None) => Err(AppError::ConfigError("Runtime AI configuration not found after update".to_string())),
        Err(e) => Err(AppError::ConfigError(format!("Failed to get runtime AI configuration: {}", e))),
    }
}



/// Retrieves the server URL from environment variables
/// 
/// This ensures consistent server URL configuration between backend and frontend
#[tauri::command]
pub async fn get_server_url(_app_handle: AppHandle) -> AppResult<String> {
    info!("Retrieving server URL configuration");
    
    // Get server URL using the centralized env_utils with a default
    // Prefer MAIN_SERVER_BASE_URL over SERVER_URL for consistency
    let server_url = read_env("MAIN_SERVER_BASE_URL", 
                            &read_env("SERVER_URL", "http://localhost:8080", false), 
                            true);
    
    info!("Server URL configuration retrieved: {}", server_url);
    Ok(server_url)
}