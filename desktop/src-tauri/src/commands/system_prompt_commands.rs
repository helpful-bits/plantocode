use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use crate::error::{AppError, AppResult};
use crate::models::{SystemPrompt, DefaultSystemPrompt};
use crate::db_utils::SettingsRepository;
use crate::utils::get_timestamp;
use crate::api_clients::ServerProxyClient;

/// Request for getting system prompt
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSystemPromptRequest {
    pub session_id: String,
    pub task_type: String,
}

/// Request for setting system prompt
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSystemPromptRequest {
    pub session_id: String,
    pub task_type: String,
    pub system_prompt: String,
}

/// Response for system prompt operations
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptResponse {
    pub session_id: String,
    pub task_type: String,
    pub system_prompt: String,
    pub is_default: bool,
    pub is_custom: bool,
    pub version: Option<String>,
    pub based_on_version: Option<String>,
}

/// Get effective system prompt for a task type (custom or default)
#[command]
pub async fn get_system_prompt_command(
    session_id: String,
    task_type: String,
    app_handle: AppHandle,
) -> AppResult<Option<SystemPromptResponse>> {
    info!("Getting system prompt for session {} task {}", session_id, task_type);
    
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // First try to get custom system prompt
    if let Some(custom_prompt) = settings_repo.get_system_prompt(&session_id, &task_type).await? {
        // For custom prompts, try to get the default version they might be based on
        let based_on_version = if let Some(default_prompt) = settings_repo.get_default_system_prompt(&task_type).await? {
            Some(default_prompt.version)
        } else {
            None
        };
        
        return Ok(Some(SystemPromptResponse {
            session_id: custom_prompt.session_id,
            task_type: custom_prompt.task_type,
            system_prompt: custom_prompt.system_prompt,
            is_default: false,
            is_custom: true,
            version: None, // Custom prompts don't have versions
            based_on_version,
        }));
    }
    
    // Fall back to default system prompt
    if let Some(default_prompt) = settings_repo.get_default_system_prompt(&task_type).await? {
        return Ok(Some(SystemPromptResponse {
            session_id: session_id,
            task_type: default_prompt.task_type,
            system_prompt: default_prompt.system_prompt,
            is_default: true,
            is_custom: false,
            version: Some(default_prompt.version),
            based_on_version: None,
        }));
    }
    
    Ok(None)
}

/// Set custom system prompt for a task type
#[command]
pub async fn set_system_prompt_command(
    session_id: String,
    task_type: String,
    system_prompt: String,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Setting system prompt for session {} task {}", session_id, task_type);
    
    if system_prompt.trim().is_empty() {
        return Err(AppError::ValidationError("System prompt cannot be empty".to_string()));
    }
    
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    let now = get_timestamp();
    
    let prompt = SystemPrompt {
        id: format!("custom_{}_{}", session_id, task_type),
        session_id,
        task_type,
        system_prompt,
        is_default: false,
        created_at: now,
        updated_at: now,
    };
    
    settings_repo.set_system_prompt(&prompt).await?;
    
    Ok(())
}

/// Reset system prompt to default for a task type
#[command]
pub async fn reset_system_prompt_command(
    session_id: String,
    task_type: String,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Resetting system prompt to default for session {} task {}", session_id, task_type);
    
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    settings_repo.reset_system_prompt_to_default(&session_id, &task_type).await?;
    
    Ok(())
}

/// Get all default system prompts
#[command]
pub async fn get_default_system_prompts_command(
    app_handle: AppHandle,
) -> AppResult<Vec<DefaultSystemPrompt>> {
    info!("Getting all default system prompts");
    
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    settings_repo.get_all_default_system_prompts().await
}

/// Get default system prompt for a specific task type
#[command]
pub async fn get_default_system_prompt_command(
    task_type: String,
    app_handle: AppHandle,
) -> AppResult<Option<DefaultSystemPrompt>> {
    info!("Getting default system prompt for task {}", task_type);
    
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    settings_repo.get_default_system_prompt(&task_type).await
}

/// Check if a task type has a custom system prompt
#[command]
pub async fn has_custom_system_prompt_command(
    session_id: String,
    task_type: String,
    app_handle: AppHandle,
) -> AppResult<bool> {
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    let custom_prompt = settings_repo.get_system_prompt(&session_id, &task_type).await?;
    
    Ok(custom_prompt.is_some())
}

/// Update a default system prompt content and description
/// This is primarily for admin/dev use but sets up future possibilities
#[command]
pub async fn update_default_system_prompt_command(
    task_type: String,
    new_prompt_content: String,
    new_description: Option<String>,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Updating default system prompt for task type: {}", task_type);
    
    if new_prompt_content.trim().is_empty() {
        return Err(AppError::ValidationError("System prompt content cannot be empty".to_string()));
    }
    
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    settings_repo.update_default_system_prompt(&task_type, &new_prompt_content, new_description.as_deref()).await?;
    
    Ok(())
}

/// Get all default system prompts from server
#[command]
pub async fn fetch_default_system_prompts_from_server(
    app_handle: AppHandle,
) -> AppResult<Vec<serde_json::Value>> {
    info!("Fetching all default system prompts from server");
    
    let server_proxy_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
    
    server_proxy_client.get_default_system_prompts().await
}

/// Get default system prompt for a specific task type from server
#[command]
pub async fn fetch_default_system_prompt_from_server(
    task_type: String,
    app_handle: AppHandle,
) -> AppResult<Option<serde_json::Value>> {
    info!("Fetching default system prompt for task type '{}' from server", task_type);
    
    let server_proxy_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
    
    server_proxy_client.get_default_system_prompt(&task_type).await
}

/// Initialize system prompts from server (populate local cache)
/// This command should be called after user authentication is complete
#[command]
pub async fn initialize_system_prompts_from_server(
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Initializing system prompts from server via command");
    
    crate::app_setup::initialize_system_prompts(&app_handle).await
}