use tauri::{command, AppHandle, Manager};
use log::info;
use crate::error::{AppError, AppResult};
use std::sync::Arc;
use serde::{Serialize, Deserialize};


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
        .map_err(|e| AppError::DatabaseError(format!("Failed to delete job: {}", e)))
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

    // Get all active jobs for the session to handle workflow-aware cancellation
    let active_jobs = repo.get_jobs_by_session_id(&session_id)
        .await
        .map_err(|e| AppError::JobError(format!("Failed to get jobs by session ID: {}", e)))?;

    // Filter for active jobs and exclude implementation plans
    let active_statuses = vec![
        crate::models::JobStatus::Created.to_string(),
        crate::models::JobStatus::Running.to_string(),
        crate::models::JobStatus::Queued.to_string(),
        crate::models::JobStatus::AcknowledgedByWorker.to_string(),
        crate::models::JobStatus::Idle.to_string(),
        crate::models::JobStatus::Preparing.to_string(),
    ];

    let mut cancelled_count = 0;
    
    for job in active_jobs {
        // Skip if not in active status
        if !active_statuses.contains(&job.status) {
            continue;
        }
        
        // Skip implementation plans
        if job.task_type == crate::models::TaskType::ImplementationPlan.to_string() {
            continue;
        }
        
        // Check if this job is part of a workflow
        let is_workflow_job = if let Some(metadata_str) = &job.metadata {
            if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata_str) {
                metadata_json.get("workflowId").is_some()
            } else {
                false
            }
        } else {
            false
        };
        
        if is_workflow_job {
            // For workflow jobs, use the orchestrator to handle cancellation properly
            match crate::jobs::workflow_orchestrator::get_workflow_orchestrator().await {
                Ok(orchestrator) => {
                    if let Err(e) = orchestrator.update_job_status(
                        &job.id, 
                        crate::models::JobStatus::Canceled, 
                        Some("Canceled by session action".to_string()),
                        None,
                        None
                    ).await {
                        log::warn!("Failed to cancel workflow job {} via orchestrator: {}. Falling back to direct cancellation.", job.id, e);
                        if let Err(e2) = repo.cancel_job(&job.id, "Canceled by session action").await {
                            log::warn!("Failed to cancel job {} directly: {}", job.id, e2);
                        } else {
                            cancelled_count += 1;
                        }
                    } else {
                        cancelled_count += 1;
                    }
                },
                Err(e) => {
                    log::warn!("Could not get workflow orchestrator to cancel workflow job {}: {}. Using direct cancellation.", job.id, e);
                    if let Err(e2) = repo.cancel_job(&job.id, "Canceled by session action").await {
                        log::warn!("Failed to cancel job {} directly: {}", job.id, e2);
                    } else {
                        cancelled_count += 1;
                    }
                }
            }
        } else {
            // For non-workflow jobs, use direct cancellation via repository
            if let Err(e) = repo.cancel_job(&job.id, "Canceled by session action").await {
                log::warn!("Failed to cancel job {}: {}", job.id, e);
            } else {
                cancelled_count += 1;
            }
        }
    }

    Ok(cancelled_count)
}