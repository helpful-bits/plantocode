use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use crate::error::{AppError, AppResult};
use crate::models::{TaskType, JobCommandResponse};
use crate::utils::job_creation_utils;
use crate::db_utils::SessionRepository;



/// Options for the PathFinder command
#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderOptionsArgs {
    pub include_file_contents: Option<bool>,
    pub max_files_with_content: Option<usize>,
    pub priority_file_types: Option<Vec<String>>,
    pub included_files: Option<Vec<String>>,
    pub excluded_files: Option<Vec<String>>,
}

/// Request arguments for finding relevant files
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderRequestArgs {
    pub session_id: String,
    pub task_description: String,
    pub project_directory: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub options: Option<PathFinderOptionsArgs>,
    pub directory_tree: Option<String>,
}

/// Request arguments for path correction job
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePathCorrectionJobArgs {
    pub session_id: String,
    pub project_directory: String,
    pub paths_to_correct: String,
    pub context_description: Option<String>,
    pub directory_tree: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
}

/// Create a job to find relevant files in the project
#[command]
pub async fn find_relevant_files_command(
    session_id: String,
    task_description: String,
    project_directory: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    options: Option<PathFinderOptionsArgs>,
    directory_tree: Option<String>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = PathFinderRequestArgs {
        session_id,
        task_description,
        project_directory,
        model_override,
        temperature_override,
        max_tokens_override,
        options,
        directory_tree,
    };
    info!("Finding relevant files for task: {}", args.task_description);
    
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
    
    // Determine effective model settings - check project settings first, then server defaults
    let model = if let Some(override_model) = args.model_override.clone() {
        override_model
    } else {
        match crate::config::get_model_for_task_with_project(TaskType::PathFinder, &project_directory, &app_handle).await {
            Ok(model) => model,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get model for path finder: {}", e)));
            }
        }
    };
    
    let temperature = if let Some(override_temp) = args.temperature_override {
        override_temp
    } else {
        match crate::config::get_temperature_for_task_with_project(TaskType::PathFinder, &project_directory, &app_handle).await {
            Ok(temp) => temp,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get temperature for path finder: {}", e)));
            }
        }
    };
    
    let max_tokens = if let Some(override_tokens) = args.max_tokens_override {
        override_tokens
    } else {
        match crate::config::get_max_tokens_for_task_with_project(TaskType::PathFinder, &project_directory, &app_handle).await {
            Ok(tokens) => tokens,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get max tokens for path finder: {}", e)));
            }
        }
    };
    
    // Construct PathFinderOptions from args.options
    let options = args.options.unwrap_or_default();
    let path_finder_options = crate::jobs::processors::path_finder_types::PathFinderOptions {
        include_file_contents: options.include_file_contents,
        max_files_with_content: options.max_files_with_content,
        priority_file_types: options.priority_file_types,
        included_files: options.included_files,
        excluded_files: options.excluded_files,
    };
    
    // Create input payload for PathFinderProcessor
    let input_payload = crate::jobs::types::InputPathFinderPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        task_description: args.task_description.clone(),
        project_directory: project_directory.clone(),
        model_override: Some(model.clone()),
        temperature_override: Some(temperature),
        max_tokens_override: Some(max_tokens),
        options: path_finder_options,
        directory_tree: args.directory_tree,
    };
    
    // Queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_directory,
        "openrouter",
        TaskType::PathFinder,
        "PATH_FINDER",
        &format!("Finding relevant files for task: {}", args.task_description.chars().take(50).collect::<String>()),
        (model, temperature, max_tokens),
        serde_json::to_value(input_payload).map_err(|e| AppError::SerdeError(e.to_string()))?,
        2, // Priority
        None, // No extra metadata
        &app_handle, // Add app_handle parameter
    ).await?;
    
    info!("Created path finder job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

/// Generate a directory tree directly
#[command]
pub async fn generate_directory_tree_command(
    project_directory: String,
    options: Option<crate::utils::directory_tree::DirectoryTreeOptions>,
) -> AppResult<String> {
    info!("Generating directory tree for path: {}", project_directory);
    
    // Validate project directory
    if project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    let path = std::path::Path::new(&project_directory);
    
    // Check if the directory exists
    if !crate::utils::fs_utils::file_exists(path).await {
        return Err(AppError::FileSystemError(format!("Directory does not exist: {}", project_directory)));
    }
    
    // Check if the path is a directory
    if !crate::utils::fs_utils::is_directory(path).await? {
        return Err(AppError::FileSystemError(format!("Path is not a directory: {}", project_directory)));
    }
    
    // Generate the directory tree using the existing utility
    let options = options.unwrap_or_default();
    let tree = crate::utils::directory_tree::generate_directory_tree(path, options).await?;
    
    info!("Successfully generated directory tree for: {}", project_directory);
    Ok(tree)
}

/// Create a background job to correct file paths
#[command]
pub async fn create_path_correction_job_command(
    session_id: String,
    project_directory: String,
    paths_to_correct: String,
    context_description: Option<String>,
    directory_tree: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = CreatePathCorrectionJobArgs {
        session_id,
        project_directory,
        paths_to_correct,
        context_description,
        directory_tree,
        model_override,
        temperature_override,
        max_tokens_override,
    };
    
    info!("Creating path correction job for paths: {}", args.paths_to_correct.chars().take(100).collect::<String>());
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    if args.paths_to_correct.trim().is_empty() {
        return Err(AppError::ValidationError("Paths to correct are required".to_string()));
    }
    
    // Determine effective model settings - check project settings first, then server defaults
    let model = if let Some(override_model) = args.model_override.clone() {
        override_model
    } else {
        match crate::config::get_model_for_task_with_project(TaskType::PathCorrection, &args.project_directory, &app_handle).await {
            Ok(model) => model,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get model for path correction: {}", e)));
            }
        }
    };
    
    let temperature = if let Some(override_temp) = args.temperature_override {
        override_temp
    } else {
        match crate::config::get_temperature_for_task_with_project(TaskType::PathCorrection, &args.project_directory, &app_handle).await {
            Ok(temp) => temp,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get temperature for path correction: {}", e)));
            }
        }
    };
    
    let max_tokens = if let Some(override_tokens) = args.max_tokens_override {
        override_tokens
    } else {
        match crate::config::get_max_tokens_for_task_with_project(TaskType::PathCorrection, &args.project_directory, &app_handle).await {
            Ok(tokens) => tokens,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get max tokens for path correction: {}", e)));
            }
        }
    };
    
    // Create payload for PathCorrectionProcessor
    let payload = crate::jobs::types::PathCorrectionPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        paths_to_correct: args.paths_to_correct.clone(),
        context_description: args.context_description.unwrap_or_else(|| "No additional context provided".to_string()),
        directory_tree: args.directory_tree,
        system_prompt_override: None,
        model_override: Some(model.clone()),
        temperature: Some(temperature),
        max_output_tokens: Some(max_tokens),
    };
    
    // Queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "openrouter",
        TaskType::PathCorrection,
        "PATH_CORRECTION",
        &format!("Correcting file paths: {}", args.paths_to_correct.chars().take(50).collect::<String>()),
        (model, temperature, max_tokens),
        serde_json::to_value(payload).map_err(|e| AppError::SerdeError(e.to_string()))?,
        2, // Priority
        None, // No extra metadata
        &app_handle,
    ).await?;
    
    info!("Created path correction job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

