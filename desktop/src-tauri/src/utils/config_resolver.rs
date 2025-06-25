use tauri::{AppHandle, Manager};
use crate::error::{AppError, AppResult};
use crate::models::TaskType;
use crate::db_utils::SettingsRepository;
use crate::utils::hash_utils::generate_project_hash;
use serde_json;
use heck::ToSnakeCase;

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
        let project_key = format!("project_task_settings:{}:{}_{}", project_hash, task_type_snake, "model");
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
        let project_key = format!("project_task_settings:{}:{}_{}", project_hash, task_type_snake, "temperature");
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
        let project_key = format!("project_task_settings:{}:{}_{}", project_hash, task_type_snake, "max_tokens");
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