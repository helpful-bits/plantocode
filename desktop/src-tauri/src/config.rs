use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use std::collections::HashMap;
use log::{info, warn, error};
use tauri::AppHandle;
use crate::constants::SERVER_API_URL;
use crate::utils::env_utils::read_env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub server_url: String,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            server_url: read_env("MAIN_SERVER_BASE_URL", &read_env("SERVER_URL", SERVER_API_URL, false), true),
        }
    }
}

// Global configuration with RwLock for thread-safe access
pub static CONFIG: Lazy<RwLock<Option<crate::models::RuntimeAIConfig>>> = Lazy::new(|| RwLock::new(None));

// Note: The get_model_context_window function is implemented below


// Model configuration helper functions
use crate::error::{AppResult, AppError};
use crate::models::{TaskType, RuntimeAIConfig};
use crate::utils::hash_utils::hash_string;
use crate::SETTINGS_REPO;

// Update runtime AI configuration
pub fn update_runtime_ai_config(new_config: RuntimeAIConfig) -> AppResult<()> {
    let mut config_opt = CONFIG.write().map_err(|e| AppError::InternalError(format!("Failed to acquire write lock: {}", e)))?;
    *config_opt = Some(new_config);
    info!("Runtime AI configuration updated");
    Ok(())
}

// Get the runtime AI configuration
pub fn get_runtime_ai_config() -> AppResult<Option<RuntimeAIConfig>> {
    let config_opt = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    Ok(config_opt.clone())
}

// Get the default transcription model ID
pub fn get_default_transcription_model_id() -> AppResult<String> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    if let Some(runtime_config) = &*config_guard {
        if runtime_config.default_transcription_model_id.is_empty() {
            return Err(AppError::ConfigError("Default transcription model ID not available from server config".to_string()));
        }
        Ok(runtime_config.default_transcription_model_id.clone())
    } else {
        Err(AppError::ConfigError("Runtime AI configuration not available from server".to_string()))
    }
}

// PathFinder settings helpers

/// Get the maximum number of files to include content from for PathFinder
pub fn get_path_finder_max_files_with_content() -> AppResult<usize> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    if let Some(runtime_config) = &*config_guard {
        if let Some(max_files) = runtime_config.path_finder_settings.max_files_with_content {
            return Ok(max_files);
        }
    }
    
    Err(AppError::ConfigError("PathFinder max_files_with_content not available from server config".to_string()))
}

/// Get whether to include file contents by default for PathFinder
pub fn get_path_finder_include_file_contents() -> AppResult<bool> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    if let Some(runtime_config) = &*config_guard {
        if let Some(include_file_contents) = runtime_config.path_finder_settings.include_file_contents {
            return Ok(include_file_contents);
        }
    }
    
    Err(AppError::ConfigError("PathFinder include_file_contents not available from server config".to_string()))
}

/// Get the maximum content size per file for PathFinder
pub fn get_path_finder_max_content_size_per_file() -> AppResult<usize> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        if let Some(max_content_size) = runtime_config.path_finder_settings.max_content_size_per_file {
            return Ok(max_content_size);
        }
    }
    
    Err(AppError::ConfigError("PathFinder max_content_size_per_file not available from server config".to_string()))
}

/// Get the maximum number of paths to return in results for PathFinder
pub fn get_path_finder_max_file_count() -> AppResult<usize> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        if let Some(max_file_count) = runtime_config.path_finder_settings.max_file_count {
            return Ok(max_file_count);
        }
    }
    
    Err(AppError::ConfigError("PathFinder max_file_count not available from server config".to_string()))
}

/// Get the initial truncation length for file contents for PathFinder
pub fn get_path_finder_file_content_truncation_chars() -> AppResult<usize> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        if let Some(truncation_chars) = runtime_config.path_finder_settings.file_content_truncation_chars {
            return Ok(truncation_chars);
        }
    }
    
    Err(AppError::ConfigError("PathFinder file_content_truncation_chars not available from server config".to_string()))
}

/// Get the token limit buffer for PathFinder
pub fn get_path_finder_token_limit_buffer() -> AppResult<u32> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        if let Some(token_limit_buffer) = runtime_config.path_finder_settings.token_limit_buffer {
            return Ok(token_limit_buffer);
        }
    }
    
    Err(AppError::ConfigError("PathFinder token_limit_buffer not available from server config".to_string()))
}

// Get default LLM model ID
pub fn get_default_llm_model_id() -> AppResult<String> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        if runtime_config.default_llm_model_id.is_empty() {
            return Err(AppError::ConfigError("Default LLM model ID not available from server config".to_string()));
        }
        Ok(runtime_config.default_llm_model_id.clone())
    } else {
        Err(AppError::ConfigError("Runtime AI configuration not available from server".to_string()))
    }
}

// Get model for a specific task type (sync version for backward compatibility)
pub fn get_model_for_task(task_type: TaskType) -> AppResult<String> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        let task_key = task_type.to_string();
        
        if let Some(task_config) = runtime_config.tasks.get(&task_key) {
            if task_config.model.is_empty() {
                return Err(AppError::ConfigError(format!("Model configuration for task {} is empty", task_key)));
            }
            return Ok(task_config.model.clone());
        }
        
        // If task-specific config not found, use default LLM model
        if runtime_config.default_llm_model_id.is_empty() {
            return Err(AppError::ConfigError(format!("Server default model ID is empty for task {:?}. Please check server configuration.", task_type)));
        }
        
        return Ok(runtime_config.default_llm_model_id.clone());
    }
    
    // Server config not available - this is an error, not a fallback case
    Err(AppError::ConfigError(format!("Server configuration not loaded for task {:?}. Please check server connection and configuration.", task_type)))
}

// Async version: Get model for a specific task type with AppHandle
pub async fn get_model_for_task_async(task_type: TaskType, app_handle: &AppHandle) -> AppResult<String> {
    // Get from server configuration - no fallbacks
    get_model_for_task(task_type)
}

// Get task-specific configuration
pub fn get_task_specific_config(task_type: TaskType) -> AppResult<Option<crate::models::TaskSpecificModelConfig>> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        let task_key = task_type.to_string();
        Ok(runtime_config.tasks.get(&task_key).cloned())
    } else {
        Ok(None)
    }
}

// Get default max tokens for a task (sync version)
pub fn get_default_max_tokens_for_task(task_type: Option<TaskType>) -> AppResult<u32> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        if let Some(task) = task_type {
            let task_key = task.to_string();
            
            if let Some(task_config) = runtime_config.tasks.get(&task_key) {
                return Ok(task_config.max_tokens);
            }
            
            return Err(AppError::ConfigError(format!("No max_tokens configuration found for task {:?}. Please check server configuration.", task)));
        }
        
        return Err(AppError::ConfigError("No task type provided for max tokens configuration".to_string()));
    }
    
    Err(AppError::ConfigError(format!("Server configuration not loaded for max_tokens. Please check server connection and configuration.")))
}

// Async version: Get max tokens for a task with AppHandle
pub async fn get_max_tokens_for_task_async(task_type: TaskType, app_handle: &AppHandle) -> AppResult<u32> {
    // Get from server configuration - no fallbacks
    get_default_max_tokens_for_task(Some(task_type))
}

// Get default temperature for a task (sync version)
pub fn get_default_temperature_for_task(task_type: Option<TaskType>) -> AppResult<f32> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        if let Some(task) = task_type {
            let task_key = task.to_string();
            
            if let Some(task_config) = runtime_config.tasks.get(&task_key) {
                if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
                    return Err(AppError::ConfigError(format!("Invalid temperature {} for task {:?}. Must be between 0.0 and 2.0.", task_config.temperature, task)));
                }
                return Ok(task_config.temperature);
            }
            
            return Err(AppError::ConfigError(format!("No temperature configuration found for task {:?}. Please check server configuration.", task)));
        }
        
        return Err(AppError::ConfigError("No task type provided for temperature configuration".to_string()));
    }
    
    Err(AppError::ConfigError(format!("Server configuration not loaded for temperature. Please check server connection and configuration.")))
}

// Async version: Get temperature for a task with AppHandle
pub async fn get_temperature_for_task_async(task_type: TaskType, app_handle: &AppHandle) -> AppResult<f32> {
    // Get from server configuration - no fallbacks
    get_default_temperature_for_task(Some(task_type))
}

// Get context window size for a model
pub fn get_model_context_window(model_name: &str) -> AppResult<u32> {
    let config_guard = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &*config_guard {
        // Find model in available_models list by ID
        for model_info in &runtime_config.available_models {
            if model_info.id == model_name {
                // First check if context_window is set directly in the model info
                if let Some(context_window) = model_info.context_window {
                    return Ok(context_window);
                }
                
                // Model found but context_window is None - this should not happen with database-sourced models
                return Err(AppError::ConfigError(format!("Model {} found but context_window is missing from server config", model_name)));
            }
        }
        
        // Model not found in available_models list - this should not happen in normal operation
        // as all models should be loaded from the database
        return Err(AppError::ConfigError(format!("Model {} not found in server configuration. Available models: {}", 
            model_name, 
            runtime_config.available_models.iter().map(|m| m.id.as_str()).collect::<Vec<_>>().join(", "))));
    }
    
    Err(AppError::ConfigError("Runtime AI configuration not available from server".to_string()))
}

// Project-aware configuration functions that check user settings first, then fall back to server defaults

/// Helper function to parse project settings JSON and extract model for a specific task
fn extract_model_from_project_settings(settings_json: &str, task_type: TaskType) -> Option<String> {
    let settings: serde_json::Value = serde_json::from_str(settings_json).ok()?;
    
    // Map TaskType to frontend camelCase key
    let task_key = match task_type {
        TaskType::ImplementationPlan => "implementationPlan",
        TaskType::PathFinder => "pathFinder",
        TaskType::TextImprovement => "textImprovement",
        TaskType::VoiceTranscription => "transcription",
        TaskType::TextCorrection => "textCorrection",
        TaskType::PathCorrection => "pathCorrection",
        TaskType::GuidanceGeneration => "guidanceGeneration",
        TaskType::TaskEnhancement => "taskEnhancement",
        TaskType::GenericLlmStream => "genericLlmStream",
        TaskType::RegexSummaryGeneration => "regexSummaryGeneration",
        TaskType::RegexPatternGeneration => "regexPatternGeneration",
        TaskType::FileFinderWorkflow => "fileFinderWorkflow",
        _ => return None,
    };
    
    settings.get(task_key)?
        .get("model")?
        .as_str()
        .map(|s| s.to_string())
}

/// Helper function to extract temperature from project settings
fn extract_temperature_from_project_settings(settings_json: &str, task_type: TaskType) -> Option<f32> {
    let settings: serde_json::Value = serde_json::from_str(settings_json).ok()?;
    
    let task_key = match task_type {
        TaskType::ImplementationPlan => "implementationPlan",
        TaskType::PathFinder => "pathFinder",
        TaskType::TextImprovement => "textImprovement",
        TaskType::VoiceTranscription => "transcription",
        TaskType::TextCorrection => "textCorrection",
        TaskType::PathCorrection => "pathCorrection",
        TaskType::GuidanceGeneration => "guidanceGeneration",
        TaskType::TaskEnhancement => "taskEnhancement",
        TaskType::GenericLlmStream => "genericLlmStream",
        TaskType::RegexSummaryGeneration => "regexSummaryGeneration",
        TaskType::RegexPatternGeneration => "regexPatternGeneration",
        TaskType::FileFinderWorkflow => "fileFinderWorkflow",
        _ => return None,
    };
    
    settings.get(task_key)?
        .get("temperature")?
        .as_f64()
        .map(|t| t as f32)
}

/// Helper function to extract maxTokens from project settings
fn extract_max_tokens_from_project_settings(settings_json: &str, task_type: TaskType) -> Option<u32> {
    let settings: serde_json::Value = serde_json::from_str(settings_json).ok()?;
    
    let task_key = match task_type {
        TaskType::ImplementationPlan => "implementationPlan",
        TaskType::PathFinder => "pathFinder",
        TaskType::TextImprovement => "textImprovement",
        TaskType::VoiceTranscription => "transcription",
        TaskType::TextCorrection => "textCorrection",
        TaskType::PathCorrection => "pathCorrection",
        TaskType::GuidanceGeneration => "guidanceGeneration",
        TaskType::TaskEnhancement => "taskEnhancement",
        TaskType::GenericLlmStream => "genericLlmStream",
        TaskType::RegexSummaryGeneration => "regexSummaryGeneration",
        TaskType::RegexPatternGeneration => "regexPatternGeneration",
        TaskType::FileFinderWorkflow => "fileFinderWorkflow",
        _ => return None,
    };
    
    settings.get(task_key)?
        .get("maxTokens")?
        .as_u64()
        .map(|t| t as u32)
}

/// Async version: Get model for a task, checking project-specific settings first, then falling back to server config
pub async fn get_model_for_task_with_project(task_type: TaskType, project_directory: &str, app_handle: &AppHandle) -> AppResult<String> {
    // First try to get project-specific settings
    if let Ok(settings_repo) = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    }) {
        let project_hash = hash_string(project_directory);
        let key = format!("project_task_model_settings_{}", project_hash);
        
        // Try to get project settings
        if let Ok(Some(settings_json)) = settings_repo.get_value(&key).await {
            if let Some(model) = extract_model_from_project_settings(&settings_json, task_type) {
                if !model.is_empty() {
                    log::debug!("Using project-specific model for {:?}: {}", task_type, model);
                    return Ok(model);
                }
            }
        }
    }
    
    // Fall back to server config (with async version)
    log::debug!("Using server default model for {:?}", task_type);
    get_model_for_task_async(task_type, app_handle).await
}

/// Async version: Get temperature for a task, checking project-specific settings first, then falling back to server config
pub async fn get_temperature_for_task_with_project(task_type: TaskType, project_directory: &str, app_handle: &AppHandle) -> AppResult<f32> {
    // First try to get project-specific settings
    if let Ok(settings_repo) = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    }) {
        let project_hash = hash_string(project_directory);
        let key = format!("project_task_model_settings_{}", project_hash);
        
        // Try to get project settings
        if let Ok(Some(settings_json)) = settings_repo.get_value(&key).await {
            if let Some(temperature) = extract_temperature_from_project_settings(&settings_json, task_type) {
                log::debug!("Using project-specific temperature for {:?}: {}", task_type, temperature);
                return Ok(temperature);
            }
        }
    }
    
    // Fall back to server config (with async version)
    log::debug!("Using server default temperature for {:?}", task_type);
    get_temperature_for_task_async(task_type, app_handle).await
}

/// Async version: Get max tokens for a task, checking project-specific settings first, then falling back to server config
pub async fn get_max_tokens_for_task_with_project(task_type: TaskType, project_directory: &str, app_handle: &AppHandle) -> AppResult<u32> {
    // First try to get project-specific settings
    if let Ok(settings_repo) = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    }) {
        let project_hash = hash_string(project_directory);
        let key = format!("project_task_model_settings_{}", project_hash);
        
        // Try to get project settings
        if let Ok(Some(settings_json)) = settings_repo.get_value(&key).await {
            if let Some(max_tokens) = extract_max_tokens_from_project_settings(&settings_json, task_type) {
                log::debug!("Using project-specific max_tokens for {:?}: {}", task_type, max_tokens);
                return Ok(max_tokens);
            }
        }
    }
    
    // Fall back to server config (with async version)
    log::debug!("Using server default max_tokens for {:?}", task_type);
    get_max_tokens_for_task_async(task_type, app_handle).await
}


// PathFinder settings with async AppHandle versions

/// Async version: Get the maximum number of files to include content from for PathFinder
pub async fn get_path_finder_max_files_with_content_async(app_handle: &AppHandle) -> AppResult<usize> {
    // Get from server configuration - no fallbacks
    get_path_finder_max_files_with_content()
}

/// Async version: Get whether to include file contents by default for PathFinder
pub async fn get_path_finder_include_file_contents_async(app_handle: &AppHandle) -> AppResult<bool> {
    // Get from server configuration - no fallbacks
    get_path_finder_include_file_contents()
}

/// Async version: Get the maximum content size per file for PathFinder
pub async fn get_path_finder_max_content_size_per_file_async(app_handle: &AppHandle) -> AppResult<usize> {
    // Get from server configuration - no fallbacks
    get_path_finder_max_content_size_per_file()
}

/// Async version: Get the maximum number of paths to return in results for PathFinder
pub async fn get_path_finder_max_file_count_async(app_handle: &AppHandle) -> AppResult<usize> {
    // Get from server configuration - no fallbacks
    get_path_finder_max_file_count()
}

/// Async version: Get the initial truncation length for file contents for PathFinder
pub async fn get_path_finder_file_content_truncation_chars_async(app_handle: &AppHandle) -> AppResult<usize> {
    // Get from server configuration - no fallbacks
    get_path_finder_file_content_truncation_chars()
}

/// Async version: Get the token limit buffer for PathFinder
pub async fn get_path_finder_token_limit_buffer_async(app_handle: &AppHandle) -> AppResult<u32> {
    // Get from server configuration - no fallbacks
    get_path_finder_token_limit_buffer()
}