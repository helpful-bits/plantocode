use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use crate::error::{AppError, AppResult};
use crate::models::{TaskType, JobCommandResponse};
use crate::jobs::types::JobPayload;
use crate::utils::job_creation_utils;
use crate::db_utils::{SessionRepository, SettingsRepository};
use crate::utils::unified_prompt_system::{UnifiedPromptProcessor, UnifiedPromptContextBuilder};



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
    
    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::resolve_model_settings(
        &app_handle,
        TaskType::PathFinder,
        &project_directory,
        args.model_override.clone(),
        args.temperature_override,
        args.max_tokens_override,
    ).await?;
    
    // Construct PathFinderOptions from args.options
    let options = args.options.unwrap_or_default();
    let path_finder_options = crate::jobs::processors::path_finder_types::PathFinderOptions {
        include_file_contents: options.include_file_contents,
        max_files_with_content: options.max_files_with_content,
        priority_file_types: options.priority_file_types,
        included_files: options.included_files,
        excluded_files: options.excluded_files,
    };
    
    // Create PathFinderPayload directly for the processor
    let path_finder_payload = crate::jobs::types::PathFinderPayload {
        task_description: args.task_description.clone(),
        system_prompt: String::new(), // Will be populated by the processor
        directory_tree: args.directory_tree.clone(),
        relevant_file_contents: std::collections::HashMap::new(), // Will be populated by the processor
        estimated_input_tokens: None, // Will be calculated by the processor
        options: path_finder_options,
    };
    
    // Queue the job using typed JobPayload
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_directory,
        "openrouter",
        TaskType::PathFinder,
        "PATH_FINDER",
        &format!("Finding relevant files for task: {}", args.task_description.chars().take(50).collect::<String>()),
        model_settings,
        JobPayload::PathFinder(path_finder_payload),
        2, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No additional_params
        &app_handle,
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
    
    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::resolve_model_settings(
        &app_handle,
        TaskType::PathCorrection,
        &args.project_directory,
        args.model_override.clone(),
        args.temperature_override,
        args.max_tokens_override,
    ).await?;
    
    // Create payload for PathCorrectionProcessor
    let payload = crate::jobs::types::PathCorrectionPayload {
        paths_to_correct: args.paths_to_correct.clone(),
    };
    
    // Queue the job using typed JobPayload
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "openrouter",
        TaskType::PathCorrection,
        "PATH_CORRECTION",
        &format!("Correcting file paths: {}", args.paths_to_correct.chars().take(50).collect::<String>()),
        model_settings,
        JobPayload::PathCorrection(payload),
        2, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No additional_params
        &app_handle,
    ).await?;
    
    info!("Created path correction job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

/// Response for the estimate path finder tokens command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenEstimateResponse {
    pub estimated_tokens: u32,
    pub system_prompt_tokens: u32,
    pub user_prompt_tokens: u32,
    pub total_tokens: u32,
}

/// Estimates the number of tokens a path finder prompt would use
#[command]
pub async fn estimate_path_finder_tokens_command(
    session_id: String,
    task_description: String,
    project_directory: Option<String>,
    options: Option<PathFinderOptionsArgs>,
    directory_tree: Option<String>,
    app_handle: AppHandle,
) -> AppResult<TokenEstimateResponse> {
    info!("Estimating tokens for path finder prompt");
    
    // Validate required fields
    if session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if task_description.is_empty() {
        return Err(AppError::ValidationError("Task description is required".to_string()));
    }
    
    // Determine project directory
    let project_directory = if let Some(dir) = project_directory {
        if dir.is_empty() {
            return Err(AppError::ValidationError("Project directory cannot be empty".to_string()));
        }
        dir
    } else {
        // Try to get project directory from session
        let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
        
        let session = session_repo.get_session_by_id(&session_id)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to get session: {}", e)))?
            .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", session_id)))?;
        
        if session.project_directory.is_empty() {
            return Err(AppError::ValidationError("Project directory not found in session".to_string()));
        }
        
        session.project_directory
    };
    
    // Generate directory tree if not provided
    let directory_tree = if let Some(tree) = directory_tree {
        tree
    } else {
        let path = std::path::Path::new(&project_directory);
        if !crate::utils::fs_utils::file_exists(path).await {
            return Err(AppError::FileSystemError(format!("Directory does not exist: {}", project_directory)));
        }
        
        let tree_options = crate::utils::directory_tree::DirectoryTreeOptions::default();
        crate::utils::directory_tree::generate_directory_tree(path, tree_options).await?
    };
    
    // Read file contents for included files (if specified in options)
    let mut file_contents_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    
    if let Some(opts) = &options {
        if let Some(included_files) = &opts.included_files {
            for relative_path_str in included_files {
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
        }
    }
    
    // Get settings repository for UnifiedPromptProcessor
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create unified prompt context for PathFinder
    let context = UnifiedPromptContextBuilder::new(
        project_directory.clone(),
        TaskType::PathFinder,
        task_description.clone(),
    )
    .directory_tree(Some(directory_tree))
    .file_contents(if file_contents_map.is_empty() { None } else { Some(file_contents_map) })
    .build();

    // Use UnifiedPromptProcessor to generate the complete prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &app_handle)
        .await?;
    
    // Estimate the number of tokens in the final prompt
    let estimated_prompt_tokens = composed_prompt.estimated_tokens.unwrap_or(0) as u32;
    
    Ok(TokenEstimateResponse {
        estimated_tokens: estimated_prompt_tokens,
        system_prompt_tokens: 0, // The processor sends this as a single user message
        user_prompt_tokens: estimated_prompt_tokens,
        total_tokens: estimated_prompt_tokens,
    })
}

