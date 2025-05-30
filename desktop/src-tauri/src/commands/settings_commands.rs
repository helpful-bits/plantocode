use tauri::AppHandle;
use crate::error::{AppResult, AppError};
use crate::SETTINGS_REPO;
use crate::utils::hash_utils::hash_string;
use serde_json::{json, Map};
use serde::{Serialize, Deserialize};
use crate::config;
use log;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigurationHealthReport {
    pub server_connectivity: bool,
    pub server_config_complete: bool,
    pub project_config_status: ProjectConfigStatus,
    pub missing_task_types: Vec<String>,
    pub validation_errors: Vec<String>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ProjectConfigStatus {
    NoProjectConfig,
    Complete,
    IncompleteButMerged,
    Invalid,
}

#[tauri::command]
pub async fn validate_configuration_health(_app_handle: AppHandle, project_directory: Option<String>) -> AppResult<ConfigurationHealthReport> {
    let mut report = ConfigurationHealthReport {
        server_connectivity: false,
        server_config_complete: false,
        project_config_status: ProjectConfigStatus::NoProjectConfig,
        missing_task_types: Vec::new(),
        validation_errors: Vec::new(),
        recommendations: Vec::new(),
    };
    match config::get_runtime_ai_config() {
        Ok(Some(runtime_config)) => {
            report.server_connectivity = true;
            let required_keys = get_required_frontend_task_types();
            let mut server_frontend_map = Map::new();
            
            for (snake_case_key, _) in &runtime_config.tasks {
                let camel_case_key = snake_to_camel_case(snake_case_key);
                server_frontend_map.insert(camel_case_key, json!({}));
            }
            
            for required_key in &required_keys {
                if !server_frontend_map.contains_key(*required_key) {
                    report.missing_task_types.push(required_key.to_string());
                }
            }
            
            report.server_config_complete = report.missing_task_types.is_empty();
        },
        Ok(None) => {
            report.validation_errors.push("Server configuration not loaded".to_string());
            report.recommendations.push("Call fetch_runtime_ai_config to load server configuration".to_string());
        },
        Err(e) => {
            report.validation_errors.push(format!("Server configuration error: {}", e));
            report.recommendations.push("Check server connectivity and database integrity".to_string());
        }
    }
    
    if let Some(project_dir) = project_directory {
        if let Ok(Some(project_settings_json)) = get_project_task_model_settings_command(_app_handle, project_dir).await {
            match validate_project_settings_completeness(&project_settings_json) {
                Ok(true) => {
                    report.project_config_status = ProjectConfigStatus::Complete;
                },
                Ok(false) => {
                    report.project_config_status = ProjectConfigStatus::IncompleteButMerged;
                    report.recommendations.push("Project configuration incomplete - missing keys will be merged from server".to_string());
                },
                Err(e) => {
                    report.project_config_status = ProjectConfigStatus::Invalid;
                    report.validation_errors.push(format!("Project configuration invalid: {}", e));
                    report.recommendations.push("Clear invalid project configuration to use server defaults".to_string());
                }
            }
        }
    }
    
    if !report.server_connectivity {
        report.recommendations.push("Server connection required for configuration loading".to_string());
    }
    
    if !report.server_config_complete {
        report.recommendations.push("Server database missing required task configurations".to_string());
    }
    
    Ok(report)
}

#[tauri::command]
pub async fn get_key_value_command(_app_handle: AppHandle, key: String) -> AppResult<Option<String>> {
    let settings_repo = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    })?;
    settings_repo.get_value(&key).await
}

#[tauri::command]
pub async fn set_key_value_command(_app_handle: AppHandle, key: String, value: String) -> AppResult<()> {
    let settings_repo = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    })?;
    settings_repo.set_value(&key, &value).await
}

#[tauri::command]
pub async fn get_project_task_model_settings_command(_app_handle: AppHandle, project_directory: String) -> AppResult<Option<String>> {
    let settings_repo = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    })?;
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    settings_repo.get_value(&key).await
}

#[tauri::command]
pub async fn set_project_task_model_settings_command(_app_handle: AppHandle, project_directory: String, settings_json: String) -> AppResult<()> {
    let settings_repo = SETTINGS_REPO.get().ok_or_else(|| {
        AppError::InitializationError("SettingsRepository not initialized".to_string())
    })?;
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    settings_repo.set_value(&key, &settings_json).await
}


#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrontendReadyTaskModelConfig {
    model: String,
    max_tokens: u32,
    temperature: f32,
}

fn snake_to_camel_case(snake_str: &str) -> String {
    match snake_str {
        "implementation_plan" => "implementationPlan".to_string(),
        "path_finder" => "pathFinder".to_string(),
        "text_improvement" => "textImprovement".to_string(),
        "voice_transcription" => "transcription".to_string(),
        "text_correction" => "textCorrection".to_string(),
        "path_correction" => "pathCorrection".to_string(),
        "guidance_generation" => "guidanceGeneration".to_string(),
        "task_enhancement" => "taskEnhancement".to_string(),
        "generic_llm_stream" => "genericLlmStream".to_string(),
        "regex_summary_generation" => "regexSummaryGeneration".to_string(),
        "regex_pattern_generation" => "regexGeneration".to_string(),
        "streaming" => "streaming".to_string(),
        "unknown" => "unknown".to_string(),
        _ => {
            log::error!("CONFIGURATION ERROR: Unknown task type '{}' - no mapping defined", snake_str);
            panic!("Unknown task type '{}' - this indicates a configuration error. All task types must be explicitly defined.", snake_str);
        }
    }
}

fn get_required_frontend_task_types() -> Vec<&'static str> {
    vec![
        "pathFinder",
        "transcription",
        "regexGeneration",
        "regexSummaryGeneration", 
        "pathCorrection",
        "textImprovement",
        "textCorrection",
        "taskEnhancement",
        "guidanceGeneration",
        "implementationPlan",
        "genericLlmStream",
        "streaming",
        "unknown",
    ]
}

fn validate_project_settings_completeness(settings_json: &str) -> AppResult<bool> {
    let settings: serde_json::Value = serde_json::from_str(settings_json)
        .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?;
    
    let required_keys = get_required_frontend_task_types();
    
    for required_key in required_keys {
        if settings.get(required_key).is_none() {
            log::warn!("Project settings missing required key: {}", required_key);
            return Ok(false);
        }
    }
    
    log::info!("Project settings validation passed - all required keys present");
    Ok(true)
}

fn merge_project_with_server_defaults(
    project_settings_json: &str,
    server_frontend_map: &Map<String, serde_json::Value>
) -> AppResult<String> {
    let mut project_settings: serde_json::Value = serde_json::from_str(project_settings_json)
        .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?;
    
    let project_obj = project_settings.as_object_mut()
        .ok_or_else(|| AppError::ConfigError("Project settings must be a JSON object".to_string()))?;
    
    let required_keys = get_required_frontend_task_types();
    let mut added_keys = Vec::new();
    
    for required_key in required_keys {
        if !project_obj.contains_key(required_key) {
            if let Some(server_value) = server_frontend_map.get(required_key) {
                project_obj.insert(required_key.to_string(), server_value.clone());
                added_keys.push(required_key);
            }
        }
    }
    
    if !added_keys.is_empty() {
        log::info!("Added missing task configurations from server defaults: {:?}", added_keys);
    }
    
    Ok(project_settings.to_string())
}

#[tauri::command]
pub async fn get_all_task_model_settings_for_project_command(app_handle: AppHandle, project_directory: String) -> AppResult<String> {
    let project_settings = get_project_task_model_settings_command(app_handle.clone(), project_directory).await?;
    
    let runtime_ai_config = config::get_runtime_ai_config()?
        .ok_or_else(|| AppError::ConfigError("RuntimeAIConfig not available from server. Please ensure server connection is established.".to_string()))?;
    
    let mut server_frontend_map = Map::new();
    for (snake_case_key, task_config) in &runtime_ai_config.tasks {
        let camel_case_key = snake_to_camel_case(snake_case_key);
        let frontend_config = FrontendReadyTaskModelConfig {
            model: task_config.model.clone(),
            max_tokens: task_config.max_tokens,
            temperature: task_config.temperature,
        };
        
        server_frontend_map.insert(
            camel_case_key,
            serde_json::to_value(frontend_config)
                .map_err(|e| AppError::SerializationError(format!("Failed to serialize task config for {}: {}", snake_case_key, e)))?
        );
    }
    
    if let Some(settings_json) = project_settings {
        log::info!("Found project-specific settings, validating completeness...");
        
        match validate_project_settings_completeness(&settings_json) {
            Ok(true) => {
                log::info!("Project settings are complete, using them directly");
                return Ok(settings_json);
            },
            Ok(false) => {
                log::warn!("Project settings are incomplete, merging with server defaults");
                return merge_project_with_server_defaults(&settings_json, &server_frontend_map);
            },
            Err(e) => {
                log::error!("Project settings validation failed: {}", e);
                return Err(AppError::ConfigError(format!("Project settings are invalid and cannot be used: {}. Either fix the project settings or clear them to use server defaults.", e)));
            }
        }
    }
    
    log::info!("Using server defaults for all task configurations");
    
    let required_frontend_keys = get_required_frontend_task_types();
    
    for required_key in required_frontend_keys {
        if !server_frontend_map.contains_key(required_key) {
            return Err(AppError::ConfigError(format!("Server did not provide configuration for required task type '{}'. Please ensure server database is properly configured.", required_key)));
        }
    }
    
    let result_json = serde_json::Value::Object(server_frontend_map);
    Ok(result_json.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_project_settings_completeness() {
        let complete_settings = r#"
        {
            "pathFinder": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "transcription": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "regexGeneration": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "regexSummaryGeneration": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "pathCorrection": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "textImprovement": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "textCorrection": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "taskEnhancement": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "guidanceGeneration": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "implementationPlan": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "genericLlmStream": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "streaming": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "unknown": {"model": "test", "maxTokens": 1000, "temperature": 0.5}
        }
        "#;
        
        assert!(validate_project_settings_completeness(complete_settings).unwrap());
    }
    
    #[test]
    fn test_validate_project_settings_missing_text_correction() {
        let incomplete_settings = r#"
        {
            "pathFinder": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "transcription": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "regexGeneration": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "regexSummaryGeneration": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "pathCorrection": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "textImprovement": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "taskEnhancement": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "guidanceGeneration": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "implementationPlan": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "genericLlmStream": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "streaming": {"model": "test", "maxTokens": 1000, "temperature": 0.5},
            "unknown": {"model": "test", "maxTokens": 1000, "temperature": 0.5}
        }
        "#;
        
        assert!(!validate_project_settings_completeness(incomplete_settings).unwrap());
    }
    
    #[test]
    fn test_validate_project_settings_invalid_json() {
        let invalid_json = r#"{ invalid json "#;
        
        assert!(validate_project_settings_completeness(invalid_json).is_err());
    }
}