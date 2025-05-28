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
    
    // Get the model for this task - check project settings first, then server defaults
    let model = if let Some(model) = args.model {
        model
    } else {
        match crate::config::get_model_for_task_with_project(TaskType::ImplementationPlan, &args.project_directory).await {
            Ok(model) => model,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get model for implementation plan: {}", e)));
            }
        }
    };
    
    // Get temperature for this task - check project settings first, then server defaults
    let temperature = if let Some(temp) = args.temperature {
        temp
    } else {
        match crate::config::get_temperature_for_task_with_project(TaskType::ImplementationPlan, &args.project_directory).await {
            Ok(temp) => temp,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get temperature for implementation plan: {}", e)));
            }
        }
    };
    
    // Get max tokens for this task - check project settings first, then server defaults
    let max_tokens = if let Some(tokens) = args.max_tokens {
        tokens
    } else {
        match crate::config::get_max_tokens_for_task_with_project(TaskType::ImplementationPlan, &args.project_directory).await {
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

/// Response for the get implementation plan prompt command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImplementationPlanPromptResponse {
    pub system_prompt: String,
    pub user_prompt: String,
    pub combined_prompt: String,
}

/// Response for the estimate implementation plan tokens command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImplementationPlanTokenEstimateResponse {
    pub estimated_tokens: u32,
    pub system_prompt_tokens: u32,
    pub user_prompt_tokens: u32,
    pub total_tokens: u32,
}

/// Estimates the number of tokens an implementation plan prompt would use
#[command]
pub async fn estimate_implementation_plan_tokens_command(
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    project_structure: Option<String>,
    app_handle: AppHandle,
) -> AppResult<ImplementationPlanTokenEstimateResponse> {
    info!("Estimating tokens for implementation plan prompt");
    
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
    
    // Read file contents for relevant files (SAME LOGIC AS ImplementationPlanProcessor)
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
    
    // Generate the EXACT SAME prompt as ImplementationPlanProcessor
    let prompt = crate::prompts::implementation_plan::generate_enhanced_implementation_plan_prompt(
        &task_description,
        project_structure.as_deref(),
        &file_contents_map
    );
    
    // Estimate the number of tokens in the prompt (SAME LOGIC AS ImplementationPlanProcessor)
    let estimated_prompt_tokens = crate::utils::token_estimator::estimate_tokens(&prompt);
    
    Ok(ImplementationPlanTokenEstimateResponse {
        estimated_tokens: estimated_prompt_tokens,
        system_prompt_tokens: 0, // The processor sends this as a single user message
        user_prompt_tokens: estimated_prompt_tokens,
        total_tokens: estimated_prompt_tokens,
    })
}

/// Gets the prompt that would be used to generate an implementation plan
#[command]
pub async fn get_implementation_plan_prompt_command(
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    project_structure: Option<String>,
    app_handle: AppHandle,
) -> AppResult<ImplementationPlanPromptResponse> {
    info!("Getting implementation plan prompt for task: {}", task_description);
    
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
    
    // Read file contents for relevant files (SAME LOGIC AS ImplementationPlanProcessor)
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
    
    // Generate the EXACT SAME prompt as ImplementationPlanProcessor
    let prompt = crate::prompts::implementation_plan::generate_enhanced_implementation_plan_prompt(
        &task_description,
        project_structure.as_deref(),
        &file_contents_map
    );
    
    // Extract the system prompt from the agent_instructions section
    let system_prompt = if prompt.contains("<agent_instructions>") {
        // Extract the content between <agent_instructions> and </agent_instructions>
        if let Some(start) = prompt.find("<agent_instructions>") {
            if let Some(end) = prompt.find("</agent_instructions>") {
                let start_content = start + "<agent_instructions>".len();
                if start_content < end {
                    prompt[start_content..end]
                        .trim()
                        .lines()
                        .map(|line| line.trim())
                        .filter(|line| !line.is_empty())
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };
    
    // Create user prompt without the agent_instructions section
    let user_prompt = if prompt.contains("<agent_instructions>") {
        // Remove the entire agent_instructions section
        let mut result = prompt.clone();
        if let Some(start) = prompt.find("<agent_instructions>") {
            if let Some(end) = prompt.find("</agent_instructions>") {
                let end_tag = end + "</agent_instructions>".len();
                // Find the next newline after the closing tag to keep formatting clean
                let next_newline = prompt[end_tag..].find('\n').unwrap_or(0);
                result.replace_range(start..end_tag + next_newline, "");
                result.trim().to_string()
            } else {
                prompt.clone()
            }
        } else {
            prompt.clone()
        }
    } else {
        prompt.clone()
    };
    
    Ok(ImplementationPlanPromptResponse {
        system_prompt,
        user_prompt,
        combined_prompt: prompt,
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