//! Service functions for creating and managing tasks.

use tauri::{AppHandle, Manager};
use serde::{Serialize, Deserialize};
use crate::error::AppResult;
use crate::commands::text_commands::CorrectTextArgs;
use crate::models::{PathFinderRequestArgs, JobCommandResponse};
use crate::db_utils::SessionRepository;
use crate::jobs::types::{JobPayload, PathFinderPayload};
use std::sync::Arc;


/// Creates a background job to find relevant files for a given task description.
pub async fn create_path_finder_job_service(
    app_handle: &AppHandle,
    args: PathFinderRequestArgs,
) -> AppResult<JobCommandResponse> {
    use log::info;
    use crate::error::AppError;
    use crate::models::TaskType;
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
    
    // Get the model for this task - check project settings first, then server defaults
    let model = if let Some(override_model) = args.model.clone() {
        override_model
    } else {
        match crate::config::get_model_for_task_with_project(TaskType::PathFinder, &project_directory, app_handle).await {
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
        match crate::config::get_temperature_for_task_with_project(TaskType::PathFinder, &project_directory, app_handle).await {
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
        match crate::config::get_max_tokens_for_task_with_project(TaskType::PathFinder, &project_directory, app_handle).await {
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
    
    // Create path finder payload (the format expected by the processor)
    let payload = PathFinderPayload {
        task_description: args.task_description.clone(),
        system_prompt: String::new(), // Will be populated by the processor
        directory_tree: None, // Will be populated by the processor
        relevant_file_contents: std::collections::HashMap::new(), // Will be populated by the processor
        estimated_input_tokens: None, // Will be calculated by the processor
        options,
    };
    
    // Wrap in JobPayload enum
    let typed_payload = JobPayload::PathFinder(payload);
    
    // Convert AppError to CommandError for job_creation_utils
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_directory,
        "openrouter",
        TaskType::PathFinder,
        "PATH_FINDER",
        &format!("Find relevant files for task: {}", args.task_description),
        Some((model, temperature, max_tokens)),
        typed_payload,
        1, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No extra metadata
        app_handle
    )
    .await
    .map_err(|e| AppError::ApplicationError(format!("Failed to create path finder job: {}", e.to_string())))?;
    
    info!("Created path finder job: {}", job_id);
    
    // Return the response
    Ok(JobCommandResponse { job_id })
}

