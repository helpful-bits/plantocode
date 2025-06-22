use tauri::{AppHandle, Manager};
use crate::error::{AppResult, AppError};
use crate::models::{TaskType, RuntimeAIConfig};
use crate::services::config_cache_service::ConfigCache;
use log::{warn, error};

/// Get model context window size for a model (async version)
pub async fn get_model_context_window(model_name: &str, app_handle: &AppHandle) -> AppResult<u32> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    // Find model in providers list by ID
    for provider in &runtime_config.providers {
        for model_info in &provider.models {
            if model_info.id == model_name {
                // First check if context_window is set directly in the model info
                if let Some(context_window) = model_info.context_window {
                    return Ok(context_window);
                }
                
                // Model found but context_window is None - use a conservative fallback
                warn!("Model {} found but context_window is missing from server config, using fallback: 4096", model_name);
                return Ok(4096);  // Conservative fallback that works for most models
            }
        }
    }
    
    // Model not found in providers list - this indicates the model selection is invalid
    let available_models = runtime_config.providers.iter()
        .flat_map(|p| p.models.iter().map(|m| m.id.as_str()))
        .collect::<Vec<_>>()
        .join(", ");
    Err(AppError::ConfigError(format!(
        "Model '{}' not found in server configuration. This model may not be available or properly configured. Available models: {}", 
        model_name, 
        if available_models.is_empty() { "None configured" } else { &available_models }
    )))
}

/// Get default max tokens for a task (async version)
pub async fn get_default_max_tokens_for_task(task_type: Option<TaskType>, app_handle: &AppHandle) -> AppResult<u32> {
    if let Some(task) = task_type {
        // Check if this task requires LLM configuration
        if !task.requires_llm() {
            return Err(AppError::ConfigError(format!("Task {:?} is a local filesystem task that does not require max_tokens configuration", task)));
        }
    } else {
        return Err(AppError::ConfigError("No task type provided for max tokens configuration".to_string()));
    }
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    if let Some(task) = task_type {
        let task_key = task.to_string();
        
        // First try task-specific configuration
        if let Some(task_config) = runtime_config.tasks.get(&task_key) {
            if let Some(max_tokens) = task_config.max_tokens {
                return Ok(max_tokens);
            }
        }
        
        // Fall back to server general default if available
        if let Some(server_default) = runtime_config.default_max_tokens {
            warn!("No max_tokens configuration found for task {:?}, using server default: {}", task, server_default);
            return Ok(server_default);
        }
        
        // No hardcoded fallbacks - fail gracefully
        return Err(AppError::ConfigError(format!(
            "No max_tokens configuration found for task {:?}. Please check server configuration.", 
            task
        )));
    }
    
    Err(AppError::ConfigError("Server configuration not loaded for max_tokens. Please check server connection and configuration.".to_string()))
}

/// Get default temperature for a task (async version)
pub async fn get_default_temperature_for_task(task_type: Option<TaskType>, app_handle: &AppHandle) -> AppResult<f32> {
    if let Some(task) = task_type {
        // Check if this task requires LLM configuration
        if !task.requires_llm() {
            return Err(AppError::ConfigError(format!("Task {:?} is a local filesystem task that does not require temperature configuration", task)));
        }
    } else {
        return Err(AppError::ConfigError("No task type provided for temperature configuration".to_string()));
    }
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    if let Some(task) = task_type {
        let task_key = task.to_string();
        
        // First try task-specific configuration
        if let Some(task_config) = runtime_config.tasks.get(&task_key) {
            if let Some(temperature) = task_config.temperature {
                if temperature < 0.0 || temperature > 2.0 {
                    return Err(AppError::ConfigError(format!("Invalid temperature {} for task {:?}. Must be between 0.0 and 2.0.", temperature, task)));
                }
                return Ok(temperature);
            }
        }
        
        // Fall back to server general default if available
        if let Some(server_default) = runtime_config.default_temperature {
            if server_default < 0.0 || server_default > 2.0 {
                return Err(AppError::ConfigError(format!("Invalid server default temperature {} for task {:?}. Must be between 0.0 and 2.0.", server_default, task)));
            }
            warn!("No temperature configuration found for task {:?}, using server default: {}", task, server_default);
            return Ok(server_default);
        }
        
        // No hardcoded fallbacks - fail gracefully
        return Err(AppError::ConfigError(format!(
            "No temperature configuration found for task {:?}. Please check server configuration.", 
            task
        )));
    }
    
    Err(AppError::ConfigError("Server configuration not loaded for temperature. Please check server connection and configuration.".to_string()))
}

/// Get model for a specific task type (async version)
pub async fn get_model_for_task(task_type: TaskType, app_handle: &AppHandle) -> AppResult<String> {
    // Check if this task requires LLM configuration
    if !task_type.requires_llm() {
        return Err(AppError::ConfigError(format!("Task {:?} is a local filesystem task that does not require LLM model configuration", task_type)));
    }
    
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    let task_key = task_type.to_string();
    
    if let Some(task_config) = runtime_config.tasks.get(&task_key) {
        if let Some(model) = &task_config.model {
            if model.is_empty() {
                return Err(AppError::ConfigError(format!("Model configuration for task {} is empty", task_key)));
            }
            return Ok(model.clone());
        }
    }
    
    // If task-specific config not found, use default LLM model
    if runtime_config.default_llm_model_id.is_empty() {
        return Err(AppError::ConfigError(format!("Server default model ID is empty for task {:?}. Please check server configuration.", task_type)));
    }
    
    Ok(runtime_config.default_llm_model_id.clone())
}

/// Get the default transcription model ID (async version)
pub async fn get_default_transcription_model_id(app_handle: &AppHandle) -> AppResult<String> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    if runtime_config.default_transcription_model_id.is_empty() {
        return Err(AppError::ConfigError("Default transcription model ID not available from server config".to_string()));
    }
    Ok(runtime_config.default_transcription_model_id.clone())
}

/// Get the maximum number of concurrent jobs (async version)
pub async fn get_max_concurrent_jobs(app_handle: &AppHandle) -> usize {
    match get_runtime_ai_config_from_cache(app_handle).await {
        Ok(runtime_config) => {
            if let Some(max_jobs) = runtime_config.max_concurrent_jobs {
                max_jobs as usize
            } else {
                4 // Default to 4 concurrent jobs if not configured
            }
        }
        Err(_) => {
            log::warn!("Failed to get max_concurrent_jobs from cache, using default: 4");
            4 // Default to 4 concurrent jobs if config fails
        }
    }
}

/// Get the maximum number of files to include content from for PathFinder (async version)
pub async fn get_path_finder_max_files_with_content(app_handle: &AppHandle) -> AppResult<usize> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    if let Some(max_files) = runtime_config.path_finder_settings.max_files_with_content {
        Ok(max_files)
    } else {
        Err(AppError::ConfigError("PathFinder max_files_with_content not configured in server config".to_string()))
    }
}

/// Get whether to include file contents by default for PathFinder (async version)
pub async fn get_path_finder_include_file_contents(app_handle: &AppHandle) -> AppResult<bool> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    if let Some(include_file_contents) = runtime_config.path_finder_settings.include_file_contents {
        Ok(include_file_contents)
    } else {
        Err(AppError::ConfigError("PathFinder include_file_contents not configured in server config".to_string()))
    }
}

/// Get the maximum number of paths to return in results for PathFinder (async version)
pub async fn get_path_finder_max_file_count(app_handle: &AppHandle) -> AppResult<usize> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    if let Some(max_file_count) = runtime_config.path_finder_settings.max_file_count {
        Ok(max_file_count)
    } else {
        Err(AppError::ConfigError("PathFinder max_file_count not configured in server config".to_string()))
    }
}

/// Get the token limit buffer for PathFinder (async version)
pub async fn get_path_finder_token_limit_buffer(app_handle: &AppHandle) -> AppResult<u32> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    if let Some(token_limit_buffer) = runtime_config.path_finder_settings.token_limit_buffer {
        Ok(token_limit_buffer)
    } else {
        Err(AppError::ConfigError("PathFinder token_limit_buffer not configured in server config".to_string()))
    }
}

/// Get model info by model ID (async version)
pub async fn get_model_info(model_id: &str, app_handle: &AppHandle) -> AppResult<crate::models::ModelInfo> {
    let runtime_config = get_runtime_ai_config_from_cache(app_handle).await?;
    
    for provider in &runtime_config.providers {
        for model_info in &provider.models {
            if model_info.id == model_id {
                return Ok(model_info.clone());
            }
        }
    }
    
    Err(AppError::ConfigError(format!("Model '{}' not found in server configuration", model_id)))
}

/// Helper function to get RuntimeAIConfig from cache
pub async fn get_runtime_ai_config_from_cache(app_handle: &AppHandle) -> AppResult<RuntimeAIConfig> {
    let config_cache = app_handle.state::<ConfigCache>();
    
    match config_cache.lock() {
        Ok(cache_guard) => {
            if let Some(config_value) = cache_guard.get("runtime_ai_config") {
                match serde_json::from_value::<RuntimeAIConfig>(config_value.clone()) {
                    Ok(config) => Ok(config),
                    Err(e) => {
                        error!("Failed to deserialize runtime AI config from cache: {}", e);
                        Err(AppError::SerializationError(e.to_string()))
                    }
                }
            } else {
                Err(AppError::ConfigError("Runtime AI configuration not found in cache. Please refresh configuration.".to_string()))
            }
        }
        Err(e) => {
            error!("Failed to acquire cache lock: {}", e);
            Err(AppError::InternalError(format!("Failed to read configuration cache: {}", e)))
        }
    }
}