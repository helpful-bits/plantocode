use tauri::{AppHandle, Manager, State, command};
use std::collections::HashMap;
use std::sync::Arc;
use log::{info, error, warn};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::models::{ModelInfo, RuntimeAiConfig, TaskSpecificModelConfig};
use crate::api_clients::client_factory::ClientFactory;
use crate::utils::{read_env, read_env_bool, read_env_i64, read_env_f64};

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
) -> AppResult<RuntimeAiConfig> {
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


/// Retrieves Firebase authentication configuration for the front-end
/// 
/// This command provides secure access to the Firebase configuration from environment variables
/// or another secure storage mechanism to the frontend, solving issues with Vite environment
/// variables in Tauri v2.
#[tauri::command]
pub async fn get_runtime_firebase_config(_app_handle: AppHandle) -> AppResult<Value> {
    info!("Retrieving Firebase authentication configuration");
    
    // Get Firebase configuration using the centralized env_utils
    // We prefer standard env vars over VITE_ prefixed ones for production builds
    let fb_auth_domain = read_env("FIREBASE_AUTH_DOMAIN", "", true);
    
    // Log the Firebase auth domain for debugging
    info!("Using Firebase auth domain: {}", fb_auth_domain);
    
    let firebase_config = serde_json::json!({
        "apiKey": read_env("FIREBASE_API_KEY", "", true),
        "authDomain": fb_auth_domain,
        "projectId": read_env("FIREBASE_PROJECT_ID", "", true),
        "storageBucket": read_env("FIREBASE_STORAGE_BUCKET", "", true),
        "messagingSenderId": read_env("FIREBASE_MESSAGING_SENDER_ID", "", true),
        "appId": read_env("FIREBASE_APP_ID", "", true),
        // Add any other Firebase config fields that might be needed by the frontend
        "measurementId": read_env("FIREBASE_MEASUREMENT_ID", "", true),
    });
    
    // Validate that we have at least the required fields
    if firebase_config["apiKey"].as_str().map_or(true, |s| s.is_empty()) ||
       firebase_config["authDomain"].as_str().map_or(true, |s| s.is_empty()) {
        error!("Firebase configuration is missing required fields");
        error!("apiKey: {}, authDomain: {}", 
            firebase_config["apiKey"].as_str().unwrap_or("MISSING"),
            firebase_config["authDomain"].as_str().unwrap_or("MISSING"));
        return Err(AppError::ConfigError("Firebase configuration is incomplete or missing. Check environment variables".into()));
    }
    
    info!("Firebase configuration retrieved successfully");
    Ok(firebase_config)
}

/// Retrieves the server URL from environment variables
/// 
/// This ensures consistent server URL configuration between backend and frontend
#[tauri::command]
pub async fn get_server_url(_app_handle: AppHandle) -> AppResult<String> {
    info!("Retrieving server URL configuration");
    
    // Get server URL using the centralized env_utils with a default
    // Prefer standard SERVER_URL over VITE_SERVER_URL
    let server_url = read_env("SERVER_URL", "http://localhost:8080", true);
    
    info!("Server URL configuration retrieved: {}", server_url);
    Ok(server_url)
}