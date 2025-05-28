//! Service functions for creating and managing tasks.

use tauri::AppHandle;
use serde::{Serialize, Deserialize};
use crate::error::AppResult;
use crate::commands::text_commands::CorrectTextPostTranscriptionArgs;
use crate::models::{PathFinderRequestArgs, JobCommandResponse};


/// Creates a background job to find relevant files for a given task description.
pub async fn create_path_finder_job_service(
    app_handle: &AppHandle,
    args: PathFinderRequestArgs,
) -> AppResult<JobCommandResponse> {
    use log::info;
    use crate::error::AppError;
    use crate::models::TaskType;
    use crate::SESSION_REPO;
    use crate::utils::job_creation_utils;
    
    info!("Creating path finder job for task: {}", args.task_description);
    
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
        let session_repo = SESSION_REPO
            .get()
            .ok_or_else(|| AppError::InitializationError("Session repository not initialized".to_string()))?
            .clone();

        let session = session_repo.get_session_by_id(&args.session_id)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to get session: {}", e)))?
            .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", args.session_id)))?;

        if session.project_directory.is_empty() {
            return Err(AppError::ValidationError("Project directory not found in session".to_string()));
        }

        session.project_directory
    };
    
    // Get the model for this task - check project settings first, then server defaults
    let model = if let Some(override_model) = args.model.clone() {
        override_model
    } else {
        match crate::config::get_model_for_task_with_project(TaskType::PathFinder, &project_directory).await {
            Ok(model) => model,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get model for path finder: {}", e)));
            }
        }
    };
    
    // Get temperature for this task - check project settings first, then server defaults
    let temperature = if let Some(override_temp) = args.temperature {
        override_temp
    } else {
        match crate::config::get_temperature_for_task_with_project(TaskType::PathFinder, &project_directory).await {
            Ok(temp) => temp,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get temperature for path finder: {}", e)));
            }
        }
    };
    
    // Get max tokens for this task - check project settings first, then server defaults
    let max_tokens = if let Some(override_tokens) = args.max_tokens {
        override_tokens
    } else {
        match crate::config::get_max_tokens_for_task_with_project(TaskType::PathFinder, &project_directory).await {
            Ok(tokens) => tokens,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get max tokens for path finder: {}", e)));
            }
        }
    };
    
    // Create path finder options
    let options = crate::jobs::processors::path_finder_types::PathFinderOptions {
        include_file_contents: args.include_file_contents,
        max_files_with_content: None, // Default will be used by processor
        priority_file_types: None,    // Default will be used by processor
        included_files: args.included_files,
        excluded_files: args.excluded_files,
    };
    
    // Create input payload
    let payload = crate::jobs::types::InputPathFinderPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        task_description: args.task_description.clone(),
        project_directory: project_directory.clone(),
        model_override: Some(model.clone()),
        temperature_override: Some(temperature),
        max_tokens_override: Some(max_tokens),
        options,
    };
    
    // Convert AppError to CommandError for job_creation_utils
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_directory,
        "openrouter",
        TaskType::PathFinder,
        "PATH_FINDER",
        &format!("Find relevant files for task: {}", args.task_description),
        (model, temperature, max_tokens),
        serde_json::to_value(payload)
            .map_err(|e| AppError::SerializationError(format!("Failed to serialize payload: {}", e)))?,
        1, // Priority
        None, // No extra metadata
        app_handle
    )
    .await
    .map_err(|e| AppError::ApplicationError(format!("Failed to create path finder job: {}", e.to_string())))?;
    
    info!("Created path finder job: {}", job_id);
    
    // Return the response
    Ok(JobCommandResponse { job_id })
}

