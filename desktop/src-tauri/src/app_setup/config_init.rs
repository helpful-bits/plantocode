use tauri::{AppHandle, Manager};
use crate::error::AppError;
use log::{info, error};
use crate::models::RuntimeAiConfig;
use crate::config;
use crate::AppState;

pub async fn initialize_application_configuration(app_handle: &AppHandle) -> Result<(), AppError> {
    // Initialize configuration - ensure Stronghold plugin is initialized
    if let Some(stronghold) = app_handle.try_state::<tauri_plugin_stronghold::stronghold::Stronghold>() {
        config::init_config(&stronghold).await
            .map_err(|e| AppError::ConfigError(format!("Failed to initialize configuration: {}", e)))?;
        
        info!("Configuration initialized with Stronghold plugin");
    } else {
        // Handle the case where Stronghold isn't available yet
        error!("Stronghold plugin state not available. Ensure the plugin is properly initialized.");
        return Err(AppError::ConfigError("Stronghold plugin state not available".to_string()));
    }
    
    Ok(())
}

pub async fn fetch_and_update_runtime_ai_config(app_handle: &AppHandle) -> Result<(), AppError> {
    // Fetch RuntimeAiConfig from server
    info!("Fetching RuntimeAiConfig from server");
    let http_client = app_handle.state::<tauri_plugin_http::reqwest::Client>();
    // TODO: Replace with actual server URL from environment or configuration
    let server_url = "http://localhost:8000/api/config/runtime";
    
    let response = http_client.get(server_url).send().await
        .map_err(|e| AppError::HttpError(e.to_string()))?;
    
    if !response.status().is_success() {
        let error_msg = format!("Failed to fetch runtime AI config: Server responded with status {}", response.status());
        error!("{}", error_msg);
        
        // Store error in app state
        let app_state = app_handle.state::<AppState>();
        if let Ok(mut guard) = app_state.config_load_error.lock() {
            *guard = Some(error_msg.clone());
        } else {
            error!("Failed to acquire lock on config_load_error");
        }
        
        return Err(AppError::HttpError(format!("Server responded with status {}", response.status())));
    }
    
    let runtime_config = response.json::<RuntimeAiConfig>().await
        .map_err(|e| {
            let error_msg = format!("Failed to deserialize runtime AI config: {}", e);
            error!("{}", &error_msg);
            
            // Store error in app state
            let app_state = app_handle.state::<AppState>();
            if let Ok(mut guard) = app_state.config_load_error.lock() {
                *guard = Some(error_msg.clone());
            } else {
                error!("Failed to acquire lock on config_load_error");
            }
            
            AppError::SerializationError(e.to_string())
        })?;
    
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
