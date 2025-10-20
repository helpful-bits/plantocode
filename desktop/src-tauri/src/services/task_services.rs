//! Service functions for creating and managing tasks.

use crate::commands::text_commands::ImproveTextArgs;
use crate::error::AppResult;
use crate::jobs::types::{JobPayload, RegexFileFilterPayload};
use crate::models::{JobCommandResponse, PathFinderRequestArgs};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Creates a background job to find relevant files for a given task description.
pub async fn create_path_finder_job_service(
    app_handle: &AppHandle,
    args: PathFinderRequestArgs,
) -> AppResult<JobCommandResponse> {
    use crate::error::AppError;
    use crate::models::TaskType;
    use crate::utils::job_creation_utils;
    use log::info;

    info!(
        "Creating path finder job for task: {}",
        args.task_description
    );

    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError(
            "Session ID is required".to_string(),
        ));
    }

    if args.task_description.is_empty() {
        return Err(AppError::ValidationError(
            "Task description is required".to_string(),
        ));
    }

    // Determine project directory
    let project_directory = if let Some(dir) = args.project_directory.clone() {
        if dir.is_empty() {
            return Err(AppError::ValidationError(
                "Project directory cannot be empty".to_string(),
            ));
        }
        dir
    } else {
        // Get project directory from session via cache (avoid stale DB reads)
        let cache = app_handle
            .state::<Arc<crate::services::SessionCache>>()
            .inner()
            .clone();

        let session = cache
            .get_session(app_handle, &args.session_id)
            .await
            .map_err(|e| AppError::NotFoundError(format!("Session not found: {}", e)))?;

        if session.project_directory.is_empty() {
            return Err(AppError::ValidationError(
                "Project directory not found in session".to_string(),
            ));
        }

        session.project_directory
    };

    // Get the model for this task - check project settings first, then server defaults
    let model = if let Some(override_model) = args.model.clone() {
        override_model
    } else {
        match crate::utils::config_helpers::get_model_for_task(
            TaskType::RegexFileFilter,
            app_handle,
        )
        .await
        {
            Ok(model) => model,
            Err(e) => {
                return Err(AppError::ConfigError(format!(
                    "Failed to get model for path finder: {}",
                    e
                )));
            }
        }
    };

    // Get temperature for this task - check project settings first, then server defaults
    let temperature = if let Some(override_temp) = args.temperature {
        override_temp
    } else {
        match crate::utils::config_helpers::get_default_temperature_for_task(
            Some(TaskType::RegexFileFilter),
            app_handle,
        )
        .await
        {
            Ok(temp) => temp,
            Err(e) => {
                return Err(AppError::ConfigError(format!(
                    "Failed to get temperature for path finder: {}",
                    e
                )));
            }
        }
    };

    // Get max tokens for this task - check project settings first, then server defaults
    let max_tokens = if let Some(override_tokens) = args.max_tokens {
        override_tokens
    } else {
        match crate::utils::config_helpers::get_default_max_tokens_for_task(
            Some(TaskType::RegexFileFilter),
            app_handle,
        )
        .await
        {
            Ok(tokens) => tokens,
            Err(e) => {
                return Err(AppError::ConfigError(format!(
                    "Failed to get max tokens for path finder: {}",
                    e
                )));
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

    // Create regex file filter payload (the format expected by the processor)
    let payload = RegexFileFilterPayload {
        task_description: args.task_description.clone(),
        root_directories: vec![], // Will be populated by workflow orchestrator
    };

    // Wrap in JobPayload enum
    let typed_payload = JobPayload::RegexFileFilter(payload);

    // Convert AppError to CommandError for job_creation_utils
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_directory,
        "openrouter",
        TaskType::RegexFileFilter,
        "PATH_FINDER",
        &format!("Find relevant files for task: {}", args.task_description),
        Some((model, temperature, max_tokens)),
        typed_payload,
        1,    // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No extra metadata
        app_handle,
    )
    .await
    .map_err(|e| {
        AppError::ApplicationError(format!(
            "Failed to create path finder job: {}",
            e.to_string()
        ))
    })?;

    info!("Created path finder job: {}", job_id);

    // Return the response
    Ok(JobCommandResponse { job_id })
}
