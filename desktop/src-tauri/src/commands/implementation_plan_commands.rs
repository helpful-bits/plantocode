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
use crate::utils::unified_prompt_system::{UnifiedPromptProcessor, UnifiedPromptContextBuilder, ComposedPrompt as UnifiedComposedPrompt};
use crate::db_utils::SettingsRepository;
use crate::jobs::types::JobPayload;

/// Request payload for the implementation plan generation command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    
    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::resolve_model_settings(
        &app_handle,
        TaskType::ImplementationPlan,
        &args.project_directory,
        args.model,
        args.temperature,
        args.max_tokens,
    ).await?;
    
    // Use the job creation utility to create and queue the job
    let payload = crate::jobs::types::ImplementationPlanPayload {
        task_description: args.task_description.clone(),
        relevant_files: args.relevant_files,
    };
    
    // Create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "openrouter",
        TaskType::ImplementationPlan,
        "IMPLEMENTATION_PLAN",
        &args.task_description.clone(),
        model_settings,
        JobPayload::ImplementationPlan(payload),
        2, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No extra metadata
        &app_handle,
    ).await?;
    
    info!("Created implementation plan job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

/// Arguments for reading an implementation plan
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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

/// Response for the get prompt command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptResponse {
    pub system_prompt: String,
    pub user_prompt: String,
    pub combined_prompt: String,
}

/// Response for the estimate prompt tokens command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTokenEstimateResponse {
    pub estimated_tokens: u32,
    pub system_prompt_tokens: u32,
    pub user_prompt_tokens: u32,
    pub total_tokens: u32,
}

/// Estimates the number of tokens a prompt would use
#[command]
pub async fn estimate_prompt_tokens_command(
    task_type: String,
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    project_structure: Option<String>,
    app_handle: AppHandle,
) -> AppResult<PromptTokenEstimateResponse> {
    info!("Estimating tokens for {} prompt", task_type);
    
    // Validate required fields
    if session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if task_description.is_empty() {
        return Err(AppError::ValidationError("Task description is required".to_string()));
    }
    
    if project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    // Parse task_type string into TaskType enum using the FromStr implementation
    let parsed_task_type = task_type.parse::<TaskType>()
        .map_err(|_| AppError::ValidationError(format!("Unsupported task type: {}", task_type)))?;
    
    // Read file contents for relevant files
    let mut file_contents_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    
    for relative_path_str in &relevant_files {
        // Construct full path
        let full_path = std::path::Path::new(&project_directory).join(relative_path_str);
        
        // Read file content
        match crate::utils::fs_utils::read_file_to_string(&*full_path.to_string_lossy()).await {
            Ok(content) => {
                // Add to map with relative path as key
                file_contents_map.insert(relative_path_str.clone(), content);
            },
            Err(e) => {
                // Log warning but continue with other files
                log::warn!("Failed to read file {}: {}", full_path.display(), e);
            }
        }
    }
    
    // Get settings repository for UnifiedPromptProcessor
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create unified prompt context
    let context = UnifiedPromptContextBuilder::new(
        project_directory.clone(),
        parsed_task_type,
        task_description.clone(),
    )
    .project_structure(project_structure.clone())
    .file_contents(if file_contents_map.is_empty() { None } else { Some(file_contents_map.clone()) })
    .build();

    // Use UnifiedPromptProcessor to generate the complete prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &app_handle)
        .await?;
    
    Ok(PromptTokenEstimateResponse {
        estimated_tokens: composed_prompt.estimated_total_tokens.unwrap_or(0) as u32,
        system_prompt_tokens: composed_prompt.estimated_system_tokens.unwrap_or(0) as u32,
        user_prompt_tokens: composed_prompt.estimated_user_tokens.unwrap_or(0) as u32,
        total_tokens: composed_prompt.estimated_total_tokens.unwrap_or(0) as u32,
    })
}

/// Gets the prompt that would be used to generate a task
#[command]
pub async fn get_prompt_command(
    task_type: String,
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    project_structure: Option<String>,
    app_handle: AppHandle,
) -> AppResult<PromptResponse> {
    info!("Getting {} prompt for task: {}", task_type, task_description);
    
    // Validate required fields
    if session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if task_description.is_empty() {
        return Err(AppError::ValidationError("Task description is required".to_string()));
    }
    
    if project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    // Parse task_type string into TaskType enum using the FromStr implementation
    let parsed_task_type = task_type.parse::<TaskType>()
        .map_err(|_| AppError::ValidationError(format!("Unsupported task type: {}", task_type)))?;
    
    // Read file contents for relevant files
    let mut file_contents_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    
    for relative_path_str in &relevant_files {
        // Construct full path
        let full_path = std::path::Path::new(&project_directory).join(relative_path_str);
        
        // Read file content
        match crate::utils::fs_utils::read_file_to_string(&*full_path.to_string_lossy()).await {
            Ok(content) => {
                // Add to map with relative path as key
                file_contents_map.insert(relative_path_str.clone(), content);
            },
            Err(e) => {
                // Log warning but continue with other files
                log::warn!("Failed to read file {}: {}", full_path.display(), e);
            }
        }
    }
    
    // Get settings repository for UnifiedPromptProcessor
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create unified prompt context
    let context = UnifiedPromptContextBuilder::new(
        project_directory.clone(),
        parsed_task_type,
        task_description.clone(),
    )
    .project_structure(project_structure.clone())
    .file_contents(if file_contents_map.is_empty() { None } else { Some(file_contents_map.clone()) })
    .build();

    // Use UnifiedPromptProcessor to generate the complete prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &app_handle)
        .await?;
    
    // Use the clean separated prompts from the unified system
    let system_prompt = composed_prompt.system_prompt;
    let user_prompt = composed_prompt.user_prompt;
    let combined_prompt = format!("{}\n\n{}", system_prompt, user_prompt);

    Ok(PromptResponse {
        system_prompt,
        user_prompt, 
        combined_prompt,
    })
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
    
    // job.response now contains clean XML directly
    let implementation_plan_content = job_response;
    
    // Try to parse the title from metadata
    let title = if let Some(metadata) = job.metadata.as_ref() {
        if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata) {
            metadata_json["planTitle"].as_str().map(|s| s.to_string())
                .or_else(|| metadata_json["generated_title"].as_str().map(|s| s.to_string()))
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