use tauri::{AppHandle, State};
use crate::error::{AppResult, AppError};
use crate::SETTINGS_REPO;
use crate::utils::hash_utils::hash_string;
use serde_json::{json, Value, Map};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::config;
use log;

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


#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrontendReadyTaskModelConfig {
    model: String,
    max_tokens: u32,
    temperature: f32,
}

/// Convert snake_case task key to camelCase frontend key
/// This mapping MUST cover all task types defined in desktop/src/types/task-settings-types.ts
fn snake_to_camel_case(snake_str: &str) -> String {
    match snake_str {
        "implementation_plan" => "implementationPlan".to_string(),
        "path_finder" => "pathFinder".to_string(),
        "text_improvement" => "textImprovement".to_string(),
        "voice_transcription" => "transcription".to_string(), // Note: frontend uses "transcription"
        "voice_correction" => "voiceCorrection".to_string(),
        "path_correction" => "pathCorrection".to_string(),
        "regex_generation" => "regexGeneration".to_string(),
        "guidance_generation" => "guidanceGeneration".to_string(),
        "task_enhancement" => "taskEnhancement".to_string(),
        "generic_llm_stream" => "genericLlmStream".to_string(),
        "regex_summary_generation" => "regexSummaryGeneration".to_string(),
        "generate_directory_tree" => "generateDirectoryTree".to_string(),
        "text_correction_post_transcription" => "textCorrectionPostTranscription".to_string(),
        "streaming" => "streaming".to_string(),
        "unknown" => "unknown".to_string(),
        _ => snake_str.to_string(), // fallback to original if no mapping
    }
}

/// Get all frontend task types that MUST be present in the response
/// This list MUST match the TaskSettings interface in desktop/src/types/task-settings-types.ts
fn get_required_frontend_task_types() -> Vec<&'static str> {
    vec![
        "pathFinder",
        "transcription", // maps to voice_transcription
        "regexGeneration",
        "regexSummaryGeneration", 
        "pathCorrection",
        "textImprovement",
        "textCorrectionPostTranscription",
        "voiceCorrection",
        "taskEnhancement",
        "guidanceGeneration",
        "implementationPlan",
        "genericLlmStream",
        "generateDirectoryTree",
        "streaming",
        "unknown",
    ]
}

/// Create a fallback task config when server doesn't provide a specific task type
fn create_fallback_task_config(runtime_config: &crate::models::RuntimeAIConfig) -> FrontendReadyTaskModelConfig {
    // Try to use generic_llm_stream as fallback, then unknown, then use default model
    let fallback_config = runtime_config.tasks.get("generic_llm_stream")
        .or_else(|| runtime_config.tasks.get("unknown"))
        .cloned()
        .unwrap_or_else(|| crate::models::TaskSpecificModelConfig {
            model: runtime_config.default_llm_model_id.clone(),
            max_tokens: 4096,
            temperature: 0.7,
        });
    
    FrontendReadyTaskModelConfig {
        model: fallback_config.model,
        max_tokens: fallback_config.max_tokens,
        temperature: fallback_config.temperature,
    }
}

#[tauri::command]
pub async fn get_all_task_model_settings_for_project_command(app_handle: AppHandle, project_directory: String) -> AppResult<String> {
    // Step 1: First try to get project-specific settings
    let project_settings = get_project_task_model_settings_command(app_handle.clone(), project_directory).await?;
    
    // If project settings exist, return them
    if let Some(settings) = project_settings {
        return Ok(settings);
    }
    
    // Step 2: Get defaults from RuntimeAIConfig cached from server
    let runtime_ai_config = config::get_runtime_ai_config()?
        .ok_or_else(|| AppError::ConfigError("RuntimeAIConfig not available from server. Please ensure server connection is established.".to_string()))?;
    
    // Step 3: Create a map for frontend task settings
    let mut frontend_map = Map::new();
    
    // Step 4: Convert all available server task configs to frontend format
    for (snake_case_key, task_config) in &runtime_ai_config.tasks {
        let camel_case_key = snake_to_camel_case(snake_case_key);
        let frontend_config = FrontendReadyTaskModelConfig {
            model: task_config.model.clone(),
            max_tokens: task_config.max_tokens,
            temperature: task_config.temperature,
        };
        
        frontend_map.insert(
            camel_case_key,
            serde_json::to_value(frontend_config)
                .map_err(|e| AppError::SerializationError(format!("Failed to serialize task config for {}: {}", snake_case_key, e)))?
        );
    }
    
    // Step 5: Ensure ALL required frontend task types are covered
    // This is critical - the frontend expects ALL these keys to be present
    let required_frontend_keys = get_required_frontend_task_types();
    
    for required_key in required_frontend_keys {
        if !frontend_map.contains_key(required_key) {
            // Create a safe fallback for missing task types
            let fallback_config = create_fallback_task_config(&runtime_ai_config);
            
            frontend_map.insert(
                required_key.to_string(),
                serde_json::to_value(fallback_config)
                    .map_err(|e| AppError::SerializationError(format!("Failed to serialize fallback config for {}: {}", required_key, e)))?
            );
            
            // Log warning for missing task type (should not happen if server migration is complete)
            log::warn!("Server did not provide configuration for task type '{}', using fallback", required_key);
        }
    }
    
    // Step 6: Serialize and return the complete settings map
    let result_json = serde_json::Value::Object(frontend_map);
    Ok(result_json.to_string())
}