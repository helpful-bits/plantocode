//! Job Processor Utilities
//! 
//! This module provides core job lifecycle management utilities.
//! For specialized utilities, see the `processors::utils` modules:
//! - `llm_api_utils`: LLM API interactions and message formatting
//! - `prompt_utils`: Prompt building and composition
//! 
//! ## Standard Processor Pattern:
//! 1. Use `setup_job_processing()` to initialize repos and mark job as running
//! 2. Use `check_job_canceled()` at key points to handle cancellation
//! 3. Use `finalize_job_success()` or `finalize_job_failure()` for completion
//!
//! ## Cost Handling Policy:
//! The desktop client NEVER calculates costs locally. All cost calculations are performed
//! server-side and returned as authoritative values in the `OpenRouterUsage.cost` field.
//! This ensures consistency across the application and prevents billing discrepancies.
//! All job processing components must rely exclusively on server-provided cost data.

use std::sync::Arc;
use tauri::{AppHandle, Manager, Emitter};
use log::{info, warn, error, debug};
use serde_json::Value;
use std::str::FromStr;

use crate::error::{AppError, AppResult};
use crate::models::{TaskType, JobStatus, OpenRouterUsage, Session};
use crate::db_utils::{BackgroundJobRepository, SettingsRepository, SessionRepository};
use crate::models::BackgroundJob;
use crate::api_clients::client_factory;
use crate::jobs::types::JobUIMetadata;
use crate::utils::job_metadata_builder::JobMetadataBuilder;

/// Setup repositories from app state and fetch the job, marking it as running
/// Returns (background_job_repo, session_repo, settings_repo, background_job)
pub async fn setup_job_processing(
    job_id: &str,
    app_handle: &AppHandle,
) -> AppResult<(Arc<BackgroundJobRepository>, Arc<SessionRepository>, Arc<SettingsRepository>, BackgroundJob)> {
    let repo = match app_handle.try_state::<Arc<BackgroundJobRepository>>() {
        Some(repo) => repo.inner().clone(),
        None => {
            return Err(AppError::InitializationError(
                "BackgroundJobRepository not available in app state. App initialization may be incomplete.".to_string()
            ));
        }
    };
    let session_repo = match app_handle.try_state::<Arc<SessionRepository>>() {
        Some(repo) => repo.inner().clone(),
        None => {
            return Err(AppError::InitializationError(
                "SessionRepository not available in app state. App initialization may be incomplete.".to_string()
            ));
        }
    };
    let settings_repo = match app_handle.try_state::<Arc<SettingsRepository>>() {
        Some(repo) => repo.inner().clone(),
        None => {
            return Err(AppError::InitializationError(
                "SettingsRepository not available in app state. App initialization may be incomplete.".to_string()
            ));
        }
    };
    
    // Fetch the job from database
    let background_job = repo
        .get_job_by_id(job_id)
        .await?
        .ok_or_else(|| AppError::JobError(format!("Background job {} not found", job_id)))?;
    
    // Update job status to running
    repo.mark_job_running(job_id).await?;
    
    Ok((repo, session_repo, settings_repo, background_job))
}

/// Log job processing start with standardized format
pub fn log_job_start(job_id: &str, task_name: &str) {
    info!("Processing {} job {}", task_name, job_id);
}

/// Get model name for task with optional override  
pub async fn get_model_name_for_context(
    task_type: TaskType,
    project_directory: &str,
    model_override: Option<String>,
    app_handle: &AppHandle,
) -> AppResult<String> {
    if let Some(model) = model_override {
        Ok(model)
    } else {
        crate::utils::config_helpers::get_model_for_task(task_type, app_handle).await
    }
}

/// Checks if job has been canceled
pub async fn check_job_canceled(
    repo: &BackgroundJobRepository,
    job_id: &str,
) -> AppResult<bool> {
    let job_status = match repo.get_job_by_id(job_id).await {
        Ok(Some(job)) => {
            JobStatus::from_str(&job.status)
                .unwrap_or(JobStatus::Created)
        }
        _ => JobStatus::Created,
    };
    
    Ok(job_status == JobStatus::Canceled)
}




pub async fn get_llm_task_config(
    job: &BackgroundJob,
    app_handle: &AppHandle,
    session: &crate::models::Session,
) -> AppResult<(String, f32, u32)> {
    let task_type = TaskType::from_str(&job.task_type)
        .map_err(|_| AppError::ValidationError(format!("Invalid task type: {}", job.task_type)))?;
    
    let config = crate::utils::config_resolver::resolve_model_settings(
        app_handle,
        task_type,
        &session.project_directory,
        None,
        None,
        None,
    ).await?;
    
    match config {
        Some((model, temperature, max_tokens)) => Ok((model, temperature, max_tokens)),
        None => Err(AppError::ConfigError(format!("Task {:?} does not require LLM configuration", task_type))),
    }
}

/// Emit a job update event
/// 
/// Emits a generic job update event to the frontend with any serializable payload
pub fn emit_job_update<T: serde::Serialize + Clone>(app_handle: &AppHandle, event_name: &str, payload: T) -> AppResult<()> {
    if let Err(e) = app_handle.emit(event_name, payload.clone()) {
        error!("Failed to emit {} event: {}", event_name, e);
        return Err(AppError::TauriError(format!("Failed to emit {} event: {}", event_name, e)));
    }
    
    debug!("Emitted {} event", event_name);
        
    Ok(())
}