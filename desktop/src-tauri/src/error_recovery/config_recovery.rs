use crate::error::{AppError, AppResult};
use crate::models::{RuntimeAIConfig, TaskType};
use crate::services::config_cache_service::ConfigCache;
use crate::utils::config_helpers::get_runtime_ai_config_from_cache;
use log::{error, info, warn};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

/// Configuration recovery and validation module
/// Provides comprehensive error recovery strategies for configuration issues

#[derive(Debug, Clone)]
pub struct ConfigurationValidationError {
    pub error_type: ConfigurationErrorType,
    pub description: String,
    pub recovery_suggestion: String,
    pub critical: bool,
}

#[derive(Debug, Clone)]
pub enum ConfigurationErrorType {
    MissingTaskConfiguration,
    InvalidModelConfiguration,
    MissingProviderConfiguration,
    InvalidTokenConfiguration,
    InvalidTemperatureConfiguration,
    CacheCorruption,
    ServerConnectionFailure,
    ConfigurationInconsistency,
}

impl ConfigurationValidationError {
    pub fn new(
        error_type: ConfigurationErrorType,
        description: String,
        recovery_suggestion: String,
        critical: bool,
    ) -> Self {
        Self {
            error_type,
            description,
            recovery_suggestion,
            critical,
        }
    }
}

/// Attempt comprehensive configuration recovery
pub async fn attempt_configuration_recovery(app_handle: &AppHandle) -> AppResult<Vec<String>> {
    info!("Starting configuration recovery process");

    let mut recovery_actions = Vec::new();
    let mut errors = Vec::new();

    // Step 1: Validate cache integrity
    match validate_cache_integrity(app_handle).await {
        Ok(actions) => recovery_actions.extend(actions),
        Err(e) => errors.push(format!("Cache validation failed: {}", e)),
    }

    // Step 2: Validate configuration consistency
    match validate_configuration_consistency(app_handle).await {
        Ok(actions) => recovery_actions.extend(actions),
        Err(e) => errors.push(format!("Configuration consistency check failed: {}", e)),
    }

    // Step 3: Validate task configurations
    match validate_task_configurations(app_handle).await {
        Ok(actions) => recovery_actions.extend(actions),
        Err(e) => errors.push(format!("Task configuration validation failed: {}", e)),
    }

    // Step 4: Validate provider configurations
    match validate_provider_configurations(app_handle).await {
        Ok(actions) => recovery_actions.extend(actions),
        Err(e) => errors.push(format!("Provider configuration validation failed: {}", e)),
    }

    if !errors.is_empty() {
        return Err(AppError::ConfigError(format!(
            "Configuration recovery failed with {} errors: {}",
            errors.len(),
            errors.join("; ")
        )));
    }

    info!(
        "Configuration recovery completed successfully with {} actions",
        recovery_actions.len()
    );
    Ok(recovery_actions)
}

/// Detect and fix common configuration issues
pub async fn detect_and_fix_common_config_issues(
    app_handle: &AppHandle,
) -> AppResult<Vec<ConfigurationValidationError>> {
    info!("Detecting common configuration issues");

    let mut issues = Vec::new();

    // Get runtime configuration
    let runtime_config = match get_runtime_ai_config_from_cache(app_handle).await {
        Ok(config) => config,
        Err(e) => {
            issues.push(ConfigurationValidationError::new(
                ConfigurationErrorType::ServerConnectionFailure,
                format!("Failed to load runtime configuration: {}", e),
                "Refresh configuration from server or check network connection".to_string(),
                true,
            ));
            return Ok(issues);
        }
    };

    // Check for missing task configurations
    let required_tasks = [
        TaskType::ImplementationPlan,
        TaskType::VoiceTranscription,
        TaskType::TextImprovement,
        TaskType::PathCorrection,
        TaskType::TaskRefinement,
        TaskType::RegexFileFilter,
        TaskType::FileRelevanceAssessment,
        TaskType::ExtendedPathFinder,
        TaskType::WebSearchPromptsGeneration,
        TaskType::WebSearchExecution,
    ];

    for task_type in required_tasks {
        let task_key = task_type.to_string();
        if !runtime_config.tasks.contains_key(&task_key) {
            issues.push(ConfigurationValidationError::new(
                ConfigurationErrorType::MissingTaskConfiguration,
                format!("Missing configuration for task: {}", task_key),
                format!("Add {} configuration to server settings", task_key),
                true,
            ));
        } else {
            // Validate task configuration completeness
            let task_config = &runtime_config.tasks[&task_key];

            if task_config.model.is_empty() {
                issues.push(ConfigurationValidationError::new(
                    ConfigurationErrorType::InvalidModelConfiguration,
                    format!("Empty model configuration for task: {}", task_key),
                    format!("Set a valid model for task: {}", task_key),
                    true,
                ));
            }

            if task_config.max_tokens == 0 {
                issues.push(ConfigurationValidationError::new(
                    ConfigurationErrorType::InvalidTokenConfiguration,
                    format!("Invalid max_tokens (0) for task: {}", task_key),
                    format!("Set valid max_tokens for task: {}", task_key),
                    true,
                ));
            }

            if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
                issues.push(ConfigurationValidationError::new(
                    ConfigurationErrorType::InvalidTemperatureConfiguration,
                    format!(
                        "Invalid temperature {} for task: {}",
                        task_config.temperature, task_key
                    ),
                    format!("Set temperature between 0.0 and 2.0 for task: {}", task_key),
                    true,
                ));
            }

            // Validate model exists in providers
            let model_exists = runtime_config
                .providers
                .iter()
                .any(|p| p.models.iter().any(|m| m.id == task_config.model));

            if !model_exists {
                issues.push(ConfigurationValidationError::new(
                    ConfigurationErrorType::InvalidModelConfiguration,
                    format!("Model '{}' for task '{}' not found in providers", task_config.model, task_key),
                    format!("Update task configuration to use an available model or add the model to providers"),
                    true,
                ));
            }
        }
    }

    // Check provider configurations
    if runtime_config.providers.is_empty() {
        issues.push(ConfigurationValidationError::new(
            ConfigurationErrorType::MissingProviderConfiguration,
            "No providers configured".to_string(),
            "Add at least one provider configuration".to_string(),
            true,
        ));
    } else {
        for provider in &runtime_config.providers {
            if provider.models.is_empty() {
                issues.push(ConfigurationValidationError::new(
                    ConfigurationErrorType::MissingProviderConfiguration,
                    format!(
                        "Provider '{}' has no models configured",
                        provider.provider.name
                    ),
                    format!("Add models to provider: {}", provider.provider.name),
                    false,
                ));
            }

            for model in &provider.models {
                if model.context_window.is_none() {
                    issues.push(ConfigurationValidationError::new(
                        ConfigurationErrorType::InvalidModelConfiguration,
                        format!("Model '{}' missing context_window configuration", model.id),
                        format!("Add context_window configuration for model: {}", model.id),
                        false,
                    ));
                }
            }
        }
    }

    info!(
        "Configuration issue detection completed: {} issues found",
        issues.len()
    );
    Ok(issues)
}

/// Rebuild cache from server configuration
pub async fn rebuild_cache_from_server(app_handle: &AppHandle) -> AppResult<String> {
    info!("Rebuilding cache from server configuration");

    // Clear current cache
    let config_cache = match app_handle.try_state::<ConfigCache>() {
        Some(cache) => cache,
        None => {
            return Err(AppError::InitializationError(
                "Config cache not initialized".to_string(),
            ));
        }
    };

    match config_cache.lock() {
        Ok(mut cache_guard) => {
            cache_guard.clear();
            info!("Cache cleared successfully");
        }
        Err(e) => {
            return Err(AppError::InternalError(format!(
                "Failed to clear cache: {}",
                e
            )));
        }
    }

    // Trigger configuration refresh
    // This would typically involve calling the server to get fresh configuration
    // For now, we'll simulate this by indicating the cache needs refresh

    Ok(
        "Cache cleared and marked for refresh. Please refresh configuration from server."
            .to_string(),
    )
}

/// Emergency configuration reset
pub async fn emergency_configuration_reset(app_handle: &AppHandle) -> AppResult<String> {
    error!("Performing emergency configuration reset");

    // Clear all cached configuration
    let config_cache = match app_handle.try_state::<ConfigCache>() {
        Some(cache) => cache,
        None => {
            return Err(AppError::InitializationError(
                "Config cache not initialized".to_string(),
            ));
        }
    };

    match config_cache.lock() {
        Ok(mut cache_guard) => {
            cache_guard.clear();
            warn!("Emergency cache reset completed");
        }
        Err(e) => {
            return Err(AppError::InternalError(format!(
                "Failed to perform emergency reset: {}",
                e
            )));
        }
    }

    Ok("Emergency configuration reset completed. All cached configuration cleared.".to_string())
}

/// Validate cache integrity
async fn validate_cache_integrity(app_handle: &AppHandle) -> AppResult<Vec<String>> {
    let config_cache = match app_handle.try_state::<ConfigCache>() {
        Some(cache) => cache,
        None => {
            return Err(AppError::InitializationError(
                "Config cache not initialized".to_string(),
            ));
        }
    };

    let mut actions = Vec::new();

    match config_cache.lock() {
        Ok(cache_guard) => {
            if cache_guard.is_empty() {
                actions.push("Cache is empty - needs refresh".to_string());
            } else {
                // Check if runtime_ai_config exists
                if let Some(config_value) = cache_guard.get("runtime_ai_config") {
                    match serde_json::from_value::<RuntimeAIConfig>(config_value.clone()) {
                        Ok(_) => {
                            actions.push("Cache validation passed".to_string());
                        }
                        Err(_) => {
                            actions
                                .push("Cache contains corrupted data - needs refresh".to_string());
                        }
                    }
                } else {
                    actions
                        .push("Runtime AI config missing from cache - needs refresh".to_string());
                }
            }
        }
        Err(e) => {
            return Err(AppError::InternalError(format!(
                "Failed to validate cache: {}",
                e
            )));
        }
    }

    Ok(actions)
}

/// Validate configuration consistency
async fn validate_configuration_consistency(app_handle: &AppHandle) -> AppResult<Vec<String>> {
    let mut actions = Vec::new();

    match get_runtime_ai_config_from_cache(app_handle).await {
        Ok(config) => {
            // Check for configuration inconsistencies
            let mut model_references = HashMap::new();
            let mut available_models = HashMap::new();

            // Collect all available models
            for provider in &config.providers {
                for model in &provider.models {
                    available_models.insert(model.id.clone(), provider.provider.name.clone());
                }
            }

            // Collect all model references from tasks
            for (task_key, task_config) in &config.tasks {
                model_references.insert(task_key.clone(), task_config.model.clone());
            }

            // Check for broken references
            for (task_key, model_id) in model_references {
                if !available_models.contains_key(&model_id) {
                    actions.push(format!(
                        "Task '{}' references unavailable model '{}' - needs correction",
                        task_key, model_id
                    ));
                }
            }

            if actions.is_empty() {
                actions.push("Configuration consistency check passed".to_string());
            }
        }
        Err(e) => {
            return Err(AppError::ConfigError(format!(
                "Failed to validate configuration consistency: {}",
                e
            )));
        }
    }

    Ok(actions)
}

/// Validate task configurations
async fn validate_task_configurations(app_handle: &AppHandle) -> AppResult<Vec<String>> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    let mut actions = Vec::new();

    // Define required tasks
    let required_llm_tasks = [
        TaskType::ImplementationPlan,
        TaskType::VoiceTranscription,
        TaskType::TextImprovement,
        TaskType::PathCorrection,
        TaskType::TaskRefinement,
        TaskType::RegexFileFilter,
        TaskType::FileRelevanceAssessment,
        TaskType::ExtendedPathFinder,
        TaskType::WebSearchPromptsGeneration,
        TaskType::WebSearchExecution,
    ];

    for task_type in required_llm_tasks {
        let task_key = task_type.to_string();

        if let Some(task_config) = runtime_config.tasks.get(&task_key) {
            // Validate configuration completeness
            if task_config.model.is_empty() {
                actions.push(format!("Task '{}' has empty model configuration", task_key));
            }

            if task_config.max_tokens == 0 {
                actions.push(format!("Task '{}' has invalid max_tokens (0)", task_key));
            }

            if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
                actions.push(format!(
                    "Task '{}' has invalid temperature ({})",
                    task_key, task_config.temperature
                ));
            }
        } else {
            actions.push(format!(
                "Missing configuration for required task: {}",
                task_key
            ));
        }
    }

    if actions.is_empty() {
        actions.push("Task configuration validation passed".to_string());
    }

    Ok(actions)
}

/// Validate provider configurations
async fn validate_provider_configurations(app_handle: &AppHandle) -> AppResult<Vec<String>> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    let mut actions = Vec::new();

    if runtime_config.providers.is_empty() {
        actions.push("No providers configured".to_string());
    } else {
        for provider in &runtime_config.providers {
            if provider.models.is_empty() {
                actions.push(format!(
                    "Provider '{}' has no models configured",
                    provider.provider.name
                ));
            }

            for model in &provider.models {
                if model.context_window.is_none() {
                    actions.push(format!("Model '{}' missing context_window", model.id));
                }
            }
        }
    }

    if actions.is_empty() {
        actions.push("Provider configuration validation passed".to_string());
    }

    Ok(actions)
}
