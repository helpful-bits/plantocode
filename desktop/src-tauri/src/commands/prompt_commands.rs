use crate::db_utils::SessionRepository;
use crate::models::TaskType;
use crate::utils::unified_prompt_system::{UnifiedPromptContextBuilder, UnifiedPromptProcessor};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptResponse {
    pub system_prompt: String,
    pub system_prompt_template: String,
    pub system_prompt_id: String,
}

#[tauri::command]
pub async fn get_system_prompt_for_task(
    session_id: String,
    task_type: String,
    app_handle: AppHandle,
) -> Result<SystemPromptResponse, String> {
    // Get session repository
    let session_repo = app_handle
        .state::<Arc<SessionRepository>>()
        .inner()
        .clone();

    // Get session to get project directory
    let session = session_repo
        .get_session_by_id(&session_id)
        .await
        .map_err(|e| format!("Failed to get session: {}", e))?
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    // Parse task type
    let task_type_enum = task_type
        .parse::<TaskType>()
        .map_err(|e| format!("Invalid task type: {}", e))?;

    // Build minimal context for getting system prompt
    let context = UnifiedPromptContextBuilder::new(
        session.project_directory.clone(),
        task_type_enum,
        String::new(), // Empty task description - we just need the system prompt
    )
    .build();

    // Get the composed prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &app_handle)
        .await
        .map_err(|e| format!("Failed to get system prompt: {}", e))?;

    Ok(SystemPromptResponse {
        system_prompt: composed_prompt.system_prompt,
        system_prompt_template: composed_prompt.system_prompt_template,
        system_prompt_id: composed_prompt.system_prompt_id,
    })
}