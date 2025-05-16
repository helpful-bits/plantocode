use tauri::{AppHandle, Manager, State, command};
use std::collections::HashMap;
use log::info;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::models::{ModelInfo, RuntimeAiConfig, TaskSpecificModelConfig};
use crate::api_clients::client_factory::ClientFactory;

/// Retrieves the list of available AI models from the RuntimeAiConfig
#[tauri::command]
pub async fn get_available_ai_models(app_handle: AppHandle) -> AppResult<Vec<ModelInfo>> {
    match crate::config::get_runtime_ai_config() {
        Ok(Some(config)) => Ok(config.available_models),
        Ok(None) => Err(AppError::ConfigError("Runtime AI configuration not found".to_string())),
        Err(e) => Err(AppError::ConfigError(format!("Failed to get runtime AI configuration: {}", e))),
    }
}

/// Retrieves the default task configurations from the RuntimeAiConfig
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
    client_factory: State<'_, ClientFactory>
) -> AppResult<RuntimeAiConfig> {
    info!("Fetching runtime AI configuration from server");
    
    // Get a server proxy client
    let client = client_factory.get_server_proxy_client(app_handle.clone())?;
    
    // Fetch the configuration from the server
    let config_json = client.get_runtime_ai_config().await?;
    
    // Convert to RuntimeAiConfig
    let runtime_config: RuntimeAiConfig = serde_json::from_value(config_json)
        .map_err(|e| AppError::ConfigError(format!("Failed to deserialize runtime AI config: {}", e)))?;
    
    // Update the in-memory configuration
    crate::config::update_runtime_ai_config(runtime_config.clone())?;
    
    info!("Runtime AI configuration updated from server");
    Ok(runtime_config)
}

