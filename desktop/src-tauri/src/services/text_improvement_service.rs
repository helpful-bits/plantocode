//! Service functions for text improvement.

use tauri::{AppHandle, Manager};
use log::info;
use crate::error::{AppResult, AppError};
use crate::models::{TaskType, JobCommandResponse};
use crate::jobs::types::JobPayload;
use crate::utils::job_creation_utils;
use crate::commands::text_commands::ImproveTextArgs;
use crate::db_utils::SessionRepository;
use std::sync::Arc;

/// Creates a background job to improve text for clarity and grammar.
pub async fn create_text_improvement_job_service(
    app_handle: &AppHandle, 
    args: ImproveTextArgs,
) -> AppResult<JobCommandResponse> {
    info!("Improving text for clarity and grammar");

    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }

    if args.text.is_empty() {
        return Err(AppError::ValidationError("Text to improve is required".to_string()));
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
        app_handle,
        TaskType::TextImprovement,
        &project_directory,
        args.model_override.clone(),
        args.temperature_override,
        args.max_tokens_override,
    ).await?;

    // Create text improvement payload
    let payload = crate::jobs::types::TextImprovementPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        project_directory: Some(project_directory.clone()),
        text_to_improve: args.text.clone(),
        target_field: args.target_field.clone(),
    };

    // Additional params specific to text improvement
    let additional_params = serde_json::json!({
        "targetField": args.target_field,
    });

    // Use job creation utility
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_directory,
        "openrouter",
        TaskType::TextImprovement,
        "TEXT_IMPROVEMENT",
        "Improve text clarity and grammar",
        model_settings,
        JobPayload::TextImprovement(payload),
        2, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        Some(additional_params),
        app_handle
    )
    .await
    .map_err(|e| AppError::ApplicationError(format!("Failed to create text improvement job: {}", e.to_string())))?;

    info!("Created text improvement job: {}", job_id);
    Ok(JobCommandResponse { job_id })
}