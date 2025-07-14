use tauri::{command, AppHandle, Manager, Emitter};
use log::info;
use crate::error::{AppError, AppResult};
use std::sync::Arc;
use serde::{Serialize, Deserialize};
use serde_json::json;


#[command]
pub async fn get_background_job_by_id_command(job_id: String, app_handle: AppHandle) -> AppResult<Option<crate::models::BackgroundJob>> {
    info!("Fetching background job by ID: {}", job_id);

    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.get_job_by_id(&job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get job by ID: {}", e)))
}

#[command]
pub async fn clear_job_history_command(days_to_keep: i64, app_handle: AppHandle) -> AppResult<()> {
    info!("Clearing job history with days_to_keep={}", days_to_keep);

    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.clear_job_history(days_to_keep)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to clear job history: {}", e)))
}

#[command]
pub async fn get_active_jobs_command(app_handle: AppHandle) -> AppResult<Vec<crate::models::BackgroundJob>> {
    info!("Fetching active jobs");

    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.get_all_visible_jobs_lightweight()
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get active jobs: {}", e)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBackgroundJobArgs {
    pub job_id: String,
}

#[command]
pub async fn delete_background_job_command(job_id: String, app_handle: AppHandle) -> AppResult<()> {
    info!("Deleting background job: {}", job_id);

    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.delete_job(&job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to delete job: {}", e)))?;

    app_handle.emit("job_deleted", json!({ "jobId": job_id }))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelJobArgs {
    pub job_id: String,
}

#[command]
pub async fn cancel_background_job_command(job_id: String, app_handle: AppHandle) -> AppResult<()> {
    info!("Cancelling background job: {}", job_id);

    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.cancel_job(&job_id, "Canceled by user")
        .await
        .map_err(|e| AppError::JobError(format!("Failed to cancel job: {}", e)))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelSessionJobsArgs {
    pub session_id: String,
}

#[command]
pub async fn cancel_session_jobs_command(session_id: String, app_handle: AppHandle) -> AppResult<usize> {
    info!("Cancelling all jobs for session: {}", session_id);

    // Get the repository
    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Use the single call to cancel session jobs
    let cancelled_count = repo.cancel_session_jobs(&session_id).await
        .map_err(|e| AppError::JobError(format!("Failed to cancel session jobs: {}", e)))?;

    Ok(cancelled_count)
}

#[command]
pub async fn get_all_visible_jobs_command(app_handle: AppHandle) -> AppResult<Vec<crate::models::BackgroundJob>> {
    info!("Fetching all visible jobs");

    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.get_all_visible_jobs_lightweight()
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get all visible jobs: {}", e)))
}