use crate::api_clients::ServerProxyClient;
use crate::db_utils::SettingsRepository;
use crate::error::{AppError, AppResult};
use crate::models::RuntimeAIConfig;
use crate::models::{DefaultSystemPrompt, ProjectSystemPrompt, TaskType};
use crate::services::config_cache_service::ConfigCache;
use crate::utils::hash_utils::hash_string;
use heck::{ToLowerCamelCase, ToSnakeCase};
use log;
use serde::{Deserialize, Serialize};
use serde_json::{Map, json};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use crate::auth::TokenManager;
use tauri::{AppHandle, Manager, State};

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

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ServerRegionInfo {
    pub label: String,
    pub url: String,
}

#[tauri::command]
pub async fn validate_configuration_health(
    app_handle: AppHandle,
    project_directory: Option<String>,
) -> AppResult<ConfigurationHealthReport> {
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
        }
        Err(_) => {
            report
                .validation_errors
                .push("Server configuration not loaded".to_string());
            report
                .recommendations
                .push("Call fetch_runtime_ai_config to load server configuration".to_string());
        }
    }

    // Project configuration is no longer stored locally - always using server defaults
    if project_directory.is_some() {
        report.project_config_status = ProjectConfigStatus::NoProjectConfig;
        report.recommendations.push(
            "Project settings are now managed by the server - no local configuration needed"
                .to_string(),
        );
    }

    if !report.server_connectivity {
        report
            .recommendations
            .push("Server connection required for configuration loading".to_string());
    }

    if !report.server_config_complete {
        report
            .recommendations
            .push("Server database missing required task configurations".to_string());
    }

    Ok(report)
}

#[tauri::command]
pub async fn get_key_value_command(
    app_handle: AppHandle,
    key: String,
) -> AppResult<Option<String>> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo.get_value(&key).await
}

#[tauri::command]
pub async fn set_key_value_command(
    app_handle: AppHandle,
    key: String,
    value: String,
) -> AppResult<()> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo.set_value(&key, &value).await
}

#[tauri::command]
pub async fn set_onboarding_completed_command(
    app_handle: AppHandle,
    app_state: State<'_, crate::AppState>,
) -> AppResult<()> {
    // Set in AppState first
    app_state.set_onboarding_completed(true);
    
    // Save to settings if repository is available
    if let Some(repo) = app_handle.try_state::<std::sync::Arc<crate::db_utils::SettingsRepository>>() {
        repo.set_value("onboarding_completed", "true").await?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn is_onboarding_completed_command(
    app_handle: AppHandle,
    app_state: State<'_, crate::AppState>,
) -> AppResult<bool> {
    if let Some(repo) = app_handle.try_state::<std::sync::Arc<crate::db_utils::SettingsRepository>>() {
        let value = repo.get_value("onboarding_completed").await?;
        return Ok(value.as_deref() == Some("true"));
    }
    Ok(app_state.get_onboarding_completed().unwrap_or(false))
}

#[tauri::command]
pub async fn get_workflow_setting_command(
    app_handle: AppHandle,
    workflow_name: String,
    setting_key: String,
) -> AppResult<Option<String>> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo
        .get_workflow_setting(&workflow_name, &setting_key)
        .await
}

#[tauri::command]
pub async fn set_workflow_setting_command(
    app_handle: AppHandle,
    workflow_name: String,
    setting_key: String,
    value: String,
) -> AppResult<()> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo
        .set_workflow_setting(&workflow_name, &setting_key, &value)
        .await
}

#[tauri::command]
pub async fn delete_workflow_setting_command(
    app_handle: AppHandle,
    workflow_name: String,
    setting_key: String,
) -> AppResult<()> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo
        .delete_workflow_setting(&workflow_name, &setting_key)
        .await
}

#[tauri::command]
pub async fn get_all_workflow_settings_command(
    app_handle: AppHandle,
    workflow_name: String,
) -> AppResult<std::collections::HashMap<String, String>> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo
        .get_all_workflow_settings(&workflow_name)
        .await
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrontendReadyTaskModelConfig {
    model: String,
    max_tokens: u32,
    temperature: f32,
    system_prompt: Option<String>,
    copy_buttons: Option<Vec<serde_json::Value>>,
    allowed_models: Option<Vec<String>>,
}

#[tauri::command]
pub async fn get_server_default_task_model_settings_command(
    app_handle: AppHandle,
) -> AppResult<String> {
    let runtime_ai_config =
        crate::utils::config_helpers::get_runtime_ai_config_from_cache(&app_handle).await?;

    // Convert server tasks to frontend format
    let mut server_frontend_map = Map::new();
    for (snake_case_key, task_config) in &runtime_ai_config.tasks {
        // Validate task type before processing
        match TaskType::from_str(&snake_case_key) {
            Ok(_) => {
                // Task type is valid, proceed with processing
                let camel_case_key = snake_case_key.to_lower_camel_case();
                let frontend_config = FrontendReadyTaskModelConfig {
                    model: task_config.model.clone(),
                    max_tokens: task_config.max_tokens,
                    temperature: task_config.temperature,
                    system_prompt: task_config.system_prompt.clone(),
                    copy_buttons: task_config.copy_buttons.clone(),
                    allowed_models: task_config.allowed_models.clone(),
                };
                server_frontend_map.insert(
                    camel_case_key,
                    serde_json::to_value(frontend_config).map_err(|e| {
                        AppError::SerializationError(format!(
                            "Failed to serialize task config for {}: {}",
                            snake_case_key, e
                        ))
                    })?,
                );
            }
            Err(_) => {
                // Task type is invalid or deprecated, filter it out
                log::warn!(
                    "Filtering out unknown task type from server config: {}",
                    snake_case_key
                );
            }
        }
    }

    log::info!("Returning server default task model settings only");
    let result_json = serde_json::Value::Object(server_frontend_map);
    Ok(result_json.to_string())
}

#[tauri::command]
pub async fn fetch_default_system_prompts_from_server(
    app_handle: AppHandle,
) -> AppResult<Vec<DefaultSystemPrompt>> {
    let server_client = crate::api_clients::client_factory::get_server_proxy_client(&app_handle).await?;
    server_client.get_default_system_prompts().await
}

#[tauri::command]
pub async fn fetch_default_system_prompt_from_server(
    app_handle: AppHandle,
    task_type: String,
) -> AppResult<Option<serde_json::Value>> {
    let server_client = crate::api_clients::client_factory::get_server_proxy_client(&app_handle).await?;
    let result = server_client.get_default_system_prompt(&task_type).await?;
    Ok(result.map(|prompt| serde_json::to_value(prompt).unwrap_or_default()))
}

#[tauri::command]
pub async fn initialize_system_prompts_from_server(app_handle: AppHandle) -> AppResult<()> {
    let server_client = crate::api_clients::client_factory::get_server_proxy_client(&app_handle).await?;
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    server_client
        .populate_default_system_prompts_cache(&*settings_repo)
        .await
}

#[tauri::command]
pub async fn is_setting_customized_command(
    app_handle: AppHandle,
    setting_key: String,
) -> AppResult<bool> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();

    // Check if the setting exists in the database
    let value = settings_repo.get_value(&setting_key).await?;
    Ok(value.is_some())
}

#[tauri::command]
pub async fn reset_setting_to_default_command(
    app_handle: AppHandle,
    setting_key: String,
) -> AppResult<()> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();

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
                Err(AppError::ConfigError(
                    "Runtime AI configuration not found in cache. Please refresh configuration."
                        .to_string(),
                ))
            }
        }
        Err(e) => {
            log::error!("Failed to acquire cache lock: {}", e);
            Err(AppError::InternalError(format!(
                "Failed to read configuration cache: {}",
                e
            )))
        }
    }
}

#[tauri::command]
pub async fn get_project_task_model_settings_command(
    app_handle: AppHandle,
    project_directory: String,
) -> AppResult<String> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();

    // Get server defaults
    let runtime_ai_config = get_runtime_ai_config_from_cache(&app_handle).await?;

    // Get project overrides
    let project_overrides = settings_repo
        .get_all_project_task_settings(&project_hash)
        .await?;

    // Initialize result object with server defaults
    let mut result = serde_json::Map::new();

    for (snake_case_key, server_task_config) in &runtime_ai_config.tasks {
        let camel_case_key = snake_case_key.to_lower_camel_case();

        // Start with server defaults
        let mut task_config = serde_json::Map::new();
        task_config.insert("model".to_string(), json!(server_task_config.model.clone()));
        task_config.insert(
            "maxTokens".to_string(),
            json!(server_task_config.max_tokens),
        );
        task_config.insert(
            "temperature".to_string(),
            json!(server_task_config.temperature),
        );
        if let Some(copy_buttons) = &server_task_config.copy_buttons {
            task_config.insert("copyButtons".to_string(), json!(copy_buttons));
        }
        if let Some(allowed_models) = &server_task_config.allowed_models {
            task_config.insert("allowedModels".to_string(), json!(allowed_models));
        }

        // Apply project-specific overrides
        for (override_key, override_value) in &project_overrides {
            if let Some(task_and_setting) =
                override_key.strip_prefix(&format!("{}:", snake_case_key))
            {
                // Parse the JSON value and apply it
                if let Ok(parsed_value) = serde_json::from_str::<serde_json::Value>(override_value)
                {
                    task_config.insert(task_and_setting.to_string(), parsed_value);
                }
            }
        }

        result.insert(camel_case_key, serde_json::Value::Object(task_config));
    }

    Ok(serde_json::Value::Object(result).to_string())
}

#[tauri::command]
pub async fn get_available_regions_command(
    app_state: State<'_, crate::AppState>,
) -> AppResult<Vec<ServerRegionInfo>> {
    let client = reqwest::Client::new();

    // Attempt to fetch from current server URL first if available
    if let Some(current_server_url) = app_state.get_server_url() {
        if !current_server_url.is_empty() {
            let regions_url = format!("{}/config/regions", current_server_url.trim_end_matches('/'));
            if let Ok(response) = client.get(&regions_url).send().await {
                if response.status().is_success() {
                    if let Ok(regions) = response.json::<Vec<ServerRegionInfo>>().await {
                        log::info!("Fetched server regions from current server: {}", current_server_url);
                        return Ok(regions);
                    }
                }
            }
        }
    }
    
    // Try US region first
    let us_url = "https://api.us.vibemanager.app/config/regions";
    if let Ok(response) = client.get(us_url).send().await {
        if response.status().is_success() {
            if let Ok(regions) = response.json::<Vec<ServerRegionInfo>>().await {
                return Ok(regions);
            }
        }
    }
    
    // Fallback to EU region
    let eu_url = "https://api.eu.vibemanager.app/config/regions";
    if let Ok(response) = client.get(eu_url).send().await {
        if response.status().is_success() {
            if let Ok(regions) = response.json::<Vec<ServerRegionInfo>>().await {
                return Ok(regions);
            }
        }
    }
    
    // Return default regions if both fail
    Ok(vec![
        ServerRegionInfo {
            label: "US (Default)".to_string(),
            url: "https://api.us.vibemanager.app".to_string(),
        },
        ServerRegionInfo {
            label: "EU".to_string(),
            url: "https://api.eu.vibemanager.app".to_string(),
        },
    ])
}

#[tauri::command]
pub async fn get_selected_server_url_command(
    app_handle: AppHandle,
    app_state: State<'_, crate::AppState>,
) -> AppResult<Option<String>> {
    if let Some(repo) = app_handle.try_state::<std::sync::Arc<crate::db_utils::SettingsRepository>>() {
        return Ok(repo.get_value("selected_server_url").await?)
    }
    Ok(app_state.get_server_url())
}

#[tauri::command]
pub async fn set_selected_server_url_command(
    app_handle: AppHandle,
    app_state: State<'_, crate::AppState>,
    url: String,
) -> AppResult<()> {
    // Update AppState with the new URL
    app_state.set_server_url(url.clone());
    
    // Save the URL to settings if repository is available
    if let Some(repo) = app_handle.try_state::<std::sync::Arc<crate::db_utils::SettingsRepository>>() {
        repo.set_value("selected_server_url", &url).await?;
    }
    
    // Reinitialize API clients with new URL
    reinitialize_api_clients(&app_handle, &url).await?;
    
    Ok(())
}

#[tauri::command]
pub async fn change_server_url_and_reset_command(
    app_handle: AppHandle,
    app_state: State<'_, crate::AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
    config_cache: State<'_, ConfigCache>,
    new_url: String,
) -> AppResult<()> {
    // Clear tokens
    token_manager.set(None).await?;
    
    // Clear cache
    if let Ok(mut cache_guard) = config_cache.lock() {
        cache_guard.clear();
    }
    
    // Update AppState with the new URL
    app_state.set_server_url(new_url.clone());
    
    // Save the new URL if repository is available
    if let Some(repo) = app_handle.try_state::<std::sync::Arc<crate::db_utils::SettingsRepository>>() {
        repo.set_value("selected_server_url", &new_url).await?;
    }
    
    reinitialize_api_clients(&app_handle, &new_url).await?;
    
    Ok(())
}

/// Reinitialize API clients with a new server URL
async fn reinitialize_api_clients(app_handle: &AppHandle, server_url: &str) -> AppResult<()> {
    crate::app_setup::services::reinitialize_api_clients(app_handle, server_url.to_string()).await
}

#[tauri::command]
pub async fn set_project_task_setting_command(
    app_handle: AppHandle,
    project_directory: String,
    task_key: String,
    setting_key: String,
    value_json: String,
) -> AppResult<()> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();

    let key = format!(
        "project_task_settings:{}:{}:{}",
        project_hash,
        task_key.to_snake_case(),
        setting_key
    );
    settings_repo.set_value(&key, &value_json).await
}

#[tauri::command]
pub async fn reset_project_task_setting_command(
    app_handle: AppHandle,
    project_directory: String,
    task_key: String,
    setting_key: String,
) -> AppResult<()> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();

    let key = format!(
        "project_task_settings:{}:{}:{}",
        project_hash,
        task_key.to_snake_case(),
        setting_key
    );
    settings_repo.delete_value(&key).await
}

#[tauri::command]
pub async fn get_project_system_prompt_command(
    app_handle: AppHandle,
    project_directory: String,
    task_type: String,
) -> AppResult<Option<ProjectSystemPrompt>> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo
        .get_project_system_prompt(&project_hash, &task_type)
        .await
}

#[tauri::command]
pub async fn set_project_system_prompt_command(
    app_handle: AppHandle,
    project_directory: String,
    task_type: String,
    system_prompt: String,
) -> AppResult<()> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo
        .set_project_system_prompt(&project_hash, &task_type, &system_prompt)
        .await
}

#[tauri::command]
pub async fn reset_project_system_prompt_command(
    app_handle: AppHandle,
    project_directory: String,
    task_type: String,
) -> AppResult<()> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo
        .delete_project_system_prompt(&project_hash, &task_type)
        .await
}

#[tauri::command]
pub async fn is_project_system_prompt_customized_command(
    app_handle: AppHandle,
    project_directory: String,
    task_type: String,
) -> AppResult<bool> {
    let project_hash = hash_string(&project_directory);
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    settings_repo
        .has_custom_system_prompt(&project_hash, &task_type)
        .await
}

#[tauri::command]
pub async fn get_server_default_system_prompts_command(app_handle: AppHandle) -> AppResult<String> {
    // This connects to the server PostgreSQL database to fetch default_system_prompts
    // organized by task_type for easy lookup

    let server_client = crate::api_clients::client_factory::get_server_proxy_client(&app_handle).await?;

    // Make HTTP request to server to get default system prompts
    match server_client.get_default_system_prompts().await {
        Ok(prompts) => {
            // Organize prompts by task_type for easy lookup
            let mut prompts_by_task_type = std::collections::HashMap::new();

            for prompt in prompts {
                prompts_by_task_type.insert(prompt.task_type.clone(), prompt);
            }

            let prompts_json = serde_json::to_string(&prompts_by_task_type).map_err(|e| {
                AppError::SerializationError(format!("Failed to serialize system prompts: {}", e))
            })?;
            Ok(prompts_json)
        }
        Err(e) => {
            log::error!("Failed to fetch default system prompts from server: {}", e);
            Err(AppError::HttpError(format!(
                "Failed to fetch system prompts: {}",
                e
            )))
        }
    }
}
