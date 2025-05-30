use std::sync::Arc;
use tauri::{AppHandle, Manager};
use log::info;

use crate::error::{AppError, AppResult};
use crate::models::{TaskType, JobStatus, OpenRouterRequestMessage, OpenRouterContent};
use crate::db_utils::{BackgroundJobRepository, SettingsRepository};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::utils::{PromptComposer, CompositionContextBuilder};
use crate::api_clients::{client_factory, client_trait::ApiClient};

/// Setup repositories from app state - DUPLICATED IN EVERY PROCESSOR
/// This pattern appears identically in all processors
pub fn setup_repositories(
    app_handle: &AppHandle,
) -> AppResult<(Arc<BackgroundJobRepository>, Arc<SettingsRepository>)> {
    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    
    Ok((repo, settings_repo))
}

/// Update job status to running - DUPLICATED IN EVERY PROCESSOR
/// This pattern appears identically in all processors
pub async fn update_status_running(
    repo: &BackgroundJobRepository,
    job_id: &str,
    message: &str,
) -> AppResult<()> {
    repo.update_job_status(job_id, &JobStatus::Running.to_string(), Some(message))
        .await?;
    Ok(())
}

/// Create OpenRouter messages - DUPLICATED IN EVERY PROCESSOR 
/// This exact pattern appears in all processors that use OpenRouter
pub fn create_openrouter_messages(
    system_prompt: &str,
    user_prompt: &str,
) -> Vec<OpenRouterRequestMessage> {
    vec![
        OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: system_prompt.to_string(),
            }],
        },
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: user_prompt.to_string(),
            }],
        },
    ]
}

/// Get API client - DUPLICATED IN MANY PROCESSORS
pub fn get_api_client(
    app_handle: &AppHandle,
) -> AppResult<Arc<dyn ApiClient>> {
    client_factory::get_api_client(app_handle)
}

/// Extract system and user prompts from composed prompt - DUPLICATED PATTERN
/// This splitting logic appears in most processors
pub fn extract_prompts_from_composed(
    composed_prompt: &crate::utils::unified_prompt_system::ComposedPrompt,
) -> (String, String, String) {
    let system_prompt_text = composed_prompt
        .final_prompt
        .split("\n\n")
        .next()
        .unwrap_or("")
        .to_string();
    let user_prompt_text = composed_prompt
        .final_prompt
        .split("\n\n")
        .skip(1)
        .collect::<Vec<&str>>()
        .join("\n\n");
    let system_prompt_id = composed_prompt.system_prompt_id.clone();
    
    (system_prompt_text, user_prompt_text, system_prompt_id)
}

/// Log job processing start - COMMON PATTERN
pub fn log_job_start(job_id: &str, task_name: &str) {
    info!("Processing {} job {}", task_name, job_id);
}