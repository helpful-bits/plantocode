use tauri::{AppHandle, Manager};
use crate::error::{AppResult, AppError};
use crate::db_utils::SettingsRepository;
use std::sync::Arc;
use crate::utils::hash_utils::hash_string;
use serde_json::{json, Map};
use serde::{Serialize, Deserialize};
use crate::config;
use log;
use heck::ToLowerCamelCase;
use crate::api_clients::ServerProxyClient;
use crate::models::DefaultSystemPrompt;

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
    match config::get_runtime_ai_config() {
        Ok(Some(runtime_config)) => {
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
        if let Ok(Some(project_settings_json)) = get_project_task_model_settings_command(app_handle.clone(), project_dir).await {
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
pub async fn get_project_task_model_settings_command(app_handle: AppHandle, project_directory: String) -> AppResult<Option<String>> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    settings_repo.get_value(&key).await
}

#[tauri::command]
pub async fn set_project_task_model_settings_command(app_handle: AppHandle, project_directory: String, settings_json: String) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    settings_repo.set_value(&key, &settings_json).await
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
    
    // Add any server task that's not in project settings
    for (server_key, server_value) in server_frontend_map {
        if !project_obj.contains_key(server_key) {
            project_obj.insert(server_key.clone(), server_value.clone());
            added_keys.push(server_key.as_str());
        }
    }
    
    if !added_keys.is_empty() {
        log::info!("Added missing task configurations from server defaults: {:?}", added_keys);
    }
    
    Ok(project_settings.to_string())
}

#[tauri::command]
pub async fn get_server_default_task_model_settings_command(_app_handle: AppHandle) -> AppResult<String> {
    let runtime_ai_config = config::get_runtime_ai_config()?
        .ok_or_else(|| AppError::ConfigError("RuntimeAIConfig not available from server. Please ensure server connection is established.".to_string()))?;
    
    // Convert server tasks to frontend format
    let mut server_frontend_map = Map::new();
    for (snake_case_key, task_config) in &runtime_ai_config.tasks {
        let camel_case_key = snake_case_key.to_lower_camel_case();
        let frontend_config = FrontendReadyTaskModelConfig {
            model: task_config.model.clone().unwrap_or_default(),
            max_tokens: task_config.max_tokens.unwrap_or(0),
            temperature: task_config.temperature.unwrap_or(0.0),
            system_prompt: task_config.system_prompt.clone(),
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
pub async fn get_project_overrides_only_command(app_handle: AppHandle, project_directory: String) -> AppResult<Option<String>> {
    log::info!("Getting project overrides only for project: {}", project_directory);
    get_project_task_model_settings_command(app_handle, project_directory).await
}

#[tauri::command]
pub async fn reset_project_setting_to_default_command(app_handle: AppHandle, project_directory: String, task_key: String, setting_key: String) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    
    // Get current project settings
    let current_settings_json = settings_repo.get_value(&key).await?;
    
    if let Some(settings_json) = current_settings_json {
        let mut settings: serde_json::Value = serde_json::from_str(&settings_json)
            .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?;
        
        // Remove the specific setting to revert to server default
        if let Some(task_settings) = settings.get_mut(&task_key) {
            if let Some(task_object) = task_settings.as_object_mut() {
                task_object.remove(&setting_key);
                
                // If the task object is now empty, we could remove the entire task
                // But we'll keep it for now to maintain task structure
                
                // Save the updated settings
                let updated_json = settings.to_string();
                settings_repo.set_value(&key, &updated_json).await?;
                
                log::info!("Reset {}.{} to server default for project: {}", task_key, setting_key, project_directory);
            }
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn is_project_setting_customized_command(app_handle: AppHandle, project_directory: String, task_key: String, setting_key: String) -> AppResult<bool> {
    let project_settings = get_project_task_model_settings_command(app_handle.clone(), project_directory).await?;
    
    if let Some(settings_json) = project_settings {
        let settings: serde_json::Value = serde_json::from_str(&settings_json)
            .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?;
        
        // Check if the specific setting exists in project overrides
        if let Some(task_settings) = settings.get(&task_key) {
            if let Some(task_object) = task_settings.as_object() {
                return Ok(task_object.contains_key(&setting_key));
            }
        }
    }
    
    Ok(false)
}

#[tauri::command]
pub async fn get_all_task_model_settings_for_project_command(app_handle: AppHandle, project_directory: String) -> AppResult<String> {
    let project_settings = get_project_task_model_settings_command(app_handle.clone(), project_directory).await?;
    
    let runtime_ai_config = config::get_runtime_ai_config()?
        .ok_or_else(|| AppError::ConfigError("RuntimeAIConfig not available from server. Please ensure server connection is established.".to_string()))?;
    
    // Convert server tasks to frontend format
    let mut server_frontend_map = Map::new();
    for (snake_case_key, task_config) in &runtime_ai_config.tasks {
        let camel_case_key = snake_case_key.to_lower_camel_case();
        let frontend_config = FrontendReadyTaskModelConfig {
            model: task_config.model.clone().unwrap_or_default(),
            max_tokens: task_config.max_tokens.unwrap_or(0),
            temperature: task_config.temperature.unwrap_or(0.0),
            system_prompt: task_config.system_prompt.clone(),
        };
        server_frontend_map.insert(
            camel_case_key, 
            serde_json::to_value(frontend_config)
                .map_err(|e| AppError::SerializationError(format!("Failed to serialize task config for {}: {}", snake_case_key, e)))?
        );
    }
    
    // If we have project settings, merge them with server defaults
    if let Some(settings_json) = project_settings {
        log::info!("Found project-specific settings, merging with server defaults");
        return merge_project_with_server_defaults(&settings_json, &server_frontend_map);
    }
    
    log::info!("Using server defaults for all task configurations");
    let result_json = serde_json::Value::Object(server_frontend_map);
    Ok(result_json.to_string())
}

#[tauri::command]
pub async fn get_project_system_prompt_command(
    app_handle: AppHandle, 
    project_directory: String, 
    task_type: String
) -> AppResult<Option<String>> {
    let project_settings = get_project_task_model_settings_command(app_handle, project_directory).await?;
    
    if let Some(settings_json) = project_settings {
        let settings: serde_json::Value = serde_json::from_str(&settings_json)
            .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?;
        
        if let Some(task_settings) = settings.get(&task_type) {
            if let Some(task_object) = task_settings.as_object() {
                if let Some(system_prompt) = task_object.get("systemPrompt") {
                    return Ok(system_prompt.as_str().map(|s| s.to_string()));
                }
            }
        }
    }
    
    Ok(None)
}

#[tauri::command] 
pub async fn set_project_system_prompt_command(
    app_handle: AppHandle,
    project_directory: String,
    task_type: String, 
    system_prompt: String
) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    
    // Get current project settings or create empty object
    let current_settings_json = settings_repo.get_value(&key).await?;
    let mut settings: serde_json::Value = if let Some(json) = current_settings_json {
        serde_json::from_str(&json)
            .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?
    } else {
        serde_json::json!({})
    };
    
    // Ensure task object exists
    if !settings.get(&task_type).is_some() {
        settings[&task_type] = serde_json::json!({});
    }
    
    // Set the system prompt
    settings[&task_type]["systemPrompt"] = serde_json::json!(system_prompt);
    
    // Save updated settings
    let updated_json = settings.to_string();
    settings_repo.set_value(&key, &updated_json).await?;
    
    Ok(())
}

#[tauri::command]
pub async fn reset_project_system_prompt_command(
    app_handle: AppHandle, 
    project_directory: String, 
    task_type: String
) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let project_hash = hash_string(&project_directory);
    let key = format!("project_task_model_settings_{}", project_hash);
    
    let current_settings_json = settings_repo.get_value(&key).await?;
    
    if let Some(settings_json) = current_settings_json {
        let mut settings: serde_json::Value = serde_json::from_str(&settings_json)
            .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?;
        
        if let Some(task_settings) = settings.get_mut(&task_type) {
            if let Some(task_object) = task_settings.as_object_mut() {
                task_object.remove("systemPrompt");
                
                let updated_json = settings.to_string();
                settings_repo.set_value(&key, &updated_json).await?;
            }
        }
    }
    
    Ok(())
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