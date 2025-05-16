use std::sync::Arc;
use log::{debug, warn};
use serde_json::json;
use tauri::AppHandle;
use tauri::Manager;
use crate::error::{AppError, AppResult};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::models::BackgroundJob;

/// Maximum number of job retries
pub const MAX_RETRY_COUNT: u32 = 3;

/// Ensure a job is marked as visible in the database
pub async fn ensure_job_visible(repo: &Arc<BackgroundJobRepository>, job_id: &str) -> AppResult<()> {
    let job = repo.get_job_by_id(job_id).await?
        .ok_or_else(|| AppError::NotFoundError(format!("Job with ID {} not found", job_id)))?;
    
    // Only update if not already visible
    if job.visible.unwrap_or(false) == false {
        repo.update_job_visibility(job_id, true, false).await?;
    }
    
    Ok(())
}

/// Update job status to running
pub async fn update_job_status_running(repo: &Arc<BackgroundJobRepository>, job_id: &str) -> AppResult<()> {
    repo.update_job_status_running(job_id, Some("Processing...")).await
}

/// Update job status to failed
pub async fn update_job_status_failed(repo: &Arc<BackgroundJobRepository>, job_id: &str, error_message: &str) -> AppResult<()> {
    repo.update_job_status_failed(job_id, error_message).await
}

/// Update job status to completed
pub async fn update_job_status_completed(
    repo: &Arc<BackgroundJobRepository>, 
    job_id: &str, 
    response: &str,
    tokens_sent: Option<i32>,
    tokens_received: Option<i32>,
    total_tokens: Option<i32>,
    chars_received: Option<i32>
) -> AppResult<()> {
    repo.update_job_status_completed(job_id, response, None, tokens_sent, tokens_received, total_tokens, chars_received).await
}

/// Cancel a job by ID
pub async fn cancel_job(app_handle: &AppHandle, job_id: &str) -> AppResult<()> {
    let repositories = app_handle.state::<Arc<BackgroundJobRepository>>();
    repositories.cancel_job(job_id).await
}

/// Cancel all active jobs for a session
pub async fn cancel_session_jobs(app_handle: &AppHandle, session_id: &str) -> AppResult<usize> {
    let repositories = app_handle.state::<Arc<BackgroundJobRepository>>();
    repositories.cancel_session_jobs(session_id).await
}

/// Calculate retry delay using exponential backoff
/// Formula: base_delay * (2^retry_count) + random_jitter
pub fn calculate_retry_delay(retry_count: u32) -> u32 {
    let base_delay_seconds = 2; // Start with 2 seconds
    let max_delay_seconds = 60; // Cap at 60 seconds
    
    // Calculate delay with exponential backoff: base * 2^retry_count
    let exp_delay = base_delay_seconds * (2u32.pow(retry_count));
    
    // Add small random jitter to prevent thundering herd problem
    let jitter = (retry_count as f64 * 0.1).round() as u32;
    
    // Ensure we don't exceed max delay
    std::cmp::min(exp_delay + jitter, max_delay_seconds)
}

/// Get retry information from job metadata
pub async fn get_retry_info(job: &BackgroundJob) -> (bool, u32) {
    // Default values if metadata is absent
    let mut is_retryable = true;
    let mut retry_count = 0;
    
    // Check if job has metadata with retry information
    if let Some(metadata) = &job.metadata {
        // Parse retry information from metadata
        if let Ok(metadata_value) = serde_json::from_str::<serde_json::Value>(&metadata) {
            // Check if this error type is retryable
            if let Some(retryable) = metadata_value.get("retryable").and_then(|v| v.as_bool()) {
                is_retryable = retryable;
            } else {
                // Default job types that should not be retried
                match job.task_type.as_str() {
                    // Configuration or validation errors are not retryable
                    "ConfigValidation" | "DirectoryValidation" => is_retryable = false,
                    // Network operations are typically retryable
                    "OpenRouterTranscription" | "LlmCompletion" => is_retryable = true,
                    // Default to allowing retry
                    _ => is_retryable = true,
                }
            }
            
            // Get current retry count
            if let Some(count) = metadata_value.get("retry_count").and_then(|v| v.as_u64()) {
                retry_count = count as u32;
            }
        }
    }
    
    // Some error types are always retryable or non-retryable, regardless of metadata
    // This is based on the job's error message
    if let Some(error) = &job.error_message {
        // Network and timeout errors are retryable
        if error.contains("timeout") || error.contains("network") || error.contains("connection") {
            is_retryable = true;
        }
        // Validation errors are not retryable
        else if error.contains("validation") || error.contains("invalid input") {
            is_retryable = false;
        }
    }
    
    (is_retryable, retry_count)
}

/// Prepare updated metadata for job retry
pub async fn prepare_retry_metadata(job: &BackgroundJob, new_retry_count: u32, error_message: &str) -> String {
    // Start with existing metadata or empty object
    let mut metadata = match &job.metadata {
        Some(m) => serde_json::from_str::<serde_json::Value>(m).unwrap_or_else(|_| json!({})),
        None => json!({}),
    };
    
    // Update retry information
    metadata["retry_count"] = json!(new_retry_count);
    
    // Keep track of previous errors
    let mut errors = metadata.get("errors")
        .and_then(|e| e.as_array())
        .cloned()
        .unwrap_or_else(|| Vec::new());
    
    // Add this error to the list
    errors.push(json!({
        "attempt": new_retry_count,
        "time": chrono::Utc::now().to_rfc3339(),
        "message": error_message
    }));
    
    // Update errors in metadata
    metadata["errors"] = json!(errors);
    
    // Serialize and return
    serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string())
}