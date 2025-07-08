use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use serde_json::Value as JsonValue;
use tauri::{AppHandle, Manager};
use tracing::{info, error, warn, instrument};
use tokio::time::{interval, Duration};
use crate::error::AppError;
use crate::models::{TaskType, RuntimeAIConfig};

/// Cache structure to hold configurations
pub type ConfigCache = Arc<Mutex<HashMap<String, JsonValue>>>;

/// Fetches all server configurations and caches them in Tauri managed state
#[instrument(skip(app_handle))]
pub async fn fetch_and_cache_server_configurations(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Fetching server configurations from API");
    
    // Get the config cache from managed state
    let cache = app_handle.state::<ConfigCache>();
    
    // Make authenticated request to server for all configurations
    match fetch_server_configurations(app_handle).await {
        Ok(configurations) => {
            // CRITICAL: Validate configurations before caching
            validate_runtime_config_before_cache(&configurations)?;
            
            // Update the cache with validated configurations
            match cache.lock() {
                Ok(mut cache_guard) => {
                    cache_guard.clear();
                    cache_guard.extend(configurations.clone());
                    info!("Successfully cached {} validated server configurations", configurations.len());
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
    let cache = app_handle.state::<ConfigCache>();
    
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
    let cache = app_handle.state::<ConfigCache>();
    
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
    let app_state = app_handle.state::<crate::AppState>();
    let runtime_config = &app_state.settings;
    
    let server_url = &runtime_config.server_url;
    let config_url = format!("{}/config/desktop-runtime-config", server_url);
    
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

/// Refreshes the configuration cache on demand
#[instrument(skip(app_handle))]
pub async fn refresh_config_cache(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Refreshing configuration cache");
    fetch_and_cache_server_configurations(app_handle).await
}

/// Automatically synchronizes cache with server at 30-second intervals
#[instrument(skip(app_handle))]
pub async fn auto_sync_cache_with_server(app_handle: AppHandle) {
    let mut sync_interval = interval(Duration::from_secs(30));
    
    info!("Starting auto-sync cache service with 30-second intervals");
    
    loop {
        sync_interval.tick().await;
        
        match detect_server_configuration_changes(&app_handle).await {
            Ok(changes_detected) => {
                if changes_detected {
                    info!("Server configuration changes detected, refreshing cache");
                    if let Err(e) = force_cache_refresh_on_mismatch(&app_handle).await {
                        error!("Failed to refresh cache after detecting changes: {}", e);
                    }
                } else {
                    info!("No server configuration changes detected");
                }
            }
            Err(e) => {
                error!("Failed to detect server configuration changes: {}", e);
            }
        }
    }
}

/// Detects if server configuration has changed since last cache update
#[instrument(skip(app_handle))]
pub async fn detect_server_configuration_changes(app_handle: &AppHandle) -> Result<bool, AppError> {
    info!("Detecting server configuration changes");
    
    // Get current server configuration hash
    let server_hash = get_server_config_hash(app_handle).await?;
    
    // Get cached configuration hash
    let cached_hash = get_cached_config_hash(app_handle)?;
    
    let changes_detected = server_hash != cached_hash;
    
    if changes_detected {
        info!("Configuration changes detected - Server hash: {}, Cached hash: {}", server_hash, cached_hash);
    } else {
        info!("No configuration changes detected - Hash: {}", server_hash);
    }
    
    Ok(changes_detected)
}

/// Forces cache refresh when configuration mismatch is detected
#[instrument(skip(app_handle))]
pub async fn force_cache_refresh_on_mismatch(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Forcing cache refresh due to configuration mismatch");
    
    // Clear existing cache
    let cache = app_handle.state::<ConfigCache>();
    match cache.lock() {
        Ok(mut cache_guard) => {
            cache_guard.clear();
            info!("Cleared existing configuration cache");
        }
        Err(e) => {
            error!("Failed to clear cache: {}", e);
            return Err(AppError::ConfigError(format!("Failed to clear cache: {}", e)));
        }
    }
    
    // Fetch fresh configurations from server
    fetch_and_cache_server_configurations(app_handle).await?;
    
    info!("Successfully refreshed configuration cache");
    Ok(())
}

/// Gets hash of current server configuration for change detection
#[instrument(skip(app_handle))]
pub async fn get_server_config_hash(app_handle: &AppHandle) -> Result<u64, AppError> {
    info!("Fetching server configuration hash");
    
    let configurations = fetch_server_configurations(app_handle).await?;
    
    // Create hash from all configuration keys and values
    let mut hasher = DefaultHasher::new();
    
    // Sort keys for consistent hashing
    let mut sorted_configs: Vec<_> = configurations.iter().collect();
    sorted_configs.sort_by_key(|&(k, _)| k);
    
    for (key, value) in sorted_configs {
        key.hash(&mut hasher);
        value.to_string().hash(&mut hasher);
    }
    
    let hash = hasher.finish();
    info!("Generated server configuration hash: {}", hash);
    
    Ok(hash)
}

/// Gets hash of cached configuration for comparison
#[instrument(skip(app_handle))]
pub fn get_cached_config_hash(app_handle: &AppHandle) -> Result<u64, AppError> {
    let cache = app_handle.state::<ConfigCache>();
    
    match cache.lock() {
        Ok(cache_guard) => {
            let mut hasher = DefaultHasher::new();
            
            // Sort keys for consistent hashing
            let mut sorted_configs: Vec<_> = cache_guard.iter().collect();
            sorted_configs.sort_by_key(|&(k, _)| k);
            
            for (key, value) in sorted_configs {
                key.hash(&mut hasher);
                value.to_string().hash(&mut hasher);
            }
            
            let hash = hasher.finish();
            Ok(hash)
        }
        Err(e) => {
            error!("Failed to acquire cache lock for hash calculation: {}", e);
            Err(AppError::ConfigError(format!("Failed to calculate cached config hash: {}", e)))
        }
    }
}

/// Validates runtime configuration before caching - ZERO tolerance for invalid configs
#[instrument]
pub fn validate_runtime_config_before_cache(configurations: &HashMap<String, JsonValue>) -> Result<(), AppError> {
    info!("Validating runtime configuration before caching");
    
    // Extract and validate RuntimeAIConfig if present
    if let Some(config_value) = configurations.get("runtime_ai_config") {
        let runtime_config: RuntimeAIConfig = serde_json::from_value(config_value.clone())
            .map_err(|e| {
                error!("Failed to deserialize runtime AI config during validation: {}", e);
                AppError::ConfigError(format!("Invalid runtime AI config format: {}", e))
            })?;
        
        // Validate configuration consistency
        validate_configuration_consistency(&runtime_config)?;
        
        // Validate all TaskType variants have corresponding configurations
        validate_all_task_types_have_configs(&runtime_config)?;
        
        info!("Runtime configuration validation passed");
    } else {
        error!("Runtime AI config missing from server response");
        return Err(AppError::ConfigError("Runtime AI config missing from server response".to_string()));
    }
    
    Ok(())
}

/// Validates configuration consistency - strict validation rules
#[instrument]
pub fn validate_configuration_consistency(runtime_config: &RuntimeAIConfig) -> Result<(), AppError> {
    let mut validation_errors = Vec::new();
    
    // Validate each task configuration
    for (task_key, task_config) in &runtime_config.tasks {
        // Validate model name is not empty
        if task_config.model.trim().is_empty() {
            validation_errors.push(format!("Task '{}': model name is empty", task_key));
        }
        
        // Validate temperature range (0.0 to 2.0)
        if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
            validation_errors.push(format!(
                "Task '{}': temperature {} is out of valid range [0.0, 2.0]", 
                task_key, task_config.temperature
            ));
        }
        
        // Validate max_tokens is positive
        if task_config.max_tokens == 0 {
            validation_errors.push(format!("Task '{}': max_tokens must be positive, got 0", task_key));
        }
        
        // Validate model exists in providers
        let model_exists = runtime_config.providers.iter()
            .any(|provider| provider.models.iter().any(|model| model.id == task_config.model));
        
        if !model_exists {
            validation_errors.push(format!(
                "Task '{}': model '{}' not found in any provider", 
                task_key, task_config.model
            ));
        }
    }
    
    // Validate providers have at least one model
    if runtime_config.providers.is_empty() {
        validation_errors.push("No providers configured".to_string());
    } else {
        for (idx, provider) in runtime_config.providers.iter().enumerate() {
            if provider.models.is_empty() {
                validation_errors.push(format!("Provider {} has no models configured", idx));
            }
        }
    }
    
    // Fail if any validation errors found
    if !validation_errors.is_empty() {
        let error_msg = format!(
            "Configuration validation failed with {} errors:\n{}", 
            validation_errors.len(),
            validation_errors.join("\n")
        );
        error!("{}", error_msg);
        return Err(AppError::ConfigError(error_msg));
    }
    
    info!("Configuration consistency validation passed");
    Ok(())
}

/// Validates ALL TaskType enum variants have corresponding configurations
#[instrument]
pub fn validate_all_task_types_have_configs(runtime_config: &RuntimeAIConfig) -> Result<(), AppError> {
    // Get ALL TaskType variants that require LLM configuration
    let required_task_types = [
        TaskType::ImplementationPlan,
        TaskType::VoiceTranscription,
        TaskType::TextImprovement,
        TaskType::PathCorrection,
        TaskType::TaskRefinement,
        TaskType::GenericLlmStream,
        TaskType::RegexFileFilter,
        TaskType::FileRelevanceAssessment,
        TaskType::ExtendedPathFinder,
        TaskType::WebSearchPromptsGeneration,
        TaskType::WebSearchExecution,
        TaskType::Streaming,
        TaskType::Unknown,
    ];
    
    let mut missing_configs = Vec::new();
    let mut invalid_task_keys = Vec::new();
    
    // Check each required task type has a valid configuration
    for task_type in required_task_types.iter() {
        if task_type.requires_llm() {
            let task_key = task_type.to_string();
            
            if !runtime_config.tasks.contains_key(&task_key) {
                missing_configs.push(task_key);
            }
        }
    }
    
    // Check for task configurations that don't correspond to known TaskType variants
    let known_task_keys: std::collections::HashSet<String> = required_task_types
        .iter()
        .map(|t| t.to_string())
        .collect();
    
    for task_key in runtime_config.tasks.keys() {
        if !known_task_keys.contains(task_key) {
            invalid_task_keys.push(task_key.clone());
        }
    }
    
    // Build comprehensive error message
    let mut error_messages = Vec::new();
    
    if !missing_configs.is_empty() {
        error_messages.push(format!(
            "CRITICAL: Missing configurations for required TaskType variants: {}. \
            Every TaskType enum variant that requires LLM MUST have a corresponding configuration.",
            missing_configs.join(", ")
        ));
    }
    
    if !invalid_task_keys.is_empty() {
        error_messages.push(format!(
            "CRITICAL: Invalid task configurations found: {}. \
            These configurations exist but don't correspond to any known TaskType enum variant. \
            Remove these configurations or add corresponding TaskType variants.",
            invalid_task_keys.join(", ")
        ));
    }
    
    if !error_messages.is_empty() {
        let full_error = format!(
            "TaskType configuration validation FAILED:\n{}",
            error_messages.join("\n")
        );
        error!("{}", full_error);
        return Err(AppError::ConfigError(full_error));
    }
    
    info!("All TaskType variants have valid configurations");
    Ok(())
}