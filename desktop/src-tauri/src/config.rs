use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use log::{info, warn, error};
use crate::constants::SERVER_API_URL;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub server_url: String,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            server_url: std::env::var("MAIN_SERVER_BASE_URL")
                .or_else(|_| std::env::var("SERVER_URL"))
                .unwrap_or_else(|_| SERVER_API_URL.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub runtime_ai_config: Option<crate::models::RuntimeAiConfig>,
}

// Global configuration with RwLock for thread-safe access
pub static CONFIG: Lazy<RwLock<AppConfig>> = Lazy::new(|| {
    RwLock::new(AppConfig {
        runtime_ai_config: None,
    })
});

// Initialize configuration
pub async fn init_config() -> Result<(), String> {
    info!("Initializing application configuration");
    
    // Configuration comes from the server at runtime
    
    info!("Application configuration initialized");
    Ok(())
}

// Note: The get_model_context_window function is implemented below


// Model configuration helper functions
use crate::error::{AppResult, AppError};
use crate::models::{TaskType, RuntimeAiConfig};

// Update runtime AI configuration
pub fn update_runtime_ai_config(new_config: RuntimeAiConfig) -> AppResult<()> {
    let mut config = CONFIG.write().map_err(|e| AppError::InternalError(format!("Failed to acquire write lock: {}", e)))?;
    config.runtime_ai_config = Some(new_config);
    info!("Runtime AI configuration updated");
    Ok(())
}

// Get the runtime AI configuration
pub fn get_runtime_ai_config() -> AppResult<Option<RuntimeAiConfig>> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    Ok(config.runtime_ai_config.clone())
}

// Get the default transcription model ID
pub fn get_default_transcription_model_id() -> AppResult<String> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
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
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if let Some(max_files) = runtime_config.path_finder_settings.max_files_with_content {
            return Ok(max_files);
        }
    }
    
    Err(AppError::ConfigError("PathFinder max_files_with_content not available from server config".to_string()))
}

/// Get whether to include file contents by default for PathFinder
pub fn get_path_finder_include_file_contents() -> AppResult<bool> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if let Some(include_file_contents) = runtime_config.path_finder_settings.include_file_contents {
            return Ok(include_file_contents);
        }
    }
    
    Err(AppError::ConfigError("PathFinder include_file_contents not available from server config".to_string()))
}

/// Get the maximum content size per file for PathFinder
pub fn get_path_finder_max_content_size_per_file() -> AppResult<usize> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if let Some(max_content_size) = runtime_config.path_finder_settings.max_content_size_per_file {
            return Ok(max_content_size);
        }
    }
    
    Err(AppError::ConfigError("PathFinder max_content_size_per_file not available from server config".to_string()))
}

/// Get the maximum number of paths to return in results for PathFinder
pub fn get_path_finder_max_file_count() -> AppResult<usize> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if let Some(max_file_count) = runtime_config.path_finder_settings.max_file_count {
            return Ok(max_file_count);
        }
    }
    
    Err(AppError::ConfigError("PathFinder max_file_count not available from server config".to_string()))
}

/// Get the initial truncation length for file contents for PathFinder
pub fn get_path_finder_file_content_truncation_chars() -> AppResult<usize> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if let Some(truncation_chars) = runtime_config.path_finder_settings.file_content_truncation_chars {
            return Ok(truncation_chars);
        }
    }
    
    Err(AppError::ConfigError("PathFinder file_content_truncation_chars not available from server config".to_string()))
}

/// Get the token limit buffer for PathFinder
pub fn get_path_finder_token_limit_buffer() -> AppResult<u32> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if let Some(token_limit_buffer) = runtime_config.path_finder_settings.token_limit_buffer {
            return Ok(token_limit_buffer);
        }
    }
    
    Err(AppError::ConfigError("PathFinder token_limit_buffer not available from server config".to_string()))
}

// Get default LLM model ID
pub fn get_default_llm_model_id() -> AppResult<String> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if runtime_config.default_llm_model_id.is_empty() {
            return Err(AppError::ConfigError("Default LLM model ID not available from server config".to_string()));
        }
        Ok(runtime_config.default_llm_model_id.clone())
    } else {
        Err(AppError::ConfigError("Runtime AI configuration not available from server".to_string()))
    }
}

// Get model for a specific task type
pub fn get_model_for_task(task_type: TaskType) -> AppResult<String> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        let task_key = task_type.to_string();
        
        if let Some(task_config) = runtime_config.tasks.get(&task_key) {
            if task_config.model.is_empty() {
                return Err(AppError::ConfigError(format!("Model configuration for task {} is empty", task_key)));
            }
            return Ok(task_config.model.clone());
        }
        
        // If task-specific config not found, use default LLM model
        if runtime_config.default_llm_model_id.is_empty() {
            return Err(AppError::ConfigError("Default LLM model ID not available from server config".to_string()));
        }
        
        return Ok(runtime_config.default_llm_model_id.clone());
    }
    
    Err(AppError::ConfigError("Runtime AI configuration not available from server".to_string()))
}

// Get task-specific configuration
pub fn get_task_specific_config(task_type: TaskType) -> AppResult<Option<crate::models::TaskSpecificModelConfig>> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        let task_key = task_type.to_string();
        Ok(runtime_config.tasks.get(&task_key).cloned())
    } else {
        Ok(None)
    }
}

// Get default max tokens for a task
pub fn get_default_max_tokens_for_task(task_type: Option<TaskType>) -> AppResult<u32> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if let Some(task) = task_type {
            let task_key = task.to_string();
            
            if let Some(task_config) = runtime_config.tasks.get(&task_key) {
                if task_config.max_tokens == 0 {
                    return Err(AppError::ConfigError(format!("Max tokens configuration for task {} is zero", task_key)));
                }
                return Ok(task_config.max_tokens);
            }
            
            return Err(AppError::ConfigError(format!("Task-specific configuration not found for task {}", task_key)));
        }
        
        return Err(AppError::ConfigError("No task type provided for max tokens configuration".to_string()));
    }
    
    Err(AppError::ConfigError("Runtime AI configuration not available from server".to_string()))
}

// Get default temperature for a task
pub fn get_default_temperature_for_task(task_type: Option<TaskType>) -> AppResult<f32> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        if let Some(task) = task_type {
            let task_key = task.to_string();
            
            if let Some(task_config) = runtime_config.tasks.get(&task_key) {
                if task_config.temperature < 0.0 || task_config.temperature > 1.0 {
                    return Err(AppError::ConfigError(format!("Temperature configuration for task {} is out of range [0.0, 1.0]", task_key)));
                }
                return Ok(task_config.temperature);
            }
            
            return Err(AppError::ConfigError(format!("Task-specific configuration not found for task {}", task_key)));
        }
        
        return Err(AppError::ConfigError("No task type provided for temperature configuration".to_string()));
    }
    
    Err(AppError::ConfigError("Runtime AI configuration not available from server".to_string()))
}

// Get context window size for a model
pub fn get_model_context_window(model_name: &str) -> AppResult<u32> {
    let config = CONFIG.read().map_err(|e| AppError::InternalError(format!("Failed to acquire read lock: {}", e)))?;
    
    if let Some(runtime_config) = &config.runtime_ai_config {
        // Find model in available_models list by ID
        for model_info in &runtime_config.available_models {
            if model_info.id == model_name {
                // First check if context_window is set directly in the model info
                if let Some(context_window) = model_info.context_window {
                    return Ok(context_window);
                }
                
                // Fallback to known models if context_window not explicitly set
                // Common models and their typical context sizes
                match model_info.id.to_lowercase().as_str() {
                    // Claude models
                    m if m.contains("claude-3-opus") => return Ok(200_000),
                    m if m.contains("claude-3-sonnet") => return Ok(200_000),
                    m if m.contains("claude-3-haiku") => return Ok(200_000),
                    m if m.contains("claude-2") => return Ok(100_000),
                    
                    // GPT models
                    m if m.contains("gpt-4-turbo") => return Ok(128_000),
                    m if m.contains("gpt-4-32k") => return Ok(32_768),
                    m if m.contains("gpt-4") => return Ok(8_192),
                    m if m.contains("gpt-3.5-turbo-16k") => return Ok(16_384),
                    m if m.contains("gpt-3.5-turbo") => return Ok(4_096),
                    
                    // Gemini models
                    m if m.contains("gemini-1.5-pro") => return Ok(1_000_000),
                    m if m.contains("gemini-1.0-pro") => return Ok(32_768),
                    
                    // Anthropic models with specific versions
                    m if m.contains("claude-instant") => return Ok(100_000),
                    
                    // Mistral models
                    m if m.contains("mistral") => return Ok(32_768),
                    
                    // Llama models
                    m if m.contains("llama") => return Ok(8_192),
                    
                    // Default for other models - break out to use default
                    _ => break,
                }
            }
        }
        
        // If model-specific context window not found, use a reasonable default
        // to prevent unintentionally small context windows
        return Ok(32_000);
    }
    
    Err(AppError::ConfigError("Runtime AI configuration not available from server".to_string()))
}