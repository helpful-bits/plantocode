use crate::AppState;
use crate::error::AppError;
use crate::models::{RuntimeAIConfig, TaskType};
use crate::services::config_cache_service::ConfigCache;
use crate::validation::ConfigValidator;
use log::{error, info, warn};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Fetch runtime AI configuration from the server and update local config
///
/// This function retrieves configuration data via the server proxy client
/// and updates the application's local runtime AI configuration.
/// It also handles error reporting by storing any errors in the app state.
pub async fn fetch_and_update_runtime_ai_config(app_handle: &AppHandle) -> Result<(), AppError> {
    // Fetch RuntimeAIConfig from server using the ServerProxyClient which is already initialized and managed
    info!("Fetching RuntimeAIConfig from server");

    // Get ServerProxyClient from app state using the proper getter that handles initialization
    let server_proxy_client =
        crate::api_clients::client_factory::get_server_proxy_client(app_handle).await?;

    // Call the get_runtime_ai_config method on ServerProxyClient
    // This endpoint now gets model information from the database instead of environment variables
    let runtime_config_value = server_proxy_client.get_runtime_ai_config().await?;

    // Deserialize the Value into RuntimeAIConfig
    let mut runtime_config: RuntimeAIConfig =
        match serde_json::from_value(runtime_config_value.clone()) {
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

    // CRITICAL: Validate configuration BEFORE storing in cache
    validate_runtime_config_before_cache(&runtime_config)?;

    // Validate that we have models available
    let total_models: usize = runtime_config
        .providers
        .iter()
        .map(|p| p.models.len())
        .sum();
    if total_models == 0 {
        error!("CRITICAL: No available models found in runtime AI configuration from server");
        return Err(AppError::ConfigError(
            "No models available from server".to_string(),
        ));
    } else {
        info!("Loaded {} models from server", total_models);
    }

    // Enhanced validation that all TaskType enum variants that require LLM have corresponding configurations
    validate_task_type_configurations(&runtime_config)?;

    // CRITICAL: Store in cache BEFORE comprehensive validation (which reads from cache)
    let config_cache = app_handle.state::<ConfigCache>();
    match config_cache.lock() {
        Ok(mut cache_guard) => {
            // Store the fetched RuntimeAIConfig in the cache with key "runtime_ai_config"
            cache_guard.insert("runtime_ai_config".to_string(), runtime_config_value);
        }
        Err(e) => {
            let error_msg = format!(
                "Failed to acquire cache lock to store runtime AI config: {}",
                e
            );
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

    // Perform comprehensive startup validation (now that config is in cache)
    crate::validation::comprehensive_startup_validation(app_handle).await?;

    info!("Runtime AI configuration fetched and updated successfully");

    Ok(())
}

/// ENHANCED validation that all TaskType enum variants that require LLM have corresponding configurations
fn validate_task_type_configurations(runtime_config: &RuntimeAIConfig) -> Result<(), AppError> {
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
        TaskType::FileFinderWorkflow,
        TaskType::RootFolderSelection,
        TaskType::FileRelevanceAssessment,
        TaskType::ExtendedPathFinder,
        TaskType::WebSearchPromptsGeneration,
        TaskType::WebSearchExecution,
        TaskType::VideoAnalysis,
        TaskType::Streaming,
        TaskType::Unknown,
    ];

    let mut missing_configs = Vec::new();
    let mut invalid_configs = Vec::new();

    for task_type in required_task_types.iter() {
        if task_type.requires_llm() {
            let task_key = task_type.to_string();

            match runtime_config.tasks.get(&task_key) {
                Some(task_config) => {
                    // STRICT validation - no empty configurations allowed
                    if task_config.model.trim().is_empty() {
                        invalid_configs.push(format!("{}: model is empty or whitespace", task_key));
                    }
                    if task_config.max_tokens == 0 {
                        invalid_configs
                            .push(format!("{}: max_tokens must be positive, got 0", task_key));
                    }
                    if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
                        invalid_configs.push(format!(
                            "{}: temperature {} is out of range [0.0, 2.0]",
                            task_key, task_config.temperature
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
                        invalid_configs.push(format!(
                            "{}: model '{}' not found in any provider",
                            task_key, task_config.model
                        ));
                    }
                }
                None => {
                    missing_configs.push(task_key);
                }
            }
        }
    }

    // Check for any configurations that don't correspond to known task types
    let known_task_keys: std::collections::HashSet<String> =
        required_task_types.iter().map(|t| t.to_string()).collect();

    let unknown_configs: Vec<String> = runtime_config
        .tasks
        .keys()
        .filter(|key| !known_task_keys.contains(*key))
        .cloned()
        .collect();

    // Report all validation errors with ZERO tolerance
    let mut error_messages = Vec::new();

    if !missing_configs.is_empty() {
        error_messages.push(format!(
            "CRITICAL: Missing task configurations: {}. These task types are defined in the codebase but have no server configuration.",
            missing_configs.join(", ")
        ));
    }

    if !invalid_configs.is_empty() {
        error_messages.push(format!(
            "CRITICAL: Invalid task configurations: {}",
            invalid_configs.join(", ")
        ));
    }

    if !unknown_configs.is_empty() {
        error_messages.push(format!(
            "WARNING: Unknown task configurations found: {}. These configurations exist on the server but don't correspond to any known task types.",
            unknown_configs.join(", ")
        ));
    }

    if !error_messages.is_empty() {
        let full_error = format!(
            "Task configuration validation FAILED:\n{}",
            error_messages.join("\n")
        );
        error!("{}", full_error);
        return Err(AppError::ConfigError(full_error));
    }

    info!("All task type configurations validated successfully");
    Ok(())
}

/// Validate that all required configurations are present
pub async fn validate_all_required_configs_present(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Validating all required configurations are present");

    let config_cache = app_handle.state::<ConfigCache>();
    let cache_guard = config_cache.lock().map_err(|e| {
        AppError::ConfigError(format!("Failed to acquire config cache lock: {}", e))
    })?;

    // Check that runtime AI config exists
    if !cache_guard.contains_key("runtime_ai_config") {
        return Err(AppError::ConfigError(
            "Runtime AI config not found in cache".to_string(),
        ));
    }

    let runtime_config_value = cache_guard
        .get("runtime_ai_config")
        .ok_or_else(|| AppError::ConfigError("Runtime AI config not found in cache".to_string()))?;

    let runtime_config: RuntimeAIConfig = serde_json::from_value(runtime_config_value.clone())
        .map_err(|e| {
            AppError::SerializationError(format!("Failed to deserialize runtime config: {}", e))
        })?;

    drop(cache_guard);

    // Validate basic requirements
    if runtime_config.providers.is_empty() {
        return Err(AppError::ConfigError("No providers configured".to_string()));
    }

    if runtime_config.tasks.is_empty() {
        return Err(AppError::ConfigError(
            "No task configurations found".to_string(),
        ));
    }

    info!("All required configurations are present");
    Ok(())
}

/// Fail-fast validation for invalid configurations - app MUST NOT start with bad config
pub async fn fail_fast_on_invalid_config(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Performing fail-fast validation on configuration");

    // Validate all required configurations are present
    validate_all_required_configs_present(app_handle).await?;

    // Validate model availability
    crate::validation::validate_model_availability(app_handle).await?;

    // Comprehensive validation
    crate::validation::comprehensive_startup_validation(app_handle).await?;

    info!("Fail-fast validation completed successfully");
    Ok(())
}

/// Validates runtime configuration BEFORE storing in cache - bulletproof validation
fn validate_runtime_config_before_cache(runtime_config: &RuntimeAIConfig) -> Result<(), AppError> {
    info!("Validating runtime configuration before caching");

    // Validate providers and models
    if runtime_config.providers.is_empty() {
        return Err(AppError::ConfigError("No providers configured".to_string()));
    }

    let mut total_models = 0;
    for (idx, provider) in runtime_config.providers.iter().enumerate() {
        if provider.models.is_empty() {
            return Err(AppError::ConfigError(format!(
                "Provider {} has no models",
                idx
            )));
        }
        total_models += provider.models.len();

        // Validate each model has required fields
        for model in &provider.models {
            if model.id.trim().is_empty() {
                return Err(AppError::ConfigError(format!(
                    "Model in provider {} has empty ID",
                    idx
                )));
            }
        }
    }

    info!(
        "Validated {} models across {} providers",
        total_models,
        runtime_config.providers.len()
    );

    // Validate task configurations with zero tolerance
    for (task_key, task_config) in &runtime_config.tasks {
        if task_config.model.trim().is_empty() {
            return Err(AppError::ConfigError(format!(
                "Task '{}' has empty model",
                task_key
            )));
        }
        if task_config.max_tokens == 0 {
            return Err(AppError::ConfigError(format!(
                "Task '{}' has zero max_tokens",
                task_key
            )));
        }
        if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
            return Err(AppError::ConfigError(format!(
                "Task '{}' has invalid temperature {}",
                task_key, task_config.temperature
            )));
        }
    }

    info!("Runtime configuration pre-cache validation passed");
    Ok(())
}

/// Detects configuration drift between cache and server
pub async fn detect_configuration_drift(app_handle: &AppHandle) -> Result<Vec<String>, AppError> {
    info!("Detecting configuration drift between cache and server");

    let mut drift_issues = Vec::new();

    // Get cached config
    let cached_config = match get_cached_runtime_config(app_handle) {
        Ok(config) => config,
        Err(_) => {
            drift_issues.push("Cache is empty or unreadable".to_string());
            return Ok(drift_issues);
        }
    };

    // Get fresh config from server using the proper getter that handles initialization
    let server_proxy_client =
        crate::api_clients::client_factory::get_server_proxy_client(app_handle).await?;

    let fresh_config_value = server_proxy_client
        .get_runtime_ai_config()
        .await
        .map_err(|e| AppError::ConfigError(format!("Failed to fetch fresh config: {}", e)))?;

    let fresh_config: RuntimeAIConfig = serde_json::from_value(fresh_config_value)
        .map_err(|e| AppError::ConfigError(format!("Failed to parse fresh config: {}", e)))?;

    // Compare task configurations
    for (task_key, fresh_task_config) in &fresh_config.tasks {
        match cached_config.tasks.get(task_key) {
            Some(cached_task_config) => {
                if cached_task_config.model != fresh_task_config.model {
                    drift_issues.push(format!(
                        "Task '{}' model changed: '{}' -> '{}'",
                        task_key, cached_task_config.model, fresh_task_config.model
                    ));
                }
                if cached_task_config.max_tokens != fresh_task_config.max_tokens {
                    drift_issues.push(format!(
                        "Task '{}' max_tokens changed: {} -> {}",
                        task_key, cached_task_config.max_tokens, fresh_task_config.max_tokens
                    ));
                }
                if (cached_task_config.temperature - fresh_task_config.temperature).abs() > 0.001 {
                    drift_issues.push(format!(
                        "Task '{}' temperature changed: {} -> {}",
                        task_key, cached_task_config.temperature, fresh_task_config.temperature
                    ));
                }
            }
            None => {
                drift_issues.push(format!(
                    "Task '{}' added on server but not in cache",
                    task_key
                ));
            }
        }
    }

    // Check for tasks removed from server
    for task_key in cached_config.tasks.keys() {
        if !fresh_config.tasks.contains_key(task_key) {
            drift_issues.push(format!(
                "Task '{}' removed from server but still in cache",
                task_key
            ));
        }
    }

    if drift_issues.is_empty() {
        info!("No configuration drift detected");
    } else {
        warn!(
            "Configuration drift detected: {} issues found",
            drift_issues.len()
        );
    }

    Ok(drift_issues)
}

/// Purges invalid configurations from cache
pub async fn purge_invalid_configurations(app_handle: &AppHandle) -> Result<Vec<String>, AppError> {
    info!("Purging invalid configurations from cache");

    let mut purged_keys = Vec::new();
    let config_cache = app_handle.state::<ConfigCache>();

    match config_cache.lock() {
        Ok(mut cache_guard) => {
            let mut keys_to_remove = Vec::new();

            // Check each cached configuration
            for (key, value) in cache_guard.iter() {
                if key == "runtime_ai_config" {
                    // Validate the runtime AI config
                    match serde_json::from_value::<RuntimeAIConfig>(value.clone()) {
                        Ok(config) => {
                            if let Err(e) = validate_runtime_config_before_cache(&config) {
                                error!("Invalid runtime AI config in cache: {}", e);
                                keys_to_remove.push(key.clone());
                            }
                        }
                        Err(e) => {
                            error!("Malformed runtime AI config in cache: {}", e);
                            keys_to_remove.push(key.clone());
                        }
                    }
                } else {
                    // Check if this is a known configuration key
                    if !is_known_config_key(key) {
                        warn!("Unknown configuration key found in cache: {}", key);
                        keys_to_remove.push(key.clone());
                    }
                }
            }

            // Remove invalid configurations
            for key in keys_to_remove {
                cache_guard.remove(&key);
                purged_keys.push(key.clone());
                error!("Purged invalid configuration: {}", key);
            }
        }
        Err(e) => {
            return Err(AppError::ConfigError(format!(
                "Failed to acquire cache lock: {}",
                e
            )));
        }
    }

    if purged_keys.is_empty() {
        info!("No invalid configurations found to purge");
    } else {
        warn!("Purged {} invalid configurations", purged_keys.len());
    }

    Ok(purged_keys)
}

/// Helper function to get cached runtime config
fn get_cached_runtime_config(app_handle: &AppHandle) -> Result<RuntimeAIConfig, AppError> {
    let config_cache = app_handle.state::<ConfigCache>();

    match config_cache.lock() {
        Ok(cache_guard) => {
            if let Some(config_value) = cache_guard.get("runtime_ai_config") {
                serde_json::from_value::<RuntimeAIConfig>(config_value.clone())
                    .map_err(|e| AppError::SerializationError(e.to_string()))
            } else {
                Err(AppError::ConfigError(
                    "Runtime AI config not found in cache".to_string(),
                ))
            }
        }
        Err(e) => Err(AppError::ConfigError(format!(
            "Failed to acquire cache lock: {}",
            e
        ))),
    }
}

/// Helper function to check if a configuration key is known
fn is_known_config_key(key: &str) -> bool {
    matches!(key, "runtime_ai_config" | "app_config" | "user_preferences")
}
