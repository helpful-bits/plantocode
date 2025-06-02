use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use uuid::Uuid;
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus, TaskType, JobCommandResponse};
use crate::utils::get_timestamp;
use crate::db_utils::{SessionRepository, BackgroundJobRepository, SettingsRepository};
use crate::utils::job_creation_utils;
use crate::jobs::types::JobPayload;

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
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.prompt_text.is_empty() {
        return Err(AppError::ValidationError("Prompt text is required".to_string()));
    }
    
    // Determine project directory for settings lookup
    let project_dir = if let Some(dir) = args.project_directory.clone() {
        if !dir.is_empty() {
            dir
        } else {
            // If empty, derive from session
            let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
            let session = session_repo.get_session_by_id(&args.session_id)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to get session: {}", e)))?
                .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", args.session_id)))?;
            
            if session.project_directory.is_empty() {
                return Err(AppError::ValidationError("Project directory not found in session".to_string()));
            }
            
            session.project_directory
        }
    } else {
        // If None, derive from session
        let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
        let session = session_repo.get_session_by_id(&args.session_id)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to get session: {}", e)))?
            .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", args.session_id)))?;
        
        if session.project_directory.is_empty() {
            return Err(AppError::ValidationError("Project directory not found in session".to_string()));
        }
        
        session.project_directory
    };
    
    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::resolve_model_settings(
        &app_handle,
        TaskType::GenericLlmStream,
        &project_dir,
        args.model.clone(),
        args.temperature,
        args.max_output_tokens,
    ).await?;
    
    // Use the job creation utility to create and queue the job
    let payload = if let Some((model, temperature, max_tokens)) = &model_settings {
        crate::jobs::types::GenericLlmStreamPayload {
            background_job_id: String::new(), // Will be set by create_and_queue_background_job
            session_id: args.session_id.clone(),
            project_directory: Some(project_dir.clone()),
            prompt_text: args.prompt_text.clone(),
            system_prompt: args.system_prompt.clone(),
            metadata: args.metadata.clone(),
        }
    } else {
        // This should never happen for GenericLlmStream as it requires LLM
        return Err(AppError::ConfigError("GenericLlmStream requires LLM configuration".to_string()));
    };
    
    // Create additional metadata from the payload metadata if provided
    let mut additional_metadata = serde_json::json!({
        "isStreaming": true,
    });
    
    // Add any additional metadata provided by the caller
    if let Some(extra_metadata) = args.metadata.clone() {
        if let (Some(obj), Some(extra_obj)) = (additional_metadata.as_object_mut(), extra_metadata.as_object()) {
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
        1, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        Some(additional_metadata), // Add the streaming flag and any other metadata
        &app_handle,
    ).await?;
    
    info!("Created generic LLM stream job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

// Request arguments for task enhancement
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEnhancementRequestArgs {
    pub session_id: String,
    pub task_description: String,
    pub project_context: Option<String>,
    pub project_directory: Option<String>,
    pub target_field: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
}


/// Enhances a task description with more details and clarity
#[command]
pub async fn enhance_task_description_command(
    session_id: String,
    task_description: String,
    project_context: Option<String>,
    project_directory: Option<String>,
    target_field: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = TaskEnhancementRequestArgs {
        session_id,
        task_description,
        project_context,
        project_directory,
        target_field,
        model_override,
        temperature_override,
        max_tokens_override,
    };
    info!("Enhancing task description: {}", args.task_description);
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.task_description.is_empty() {
        return Err(AppError::ValidationError("Task description is required".to_string()));
    }
    
    // Determine project directory
    let project_directory = if let Some(dir) = args.project_directory.clone() {
        if dir.is_empty() {
            return Err(AppError::ValidationError("Project directory cannot be empty".to_string()));
        }
        dir
    } else {
        // Try to get project directory from session
        let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
            
        let session = session_repo.get_session_by_id(&args.session_id)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to get session: {}", e)))?
            .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", args.session_id)))?;
            
        if session.project_directory.is_empty() {
            return Err(AppError::ValidationError("Project directory not found in session".to_string()));
        }
        
        session.project_directory
    };
    
    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::resolve_model_settings(
        &app_handle,
        TaskType::TaskEnhancement,
        &project_directory,
        args.model_override,
        args.temperature_override,
        args.max_tokens_override,
    ).await?;
    
    // Create TaskEnhancementPayload
    let task_enhancement_payload = crate::jobs::types::TaskEnhancementPayload {
        background_job_id: String::new(), // Will be set by job creation utility
        session_id: args.session_id.clone(),
        project_directory: project_directory.clone(),
        task_description: args.task_description.clone(),
        project_context: args.project_context.clone(),
        target_field: args.target_field.clone(),
    };
    
    // Additional metadata for job
    let additional_metadata = serde_json::json!({
        "targetField": args.target_field,
    });
    
    // Use the job creation utility to create and queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_directory,
        "openrouter",
        TaskType::TaskEnhancement,
        "TASK_ENHANCEMENT",
        &args.task_description,
        model_settings,
JobPayload::TaskEnhancement(task_enhancement_payload),
        2, // Higher priority for task enhancement
        None, // No workflow_id
        None, // No workflow_stage
        Some(additional_metadata),
        &app_handle,
    ).await?;
    
    info!("Created task enhancement job: {}", job_id);
    
    Ok(JobCommandResponse { job_id })
}