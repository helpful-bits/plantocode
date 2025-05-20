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

/// Initialize application configuration with Stronghold secure storage
/// 
/// This function attempts to initialize configuration using Stronghold
/// with multiple retries in case the plugin is not immediately available.
/// If all retries fail, it falls back to a non-secure development mode.
#[tauri::command]
pub async fn initialize_secure_storage(app_handle: AppHandle) -> Result<(), AppError> {
    // Initialize configuration - ensure Stronghold plugin is initialized
    // This is critical for security, but we'll make it fault-tolerant
    
    // Attempt to retrieve Stronghold state with multiple retries
    let mut retry_count = 0;
    let max_retries = 3;
    let retry_delay_ms = 500;
    
    while retry_count < max_retries {
        match app_handle.try_state::<Arc<Stronghold>>() { 
            Some(stronghold_arc) => {
                // Get a reference to the Stronghold instance
                let stronghold_instance_ref = stronghold_arc.as_ref();
                
                // Generate a predictable password using app identifier to ensure consistency
                // In a production app, this would be derived securely or obtained from the user
                let app_identifier = app_handle.package_info().name.clone();
                
                // Initialize configuration with Stronghold
                if let Err(e) = crate::config::init_config(stronghold_instance_ref).await {
                    error!("Failed to initialize configuration with Stronghold: {}", e);
                    
                    // If init_config fails, retry after delay
                    tokio::time::sleep(tokio::time::Duration::from_millis(retry_delay_ms)).await;
                    retry_count += 1;
                    continue;
                }
                
                info!("Configuration initialized with Stronghold plugin successfully");
                return Ok(());
            }
            None => {
                // Stronghold not available yet, wait and retry
                if retry_count < max_retries - 1 {
                    warn!("Stronghold plugin state not available, retrying ({}/{})", retry_count + 1, max_retries);
                    tokio::time::sleep(tokio::time::Duration::from_millis(retry_delay_ms)).await;
                    retry_count += 1;
                } else {
                    // We've tried enough times, proceed with dev fallback
                    warn!("Stronghold plugin state not available after {} retries. Using development fallback.", max_retries);
                    
                    // Use the no-Stronghold version for development
                    if let Err(e) = crate::config::init_config_without_stronghold().await {
                        error!("Failed to initialize configuration without Stronghold: {}", e);
                        return Err(AppError::ConfigError(format!("Failed to initialize configuration: {}", e)));
                    }
                    
                    info!("Successfully initialized with development configuration (without secure storage)");
                    return Ok(());
                }
            }
        }
    }
    
    // If we reached here, all retries failed but we'll use development fallback
    warn!("Failed to initialize Stronghold after maximum retries. Using development fallback.");
    
    // Use the no-Stronghold version for development
    if let Err(e) = crate::config::init_config_without_stronghold().await {
        error!("Failed to initialize configuration without Stronghold: {}", e);
        return Err(AppError::ConfigError(format!("Failed to initialize configuration: {}", e)));
    }
    
    info!("Successfully initialized with development configuration (without secure storage)");
    Ok(())
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
    let firebase_config = serde_json::json!({
        "apiKey": env::var("FIREBASE_API_KEY").unwrap_or_else(|_| {
            // Fall back to VITE_ prefixed variables for compatibility
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
    let server_url = env::var("SERVER_URL").unwrap_or_else(|_| {
        // Fall back to VITE_ prefixed variables for compatibility
        env::var("VITE_SERVER_URL").unwrap_or_else(|_| {
            // Default to localhost if not configured
            "http://localhost:8080".to_string()
        })
    });
    
    info!("Server URL configuration retrieved: {}", server_url);
    Ok(server_url)
}