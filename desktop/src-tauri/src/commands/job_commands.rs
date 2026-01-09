use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::{BackgroundJob, TaskType};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
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

    let job_opt = repo.get_job_by_id(&job_id)
        .await
        .ok()
        .flatten();

    let preserved_task_type = job_opt.as_ref().map(|j| j.task_type.clone());
    let preserved_session_id = job_opt.as_ref().map(|j| j.session_id.clone()).unwrap_or_default();

    // Resolve project_hash from session
    let session_repo = crate::db_utils::SessionRepository::new(repo.get_pool());
    let project_hash = if !preserved_session_id.is_empty() {
        session_repo
            .get_session_by_id(&preserved_session_id)
            .await
            .ok()
            .flatten()
            .map(|s| s.project_hash)
    } else {
        None
    };

    repo.delete_job(&job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to delete job: {}", e)))?;

    crate::remote_api::handlers::jobs::invalidate_job_list_for_session(&app_handle, &preserved_session_id);
    if let Some(ref ph) = project_hash {
        crate::remote_api::handlers::jobs::invalidate_job_list_for_project(&app_handle, ph);
    }

    emit_job_deleted(
        &app_handle,
        JobDeletedEvent {
            job_id: job_id.clone(),
            session_id: preserved_session_id,
        },
    );

    if let Some(task_type) = preserved_task_type {
        if task_type == "implementation_plan" || task_type == "implementation_plan_merge" {
            app_handle.emit(
                "device-link-event",
                serde_json::json!({
                    "type": "PlanDeleted",
                    "payload": { "jobId": job_id }
                })
            ).ok();
        }
    }

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

    let job_opt = repo.get_job_by_id(&job_id)
        .await
        .ok()
        .flatten();

    let preserved_session_id = job_opt.as_ref().map(|j| j.session_id.clone()).unwrap_or_default();

    // Resolve project_hash from session
    let session_repo = crate::db_utils::SessionRepository::new(repo.get_pool());
    let project_hash = if !preserved_session_id.is_empty() {
        session_repo
            .get_session_by_id(&preserved_session_id)
            .await
            .ok()
            .flatten()
            .map(|s| s.project_hash)
    } else {
        None
    };

    repo.cancel_job(&job_id, "Canceled by user")
        .await
        .map_err(|e| AppError::JobError(format!("Failed to cancel job: {}", e)))?;

    crate::remote_api::handlers::jobs::invalidate_job_list_for_session(&app_handle, &preserved_session_id);
    if let Some(ref ph) = project_hash {
        crate::remote_api::handlers::jobs::invalidate_job_list_for_project(&app_handle, ph);
    }

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
    project_directory: Option<String>,
    session_id: Option<String>,
    app_handle: AppHandle,
) -> AppResult<Vec<crate::models::BackgroundJob>> {
    // Default to including content for backwards compatibility with desktop
    get_all_visible_jobs_command_with_content(project_directory, session_id, true, app_handle).await
}

/// Internal version that accepts includeContent parameter
pub async fn get_all_visible_jobs_command_with_content(
    project_directory: Option<String>,
    session_id: Option<String>,
    _include_content: bool,
    app_handle: AppHandle,
) -> AppResult<Vec<crate::models::BackgroundJob>> {
    info!(
        "Fetching all visible jobs for project: {:?}, session: {:?}",
        project_directory, session_id
    );

    let repo = app_handle
        .state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();

    let mut jobs = if let Some(sess_id) = session_id {
        // Honor session_id FIRST, regardless of project_directory
        repo.get_all_visible_jobs_for_session(&sess_id)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to get all visible jobs: {}", e))
            })?
    } else if let Some(dir) = project_directory {
        let project_hash = crate::utils::hash_utils::generate_project_hash(&dir);
        repo.get_all_visible_jobs_for_project(&project_hash)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to get all visible jobs: {}", e))
            })?
    } else {
        repo.get_all_visible_jobs().await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to get all visible jobs: {}", e))
        })?
    };

    Ok(jobs)
}
