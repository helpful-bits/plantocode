//! Job Processor Utilities
//! 
//! This module provides core job lifecycle management utilities.
//! For specialized utilities, see the `processors::utils` modules:
//! - `llm_api_utils`: LLM API interactions and message formatting
//! - `prompt_utils`: Prompt building and composition
//! - `fs_context_utils`: File system operations and directory trees
//! - `response_parser_utils`: Parsing LLM responses
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
use crate::jobs::types::JobWorkerMetadata;
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
    repo.mark_job_running(job_id, Some("Processing...")).await?;
    
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
        crate::config::get_model_for_task_with_project(task_type, project_directory, app_handle).await
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
    metadata: Option<Value>,
) -> AppResult<()> {
    let (tokens_sent, tokens_received, total_tokens) = if let Some(usage) = llm_usage {
        (Some(usage.prompt_tokens as i32), Some(usage.completion_tokens as i32), Some(usage.total_tokens as i32))
    } else {
        (None, None, None)
    };
    
    let db_job = repo.get_job_by_id(job_id).await?.ok_or_else(|| AppError::NotFoundError(format!("Job {} not found for finalization", job_id)))?;
    
    let final_metadata_str_for_repo: Option<String>;
    
    match db_job.metadata.as_deref().and_then(|s| serde_json::from_str::<crate::jobs::types::JobWorkerMetadata>(s).ok()) {
        Some(mut worker_meta) => {
            // Successfully parsed existing metadata
            let mut builder = JobMetadataBuilder::from_existing_additional_params(worker_meta.additional_params.take());
            
            if let Some(new_additional_data_value) = metadata { // metadata is the Option<Value> argument
                if let Value::Object(map) = new_additional_data_value {
                    for (k, v_val) in map { // Renamed v to v_val to avoid conflict
                        builder = builder.custom_field(k, v_val.clone());
                    }
                } else {
                    warn!("finalize_job_success metadata argument for job {} was Some but not an Object. Ignored.", job_id);
                }
            }
            
            // Update the additional_params field in the parsed JobWorkerMetadata
            worker_meta.additional_params = Some(builder.build_value());
            
            final_metadata_str_for_repo = Some(serde_json::to_string(&worker_meta).map_err(|e| AppError::SerializationError(format!("Failed to serialize updated JobWorkerMetadata for job {}: {}", job_id, e)))?);
        }
        None => {
            // Existing metadata was None or failed to parse as JobWorkerMetadata
            warn!("Job {} metadata was None or unparseable during finalization. Creating new JobWorkerMetadata.", job_id);
            
            // Create a new JobWorkerMetadata instance
            let task_type = db_job.task_type.clone();
            
            // Placeholder payload - actual payload is lost if metadata was corrupt
            let job_payload_for_worker = crate::jobs::types::JobPayload::GenericLlmStream(
                crate::jobs::types::GenericLlmStreamPayload {
                    background_job_id: job_id.to_string(),
                    session_id: db_job.session_id.clone(),
                    prompt_text: "Finalization with recovered metadata".to_string(),
                    system_prompt: None,
                    metadata: None, // This metadata field within GenericLlmStreamPayload is different
                    project_directory: db_job.project_directory.clone(),
                }
            );
            
            // Attempt to extract workflow_id and workflow_stage if metadata string exists, even if not full JobWorkerMetadata
            let workflow_id = db_job.metadata.as_deref().and_then(|s| serde_json::from_str::<Value>(s).ok().and_then(|v| v.get("workflowId").and_then(|wid| wid.as_str().map(String::from))));
            let workflow_stage = db_job.metadata.as_deref().and_then(|s| serde_json::from_str::<Value>(s).ok().and_then(|v| v.get("workflowStage").and_then(|ws| ws.as_str().map(String::from))));
            
            let new_worker_meta = crate::jobs::types::JobWorkerMetadata {
                task_type,
                job_payload_for_worker,
                job_priority_for_worker: 0, // Default priority
                workflow_id,
                workflow_stage,
                additional_params: metadata, // Use the metadata argument as the new additional_params
            };
            
            final_metadata_str_for_repo = Some(serde_json::to_string(&new_worker_meta).map_err(|e| AppError::SerializationError(format!("Failed to serialize new JobWorkerMetadata for job {}: {}", job_id, e)))?);
        }
    }
    
    repo.mark_job_completed(
        job_id,
        response_content,
        final_metadata_str_for_repo.as_deref(),
        tokens_sent,
        tokens_received,
        total_tokens,
        Some(model_used),
        Some(system_prompt_id)
    ).await?;
    
    info!("Job {} completed successfully", job_id);
    Ok(())
}

/// Finalizes job failure with error message
pub async fn finalize_job_failure(
    job_id: &str,
    repo: &BackgroundJobRepository,
    error_message: &str,
) -> AppResult<()> {
    repo.mark_job_failed(job_id, error_message, None).await?;
    error!("Job {} failed: {}", job_id, error_message);
    Ok(())
}