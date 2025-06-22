//! Job Processor Utilities
//! 
//! This module provides core job lifecycle management utilities.
//! For specialized utilities, see the `processors::utils` modules:
//! - `llm_api_utils`: LLM API interactions and message formatting
//! - `prompt_utils`: Prompt building and composition
//! - `fs_context_utils`: File system operations and directory trees
//! 
//! ## Standard Processor Pattern:
//! 1. Use `setup_job_processing()` to initialize repos and mark job as running
//! 2. Use `check_job_canceled()` at key points to handle cancellation
//! 3. Use `finalize_job_success()` or `finalize_job_failure()` for completion

use std::sync::Arc;
use tauri::{AppHandle, Manager};
use log::{info, warn, error};
use serde_json::Value;
use std::str::FromStr;

use crate::error::{AppError, AppResult};
use crate::models::{TaskType, JobStatus, OpenRouterUsage};
use crate::db_utils::{BackgroundJobRepository, SettingsRepository};
use crate::models::BackgroundJob;
use crate::api_clients::client_factory;
use crate::jobs::types::JobUIMetadata;
use crate::utils::job_metadata_builder::JobMetadataBuilder;

/// Setup repositories from app state and fetch the job, marking it as running
/// Returns (background_job_repo, settings_repo, background_job)
pub async fn setup_job_processing(
    job_id: &str,
    app_handle: &AppHandle,
) -> AppResult<(Arc<BackgroundJobRepository>, Arc<SettingsRepository>, BackgroundJob)> {
    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    
    // Fetch the job from database
    let background_job = repo
        .get_job_by_id(job_id)
        .await?
        .ok_or_else(|| AppError::JobError(format!("Background job {} not found", job_id)))?;
    
    // Update job status to running
    repo.mark_job_running(job_id).await?;
    
    Ok((repo, settings_repo, background_job))
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


/// Finalizes job success with response and usage information
/// Ensures all token counts (tokens_sent, tokens_received, total_tokens) are correctly updated from OpenRouterUsage
/// The metadata parameter accepts Option<serde_json::Value> for type safety and flexibility
/// Correctly merges provided metadata (additional_params) into existing JobWorkerMetadata structure
/// Centralized finalization logic used by LlmTaskRunner and other processors
pub async fn finalize_job_success(
    job_id: &str,
    repo: &BackgroundJobRepository,
    response_content: &str,
    llm_usage: Option<OpenRouterUsage>,
    model_used: &str,
    system_prompt_id: &str,
    system_prompt_template: &str,
    metadata: Option<Value>,
    app_handle: &AppHandle,
) -> AppResult<()> {
    // Cost tracking is handled by server billing service, not stored in local BackgroundJob
    let (tokens_sent, tokens_received) = if let Some(usage) = &llm_usage {
        (Some(usage.prompt_tokens), Some(usage.completion_tokens))
    } else {
        (None, None)
    };
    
    let db_job = repo.get_job_by_id(job_id).await?.ok_or_else(|| AppError::NotFoundError(format!("Job {} not found for finalization", job_id)))?;
    
    // Simple approach: Always try to parse as JobUIMetadata, create new if fails
    let final_metadata_str_for_repo = if let Some(metadata_str) = db_job.metadata.as_deref() {
        // Try to parse existing metadata as JobUIMetadata
        if let Ok(mut ui_meta) = serde_json::from_str::<JobUIMetadata>(metadata_str) {
            // Update existing JobUIMetadata with new data
            if let Some(new_data) = metadata {
                if let Value::Object(new_map) = new_data {
                    if let Value::Object(ref mut task_map) = ui_meta.task_data {
                        for (k, v) in new_map {
                            task_map.insert(k, v);
                        }
                    } else {
                        ui_meta.task_data = Value::Object(new_map);
                    }
                }
            }
            
            Some(serde_json::to_string(&ui_meta)
                .map_err(|e| AppError::SerializationError(format!("Failed to serialize JobUIMetadata for job {}: {}", job_id, e)))?)
        } else {
            // Existing metadata isn't JobUIMetadata - create new JobUIMetadata
            info!("Job {} has legacy metadata format, creating new JobUIMetadata", job_id);
            
            let default_payload = crate::jobs::types::JobPayload::GenericLlmStream(
                crate::jobs::types::GenericLlmStreamPayload {
                    prompt_text: "Legacy job finalization".to_string(),
                    system_prompt: None,
                    metadata: None,
                }
            );
            let new_ui_meta = crate::utils::job_ui_metadata_builder::JobUIMetadataBuilder::new(default_payload)
                .task_data(metadata.unwrap_or_else(|| serde_json::json!({})))
                .build();
            
            Some(serde_json::to_string(&new_ui_meta)
                .map_err(|e| AppError::SerializationError(format!("Failed to serialize new JobUIMetadata for job {}: {}", job_id, e)))?)
        }
    } else {
        // No existing metadata - create new JobUIMetadata
        let default_payload = crate::jobs::types::JobPayload::GenericLlmStream(
            crate::jobs::types::GenericLlmStreamPayload {
                prompt_text: "New job finalization".to_string(),
                system_prompt: None,
                metadata: None,
            }
        );
        let new_ui_meta = crate::utils::job_ui_metadata_builder::JobUIMetadataBuilder::new(default_payload)
            .task_data(metadata.unwrap_or_else(|| serde_json::json!({})))
            .build();
        
        Some(serde_json::to_string(&new_ui_meta)
            .map_err(|e| AppError::SerializationError(format!("Failed to serialize new JobUIMetadata for job {}: {}", job_id, e)))?)
    };
    
    repo.mark_job_completed(
        job_id,
        response_content,
        final_metadata_str_for_repo.as_deref(),
        tokens_sent,
        tokens_received,
        Some(model_used),
        Some(system_prompt_template),
    ).await?;
    
    info!("Job {} completed successfully", job_id);
    Ok(())
}

/// Finalizes job failure with error message, optional structured error information, and cost tracking
pub async fn finalize_job_failure(
    job_id: &str,
    repo: &BackgroundJobRepository,
    error_message: &str,
    app_error_opt: Option<&AppError>,
    llm_usage: Option<OpenRouterUsage>,
    model_used: Option<String>,
    app_handle: &AppHandle,
) -> AppResult<()> {
    // Fetch the current job to get its metadata
    let current_job = match repo.get_job_by_id(job_id).await? {
        Some(job) => job,
        None => {
            error!("Job {} not found during failure finalization", job_id);
            // No usage info available when job not found
            repo.mark_job_failed(job_id, error_message, None, None, None, None).await?;
            return Ok(());
        }
    };

    // Try to parse existing metadata as JobUIMetadata, create new if fails
    let updated_metadata_str = if let Some(metadata_str) = current_job.metadata.as_deref() {
        if let Ok(mut ui_meta) = serde_json::from_str::<JobUIMetadata>(metadata_str) {
            // Add error information to task_data
            let error_info = serde_json::json!({
                "error_message": error_message,
                "error_type": app_error_opt.map(|e| format!("{:?}", e)).unwrap_or_else(|| "UnknownError".to_string()),
                "failed_at": chrono::Utc::now().to_rfc3339()
            });
            
            if let serde_json::Value::Object(ref mut task_map) = ui_meta.task_data {
                task_map.insert("failure_info".to_string(), error_info);
            } else {
                ui_meta.task_data = serde_json::json!({
                    "failure_info": error_info
                });
            }
            
            Some(serde_json::to_string(&ui_meta)
                .map_err(|e| AppError::SerializationError(format!("Failed to serialize JobUIMetadata for failed job {}: {}", job_id, e)))?)
        } else {
            // Can't parse existing metadata - just use simple failure without structured metadata
            None
        }
    } else {
        // No existing metadata - just use simple failure
        None
    };

    // Cost tracking is handled by server billing service, not stored in local BackgroundJob
    let (tokens_sent, tokens_received) = if let Some(usage) = &llm_usage {
        (Some(usage.prompt_tokens), Some(usage.completion_tokens))
    } else {
        (None, None)
    };

    // Mark the job as failed with usage tracking
    repo.mark_job_failed(
        job_id, 
        error_message, 
        updated_metadata_str.as_deref(),
        tokens_sent,
        tokens_received,
        model_used.as_deref(),
    ).await?;
    
    error!("Job {} failed: {}", job_id, error_message);
    Ok(())
}