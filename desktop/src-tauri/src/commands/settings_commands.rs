use tauri::{AppHandle, Manager};
use crate::error::{AppResult, AppError};
use crate::db_utils::SettingsRepository;
use std::sync::Arc;
use crate::utils::hash_utils::hash_string;
use serde_json::{json, Map};
use serde::{Serialize, Deserialize};
use log;
use heck::ToLowerCamelCase;
use crate::api_clients::ServerProxyClient;
use crate::models::{DefaultSystemPrompt, TaskSettings, ProjectSystemPrompt};
use crate::services::config_cache_service::ConfigCache;
use crate::models::RuntimeAIConfig;
use std::collections::HashMap;

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
pub async fn validate_configuration_health(app_handle: AppHandle, project_directory: Option<String>) -> AppResult<ConfigurationHealthReport> {
    let mut report = ConfigurationHealthReport {
        server_connectivity: false,
        server_config_complete: false,
        project_config_status: ProjectConfigStatus::NoProjectConfig,
        missing_task_types: Vec::new(),
        validation_errors: Vec::new(),
        recommendations: Vec::new(),
    };
    match get_runtime_ai_config_from_cache(&app_handle).await {
        Ok(runtime_config) => {
            report.server_connectivity = true;
            // Get all task types that exist in the server configuration
            let mut available_frontend_keys = Vec::new();
            for snake_case_key in runtime_config.tasks.keys() {
                available_frontend_keys.push(snake_case_key.to_lower_camel_case());
            }
            let mut server_frontend_map = Map::new();
            
            for (snake_case_key, _) in &runtime_config.tasks {
                let camel_case_key = snake_case_key.to_lower_camel_case();
                server_frontend_map.insert(camel_case_key, json!({}));
            }
            
            // Server config is complete if we have any LLM tasks configured
            report.server_config_complete = !server_frontend_map.is_empty();
        },
        Err(_) => {
            report.validation_errors.push("Server configuration not loaded".to_string());
            report.recommendations.push("Call fetch_runtime_ai_config to load server configuration".to_string());
        }
    }
    
    // Project configuration is no longer stored locally - always using server defaults
    if project_directory.is_some() {
        report.project_config_status = ProjectConfigStatus::NoProjectConfig;
        report.recommendations.push("Project settings are now managed by the server - no local configuration needed".to_string());
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
pub async fn get_key_value_command(app_handle: AppHandle, key: String) -> AppResult<Option<String>> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.get_value(&key).await
}

#[tauri::command]
pub async fn set_key_value_command(app_handle: AppHandle, key: String, value: String) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.set_value(&key, &value).await
}



#[tauri::command]
pub async fn set_onboarding_completed_command(app_handle: AppHandle) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.set_value("onboarding_completed", "true").await
}

#[tauri::command]
pub async fn is_onboarding_completed_command(app_handle: AppHandle) -> AppResult<bool> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let value = settings_repo.get_value("onboarding_completed").await?;
    Ok(value.as_deref() == Some("true"))
}

#[tauri::command]
pub async fn get_workflow_setting_command(app_handle: AppHandle, workflow_name: String, setting_key: String) -> AppResult<Option<String>> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.get_workflow_setting(&workflow_name, &setting_key).await
}

#[tauri::command]
pub async fn set_workflow_setting_command(app_handle: AppHandle, workflow_name: String, setting_key: String, value: String) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.set_workflow_setting(&workflow_name, &setting_key, &value).await
}

#[tauri::command]
pub async fn delete_workflow_setting_command(app_handle: AppHandle, workflow_name: String, setting_key: String) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.delete_workflow_setting(&workflow_name, &setting_key).await
}

#[tauri::command]
pub async fn get_all_workflow_settings_command(app_handle: AppHandle, workflow_name: String) -> AppResult<std::collections::HashMap<String, String>> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.get_all_workflow_settings(&workflow_name).await
}


#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrontendReadyTaskModelConfig {
    model: String,
    max_tokens: u32,
    temperature: f32,
    system_prompt: Option<String>,
    copy_buttons: Option<Vec<serde_json::Value>>,
}




fn validate_project_settings_completeness(settings_json: &str) -> AppResult<bool> {
    let _settings: serde_json::Value = serde_json::from_str(settings_json)
        .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?;
    
    // Project settings are always valid if they parse as JSON
    // The frontend will handle missing keys gracefully
    log::info!("Project settings validation passed - valid JSON");
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
    
    let mut added_keys = Vec::new();
    let mut merged_fields = Vec::new();
    
    // Deep merge: for each task in server defaults
    for (server_task_key, server_task_value) in server_frontend_map {
        if let Some(server_task_obj) = server_task_value.as_object() {
            if project_obj.contains_key(server_task_key) {
                // Task exists in project - deep merge individual fields
                if let Some(project_task_value) = project_obj.get_mut(server_task_key) {
                    if let Some(project_task_obj) = project_task_value.as_object_mut() {
                        // Iterate through all server default fields
                        for (field_key, field_value) in server_task_obj {
                            if !project_task_obj.contains_key(field_key) {
                                // Field missing from project, add from server default
                                project_task_obj.insert(field_key.clone(), field_value.clone());
                                merged_fields.push(format!("{}.{}", server_task_key, field_key));
                            }
                        }
                    }
                }
            } else {
                // Task doesn't exist in project - add entire task from server
                project_obj.insert(server_task_key.clone(), server_task_value.clone());
                added_keys.push(server_task_key.as_str());
            }
        }
    }
    
    if !added_keys.is_empty() {
        log::info!("Added missing task configurations from server defaults: {:?}", added_keys);
    }
    
    if !merged_fields.is_empty() {
        log::info!("Deep merged missing fields from server defaults: {:?}", merged_fields);
    }
    
    Ok(project_settings.to_string())
}

#[tauri::command]
pub async fn get_server_default_task_model_settings_command(app_handle: AppHandle) -> AppResult<String> {
    let runtime_ai_config = crate::utils::config_helpers::get_runtime_ai_config_from_cache(&app_handle).await?;
    
    // Convert server tasks to frontend format
    let mut server_frontend_map = Map::new();
    for (snake_case_key, task_config) in &runtime_ai_config.tasks {
        let camel_case_key = snake_case_key.to_lower_camel_case();
        let frontend_config = FrontendReadyTaskModelConfig {
            model: task_config.model.clone().unwrap_or_default(),
            max_tokens: task_config.max_tokens.unwrap_or(0),
            temperature: task_config.temperature.unwrap_or(0.0),
            system_prompt: task_config.system_prompt.clone(),
            copy_buttons: task_config.copy_buttons.clone(),
        };
        server_frontend_map.insert(
            camel_case_key, 
            serde_json::to_value(frontend_config)
                .map_err(|e| AppError::SerializationError(format!("Failed to serialize task config for {}: {}", snake_case_key, e)))?
        );
    }
    
    log::info!("Returning server default task model settings only");
    let result_json = serde_json::Value::Object(server_frontend_map);
    Ok(result_json.to_string())
}








#[tauri::command]
pub async fn fetch_default_system_prompts_from_server(app_handle: AppHandle) -> AppResult<Vec<DefaultSystemPrompt>> {
    let server_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
    server_client.get_default_system_prompts().await
}

#[tauri::command]
pub async fn fetch_default_system_prompt_from_server(app_handle: AppHandle, task_type: String) -> AppResult<Option<serde_json::Value>> {
    let server_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
    server_client.get_default_system_prompt(&task_type).await
}

#[tauri::command]
pub async fn initialize_system_prompts_from_server(app_handle: AppHandle) -> AppResult<()> {
    let server_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    server_client.populate_default_system_prompts_cache(&*settings_repo).await
}

#[tauri::command]
pub async fn is_setting_customized_command(app_handle: AppHandle, setting_key: String) -> AppResult<bool> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Check if the setting exists in the database
    let value = settings_repo.get_value(&setting_key).await?;
    Ok(value.is_some())
}

#[tauri::command]
pub async fn reset_setting_to_default_command(app_handle: AppHandle, setting_key: String) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Reset by removing the project-specific entry
    settings_repo.delete_value(&setting_key).await
}


/// Helper function to get RuntimeAIConfig from cache
async fn get_runtime_ai_config_from_cache(app_handle: &AppHandle) -> AppResult<RuntimeAIConfig> {
    let config_cache = app_handle.state::<ConfigCache>();
    
    match config_cache.lock() {
        Ok(cache_guard) => {
            if let Some(config_value) = cache_guard.get("runtime_ai_config") {
                match serde_json::from_value::<RuntimeAIConfig>(config_value.clone()) {
                    Ok(config) => Ok(config),
                    Err(e) => {
                        log::error!("Failed to deserialize runtime AI config from cache: {}", e);
                        Err(AppError::SerializationError(e.to_string()))
                    }
                }
            } else {
                Err(AppError::ConfigError("Runtime AI configuration not found in cache. Please refresh configuration.".to_string()))
            }
        }
        Err(e) => {
            log::error!("Failed to acquire cache lock: {}", e);
            Err(AppError::InternalError(format!("Failed to read configuration cache: {}", e)))
        }
    }
}

#[tauri::command]
pub async fn get_all_task_model_settings_for_project_command(app_handle: AppHandle, project_directory: String) -> AppResult<serde_json::Value> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = hash_string(&project_directory);
    
    // Get runtime config to know which task types exist
    let runtime_ai_config = get_runtime_ai_config_from_cache(&app_handle).await?;
    
    // Initialize result object
    let mut result = serde_json::Map::new();
    
    // For each task type in the server config, check if there are project-specific settings
    for (snake_case_key, server_task_config) in &runtime_ai_config.tasks {
        let camel_case_key = snake_case_key.to_lower_camel_case();
        
        // Try to get project-specific task settings
        match settings_repo.get_task_settings(&project_hash, snake_case_key).await? {
            Some(project_settings) => {
                // Use project-specific settings
                let mut task_config = serde_json::Map::new();
                task_config.insert("model".to_string(), json!(project_settings.model));
                task_config.insert("maxTokens".to_string(), json!(project_settings.max_tokens));
                if let Some(temp) = project_settings.temperature {
                    task_config.insert("temperature".to_string(), json!(temp));
                }
                result.insert(camel_case_key, serde_json::Value::Object(task_config));
            }
            None => {
                // Fall back to server defaults
                let mut task_config = serde_json::Map::new();
                task_config.insert("model".to_string(), json!(server_task_config.model.clone().unwrap_or_default()));
                task_config.insert("maxTokens".to_string(), json!(server_task_config.max_tokens.unwrap_or(0)));
                if let Some(temp) = server_task_config.temperature {
                    task_config.insert("temperature".to_string(), json!(temp));
                }
                result.insert(camel_case_key, serde_json::Value::Object(task_config));
            }
        }
    }
    
    Ok(serde_json::Value::Object(result))
}

#[tauri::command]
pub async fn set_project_task_model_settings_command(app_handle: AppHandle, project_directory: String, settings_json: String) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = hash_string(&project_directory);
    
    // Parse the incoming settings JSON
    let settings_value: serde_json::Value = serde_json::from_str(&settings_json)
        .map_err(|e| AppError::SerializationError(format!("Invalid settings JSON: {}", e)))?;
    
    let settings_obj = settings_value.as_object()
        .ok_or_else(|| AppError::SerializationError("Settings must be a JSON object".to_string()))?;
    
    // For each task type in the settings, save to database
    for (camel_case_key, task_settings_value) in settings_obj {
        let snake_case_key = camel_case_key.to_lowercase().replace('-', "_");
        
        if let Some(task_obj) = task_settings_value.as_object() {
            // Extract required fields
            let model = task_obj.get("model")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::SerializationError(format!("Missing or invalid model for task type {}", camel_case_key)))?
                .to_string();
            
            let max_tokens = task_obj.get("maxTokens")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| AppError::SerializationError(format!("Missing or invalid maxTokens for task type {}", camel_case_key)))? as i32;
            
            let temperature = task_obj.get("temperature")
                .and_then(|v| v.as_f64())
                .map(|t| t as f32);
            
            // Create TaskSettings object
            let task_settings = TaskSettings {
                project_hash: project_hash.clone(),
                task_type: snake_case_key,
                model,
                max_tokens,
                temperature,
            };
            
            // Save to database
            settings_repo.set_task_settings(&task_settings).await?;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_project_system_prompt_command(app_handle: AppHandle, project_directory: String, task_type: String) -> AppResult<Option<ProjectSystemPrompt>> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.get_project_system_prompt(&project_hash, &task_type).await
}

#[tauri::command]
pub async fn set_project_system_prompt_command(app_handle: AppHandle, project_directory: String, task_type: String, system_prompt: String) -> AppResult<()> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.set_project_system_prompt(&project_hash, &task_type, &system_prompt).await
}

#[tauri::command]
pub async fn reset_project_system_prompt_command(app_handle: AppHandle, project_directory: String, task_type: String) -> AppResult<()> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.delete_project_system_prompt(&project_hash, &task_type).await
}

#[tauri::command]
pub async fn is_project_system_prompt_customized_command(app_handle: AppHandle, project_directory: String, task_type: String) -> AppResult<bool> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    settings_repo.has_custom_system_prompt(&project_hash, &task_type).await
}

#[tauri::command]
pub async fn get_server_default_system_prompts_command(app_handle: AppHandle) -> AppResult<String> {
    // This connects to the server PostgreSQL database to fetch default_system_prompts
    // organized by task_type for easy lookup
    
    let server_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
    
    // Make HTTP request to server to get default system prompts
    match server_client.get_default_system_prompts().await {
        Ok(prompts) => {
            // Organize prompts by task_type for easy lookup
            let mut prompts_by_task_type = std::collections::HashMap::new();
            
            for prompt in prompts {
                prompts_by_task_type.insert(prompt.task_type.clone(), prompt);
            }
            
            let prompts_json = serde_json::to_string(&prompts_by_task_type)
                .map_err(|e| AppError::SerializationError(format!("Failed to serialize system prompts: {}", e)))?;
            Ok(prompts_json)
        },
        Err(e) => {
            log::error!("Failed to fetch default system prompts from server: {}", e);
            Err(AppError::HttpError(format!("Failed to fetch system prompts: {}", e)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_project_settings_completeness() {
        let valid_settings = r#"
        {
            "pathFinder": {"model": "test", "maxTokens": 1000, "temperature": 0.5}
        }
        "#;
        
        assert!(validate_project_settings_completeness(valid_settings).unwrap());
    }
    
    #[test]
    fn test_validate_project_settings_empty_object() {
        let empty_settings = r#"{}"#;
        
        assert!(validate_project_settings_completeness(empty_settings).unwrap());
    }
    
    #[test]
    fn test_validate_project_settings_invalid_json() {
        let invalid_json = r#"{ invalid json "#;
        
        assert!(validate_project_settings_completeness(invalid_json).is_err());
    }
}