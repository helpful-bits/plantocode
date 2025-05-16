use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use crate::error::{AppError, AppResult};
use crate::models::{TaskType, PathFinderCommandResponse};
use crate::utils::job_creation_utils;
use crate::db_utils::SessionRepository;

/// Request payload for the read directory job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReadDirectoryJobArgs {
    pub project_directory: String,
    pub session_id: String,
    pub exclude_patterns: Option<Vec<String>>,
}

/// Request payload for the directory tree generation job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGenerateDirectoryTreeJobArgs {
    pub project_directory: String,
    pub session_id: String,
    pub options: Option<crate::utils::directory_tree::DirectoryTreeOptions>,
}

/// Options for the PathFinder command
#[derive(Debug, Deserialize, Default, Clone)]
pub struct PathFinderOptionsArgs {
    pub include_file_contents: Option<bool>,
    pub max_files_with_content: Option<usize>,
    pub priority_file_types: Option<Vec<String>>,
    pub included_files: Option<Vec<String>>,
    pub excluded_files: Option<Vec<String>>,
}

/// Request arguments for finding relevant files
#[derive(Debug, Deserialize)]
pub struct PathFinderRequestArgs {
    pub session_id: String,
    pub task_description: String,
    pub project_directory: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub options: Option<PathFinderOptionsArgs>,
}

/// Create a job to find relevant files in the project
#[command]
pub async fn find_relevant_files_command(
    app_handle: AppHandle,
    args: PathFinderRequestArgs,
) -> AppResult<PathFinderCommandResponse> {
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
    
    // Determine effective model settings
    let model = if let Some(override_model) = args.model_override.clone() {
        override_model
    } else {
        match crate::config::get_model_for_task(TaskType::PathFinder) {
            Ok(model) => model,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get model for path finder: {}", e)));
            }
        }
    };
    
    let temperature = if let Some(override_temp) = args.temperature_override {
        override_temp
    } else {
        match crate::config::get_default_temperature_for_task(Some(TaskType::PathFinder)) {
            Ok(temp) => temp,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get temperature for path finder: {}", e)));
            }
        }
    };
    
    let max_tokens = if let Some(override_tokens) = args.max_tokens_override {
        override_tokens
    } else {
        match crate::config::get_default_max_tokens_for_task(Some(TaskType::PathFinder)) {
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
    Ok(PathFinderCommandResponse { job_id })
}

/// Create a background job to generate a directory tree
#[command]
pub async fn create_generate_directory_tree_job_command(
    app_handle: AppHandle,
    args: CreateGenerateDirectoryTreeJobArgs,
) -> AppResult<String> {
    info!("Creating generate directory tree job for path: {}", args.project_directory);
    
    // Validate project directory
    if args.project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    // Validate session ID
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    // Create the payload for the GenerateDirectoryTreeProcessor
    let payload = crate::jobs::types::GenerateDirectoryTreePayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        project_directory: args.project_directory.clone(),
        options: args.options.clone(),
    };
    
    // Use job creation utility to create and queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "filesystem",
        TaskType::GenerateDirectoryTree,
        "GENERATE_DIRECTORY_TREE",
        &format!("Generate directory tree for: {}", args.project_directory),
        (String::new(), 0.0, 0), // No model needed for filesystem operations
        serde_json::to_value(payload).map_err(|e| 
            AppError::SerdeError(e.to_string()))?,
        1, // Priority
        None, // No extra metadata
        &app_handle, // Add app_handle parameter
    ).await?;
    
    info!("Created generate directory tree job: {}", job_id);
    Ok(job_id)
}

/// Create a background job to read a directory
#[command(name = "task_create_read_directory_job_command")]
pub async fn task_create_read_directory_job_command(
    app_handle: AppHandle,
    args: CreateReadDirectoryJobArgs,
) -> AppResult<String> {
    info!("Creating read directory job for path: {}", args.project_directory);
    
    // Validate project directory
    if args.project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    // Validate session ID
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    // Create the payload for the ReadDirectoryProcessor
    let payload = crate::jobs::types::ReadDirectoryPayloadStruct {
        path: args.project_directory.clone(),
        exclude_patterns: args.exclude_patterns.clone(),
    };
    
    // Use job creation utility to create and queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "filesystem",
        TaskType::ReadDirectory,
        "READ_DIRECTORY",
        &format!("Read directory: {}", args.project_directory),
        (String::new(), 0.0, 0), // No model needed for filesystem operations
        serde_json::to_value(payload).map_err(|e| 
            AppError::SerdeError(e.to_string()))?,
        1, // Priority
        None, // No extra metadata
        &app_handle, // Add app_handle parameter
    ).await?;
    
    info!("Created read directory job: {}", job_id);
    Ok(job_id)
}