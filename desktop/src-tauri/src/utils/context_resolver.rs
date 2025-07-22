use crate::db_utils::session_repository::SessionRepository;
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, TaskType};
use crate::utils::directory_tree;
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Resolve project directory from session
pub async fn get_project_directory_from_session(
    session_id: &str,
    app_handle: &AppHandle,
) -> AppResult<String> {
    let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
    let session = session_repo
        .get_session_by_id(session_id)
        .await?
        .ok_or_else(|| AppError::NotFoundError(format!("Session {} not found", session_id)))?;
    Ok(session.project_directory)
}

/// Get directory tree from session ID
/// This utility function fetches the project directory from the session
/// and generates a directory tree, avoiding repeated session lookups
pub async fn get_directory_tree_from_session(
    session_id: &str,
    app_handle: &AppHandle,
) -> AppResult<String> {
    let project_directory = get_project_directory_from_session(session_id, app_handle).await?;
    directory_tree::get_directory_tree_with_defaults(&project_directory).await
}

/// Get API type from TaskType
pub fn get_api_type_from_task_type(task_type: &str) -> AppResult<String> {
    let task_type_enum = TaskType::from_str(task_type)
        .map_err(|_| AppError::ValidationError(format!("Invalid task type: {}", task_type)))?;
    Ok(task_type_enum.api_type().to_string())
}

/// Calculate total tokens from sent + received
pub fn calculate_total_tokens(job: &BackgroundJob) -> i32 {
    job.tokens_sent.unwrap_or(0) + job.tokens_received.unwrap_or(0)
}

/// Get response length in characters
pub fn get_response_length(job: &BackgroundJob) -> i32 {
    job.response.as_ref().map(|r| r.len() as i32).unwrap_or(0)
}

/// Get context data for job processing
pub async fn resolve_job_context(
    job: &BackgroundJob,
    app_handle: &AppHandle,
) -> AppResult<JobContext> {
    let project_directory = get_project_directory_from_session(&job.session_id, app_handle).await?;
    let api_type = get_api_type_from_task_type(&job.task_type)?;
    let total_tokens = calculate_total_tokens(job);
    let response_length = get_response_length(job);

    Ok(JobContext {
        project_directory,
        api_type,
        total_tokens,
        response_length,
    })
}

/// Context data resolved from job and session
#[derive(Debug, Clone)]
pub struct JobContext {
    pub project_directory: String,
    pub api_type: String,
    pub total_tokens: i32,
    pub response_length: i32,
}
