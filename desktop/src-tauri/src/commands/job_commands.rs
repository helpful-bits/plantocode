use tauri::{command, AppHandle, Manager};
use log::info;
use crate::error::{AppError, AppResult};
use std::sync::Arc;
use serde::{Serialize, Deserialize};

#[command]
pub async fn update_job_cleared_status_command(job_id: String, cleared: bool, app_handle: AppHandle) -> AppResult<()> {
    info!("Updating job cleared status: job_id={}, cleared={}", job_id, cleared);

    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.update_job_cleared_status(&job_id, cleared)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to update job cleared status: {}", e)))
}

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

    repo.get_all_visible_jobs()
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get active jobs: {}", e)))
}

#[derive(Debug, Deserialize)]
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
        .map_err(|e| AppError::DatabaseError(format!("Failed to delete job: {}", e)))
}

#[derive(Debug, Deserialize)]
pub struct CancelJobArgs {
    pub job_id: String,
}

#[command]
pub async fn cancel_background_job_command(job_id: String, app_handle: AppHandle) -> AppResult<()> {
    info!("Cancelling background job: {}", job_id);

    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.cancel_job(&job_id)
        .await
        .map_err(|e| AppError::JobError(format!("Failed to cancel job: {}", e)))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
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

    // Cancel jobs in the in-memory queue
    match crate::jobs::queue::get_job_queue().await {
        Ok(queue) => {
            match queue.cancel_session_jobs(session_id.clone()).await {
                Ok(count) => info!("Removed {} jobs from queue for session {}", count, session_id),
                Err(e) => info!("Failed to cancel session jobs in queue: {}. Proceeding with DB update.", e),
            }
        },
        Err(e) => {
            info!("Could not get job queue to cancel session jobs: {}. Proceeding with DB update.", e);
        }
    }

    // Cancel jobs in the database
    let updated_count = repo.cancel_session_jobs(&session_id)
        .await
        .map_err(|e| AppError::JobError(format!("Failed to cancel session jobs in database: {}", e)))?;

    Ok(updated_count)
}