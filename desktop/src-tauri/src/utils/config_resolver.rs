use tauri::AppHandle;
use crate::error::{AppError, AppResult};
use crate::models::TaskType;

/// Resolves model, temperature, and max_tokens settings for LLM tasks
/// 
/// This function centralizes the logic for resolving model configuration by:
/// 1. Using override values if provided
/// 2. Otherwise falling back to server defaults from cache
/// 
/// For non-LLM tasks, returns None.
pub async fn resolve_model_settings(
    app_handle: &AppHandle,
    task_type: TaskType,
    _project_directory: &str, // No longer used, keeping for API compatibility
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
) -> AppResult<Option<(String, f32, u32)>> {
    // Check if this task requires LLM configuration
    if !task_type.requires_llm() {
        // If any LLM-related overrides are provided for a local task, return an error
        if model_override.is_some() || temperature_override.is_some() || max_tokens_override.is_some() {
            return Err(AppError::ConfigError(format!(
                "Task {:?} is a local filesystem task that does not require LLM configuration. Model, temperature, and max_tokens overrides are not applicable for this task type.",
                task_type
            )));
        }
        
        // Return None for non-LLM tasks
        return Ok(None);
    }

    // Resolve model - use override or server default
    let model = if let Some(model) = model_override {
        model
    } else {
        crate::utils::config_helpers::get_model_for_task(task_type, app_handle)
            .await
            .map_err(|e| AppError::ConfigError(format!("Failed to get model for task {:?}: {}", task_type, e)))?
    };

    // Resolve temperature - use override or server default
    let temperature = if let Some(temp) = temperature_override {
        temp
    } else {
        crate::utils::config_helpers::get_default_temperature_for_task(Some(task_type), app_handle)
            .await
            .map_err(|e| AppError::ConfigError(format!("Failed to get temperature for task {:?}: {}", task_type, e)))?
    };

    // Resolve max_tokens - use override or server default
    let max_tokens = if let Some(tokens) = max_tokens_override {
        tokens
    } else {
        crate::utils::config_helpers::get_default_max_tokens_for_task(Some(task_type), app_handle)
            .await
            .map_err(|e| AppError::ConfigError(format!("Failed to get max_tokens for task {:?}: {}", task_type, e)))?
    };

    Ok(Some((model, temperature, max_tokens)))
}