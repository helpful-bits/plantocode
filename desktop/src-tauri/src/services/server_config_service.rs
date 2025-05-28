use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use serde_json::Value as JsonValue;
use tauri::{AppHandle, Manager};
use tracing::{info, error, warn, instrument};
use crate::error::AppError;

/// Cache structure to hold server configurations
pub type ServerConfigCache = Arc<Mutex<HashMap<String, JsonValue>>>;

/// Fetches all server configurations and caches them in Tauri managed state
#[instrument(skip(app_handle))]
pub async fn fetch_and_cache_server_configurations(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Fetching server configurations from API");
    
    // Get the server config cache from managed state
    let cache = app_handle.state::<ServerConfigCache>();
    
    // Make authenticated request to server for all configurations
    match fetch_server_configurations(app_handle).await {
        Ok(configurations) => {
            // Update the cache with fetched configurations
            match cache.lock() {
                Ok(mut cache_guard) => {
                    cache_guard.clear();
                    cache_guard.extend(configurations.clone());
                    info!("Successfully cached {} server configurations", configurations.len());
                    Ok(())
                }
                Err(e) => {
                    error!("Failed to acquire cache lock: {}", e);
                    Err(AppError::ConfigError(format!("Failed to update configuration cache: {}", e)))
                }
            }
        }
        Err(e) => {
            error!("Failed to fetch server configurations: {}", e);
            Err(e)
        }
    }
}

/// Retrieves a cached configuration value by key
#[instrument(skip(app_handle))]
pub fn get_cached_config_value(key: &str, app_handle: &AppHandle) -> Option<JsonValue> {
    let cache = app_handle.state::<ServerConfigCache>();
    
    match cache.lock() {
        Ok(cache_guard) => {
            let value = cache_guard.get(key).cloned();
            if value.is_some() {
                info!("Retrieved cached config value for key: {}", key);
            } else {
                warn!("No cached config value found for key: {}", key);
            }
            value
        }
        Err(e) => {
            error!("Failed to acquire cache lock when retrieving config for key {}: {}", key, e);
            None
        }
    }
}

/// Retrieves all cached configuration values
#[instrument(skip(app_handle))]
pub fn get_all_cached_config_values(app_handle: &AppHandle) -> Result<HashMap<String, JsonValue>, AppError> {
    let cache = app_handle.state::<ServerConfigCache>();
    
    match cache.lock() {
        Ok(cache_guard) => {
            let configs = cache_guard.clone();
            info!("Retrieved {} cached configuration values", configs.len());
            Ok(configs)
        }
        Err(e) => {
            error!("Failed to acquire cache lock when retrieving all configs: {}", e);
            Err(AppError::InternalError(format!("Failed to retrieve cached configurations: {}", e)))
        }
    }
}

/// Makes an authenticated HTTP request to fetch all server configurations
#[instrument(skip(app_handle))]
async fn fetch_server_configurations(app_handle: &AppHandle) -> Result<HashMap<String, JsonValue>, AppError> {
    // Get the runtime config to determine server URL
    let runtime_config = match app_handle.try_state::<crate::config::RuntimeConfig>() {
        Some(config) => config,
        None => {
            error!("Runtime configuration not available");
            return Err(AppError::ConfigError("Runtime configuration not available".to_string()));
        }
    };
    
    let server_url = &runtime_config.server_url;
    let config_url = format!("{}/api/config/all-configurations", server_url);
    
    // Get access token for authentication
    let auth_state = app_handle.state::<crate::auth::token_manager::TokenManager>();
    let access_token = match auth_state.get().await {
        Some(token) => token,
        None => {
            error!("No access token available for server configuration fetch");
            return Err(AppError::AuthError("No access token available".to_string()));
        }
    };
    
    // Make authenticated HTTP request
    let client = reqwest::Client::new();
    let response = client
        .get(&config_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| {
            error!("HTTP request failed: {}", e);
            AppError::HttpError(format!("Failed to fetch server configurations: {}", e))
        })?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Server returned error {}: {}", status, error_text);
        return Err(AppError::HttpError(format!("Server error {}: {}", status, error_text)));
    }
    
    // Parse JSON response
    let configurations: HashMap<String, JsonValue> = response
        .json()
        .await
        .map_err(|e| {
            error!("Failed to parse server configuration response: {}", e);
            AppError::SerializationError(format!("Failed to parse server configurations: {}", e))
        })?;
    
    info!("Successfully fetched {} server configurations", configurations.len());
    Ok(configurations)
}

/// Refreshes the server configuration cache on demand
#[instrument(skip(app_handle))]
pub async fn refresh_server_config_cache(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Refreshing server configuration cache");
    fetch_and_cache_server_configurations(app_handle).await
}