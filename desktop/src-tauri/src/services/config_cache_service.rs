use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::error::AppError;
use crate::models::{RuntimeAIConfig, TaskType};
use serde_json::Value as JsonValue;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tokio::time::{Duration, interval};
use tracing::instrument;

/// Recursively sort JSON objects by keys and arrays by stable identifiers
fn normalize_json_for_hashing(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut sorted_map = Map::new();
            let mut entries: Vec<_> = map.iter().collect();
            entries.sort_by_key(|(k, _)| k.as_str());

            for (k, v) in entries {
                sorted_map.insert(k.clone(), normalize_json_for_hashing(v));
            }
            Value::Object(sorted_map)
        }
        Value::Array(arr) => {
            let mut sorted_arr = arr.clone();
            // Sort arrays by 'name' field if objects, otherwise keep order
            sorted_arr.sort_by(|a, b| match (a.get("name"), b.get("name")) {
                (Some(Value::String(name_a)), Some(Value::String(name_b))) => name_a.cmp(name_b),
                _ => std::cmp::Ordering::Equal,
            });
            Value::Array(sorted_arr.iter().map(normalize_json_for_hashing).collect())
        }
        _ => value.clone(),
    }
}

/// Cache structure to hold configurations
pub type ConfigCache = Arc<Mutex<HashMap<String, JsonValue>>>;

/// Fetches all server configurations and caches them in Tauri managed state
#[instrument(skip(app_handle, server_proxy_client))]
pub async fn fetch_and_cache_server_configurations(
    app_handle: &AppHandle,
    server_proxy_client: &ServerProxyClient,
) -> Result<(), AppError> {
    // Get the config cache from managed state
    let cache = app_handle.state::<ConfigCache>();

    // Make authenticated request to server for all configurations
    let config_value = server_proxy_client.get_runtime_ai_config().await?;
    let mut configurations = HashMap::new();
    configurations.insert("runtime_ai_config".to_string(), config_value);

    match Ok(configurations) {
        Ok(configurations) => {
            // CRITICAL: Validate configurations before caching
            validate_runtime_config_before_cache(&configurations)?;

            // Update the cache with validated configurations atomically
            match cache.lock() {
                Ok(mut cache_guard) => {
                    // Preserve critical configurations that may have been loaded separately
                    let runtime_ai_config = cache_guard.get("runtime_ai_config").cloned();

                    // Update with new configurations
                    for (key, value) in configurations {
                        cache_guard.insert(key, value);
                    }

                    // Restore runtime_ai_config if it was present and not in the new configurations
                    if let Some(runtime_config) = runtime_ai_config {
                        if !cache_guard.contains_key("runtime_ai_config") {
                            cache_guard.insert("runtime_ai_config".to_string(), runtime_config);
                        }
                    }

                    Ok(())
                }
                Err(e) => Err(AppError::ConfigError(format!(
                    "Failed to update configuration cache: {}",
                    e
                ))),
            }
        }
        Err(e) => Err(e),
    }
}

/// Retrieves a cached configuration value by key
#[instrument(skip(app_handle))]
pub fn get_cached_config_value(key: &str, app_handle: &AppHandle) -> Option<JsonValue> {
    let cache = app_handle.state::<ConfigCache>();

    let result = match cache.lock() {
        Ok(cache_guard) => {
            let value = cache_guard.get(key).cloned();
            value
        }
        Err(_e) => None,
    };
    result
}

/// Retrieves all cached configuration values
#[instrument(skip(app_handle))]
pub fn get_all_cached_config_values(
    app_handle: &AppHandle,
) -> Result<HashMap<String, JsonValue>, AppError> {
    let cache = app_handle.state::<ConfigCache>();

    let result = match cache.lock() {
        Ok(cache_guard) => {
            let configs = cache_guard.clone();
            Ok(configs)
        }
        Err(e) => Err(AppError::InternalError(format!(
            "Failed to retrieve cached configurations: {}",
            e
        ))),
    };
    result
}

/// Refreshes the configuration cache on demand
#[instrument(skip(app_handle))]
pub async fn refresh_config_cache(app_handle: &AppHandle) -> Result<(), AppError> {
    // Get ServerProxyClient from app state using the proper getter that handles initialization
    let server_proxy_client = crate::api_clients::client_factory::get_server_proxy_client(app_handle).await?;

    fetch_and_cache_server_configurations(app_handle, server_proxy_client.as_ref()).await
}

/// Automatically synchronizes cache with server at 30-second intervals
#[instrument(skip(app_handle))]
pub async fn auto_sync_cache_with_server(app_handle: AppHandle) {
    let mut sync_interval = interval(Duration::from_secs(30));

    loop {
        sync_interval.tick().await;

        match detect_server_configuration_changes(&app_handle).await {
            Ok(changes_detected) => {
                if changes_detected {
                    if let Err(_) = force_cache_refresh_on_mismatch(&app_handle).await {
                        // Handle error silently
                    }
                }
            }
            Err(_e) => {}
        }
    }
}

/// Detects if server configuration has changed since last cache update
#[instrument(skip(app_handle))]
pub async fn detect_server_configuration_changes(app_handle: &AppHandle) -> Result<bool, AppError> {
    // Get current server configuration hash
    let server_hash = get_server_config_hash(app_handle).await?;

    // Get cached configuration hash
    let cached_hash = get_cached_config_hash(app_handle)?;

    let changes_detected = server_hash != cached_hash;

    Ok(changes_detected)
}

/// Forces cache refresh when configuration mismatch is detected
#[instrument(skip(app_handle))]
pub async fn force_cache_refresh_on_mismatch(app_handle: &AppHandle) -> Result<(), AppError> {
    // Fetch fresh configurations from server without clearing existing cache first
    // This ensures critical configurations like runtime_ai_config are never lost
    refresh_config_cache(app_handle).await?;

    Ok(())
}

/// Gets hash of current server configuration for change detection
#[instrument(skip(app_handle))]
pub async fn get_server_config_hash(app_handle: &AppHandle) -> Result<u64, AppError> {
    // Get ServerProxyClient from app state using the proper getter that handles initialization
    let server_proxy_client = crate::api_clients::client_factory::get_server_proxy_client(app_handle).await?;

    let config_value = server_proxy_client.get_runtime_ai_config().await?;
    let mut configurations = HashMap::new();
    configurations.insert("runtime_ai_config".to_string(), config_value);

    // Create hash from all configuration keys and values
    let mut hasher = DefaultHasher::new();

    // Normalize configurations before hashing to handle ordering differences
    let mut normalized_configs = HashMap::new();
    for (key, value) in configurations {
        let normalized = normalize_json_for_hashing(&value);
        normalized_configs.insert(key, normalized);
    }

    // Sort keys for consistent hashing
    let mut sorted_configs: Vec<_> = normalized_configs.iter().collect();
    sorted_configs.sort_by_key(|(k, _)| k.as_str());

    for (key, value) in sorted_configs {
        key.hash(&mut hasher);
        // Serialize the normalized value
        let serialized = serde_json::to_string(value).unwrap_or_else(|_| value.to_string());
        serialized.hash(&mut hasher);
    }

    let hash = hasher.finish();

    Ok(hash)
}

/// Gets hash of cached configuration for comparison
#[instrument(skip(app_handle))]
pub fn get_cached_config_hash(app_handle: &AppHandle) -> Result<u64, AppError> {
    let cache = app_handle.state::<ConfigCache>();

    let result = match cache.lock() {
        Ok(cache_guard) => {
            let mut hasher = DefaultHasher::new();

            // Normalize cached values before hashing
            let mut normalized_cache = HashMap::new();
            for (key, value) in cache_guard.iter() {
                let normalized = normalize_json_for_hashing(value);
                normalized_cache.insert(key.clone(), normalized);
            }

            // Sort keys for consistent hashing
            let mut sorted_configs: Vec<_> = normalized_cache.iter().collect();
            sorted_configs.sort_by_key(|(k, _)| k.as_str());

            for (key, value) in sorted_configs {
                key.hash(&mut hasher);
                let serialized = serde_json::to_string(value).unwrap_or_else(|_| value.to_string());
                serialized.hash(&mut hasher);
            }

            let hash = hasher.finish();
            Ok(hash)
        }
        Err(e) => Err(AppError::ConfigError(format!(
            "Failed to calculate cached config hash: {}",
            e
        ))),
    };
    result
}

/// Validates runtime configuration before caching - ZERO tolerance for invalid configs
#[instrument(skip(configurations))]
pub fn validate_runtime_config_before_cache(
    configurations: &HashMap<String, JsonValue>,
) -> Result<(), AppError> {
    // Extract and validate RuntimeAIConfig
    if let Some(config_value) = configurations.get("runtime_ai_config") {
        // Try to deserialize the runtime config
        let runtime_config: RuntimeAIConfig = serde_json::from_value(config_value.clone())
            .map_err(|e| {
                AppError::ConfigError(format!("Invalid runtime AI config format: {}", e))
            })?;

        // Validate configuration consistency
        validate_configuration_consistency(&runtime_config)?;

        // Validate all TaskType variants have corresponding configurations
        validate_all_task_types_have_configs(&runtime_config)?;
    } else {
        return Err(AppError::ConfigError(
            "Runtime AI config missing from server response".to_string(),
        ));
    }

    Ok(())
}

/// Validates configuration consistency - strict validation rules
pub fn validate_configuration_consistency(
    runtime_config: &RuntimeAIConfig,
) -> Result<(), AppError> {
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
            validation_errors.push(format!(
                "Task '{}': max_tokens must be positive, got 0",
                task_key
            ));
        }

        // Validate model exists in providers
        let model_exists = runtime_config.providers.iter().any(|provider| {
            provider
                .models
                .iter()
                .any(|model| model.id == task_config.model)
        });

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
        return Err(AppError::ConfigError(error_msg));
    }

    Ok(())
}

/// Validates ALL TaskType enum variants have corresponding configurations
#[instrument(skip(runtime_config))]
pub fn validate_all_task_types_have_configs(
    runtime_config: &RuntimeAIConfig,
) -> Result<(), AppError> {
    // Get ALL TaskType variants that require LLM configuration
    let required_task_types = [
        TaskType::ImplementationPlan,
        TaskType::ImplementationPlanMerge,
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
        TaskType::RootFolderSelection,
        TaskType::VideoAnalysis,
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
    let known_task_keys: std::collections::HashSet<String> =
        required_task_types.iter().map(|t| t.to_string()).collect();

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
        return Err(AppError::ConfigError(full_error));
    }

    Ok(())
}
