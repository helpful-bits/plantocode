use tauri::AppHandle;
use crate::error::{AppError, AppResult};
use crate::models::TaskType;

/// Resolves model, temperature, and max_tokens settings for LLM tasks
/// 
/// This function centralizes the logic for resolving model configuration by:
/// 1. Using override values if provided
/// 2. Otherwise falling back to project-specific settings
/// 3. Finally falling back to server defaults
/// 
/// For non-LLM tasks, returns None.
pub async fn resolve_model_settings(
    app_handle: &AppHandle,
    task_type: TaskType,
    project_directory: &str,
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

    // Resolve model
    let model = if let Some(model) = model_override {
        model
    } else {
        crate::config::get_model_for_task_with_project(task_type, project_directory, app_handle)
            .await
            .map_err(|e| AppError::ConfigError(format!("Failed to get model for task {:?}: {}", task_type, e)))?
    };

    // Resolve temperature
    let temperature = if let Some(temp) = temperature_override {
        temp
    } else {
        crate::config::get_temperature_for_task_with_project(task_type, project_directory, app_handle)
            .await
            .map_err(|e| AppError::ConfigError(format!("Failed to get temperature for task {:?}: {}", task_type, e)))?
    };

    // Resolve max_tokens
    let max_tokens = if let Some(tokens) = max_tokens_override {
        tokens
    } else {
        crate::config::get_max_tokens_for_task_with_project(task_type, project_directory, app_handle)
            .await
            .map_err(|e| AppError::ConfigError(format!("Failed to get max_tokens for task {:?}: {}", task_type, e)))?
    };

    Ok(Some((model, temperature, max_tokens)))
}