use tauri::{AppHandle, Manager};
use crate::error::{AppError, AppResult};
use crate::models::{TaskType, RuntimeAIConfig};
use crate::db_utils::SettingsRepository;
use crate::utils::hash_utils::generate_project_hash;
use crate::services::config_cache_service::ConfigCache;
use crate::validation::ConfigValidator;
use serde_json;
use heck::ToSnakeCase;
use log::{info, error, warn};

/// Validates that resolved settings are valid and consistent
async fn validate_resolved_settings(task_type: TaskType, app_handle: &AppHandle) -> AppResult<()> {
    info!("Validating resolved settings for task type: {:?}", task_type);
    
    // Get the config cache and validate it contains the required runtime config
    let config_cache = app_handle.state::<ConfigCache>();
    let cache_guard = config_cache.lock()
        .map_err(|e| AppError::ConfigError(format!("Failed to acquire config cache lock: {}", e)))?;
    
    let runtime_config_value = cache_guard.get("runtime_ai_config")
        .ok_or_else(|| AppError::ConfigError("Runtime AI config not found in cache".to_string()))?;
    
    let runtime_config: RuntimeAIConfig = serde_json::from_value(runtime_config_value.clone())
        .map_err(|e| AppError::SerializationError(format!("Failed to deserialize runtime config: {}", e)))?;
    
    drop(cache_guard);
    
    // Validate that the task type has a configuration
    let task_key = task_type.to_string();
    let task_config = runtime_config.tasks.get(&task_key)
        .ok_or_else(|| AppError::ConfigError(format!("No configuration found for task type: {}", task_key)))?;
    
    // Validate the task configuration is complete
    if task_config.model.trim().is_empty() {
        return Err(AppError::ConfigError(format!("Task '{}' has empty model configuration", task_key)));
    }
    
    if task_config.max_tokens == 0 {
        return Err(AppError::ConfigError(format!("Task '{}' has zero max_tokens configuration", task_key)));
    }
    
    if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
        return Err(AppError::ConfigError(format!("Task '{}' has invalid temperature {} (must be 0.0-2.0)", task_key, task_config.temperature)));
    }
    
    // Validate the model exists in available providers
    let available_models: std::collections::HashSet<String> = runtime_config.providers
        .iter()
        .flat_map(|p| p.models.iter().map(|m| m.id.clone()))
        .collect();
    
    if !available_models.contains(&task_config.model) {
        return Err(AppError::ConfigError(format!("Model '{}' for task '{}' not found in available providers", task_config.model, task_key)));
    }
    
    info!("Resolved settings validation passed for task type: {:?}", task_type);
    Ok(())
}

pub async fn resolve_model_settings(
    app_handle: &AppHandle,
    task_type: TaskType,
    project_directory: &str,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
) -> AppResult<Option<(String, f32, u32)>> {
    if !task_type.requires_llm() {
        if model_override.is_some() || temperature_override.is_some() || max_tokens_override.is_some() {
            return Err(AppError::ConfigError(format!(
                "Task {:?} is a local filesystem task that does not require LLM configuration. Model, temperature, and max_tokens overrides are not applicable for this task type.",
                task_type
            )));
        }
        return Ok(None);
    }
    
    // Add validation at the beginning of model resolution
    validate_resolved_settings(task_type, app_handle).await?;

    let project_hash = generate_project_hash(project_directory);
    let task_type_snake = task_type.to_string().to_snake_case();
    let pool = match app_handle.try_state::<sqlx::SqlitePool>() {
        Some(pool) => pool.inner().clone(),
        None => {
            return Err(AppError::InitializationError(
                "Database pool not yet initialized. Please wait for app initialization to complete.".to_string()
            ));
        }
    };
    let settings_repo = SettingsRepository::new(std::sync::Arc::new(pool));

    let model = if let Some(model) = model_override {
        model
    } else {
        let project_key = format!("project_task_settings:{}:{}:{}", project_hash, task_type_snake, "model");
        match settings_repo.get_value(&project_key).await? {
            Some(value) => {
                serde_json::from_str::<String>(&value)
                    .map_err(|e| AppError::ConfigError(format!("Failed to parse project model setting: {}", e)))?
            }
            None => {
                crate::utils::config_helpers::get_model_for_task(task_type, app_handle)
                    .await
                    .map_err(|e| AppError::ConfigError(format!("Failed to get model for task {:?}: {}", task_type, e)))?
            }
        }
    };

    let temperature = if let Some(temp) = temperature_override {
        temp
    } else {
        let project_key = format!("project_task_settings:{}:{}:{}", project_hash, task_type_snake, "temperature");
        match settings_repo.get_value(&project_key).await? {
            Some(value) => {
                serde_json::from_str::<f32>(&value)
                    .map_err(|e| AppError::ConfigError(format!("Failed to parse project temperature setting: {}", e)))?
            }
            None => {
                crate::utils::config_helpers::get_default_temperature_for_task(Some(task_type), app_handle)
                    .await
                    .map_err(|e| AppError::ConfigError(format!("Failed to get temperature for task {:?}: {}", task_type, e)))?
            }
        }
    };

    let max_tokens = if let Some(tokens) = max_tokens_override {
        tokens
    } else {
        let project_key = format!("project_task_settings:{}:{}:{}", project_hash, task_type_snake, "maxTokens");
        match settings_repo.get_value(&project_key).await? {
            Some(value) => {
                serde_json::from_str::<u32>(&value)
                    .map_err(|e| AppError::ConfigError(format!("Failed to parse project max_tokens setting: {}", e)))?
            }
            None => {
                crate::utils::config_helpers::get_default_max_tokens_for_task(Some(task_type), app_handle)
                    .await
                    .map_err(|e| AppError::ConfigError(format!("Failed to get max_tokens for task {:?}: {}", task_type, e)))?
            }
        }
    };

    Ok(Some((model, temperature, max_tokens)))
}