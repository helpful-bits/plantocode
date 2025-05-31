use tauri::{command, AppHandle};
use log::info;
use serde::Deserialize;
use crate::error::{AppError, AppResult};
use crate::models::{TaskType, JobCommandResponse};
use crate::jobs::types::RegexPatternGenerationPayload;

/// Arguments for regex generation command (for the command handler service)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRegexArgs {
    pub session_id: String,
    pub project_directory: String,
    pub description: String,
    pub examples: Option<Vec<String>>,
    pub target_language: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub target_field: Option<String>,
}

/// Arguments for regex pattern generation command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRegexPatternsArgs {
    pub session_id: String,
    pub project_directory: String,
    pub task_description: String,
    pub directory_tree: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
}


/// Command to generate regex patterns for filtering based on task description
#[command]
pub async fn generate_regex_patterns_command(
    session_id: String,
    project_directory: String,
    task_description: String,
    directory_tree: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    app_handle: AppHandle
) -> AppResult<JobCommandResponse> {
    info!("Creating regex pattern generation job for task: {}", task_description);
    
    // Recreate args struct for internal use
    let args = GenerateRegexPatternsArgs {
        session_id,
        project_directory,
        task_description,
        directory_tree,
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
    
    // Get model configuration for this task using centralized resolver
    let (model, temperature, max_output_tokens) = crate::utils::resolve_model_settings(
        &app_handle,
        TaskType::RegexPatternGeneration,
        &args.project_directory,
        args.model_override.clone(),
        args.temperature_override,
        args.max_tokens_override,
    ).await?;
    
    // Create the payload for the RegexPatternGenerationProcessor
    let processor_payload = RegexPatternGenerationPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        task_description: args.task_description.clone(),
        project_directory: args.project_directory.clone(),
        directory_tree: args.directory_tree.clone(),
        model_override: None, // Will be passed directly to create_and_queue_background_job
        temperature_override: None, // Will be passed directly to create_and_queue_background_job
        max_tokens_override: None, // Will be passed directly to create_and_queue_background_job
    };
    
    // Create additional metadata for the job
    let mut extra_metadata = serde_json::json!({
        "task_description": args.task_description,
    });
    
    // Add optional fields to metadata
    if let Some(directory_tree) = &args.directory_tree {
        extra_metadata["directory_tree"] = serde_json::to_value(directory_tree)
            .map_err(|e| AppError::SerdeError(e.to_string()))?;
    }
    
    // Use the job creation utility to create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "openrouter",
        TaskType::RegexPatternGeneration,
        "REGEX_PATTERN_GENERATION",
        &args.task_description,
        Some((model, temperature, max_output_tokens)),
        serde_json::to_value(processor_payload).map_err(|e| 
            AppError::SerdeError(e.to_string()))?,
        2, // Priority
        Some(extra_metadata),
        &app_handle,
    ).await?;
    
    info!("Created regex pattern generation job: {}", job_id);
    Ok(JobCommandResponse { job_id })
}

/// Command for generating regex (used by command handler service)
/// This is a compatibility function for the old interface
#[command]
pub async fn generate_regex_command(
    session_id: String,
    project_directory: String,
    description: String,
    examples: Option<Vec<String>>,
    target_language: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    target_field: Option<String>,
    app_handle: AppHandle
) -> AppResult<String> {
    info!("Creating regex generation job for description: {}", description);
    
    // Convert to the new pattern generation command format
    let result = generate_regex_patterns_command(
        session_id,
        project_directory,
        description,
        None, // directory_tree
        model_override,
        temperature_override,
        max_tokens_override,
        app_handle
    ).await?;
    
    Ok(result.job_id)
}