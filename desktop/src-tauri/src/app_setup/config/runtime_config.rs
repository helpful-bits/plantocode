use tauri::{AppHandle, Manager};
use crate::error::AppError;
use log::{info, error, warn};
use crate::models::RuntimeAIConfig;
use crate::AppState;
use crate::services::config_cache_service::ConfigCache;
use std::sync::Arc;

/// Fetch runtime AI configuration from the server and update local config
/// 
/// This function retrieves configuration data via the server proxy client
/// and updates the application's local runtime AI configuration.
/// It also handles error reporting by storing any errors in the app state.
pub async fn fetch_and_update_runtime_ai_config(app_handle: &AppHandle) -> Result<(), AppError> {
    // Fetch RuntimeAIConfig from server using the ServerProxyClient which is already initialized and managed
    info!("Fetching RuntimeAIConfig from server");
    
    // Get ServerProxyClient from app state
    let server_proxy_client = app_handle.state::<Arc<crate::api_clients::server_proxy_client::ServerProxyClient>>()
        .inner()
        .clone();
    
    // Call the get_runtime_ai_config method on ServerProxyClient
    // This endpoint now gets model information from the database instead of environment variables
    let runtime_config_value = server_proxy_client.get_runtime_ai_config().await?;
    
    // Deserialize the Value into RuntimeAIConfig
    let mut runtime_config: RuntimeAIConfig = match serde_json::from_value(runtime_config_value.clone()) {
        Ok(config) => config,
        Err(e) => {
            let error_msg = format!("Failed to deserialize runtime AI config: {}", e);
            error!("{}", &error_msg);
            error!("Raw value: {:?}", runtime_config_value);
            
            // Store error in app state
            let app_state = app_handle.state::<AppState>();
            if let Ok(mut guard) = app_state.config_load_error.lock() {
                *guard = Some(error_msg.clone());
            } else {
                error!("Failed to acquire lock on config_load_error");
            }
            
            return Err(AppError::SerializationError(e.to_string()));
        }
    };
    
    
    // All task configurations MUST come from the server database
    // No hardcoded fallbacks allowed
    
    // Validate that we have models available
    let total_models: usize = runtime_config.providers.iter().map(|p| p.models.len()).sum();
    if total_models == 0 {
        warn!("No available models found in runtime AI configuration from server");
    } else {
        info!("Loaded {} models from server", total_models);
    }
    
    // Get the config cache from managed state and insert the RuntimeAIConfig
    let config_cache = app_handle.state::<ConfigCache>();
    match config_cache.lock() {
        Ok(mut cache_guard) => {
            // Store the fetched RuntimeAIConfig in the cache with key "runtime_ai_config"
            cache_guard.insert("runtime_ai_config".to_string(), runtime_config_value);
        }
        Err(e) => {
            let error_msg = format!("Failed to acquire cache lock to store runtime AI config: {}", e);
            error!("{}", error_msg);
            
            // Store error in app state
            let app_state = app_handle.state::<AppState>();
            if let Ok(mut guard) = app_state.config_load_error.lock() {
                *guard = Some(error_msg.clone());
            } else {
                error!("Failed to acquire lock on config_load_error");
            }
            
            return Err(AppError::ConfigError(error_msg));
        }
    }
    
    info!("Runtime AI configuration fetched and updated successfully");
    
    Ok(())
}