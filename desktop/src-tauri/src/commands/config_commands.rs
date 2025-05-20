use tauri::{AppHandle, Manager, State, command};
use std::collections::HashMap;
use std::sync::Arc;
use log::{info, error, warn};
use serde_json::Value;
use std::env;

use crate::error::{AppError, AppResult};
use crate::models::{ModelInfo, RuntimeAiConfig, TaskSpecificModelConfig};
use crate::api_clients::client_factory::ClientFactory;
use tauri_plugin_stronghold::stronghold::Stronghold;

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
    
    // Get Firebase configuration from environment variables
    // Prioritize non-prefixed environment variables
    let firebase_config = serde_json::json!({
        "apiKey": env::var("FIREBASE_API_KEY").unwrap_or_else(|_| {
            // Fall back to VITE_ prefixed variables for development compatibility only
            env::var("VITE_FIREBASE_API_KEY").unwrap_or_default()
        }),
        "authDomain": env::var("FIREBASE_AUTH_DOMAIN").unwrap_or_else(|_| {
            env::var("VITE_FIREBASE_AUTH_DOMAIN").unwrap_or_default()
        }),
        "projectId": env::var("FIREBASE_PROJECT_ID").unwrap_or_else(|_| {
            env::var("VITE_FIREBASE_PROJECT_ID").unwrap_or_default()
        }),
        "storageBucket": env::var("FIREBASE_STORAGE_BUCKET").unwrap_or_else(|_| {
            env::var("VITE_FIREBASE_STORAGE_BUCKET").unwrap_or_default()
        }),
        "messagingSenderId": env::var("FIREBASE_MESSAGING_SENDER_ID").unwrap_or_else(|_| {
            env::var("VITE_FIREBASE_MESSAGING_SENDER_ID").unwrap_or_default()
        }),
        "appId": env::var("FIREBASE_APP_ID").unwrap_or_else(|_| {
            env::var("VITE_FIREBASE_APP_ID").unwrap_or_default()
        }),
        // Add any other Firebase config fields that might be needed by the frontend
        "measurementId": env::var("FIREBASE_MEASUREMENT_ID").unwrap_or_else(|_| {
            env::var("VITE_FIREBASE_MEASUREMENT_ID").unwrap_or_default()
        }),
    });
    
    // Validate that we have at least the required fields
    if firebase_config["apiKey"].as_str().map_or(true, |s| s.is_empty()) ||
       firebase_config["authDomain"].as_str().map_or(true, |s| s.is_empty()) {
        error!("Firebase configuration is missing required fields");
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
    
    // Get server URL from environment variables
    // Prioritize the standard SERVER_URL environment variable
    let server_url = env::var("SERVER_URL").unwrap_or_else(|_| {
        // Fall back to VITE_ prefixed variables only for development compatibility
        env::var("VITE_SERVER_URL").unwrap_or_else(|_| {
            // Default to localhost if not configured
            "http://localhost:8080".to_string()
        })
    });
    
    info!("Server URL configuration retrieved: {}", server_url);
    Ok(server_url)
}