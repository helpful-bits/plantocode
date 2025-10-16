use crate::db_utils::{BackgroundJobRepository, SessionRepository, SettingsRepository};
use crate::error::{AppError, AppResult};
use crate::jobs::types::JobPayload;
use crate::models::{BackgroundJob, JobCommandResponse, JobStatus, TaskType};
use crate::utils::get_timestamp;
use crate::utils::job_creation_utils;
use log::info;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, command};
use uuid::Uuid;

// Request arguments for generic LLM stream command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericLlmStreamArgs {
    pub session_id: String,
    pub prompt_text: String,
    pub system_prompt: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_output_tokens: Option<u32>,
    pub metadata: Option<serde_json::Value>,
    pub project_directory: Option<String>,
}

/// Command to start a generic LLM streaming job
#[command]
pub async fn generic_llm_stream_command(
    session_id: String,
    prompt_text: String,
    system_prompt: Option<String>,
    model: Option<String>,
    temperature: Option<f32>,
    max_output_tokens: Option<u32>,
    metadata: Option<serde_json::Value>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = GenericLlmStreamArgs {
        session_id,
        prompt_text,
        system_prompt,
        model,
        temperature,
        max_output_tokens,
        metadata,
        project_directory,
    };
    info!("Creating generic LLM stream job");

    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError(
            "Session ID is required".to_string(),
        ));
    }

    if args.prompt_text.is_empty() {
        return Err(AppError::ValidationError(
            "Prompt text is required".to_string(),
        ));
    }

    // Determine project directory for settings lookup
    let project_dir = if let Some(dir) = args.project_directory.clone() {
        if !dir.is_empty() {
            dir
        } else {
            // If empty, derive from session
            let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
            let session = cache.get_session(&app_handle, &args.session_id).await?;

            if session.project_directory.is_empty() {
                return Err(AppError::ValidationError(
                    "Project directory not found in session".to_string(),
                ));
            }

            session.project_directory
        }
    } else {
        // If None, derive from session
        let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
        let session = cache.get_session(&app_handle, &args.session_id).await?;

        if session.project_directory.is_empty() {
            return Err(AppError::ValidationError(
                "Project directory not found in session".to_string(),
            ));
        }

        session.project_directory
    };

    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::config_resolver::resolve_model_settings(
        &app_handle,
        TaskType::GenericLlmStream,
        &project_dir,
        args.model.clone(),
        args.temperature,
        args.max_output_tokens,
    )
    .await?;

    // Use the job creation utility to create and queue the job
    let payload = if let Some((model, temperature, max_tokens)) = &model_settings {
        crate::jobs::types::GenericLlmStreamPayload {
            prompt_text: args.prompt_text.clone(),
            system_prompt: args.system_prompt.clone(),
            metadata: args.metadata.clone(),
        }
    } else {
        // This should never happen for GenericLlmStream as it requires LLM
        return Err(AppError::ConfigError(
            "GenericLlmStream requires LLM configuration".to_string(),
        ));
    };

    // Create additional metadata from the payload metadata if provided
    let mut additional_metadata = serde_json::json!({
        "isStreaming": true,
    });

    // Add any additional metadata provided by the caller
    if let Some(additional_params_input) = args.metadata.clone() {
        if let (Some(obj), Some(extra_obj)) = (
            additional_metadata.as_object_mut(),
            additional_params_input.as_object(),
        ) {
            for (key, value) in extra_obj {
                obj.insert(key.clone(), value.clone());
            }
        }
    }

    // Create and queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_dir,
        "openrouter",
        TaskType::GenericLlmStream,
        "GENERIC_LLM_STREAM",
        &args.prompt_text.clone(),
        model_settings,
        JobPayload::GenericLlmStream(payload),
        1,                         // Priority
        None,                      // No workflow_id
        None,                      // No workflow_stage
        Some(additional_metadata), // Add the streaming flag and any other metadata
        &app_handle,
    )
    .await?;

    info!("Created generic LLM stream job: {}", job_id);

    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

/// Refines a task description with additional context from relevant files
#[command]
pub async fn refine_task_description_command(
    session_id: String,
    task_description: String,
    relevant_files: Vec<String>,
    project_directory: String,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    info!("Refining task description: {}", task_description);

    // Validate required fields
    if session_id.is_empty() {
        return Err(AppError::ValidationError(
            "Session ID is required".to_string(),
        ));
    }

    if task_description.is_empty() {
        return Err(AppError::ValidationError(
            "Task description is required".to_string(),
        ));
    }

    if project_directory.is_empty() {
        return Err(AppError::ValidationError(
            "Project directory is required".to_string(),
        ));
    }

    // Get session to access project directory
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let session = cache.get_session(&app_handle, &session_id).await?;

    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::config_resolver::resolve_model_settings(
        &app_handle,
        TaskType::TaskRefinement,
        &session.project_directory,
        None,
        None,
        None,
    )
    .await?;

    // Create TaskRefinementPayload
    let task_refinement_payload = crate::jobs::types::TaskRefinementPayload {
        task_description: task_description.clone(),
        relevant_files,
    };

    // Use the job creation utility to create and queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &session_id,
        &project_directory,
        "openrouter",
        TaskType::TaskRefinement,
        "TASK_REFINEMENT",
        &task_description,
        model_settings,
        JobPayload::TaskRefinement(task_refinement_payload),
        2,    // Higher priority for task refinement
        None, // No workflow_id
        None, // No workflow_stage
        None, // No additional metadata
        &app_handle,
    )
    .await?;

    info!("Created task refinement job: {}", job_id);

    Ok(JobCommandResponse { job_id })
}
