use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use uuid::Uuid;
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus, ApiType, TaskType, JobCommandResponse};
use crate::utils::get_timestamp;
use std::sync::Arc;
use crate::jobs::types::{Job, JobPayload, JobType, GuidanceGenerationPayload};

/// Arguments for guidance generation command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateGuidanceArgs {
    pub session_id: String,
    pub project_directory: String,
    pub task_description: String,
    pub paths: Option<Vec<String>>,
    pub file_contents_summary: Option<String>,
    pub system_prompt_override: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
}

/// Command to generate guidance for a development task
#[command]
pub async fn generate_guidance_command(
    session_id: String,
    project_directory: String,
    task_description: String,
    paths: Option<Vec<String>>,
    file_contents_summary: Option<String>,
    system_prompt_override: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    app_handle: AppHandle
) -> AppResult<JobCommandResponse> {
    info!("Creating guidance generation job for task: {}", task_description);
    
    // Recreate args struct for internal use
    let args = GenerateGuidanceArgs {
        session_id,
        project_directory,
        task_description,
        paths,
        file_contents_summary,
        system_prompt_override,
        model_override,
        temperature_override,
        max_tokens_override,
    };
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.task_description.is_empty() {
        return Err(AppError::ValidationError("Task description is required".to_string()));
    }
    
    if args.project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    // Get repository from app state
    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();
    
    // Get model configuration for this task - check project settings first, then server defaults
    let model = if let Some(model) = args.model_override.clone() {
        model
    } else {
        match crate::config::get_model_for_task_with_project(TaskType::GuidanceGeneration, &args.project_directory).await {
            Ok(model) => model,
            Err(e) => return Err(AppError::ConfigError(format!("Failed to get model for guidance generation: {}", e))),
        }
    };
    
    // Get temperature configuration - check project settings first, then server defaults
    let temperature = if let Some(temp) = args.temperature_override {
        temp
    } else {
        match crate::config::get_temperature_for_task_with_project(TaskType::GuidanceGeneration, &args.project_directory).await {
            Ok(temp) => temp,
            Err(e) => return Err(AppError::ConfigError(format!("Failed to get temperature for guidance generation: {}", e))),
        }
    };
    
    // Get max tokens configuration - check project settings first, then server defaults
    let max_output_tokens = if let Some(tokens) = args.max_tokens_override {
        tokens
    } else {
        match crate::config::get_max_tokens_for_task_with_project(TaskType::GuidanceGeneration, &args.project_directory).await {
            Ok(tokens) => tokens,
            Err(e) => return Err(AppError::ConfigError(format!("Failed to get max tokens for guidance generation: {}", e))),
        }
    };
    
    // Create the payload for the GuidanceGenerationProcessor
    let processor_payload = GuidanceGenerationPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        project_directory: args.project_directory.clone(),
        task_description: args.task_description.clone(),
        paths: args.paths.clone(),
        file_contents_summary: args.file_contents_summary.clone(),
        system_prompt_override: args.system_prompt_override.clone(),
        model_override: None, // We'll pass the model directly to create_and_queue_background_job
        temperature: None,    // We'll pass the temperature directly to create_and_queue_background_job
        max_output_tokens: None, // We'll pass the max_tokens directly to create_and_queue_background_job
    };
    
    // Create additional metadata for the job
    let mut extra_metadata = serde_json::json!({
        "taskDescription": args.task_description,
    });
    
    // Add optional fields to metadata
    if let Some(paths) = &args.paths {
        extra_metadata["paths"] = serde_json::to_value(paths)
            .map_err(|e| AppError::SerdeError(e.to_string()))?;
    }
    
    if let Some(file_contents_summary) = &args.file_contents_summary {
        extra_metadata["fileContentsSummary"] = serde_json::to_value(file_contents_summary)
            .map_err(|e| AppError::SerdeError(e.to_string()))?;
    }
    
    // Use the job creation utility to create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "openrouter",
        TaskType::GuidanceGeneration,
        "GUIDANCE_GENERATION",
        &args.task_description,
        (model, temperature, max_output_tokens),
        serde_json::to_value(processor_payload).map_err(|e| 
            AppError::SerdeError(e.to_string()))?,
        2, // Priority
        Some(extra_metadata),
        &app_handle,
    ).await?;
    
    info!("Created guidance generation job: {}", job_id);
    Ok(JobCommandResponse { job_id })
}