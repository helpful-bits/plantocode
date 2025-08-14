use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::{BackgroundJob, TaskType};
use log::{info, warn, error};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, command};

#[command]
pub async fn get_background_job_by_id_command(
    job_id: String,
    app_handle: AppHandle,
) -> AppResult<Option<crate::models::BackgroundJob>> {
    info!("Fetching background job by ID: {}", job_id);

    let repo = app_handle
        .state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.get_job_by_id(&job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get job by ID: {}", e)))
}

#[command]
pub async fn clear_job_history_command(days_to_keep: i64, app_handle: AppHandle) -> AppResult<()> {
    info!("Clearing job history with days_to_keep={}", days_to_keep);

    let repo = app_handle
        .state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.clear_job_history(days_to_keep)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to clear job history: {}", e)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBackgroundJobArgs {
    pub job_id: String,
}

#[command]
pub async fn delete_background_job_command(job_id: String, app_handle: AppHandle) -> AppResult<()> {
    info!("Deleting background job: {}", job_id);

    let repo = app_handle
        .state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    repo.delete_job(&job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to delete job: {}", e)))?;

    emit_job_deleted(&app_handle, JobDeletedEvent {
        job_id: job_id.clone(),
    });

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

    let repo = app_handle
        .state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Cancel the job
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
pub async fn cancel_session_jobs_command(
    session_id: String,
    app_handle: AppHandle,
) -> AppResult<usize> {
    info!("Cancelling all jobs for session: {}", session_id);

    // Get the repository
    let repo = app_handle
        .state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Use the single call to cancel session jobs
    let cancelled_count = repo
        .cancel_session_jobs(&session_id)
        .await
        .map_err(|e| AppError::JobError(format!("Failed to cancel session jobs: {}", e)))?;

    Ok(cancelled_count)
}

#[command]
pub async fn get_all_visible_jobs_command(
    app_handle: AppHandle,
) -> AppResult<Vec<crate::models::BackgroundJob>> {
    info!("Fetching all visible jobs");

    let repo = app_handle
        .state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    let mut jobs = repo
        .get_all_visible_jobs()
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get all visible jobs: {}", e)))?;

    // Strip large content from implementation plans to reduce payload size
    strip_implementation_plan_content(&mut jobs);

    Ok(jobs)
}

/// Strip large content from implementation plan jobs to reduce payload size
fn strip_implementation_plan_content(jobs: &mut Vec<BackgroundJob>) {
    for job in jobs.iter_mut() {
        if job.task_type == "implementation_plan" || job.task_type == "implementation_plan_merge" {
            job.response = Some("".to_string());
        }
    }
}

