use tauri::{AppHandle, Manager};
use crate::error::{AppResult, AppError};
use crate::models::{TaskType, RuntimeAIConfig};
use crate::services::config_cache_service::ConfigCache;
use log::{error, debug};

/// Strict configuration helpers with bulletproof error prevention
/// NO FALLBACKS - ALL ERRORS ARE FATAL
/// NO DEPRECATED CODE - CONFIGURATION MUST BE COMPLETE AND VALID

/// Get model context window size for a model (STRICT - NO FALLBACKS)
pub async fn get_model_context_window(model_name: &str, app_handle: &AppHandle) -> AppResult<u32> {
    debug!("Getting model context window for: {}", model_name);
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    // Find model in providers list by ID
    for provider in &runtime_config.providers {
        for model_info in &provider.models {
            if model_info.id == model_name {
                // STRICT: Context window MUST be set - no fallbacks
                if let Some(context_window) = model_info.context_window {
                    debug!("Found context window for model {}: {}", model_name, context_window);
                    return Ok(context_window);
                } else {
                    return Err(AppError::config_error_with_context(
                        "Missing Context Window",
                        &format!("Model '{}' is missing context_window configuration", model_name),
                        "Add context_window configuration to this model in the server settings",
                        Some(&format!("Provider: {}", provider.provider.name)),
                    ));
                }
            }
        }
    }
    
    // Model not found - provide detailed error with available models
    let available_models = runtime_config.providers.iter()
        .flat_map(|p| p.models.iter().map(|m| m.id.clone()))
        .collect::<Vec<_>>();
    
    Err(AppError::model_not_available_error(
        model_name,
        "context_window lookup",
        &available_models,
    ))
}

/// Get default max tokens for a task (STRICT - NO FALLBACKS)
pub async fn get_default_max_tokens_for_task(task_type: Option<TaskType>, app_handle: &AppHandle) -> AppResult<u32> {
    debug!("Getting max tokens for task: {:?}", task_type);
    
    // STRICT: Task type MUST be provided
    let task = task_type.ok_or_else(|| {
        AppError::config_error_with_context(
            "Missing Task Type",
            "No task type provided for max tokens configuration",
            "Provide a valid task type when requesting max tokens configuration",
            None,
        )
    })?;
    
    // STRICT: Only LLM tasks can have max tokens
    if !task.requires_llm() {
        return Err(AppError::config_error_with_context(
            "Invalid Task Type",
            &format!("Task '{}' is a local filesystem task that does not require max_tokens configuration", task.to_string()),
            "Only LLM tasks require max_tokens configuration",
            Some(&format!("Task type: {}", task.to_string())),
        ));
    }
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    let task_key = task.to_string();
    
    // STRICT: Task configuration MUST exist
    let task_config = runtime_config.tasks.get(&task_key)
        .ok_or_else(|| {
            AppError::missing_task_config_error(
                &task_key,
                &["model", "max_tokens", "temperature"],
            )
        })?;
    
    // STRICT: max_tokens MUST be valid (> 0)
    if task_config.max_tokens == 0 {
        return Err(AppError::invalid_config_value_error(
            "max_tokens",
            "0",
            "greater than 0",
            Some(&task_key),
        ));
    }
    
    debug!("Found max tokens for task {}: {}", task_key, task_config.max_tokens);
    Ok(task_config.max_tokens)
}

/// Get default temperature for a task (STRICT - NO FALLBACKS)
pub async fn get_default_temperature_for_task(task_type: Option<TaskType>, app_handle: &AppHandle) -> AppResult<f32> {
    debug!("Getting temperature for task: {:?}", task_type);
    
    // STRICT: Task type MUST be provided
    let task = task_type.ok_or_else(|| {
        AppError::config_error_with_context(
            "Missing Task Type",
            "No task type provided for temperature configuration",
            "Provide a valid task type when requesting temperature configuration",
            None,
        )
    })?;
    
    // STRICT: Only LLM tasks can have temperature
    if !task.requires_llm() {
        return Err(AppError::config_error_with_context(
            "Invalid Task Type",
            &format!("Task '{}' is a local filesystem task that does not require temperature configuration", task.to_string()),
            "Only LLM tasks require temperature configuration",
            Some(&format!("Task type: {}", task.to_string())),
        ));
    }
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    let task_key = task.to_string();
    
    // STRICT: Task configuration MUST exist
    let task_config = runtime_config.tasks.get(&task_key)
        .ok_or_else(|| {
            AppError::missing_task_config_error(
                &task_key,
                &["model", "max_tokens", "temperature"],
            )
        })?;
    
    // STRICT: Temperature MUST be in valid range
    let temperature = task_config.temperature;
    if temperature < 0.0 || temperature > 2.0 {
        return Err(AppError::invalid_config_value_error(
            "temperature",
            &temperature.to_string(),
            "between 0.0 and 2.0",
            Some(&task_key),
        ));
    }
    
    debug!("Found temperature for task {}: {}", task_key, temperature);
    Ok(temperature)
}

/// Get model for a specific task type (STRICT - NO FALLBACKS)
pub async fn get_model_for_task(task_type: TaskType, app_handle: &AppHandle) -> AppResult<String> {
    debug!("Getting model for task: {:?}", task_type);
    
    // STRICT: Only LLM tasks can have models
    if !task_type.requires_llm() {
        return Err(AppError::config_error_with_context(
            "Invalid Task Type",
            &format!("Task '{}' is a local filesystem task that does not require LLM model configuration", task_type.to_string()),
            "Only LLM tasks require model configuration",
            Some(&format!("Task type: {}", task_type.to_string())),
        ));
    }
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    let task_key = task_type.to_string();
    
    // STRICT: Task configuration MUST exist
    let task_config = runtime_config.tasks.get(&task_key)
        .ok_or_else(|| {
            AppError::missing_task_config_error(
                &task_key,
                &["model", "max_tokens", "temperature"],
            )
        })?;
    
    // STRICT: Model MUST be configured and non-empty
    if task_config.model.is_empty() {
        let available_models = runtime_config.providers.iter()
            .flat_map(|p| p.models.iter().map(|m| m.id.clone()))
            .collect::<Vec<_>>();
        
        return Err(AppError::missing_model_config_error(
            &task_key,
            &available_models,
        ));
    }
    
    // STRICT: Model MUST exist in providers
    let model_exists = runtime_config.providers.iter()
        .any(|p| p.models.iter().any(|m| m.id == task_config.model));
    
    if !model_exists {
        let available_models = runtime_config.providers.iter()
            .flat_map(|p| p.models.iter().map(|m| m.id.clone()))
            .collect::<Vec<_>>();
        
        return Err(AppError::model_not_available_error(
            &task_config.model,
            &task_key,
            &available_models,
        ));
    }
    
    debug!("Found model for task {}: {}", task_key, task_config.model);
    Ok(task_config.model.clone())
}

/// Get the default transcription model ID (STRICT - NO FALLBACKS)
pub async fn get_default_transcription_model_id(app_handle: &AppHandle) -> AppResult<String> {
    debug!("Getting default transcription model ID");
    get_model_for_task(TaskType::VoiceTranscription, app_handle).await
}

/// Get the maximum number of concurrent jobs (STRICT - NO FALLBACKS)
pub async fn get_max_concurrent_jobs(app_handle: &AppHandle) -> AppResult<usize> {
    debug!("Getting max concurrent jobs");
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    // STRICT: max_concurrent_jobs MUST be configured
    let max_jobs = runtime_config.max_concurrent_jobs
        .ok_or_else(|| {
            AppError::config_error_with_context(
                "Missing Configuration",
                "max_concurrent_jobs is not configured in server settings",
                "Add max_concurrent_jobs configuration to server settings",
                None,
            )
        })?;
    
    // STRICT: max_concurrent_jobs MUST be valid (> 0)
    if max_jobs == 0 {
        return Err(AppError::invalid_config_value_error(
            "max_concurrent_jobs",
            "0",
            "greater than 0",
            None,
        ));
    }
    
    debug!("Found max concurrent jobs: {}", max_jobs);
    Ok(max_jobs as usize)
}

// REMOVED: All PathFinder configuration functions - these were never used in the codebase
// If PathFinder configuration is needed in the future, implement only what's actually used

/// Get model info by model ID (STRICT - NO FALLBACKS)
pub async fn get_model_info(model_id: &str, app_handle: &AppHandle) -> AppResult<crate::models::ModelInfo> {
    debug!("Getting model info for: {}", model_id);
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    // STRICT: Model MUST exist in providers
    for provider in &runtime_config.providers {
        for model_info in &provider.models {
            if model_info.id == model_id {
                debug!("Found model info for {}: {:?}", model_id, model_info);
                return Ok(model_info.clone());
            }
        }
    }
    
    // Model not found - provide detailed error with available models
    let available_models = runtime_config.providers.iter()
        .flat_map(|p| p.models.iter().map(|m| m.id.clone()))
        .collect::<Vec<_>>();
    
    Err(AppError::model_not_available_error(
        model_id,
        "model info lookup",
        &available_models,
    ))
}

/// Helper function to get RuntimeAIConfig from cache (STRICT - NO FALLBACKS)
pub async fn get_runtime_ai_config_from_cache(app_handle: &AppHandle) -> AppResult<RuntimeAIConfig> {
    debug!("Getting runtime AI config from cache");
    
    // STRICT: Config cache MUST be initialized
    let config_cache = app_handle.try_state::<ConfigCache>()
        .ok_or_else(|| {
            AppError::config_error_with_context(
                "Cache Not Initialized",
                "Config cache is not yet initialized",
                "Wait for application initialization to complete or restart the application",
                None,
            )
        })?;
    
    // STRICT: Cache lock MUST be acquired
    let cache_guard = config_cache.lock().map_err(|e| {
        AppError::config_error_with_context(
            "Cache Lock Failed",
            &format!("Failed to acquire cache lock: {}", e),
            "Restart the application to clear lock contention",
            None,
        )
    })?;
    
    // STRICT: Runtime config MUST exist in cache
    let config_value = cache_guard.get("runtime_ai_config")
        .ok_or_else(|| {
            AppError::config_error_with_context(
                "Configuration Missing",
                "Runtime AI configuration not found in cache",
                "Refresh configuration from server or check server connection",
                None,
            )
        })?;
    
    // STRICT: Config MUST deserialize correctly
    let config = serde_json::from_value::<RuntimeAIConfig>(config_value.clone())
        .map_err(|e| {
            error!("Failed to deserialize runtime AI config from cache: {}", e);
            AppError::config_error_with_context(
                "Configuration Corrupt",
                &format!("Failed to deserialize runtime AI config: {}", e),
                "Clear cache and refresh configuration from server",
                None,
            )
        })?;
    
    // STRICT: Validate configuration completeness
    validate_runtime_config(&config)?;
    
    debug!("Successfully retrieved and validated runtime AI config");
    Ok(config)
}

/// Validate runtime configuration completeness (STRICT)
fn validate_runtime_config(config: &RuntimeAIConfig) -> AppResult<()> {
    debug!("Validating runtime configuration completeness");
    
    // STRICT: Must have at least one provider
    if config.providers.is_empty() {
        return Err(AppError::config_error_with_context(
            "No Providers Configured",
            "No AI providers are configured in the runtime configuration",
            "Add at least one provider configuration with models",
            None,
        ));
    }
    
    // STRICT: Each provider must have at least one model
    for provider in &config.providers {
        if provider.models.is_empty() {
            return Err(AppError::config_error_with_context(
                "Provider Has No Models",
                &format!("Provider '{}' has no models configured", provider.provider.name),
                &format!("Add models to provider '{}'", provider.provider.name),
                None,
            ));
        }
        
        // STRICT: Each model must have required fields
        for model in &provider.models {
            if model.context_window.is_none() {
                return Err(AppError::config_error_with_context(
                    "Model Missing Context Window",
                    &format!("Model '{}' is missing context_window configuration", model.id),
                    &format!("Add context_window to model '{}'", model.id),
                    Some(&format!("Provider: {}", provider.provider.name)),
                ));
            }
        }
    }
    
    // STRICT: Must have essential task configurations
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
        if !config.tasks.contains_key(&task_key) {
            return Err(AppError::missing_task_config_error(
                &task_key,
                &["model", "max_tokens", "temperature"],
            ));
        }
        
        // STRICT: Task configuration must be complete
        let task_config = &config.tasks[&task_key];
        if task_config.model.is_empty() {
            return Err(AppError::config_error_with_context(
                "Task Model Empty",
                &format!("Task '{}' has empty model configuration", task_key),
                &format!("Set a valid model for task '{}'", task_key),
                None,
            ));
        }
        
        if task_config.max_tokens == 0 {
            return Err(AppError::config_error_with_context(
                "Task Max Tokens Invalid",
                &format!("Task '{}' has invalid max_tokens (0)", task_key),
                &format!("Set valid max_tokens for task '{}'", task_key),
                None,
            ));
        }
        
        if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
            return Err(AppError::config_error_with_context(
                "Task Temperature Invalid",
                &format!("Task '{}' has invalid temperature ({})", task_key, task_config.temperature),
                &format!("Set temperature between 0.0 and 2.0 for task '{}'", task_key),
                None,
            ));
        }
    }
    
    // REMOVED: PathFinder settings validation - these configurations are never used in the codebase
    
    // STRICT: max_concurrent_jobs must be configured
    if config.max_concurrent_jobs.is_none() {
        return Err(AppError::config_error_with_context(
            "Max Concurrent Jobs Not Configured",
            "max_concurrent_jobs is not configured",
            "Add max_concurrent_jobs to server configuration",
            None,
        ));
    }
    
    debug!("Runtime configuration validation passed");
    Ok(())
}