use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use uuid::Uuid;
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus, TaskType};
use crate::utils::get_timestamp;
use crate::db_utils::{SessionRepository, BackgroundJobRepository, SettingsRepository};
use crate::utils::job_creation_utils;

// Request arguments for generic LLM stream command
#[derive(Debug, Deserialize)]
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

// Command response for generic LLM stream
#[derive(Debug, Serialize)]
pub struct JobCommandResponse {
    pub job_id: String,
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
    
    // Get the model for this task
    let model = if let Some(model) = args.model.clone() {
        model
    } else {
        match crate::config::get_model_for_task(TaskType::GenericLlmStream) {
            Ok(model) => model,
            Err(_) => match crate::config::get_model_for_task(TaskType::TextImprovement) {
                Ok(model) => model,
                Err(e) => return Err(AppError::ConfigError(
                    format!("Failed to get model for generic LLM stream: {}", e)
                )),
            },
        }
    };
    
    // Get temperature for this task
    let temperature = if let Some(temp) = args.temperature {
        temp
    } else {
        match crate::config::get_default_temperature_for_task(Some(TaskType::GenericLlmStream)) {
            Ok(temp) => temp,
            Err(_) => match crate::config::get_default_temperature_for_task(Some(TaskType::TextImprovement)) {
                Ok(temp) => temp,
                Err(e) => return Err(AppError::ConfigError(
                    format!("Failed to get temperature for generic LLM stream: {}", e)
                )),
            },
        }
    };
    
    // Get max tokens for this task
    let max_tokens = if let Some(tokens) = args.max_output_tokens {
        tokens
    } else {
        match crate::config::get_default_max_tokens_for_task(Some(TaskType::GenericLlmStream)) {
            Ok(tokens) => tokens,
            Err(_) => match crate::config::get_default_max_tokens_for_task(Some(TaskType::TextImprovement)) {
                Ok(tokens) => tokens,
                Err(e) => return Err(AppError::ConfigError(
                    format!("Failed to get max tokens for generic LLM stream: {}", e)
                )),
            },
        }
    };
    
    // Use the job creation utility to create and queue the job
    let payload = crate::jobs::types::GenericLlmStreamPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        project_directory: args.project_directory.clone(),
        prompt_text: args.prompt_text.clone(),
        system_prompt: args.system_prompt.clone(),
        model: Some(model.clone()),
        temperature: Some(temperature),
        max_output_tokens: Some(max_tokens),
        metadata: args.metadata.clone(),
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
        &args.project_directory.clone().unwrap_or_default(),
        "openrouter",
        TaskType::GenericLlmStream,
        "GENERIC_LLM_STREAM",
        &args.prompt_text.clone(),
        (model, temperature, max_tokens),
        serde_json::to_value(payload).map_err(|e| 
            AppError::SerializationError(format!("Failed to serialize payload: {}", e)))?,
        1, // Priority
        Some(additional_metadata), // Add the streaming flag and any other metadata
        &app_handle,
    ).await?;
    
    info!("Created generic LLM stream job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

// Request arguments for task enhancement
#[derive(Debug, Deserialize)]
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

#[derive(Debug, Serialize)]
pub struct TaskEnhancementCommandResponse {
    pub job_id: String,
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
) -> AppResult<TaskEnhancementCommandResponse> {
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
    
    // Determine LLM settings
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Try to get task-specific settings
    let task_settings = settings_repo.get_task_settings(&args.session_id, &TaskType::TaskEnhancement.to_string())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get task settings: {}", e)))?;
    
    // Determine model - use override, task settings, or default
    let model = args.model_override
        .or_else(|| task_settings.as_ref().map(|s| s.model.clone()))
        .unwrap_or_else(|| {
            // If no override or task settings, get from config
            match crate::config::get_model_for_task(TaskType::TaskEnhancement) {
                Ok(model) => model,
                Err(e) => {
                    info!("Failed to get model from config, will use fallback in job creation: {}", e);
                    String::new() // Empty string to be handled by job creation utility
                }
            }
        });
    
    // Determine temperature - use override, task settings, or default
    let temperature = args.temperature_override
        .or_else(|| task_settings.as_ref().and_then(|s| s.temperature))
        .unwrap_or_else(|| {
            // If no override or task settings, get from config
            match crate::config::get_default_temperature_for_task(Some(TaskType::TaskEnhancement)) {
                Ok(temp) => temp,
                Err(_) => 0.4, // Fallback for task enhancement
            }
        });
    
    // Determine max tokens - use override, task settings, or default
    let max_tokens = args.max_tokens_override
        .or_else(|| task_settings.as_ref().map(|s| s.max_tokens as u32))
        .unwrap_or_else(|| {
            // If no override or task settings, get from config
            match crate::config::get_default_max_tokens_for_task(Some(TaskType::TaskEnhancement)) {
                Ok(tokens) => tokens,
                Err(_) => 4000, // Fallback for task enhancement
            }
        });
    
    // Create TaskEnhancementPayload
    let task_enhancement_payload = crate::jobs::types::TaskEnhancementPayload {
        background_job_id: String::new(), // Will be set by job creation utility
        session_id: args.session_id.clone(),
        project_directory: Some(project_directory.clone()),
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
        (model, temperature, max_tokens),
        serde_json::to_value(task_enhancement_payload).map_err(|e| 
            AppError::SerializationError(format!("Failed to serialize task enhancement payload: {}", e)))?,
        2, // Higher priority for task enhancement
        Some(additional_metadata),
        &app_handle,
    ).await?;
    
    info!("Created task enhancement job: {}", job_id);
    
    Ok(TaskEnhancementCommandResponse { job_id })
}