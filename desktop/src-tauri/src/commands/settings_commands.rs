use tauri::{AppHandle, State};
use crate::error::{AppResult, AppError};
use crate::SETTINGS_REPO;
use crate::utils::hash_utils::hash_string;
use serde_json::{json, Value};

#[tauri::command]
pub async fn get_key_value_command(app_handle: AppHandle, key: String) -> AppResult<Option<String>> {
    // Get the settings repo from the state
    let settings_repo = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    })?;
    
    // Call the get_value method
    settings_repo.get_value(&key).await
}

#[tauri::command]
pub async fn set_key_value_command(app_handle: AppHandle, key: String, value: String) -> AppResult<()> {
    // Get the settings repo from the state
    let settings_repo = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    })?;
    
    // Call the set_value method
    settings_repo.set_value(&key, &value).await
}

#[tauri::command]
pub async fn get_project_task_model_settings_command(app_handle: AppHandle, project_directory: String) -> AppResult<Option<String>> {
    // Get the settings repo from the state
    let settings_repo = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    })?;
    
    // Create a project-specific key
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    
    // Call the get_value method
    settings_repo.get_value(&key).await
}

#[tauri::command]
pub async fn set_project_task_model_settings_command(app_handle: AppHandle, project_directory: String, settings_json: String) -> AppResult<()> {
    // Get the settings repo from the state
    let settings_repo = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    })?;
    
    // Create a project-specific key
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    
    // Call the set_value method
    settings_repo.set_value(&key, &settings_json).await
}

#[tauri::command]
pub async fn get_default_task_model_settings_command(app_handle: AppHandle) -> AppResult<String> {
    // Define default task model settings
    // These match the DEFAULT_TASK_SETTINGS from desktop/src/utils/constants.ts
    let default_settings = json!({
        "pathFinder": {
            "model": "gemini-2.5-flash-preview-04-17",
            "maxTokens": 8192,
            "temperature": 0.3
        },
        "transcription": {
            "model": "whisper-large-v3",
            "maxTokens": 4096,
            "temperature": 0.0
        },
        "regexGeneration": {
            "model": "claude-3-7-sonnet-20250219",
            "maxTokens": 4096,
            "temperature": 0.2
        },
        "pathCorrection": {
            "model": "gemini-2.5-flash-preview-04-17",
            "maxTokens": 8192,
            "temperature": 0.2
        },
        "textImprovement": {
            "model": "claude-3-7-sonnet-20250219",
            "maxTokens": 8192,
            "temperature": 0.7
        },
        "voiceCorrection": {
            "model": "claude-3-7-sonnet-20250219",
            "maxTokens": 4096,
            "temperature": 0.3
        },
        "taskEnhancement": {
            "model": "gemini-2.5-pro-preview-05-06",
            "maxTokens": 16384,
            "temperature": 0.7
        },
        "guidanceGeneration": {
            "model": "gemini-2.5-pro-preview-05-06",
            "maxTokens": 16384,
            "temperature": 0.7
        },
        "implementationPlan": {
            "model": "gemini-2.5-pro-preview-05-06",
            "maxTokens": 65536,
            "temperature": 0.7
        },
        "genericLlmStream": {
            "model": "gemini-2.5-flash-preview-04-17",
            "maxTokens": 16384,
            "temperature": 0.7
        },
        "streaming": {
            "model": "gemini-2.5-flash-preview-04-17",
            "maxTokens": 16384,
            "temperature": 0.7
        },
        "unknown": {
            "model": "gemini-2.5-flash-preview-04-17",
            "maxTokens": 4096,
            "temperature": 0.7
        }
    });

    Ok(default_settings.to_string())
}

#[tauri::command]
pub async fn get_all_task_model_settings_for_project_command(app_handle: AppHandle, project_directory: String) -> AppResult<String> {
    // First try to get project-specific settings
    let project_settings = get_project_task_model_settings_command(app_handle.clone(), project_directory).await?;
    
    // If project settings exist, return them
    if let Some(settings) = project_settings {
        return Ok(settings);
    }
    
    // Otherwise, return the default settings
    get_default_task_model_settings_command(app_handle).await
}