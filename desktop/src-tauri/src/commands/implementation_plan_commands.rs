use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use uuid::Uuid;
use std::sync::Arc;
use crate::models::BackgroundJob;
use crate::models::JobStatus;
use crate::utils::get_timestamp;
use crate::models::TaskType;
use crate::db_utils::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::models::JobCommandResponse;

/// Request payload for the implementation plan generation command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateImplementationPlanArgs {
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub relevant_files: Vec<String>,
    pub project_structure: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}


/// Creates an implementation plan for a development task
#[command]
pub async fn create_implementation_plan_command(
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    project_structure: Option<String>,
    model: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = CreateImplementationPlanArgs {
        session_id,
        task_description,
        project_directory,
        relevant_files,
        project_structure,
        model,
        temperature,
        max_tokens,
    };
    info!("Creating implementation plan job for task: {}", args.task_description);
    
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
    
    // Get the model for this task
    let model = if let Some(model) = args.model {
        model
    } else {
        match crate::config::get_model_for_task(TaskType::ImplementationPlan) {
            Ok(model) => model,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get model for implementation plan: {}", e)));
            }
        }
    };
    
    // Get temperature for this task
    let temperature = if let Some(temp) = args.temperature {
        temp
    } else {
        match crate::config::get_default_temperature_for_task(Some(TaskType::ImplementationPlan)) {
            Ok(temp) => temp,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get temperature for implementation plan: {}", e)));
            }
        }
    };
    
    // Get max tokens for this task
    let max_tokens = if let Some(tokens) = args.max_tokens {
        tokens
    } else {
        match crate::config::get_default_max_tokens_for_task(Some(TaskType::ImplementationPlan)) {
            Ok(tokens) => tokens,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get max tokens for implementation plan: {}", e)));
            }
        }
    };
    
    // Use the job creation utility to create and queue the job
    let payload = crate::jobs::types::ImplementationPlanPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        task_description: args.task_description.clone(),
        project_directory: args.project_directory.clone(),
        project_structure: args.project_structure,
        relevant_files: args.relevant_files,
        model: model.clone(),
        temperature,
        max_tokens: Some(max_tokens),
    };
    
    // Create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "openrouter",
        TaskType::ImplementationPlan,
        "IMPLEMENTATION_PLAN",
        &args.task_description.clone(),
        (model.clone(), temperature, max_tokens),
        serde_json::to_value(payload).map_err(|e| 
            AppError::SerializationError(format!("Failed to serialize payload: {}", e)))?,
        2, // Priority
        None, // No extra metadata
        &app_handle,
    ).await?;
    
    info!("Created implementation plan job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

/// Arguments for reading an implementation plan
#[derive(Debug, Deserialize)]
pub struct ReadImplementationPlanArgs {
    pub job_id: String,
}

/// Response for the read implementation plan command
#[derive(Debug, Serialize)]
pub struct ImplementationPlanDataResponse {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
    pub content_format: Option<String>,
    pub created_at: String,
}

/// Reads an implementation plan from the file system
#[command]
pub async fn read_implementation_plan_command(
    job_id: String,
    app_handle: AppHandle,
) -> AppResult<ImplementationPlanDataResponse> {
    let args = ReadImplementationPlanArgs { job_id };
    info!("Reading implementation plan for job: {}", args.job_id);
    
    // Get the background job repository
    let repo = app_handle.state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();
    
    // Get the job from the database
    let job = repo.get_job_by_id(&args.job_id).await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get job: {}", e)))?
        .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", args.job_id)))?;
    
    // Verify job type
    if job.task_type != "implementation_plan" {
        return Err(AppError::ValidationError(format!("Job is not an implementation plan: {}", args.job_id)));
    }
    
    // Check if job is complete
    if job.status != JobStatus::Completed.to_string() {
        return Err(AppError::ValidationError(format!("Implementation plan job is not completed: {}", args.job_id)));
    }
    
    // Check if the response is available
    if job.response.is_none() {
        return Err(AppError::NotFoundError(format!("Implementation plan response is not available: {}", args.job_id)));
    }
    
    // Extract job details
    let created_at = job.created_at;
    let job_response = job.response.clone().unwrap_or_default();
    
    // Use the job response directly as the implementation plan content
    let implementation_plan_content = job_response;
    
    // Try to parse the title from metadata or response
    let title = if let Some(metadata) = job.metadata.as_ref() {
        if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata) {
            metadata_json["planTitle"].as_str().map(|s| s.to_string())
        } else {
            None
        }
    } else {
        None
    };
    
    // Create and return the response
    Ok(ImplementationPlanDataResponse {
        id: job.id,
        title,
        description: Some(job.prompt),
        content: Some(implementation_plan_content),
        content_format: Some("xml".to_string()),
        created_at: created_at.to_string(),
    })
}