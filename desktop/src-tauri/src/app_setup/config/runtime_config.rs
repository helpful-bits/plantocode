use tauri::{AppHandle, Manager};
use crate::error::AppError;
use log::{info, error, warn};
use crate::models::RuntimeAIConfig;
use crate::config;
use crate::AppState;
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
    
    
    // Check if regex_pattern_generation task configuration exists, if not add default
    let regex_pattern_generation_key = crate::models::TaskType::RegexPatternGeneration.to_string();
    if !runtime_config.tasks.contains_key(&regex_pattern_generation_key) {
        warn!("Task-specific configuration not found for task {}, using default", regex_pattern_generation_key);
        
        if runtime_config.default_llm_model_id.is_empty() {
            error!("Server configuration is incomplete: missing default LLM model ID and task-specific config for {:?}", regex_pattern_generation_key);
            return Err(AppError::ConfigError("Server configuration incomplete: missing default model configuration".to_string()));
        }
        
        warn!("Using server default model for missing task-specific config: {:?}", regex_pattern_generation_key);
        let default_config = crate::models::TaskSpecificModelConfig {
            model: runtime_config.default_llm_model_id.clone(),
            max_tokens: 1000, // Minimal sensible default
            temperature: 0.2,  // Minimal sensible default
        };
        
        runtime_config.tasks.insert(regex_pattern_generation_key, default_config);
    }
    
    // Validate that we have models available
    if runtime_config.available_models.is_empty() {
        warn!("No available models found in runtime AI configuration from server");
    } else {
        info!("Loaded {} models from server", runtime_config.available_models.len());
    }
    
    if let Err(e) = config::update_runtime_ai_config(runtime_config) {
        let error_msg = format!("Failed to update runtime AI config: {}", e);
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
    
    info!("Runtime AI configuration fetched and updated successfully");
    
    Ok(())
}