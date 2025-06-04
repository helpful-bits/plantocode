use std::sync::Arc;
use log::{info, error, debug, warn};
use tauri::{AppHandle, Manager, Emitter};
use tokio::time::{timeout, Duration};

use crate::constants::DEFAULT_JOB_TIMEOUT_SECONDS;
use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobProcessResult, JobStatusChangeEvent, JobPayload};
use crate::jobs::queue::{get_job_queue, JobPriority};
use crate::jobs::registry::get_job_registry;
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::models::{JobStatus, BackgroundJob, TaskType};
use crate::jobs::job_helpers;
use crate::jobs::processor_trait;
use crate::jobs::job_payload_utils;
use crate::jobs::workflow_orchestrator::get_workflow_orchestrator;
use std::str::FromStr;

// No need for a local MAX_RETRIES as we use job_helpers::MAX_RETRY_COUNT

/// Dispatch a job to be processed
pub async fn dispatch_job(job: Job, app_handle: AppHandle) -> AppResult<()> {
    // Get the job queue
    let queue = get_job_queue().await?;
    
    // Enqueue the job with normal priority
    queue.enqueue(job, JobPriority::Normal).await?;
    
    Ok(())
}

/// Process the next job in the queue
pub async fn process_next_job(app_handle: AppHandle) -> AppResult<Option<JobProcessResult>> {
    // Get the job queue and registry
    let queue = get_job_queue().await?;
    let registry = get_job_registry().await?;
    
    // Try to get a job permit
    let permit = match queue.get_permit().await {
        Some(permit) => permit,
        None => {
            debug!("No job permits available");
            return Ok(None);
        }
    };
    
    // Dequeue a job
    let job = match queue.dequeue().await {
        Some(job) => job,
        None => {
            // Drop the permit
            drop(permit);
            return Ok(None);
        }
    };
    
    let job_id = job.id().to_string();
    let task_type = job.task_type_str.clone();
    info!("Processing job {} with task type {}", job_id, task_type);
    
    // Update job status to running
    let background_job_repo = app_handle.state::<Arc<BackgroundJobRepository>>();
    background_job_repo.mark_job_running(&job_id, None).await?;
    
    // Emit job status change event
    emit_job_status_change(
        &app_handle,
        &job_id,
        &JobStatus::Running.to_string(),
        None,
    )?;
    
    // Find a processor for the job
    let processor_opt_result = registry.find_processor(&job).await;

    let processor = match processor_opt_result {
        Ok(p) => p,
        Err(e) => {
            error!("Error finding processor for job {} (task type: {}): {}", job_id, task_type, e);
            let error_message = format!("Error finding processor for task type '{}': {}", task_type, e);
            let app_error = AppError::JobError(error_message.clone());
            handle_job_failure(
                &app_handle,
                &background_job_repo,
                &job_id,
                &app_error,
                None,
            ).await?;
            drop(permit);
            return Ok(Some(JobProcessResult::failure(job_id, error_message)));
        }
    };
    
    // Process the job with timeout
    let job_result = execute_job_with_processor(
        &job_id, 
        processor.as_ref(), 
        job, 
        app_handle.clone()
    ).await;
    
    match job_result {
        Ok(result) => {
            info!("Job {} completed successfully with status: {:?}", job_id, result.status);
            
            // Reset retry count and log any errors
            if let Err(e) = queue.reset_retry_count(&job_id) {
                error!("Failed to reset retry count for job {}: {}", job_id, e);
            }
            
            // Handle successful job completion
            handle_job_success(
                &app_handle,
                &background_job_repo,
                &job_id,
                &result,
            ).await?;
            
            drop(permit);
            Ok(Some(result))
        },
        Err(app_error) => {
            error!("Job {} (task type: {}) failed during processing: {}", job_id, task_type, app_error);
            
            // Handle job failure or retry
            let handled = handle_job_failure_or_retry(
                &app_handle,
                &background_job_repo,
                &job_id,
                &app_error,
            ).await?;
            
            drop(permit);
            
            // Return None if the job is being retried, or Some with failure result if job permanently failed
            match handled {
                JobFailureHandlingResult::Retrying => {
                    info!("Job {} is being retried after failure", job_id);
                    Ok(None)
                },
                JobFailureHandlingResult::PermanentFailure(failure_reason) => {
                    error!("Job {} permanently failed: {}", job_id, failure_reason);
                    Ok(Some(JobProcessResult::failure(job_id, failure_reason)))
                }
            }
        }
    }
}

/// Execute a job with the given processor and handle timeout
async fn execute_job_with_processor(
    job_id: &str,
    processor: &dyn processor_trait::JobProcessor,
    job: Job,
    app_handle: AppHandle,
) -> AppResult<JobProcessResult> {
    // Process the job with timeout
    let timeout_result = timeout(
        Duration::from_secs(DEFAULT_JOB_TIMEOUT_SECONDS),
        processor.process(job, app_handle.clone())
    ).await;
    
    match timeout_result {
        // Job completed within timeout
        Ok(process_result) => {
            debug!("Job {} completed within timeout ({} seconds)", job_id, DEFAULT_JOB_TIMEOUT_SECONDS);
            process_result
        },
        // Job timed out
        Err(_elapsed) => {
            let timeout_message = format!("Job {} timed out after {} seconds", job_id, DEFAULT_JOB_TIMEOUT_SECONDS);
            error!("Timeout occurred: {}", timeout_message);
            warn!("Consider increasing timeout limit for processor: {}", processor.name());
            Err(AppError::JobError(timeout_message))
        }
    }
}

/// Handle a successful job completion
async fn handle_job_success(
    app_handle: &AppHandle,
    background_job_repo: &Arc<BackgroundJobRepository>,
    job_id: &str,
    result: &JobProcessResult,
) -> AppResult<()> {
    match result.status {
        JobStatus::Completed => {
            info!("Job {} completed successfully", job_id);
            
            // Update job status to completed with comprehensive result data
            if let Some(response) = &result.response {
                background_job_repo.mark_job_completed(
                    job_id,
                    response,
                    None,
                    result.tokens_sent,
                    result.tokens_received,
                    result.total_tokens,
                    None,
                    None
                ).await?;
            } else {
                background_job_repo.mark_job_completed(
                    job_id,
                    "No response content",
                    None,
                    result.tokens_sent,
                    result.tokens_received,
                    result.total_tokens,
                    None,
                    None
                ).await?;
            }
            
            // Emit job status change event
            emit_job_status_change(
                app_handle,
                job_id,
                &JobStatus::Completed.to_string(),
                None,
            )?;

            // Check if this job is part of a workflow and handle orchestration
            if let Err(e) = handle_workflow_job_completion(job_id, result, &app_handle).await {
                error!("Failed to handle workflow job completion for job {}: {}", job_id, e);
                // Don't fail the original job, just log the workflow error
            }
        },
        JobStatus::Failed => {
            let error_message = result.error.clone().unwrap_or_else(|| "Unknown error".to_string());
            error!("Job {} failed: {}", job_id, error_message);
            
            // Update job status to failed with detailed error information
            background_job_repo.mark_job_failed(job_id, &error_message, None).await?;
            
            // Emit job status change event
            emit_job_status_change(
                app_handle,
                job_id,
                &JobStatus::Failed.to_string(),
                Some(&error_message),
            )?;
        },
        _ => {
            warn!("Unexpected job status: {:?}", result.status);
        }
    }
    
    Ok(())
}

/// Result of handling a job failure
enum JobFailureHandlingResult {
    Retrying,
    PermanentFailure(String),
}

/// Handle a job failure, determining if it should be retried
async fn handle_job_failure(
    app_handle: &AppHandle,
    background_job_repo: &Arc<BackgroundJobRepository>,
    job_id: &str,
    error: &AppError,
    job_copy: Option<BackgroundJob>,
) -> AppResult<JobFailureHandlingResult> {
    // Get a copy of the job to access its metadata if not provided
    let job_copy = match job_copy {
        Some(job) => job,
        None => {
            match background_job_repo.get_job_by_id(job_id).await {
                Ok(Some(j)) => j,
                Ok(None) => {
                    let msg = format!("Job {} not found in DB for retry logic. Failing permanently.", job_id);
                    error!("{}", msg);
                    // Emit job status change event for failure
                    emit_job_status_change(
                        app_handle,
                        job_id,
                        &JobStatus::Failed.to_string(),
                        Some("Job data not found for retry processing."),
                    )?;
                    return Ok(JobFailureHandlingResult::PermanentFailure(
                        "Job data not found for retry processing.".to_string()
                    ));
                }
                Err(e) => {
                    let msg = format!("Failed to fetch job {} from DB for retry logic: {}. Failing permanently.", job_id, e);
                    error!("{}", msg);
                    // Emit job status change event for failure
                    emit_job_status_change(
                        app_handle,
                        job_id,
                        &JobStatus::Failed.to_string(),
                        Some("Database error during retry processing."),
                    )?;
                    return Ok(JobFailureHandlingResult::PermanentFailure(
                        "Database error during retry processing.".to_string()
                    ));
                }
            }
        }
    };
    
    handle_job_failure_or_retry_internal(
        app_handle,
        background_job_repo,
        job_id,
        error,
        &job_copy,
    ).await
}

/// Handle a job failure by checking if it can be retried
async fn handle_job_failure_or_retry(
    app_handle: &AppHandle,
    background_job_repo: &Arc<BackgroundJobRepository>,
    job_id: &str,
    error: &AppError,
) -> AppResult<JobFailureHandlingResult> {
    handle_job_failure(app_handle, background_job_repo, job_id, error, None).await
}

/// Internal implementation of failure handling and retry logic with enhanced error context
async fn handle_job_failure_or_retry_internal(
    app_handle: &AppHandle,
    background_job_repo: &Arc<BackgroundJobRepository>,
    job_id: &str,
    error: &AppError,
    job_copy: &BackgroundJob,
) -> AppResult<JobFailureHandlingResult> {
    error!("Failed to process job {} (retry count: {}): {} [AppError Variant: {:?}]", 
        job_id, 
        job_helpers::get_retry_count_from_job(job_copy).unwrap_or(0), 
        error.to_string(),
        error
    );
    
    // Check if this error type is retryable and get current retry count
    let (is_retryable, current_retry_count) = job_helpers::get_retry_info(job_copy, Some(error)).await;
    
    // Check if we can retry this job
    if is_retryable && current_retry_count < job_helpers::MAX_RETRY_COUNT {
        // Calculate exponential backoff delay
        let retry_delay = job_helpers::calculate_retry_delay(current_retry_count);
        let next_retry_count = current_retry_count + 1;
        
        warn!("Job {} failed with retryable error [Type: {:?}]. Scheduling retry #{}/{} in {} seconds: {}", 
            job_id, 
            error,
            next_retry_count, 
            job_helpers::MAX_RETRY_COUNT, 
            retry_delay, 
            error.to_string()
        );
        
        // Prepare enhanced metadata for the retry
        let retry_metadata = match job_helpers::prepare_retry_metadata(job_copy, next_retry_count, error).await {
            Ok(metadata) => metadata,
            Err(metadata_error) => {
                error!("Failed to prepare retry metadata for job {}: {}. Treating as permanent failure.", job_id, metadata_error);
                
                // If metadata preparation fails, treat as permanent failure
                let failure_reason = format!("Failed to prepare retry metadata: {}", metadata_error);
                
                // Update job status to failed
                let user_facing_error = format_user_error(error);
                if let Err(e) = background_job_repo.update_job_status(
                    job_id,
                    &JobStatus::Failed,
                    Some(&user_facing_error)
                ).await {
                    error!("Critical error: Failed to update job {} status to failed in database: {}. This may lead to inconsistent state!", job_id, e);
                }
                
                // Emit job status change event with user-friendly message
                if let Err(e) = emit_job_status_change(
                    app_handle,
                    job_id,
                    &JobStatus::Failed.to_string(),
                    Some(&user_facing_error)
                ) {
                    error!("Failed to emit job status change event for permanently failed job {}: {}. UI may not reflect current state.", job_id, e);
                }
                
                return Ok(JobFailureHandlingResult::PermanentFailure(failure_reason));
            }
        };
        
        // Create user-friendly retry message with error context
        let retry_message = format!(
            "Retry #{} scheduled (will retry in {} seconds). Error Type: {:?}. Last error: {}", 
            next_retry_count, 
            retry_delay,
            error,
            truncate_error_for_display(&error.to_string(), 100)
        );
            
        // Update job status to queued for retry with metadata
        // Note: Using the deprecated method temporarily for retry logic
        // TODO: Consider creating a specific method for retry scheduling
        if let Err(e) = background_job_repo.update_job_status_with_metadata(
            job_id,
            &JobStatus::Queued,
            Some(&retry_message),
            retry_metadata
        ).await {
            error!("Failed to schedule job for retry: {}", e);
        }
        
        // Emit job status change event
        emit_job_status_change(
            app_handle,
            job_id,
            &JobStatus::Queued.to_string(),
            Some(&retry_message)
        )?;
        
        // Re-queue the job with delay instead of sleeping
        if let Err(e) = re_queue_job_with_delay(app_handle, job_copy, retry_delay as u64 * 1000).await {
            error!("Failed to re-queue job {} for retry: {}", job_id, e);
            // If re-queueing fails, treat as permanent failure
            return Ok(JobFailureHandlingResult::PermanentFailure(
                format!("Failed to schedule retry: {}", e)
            ));
        }
        
        Ok(JobFailureHandlingResult::Retrying)
    } else {
        // Job is not retryable or max retries reached - provide detailed failure logging with enhanced context
        let failure_reason = if !is_retryable {
            let user_friendly_reason = format_user_friendly_error(error);
            let detailed_reason = format!("Non-retryable error [{:?}]: {}", 
                error, 
                user_friendly_reason
            );
            
            error!("Job {} permanently failed due to non-retryable {:?} error. Job details: task_type={}, session_id={}, created_at={}, project_directory={}. Error: {}", 
                job_id, 
                error,
                job_copy.task_type,
                job_copy.session_id, 
                job_copy.created_at,
                job_copy.project_directory.as_deref().unwrap_or("N/A"),
                error.to_string()
            );
            
            // Log additional context if metadata is available
            log_job_metadata_context(job_id, &job_copy.metadata);
            
            // Log specific error type context
            error!("Job {} failed with AppError type: {:?} (Retryable: false)", job_id, error);
            
            detailed_reason
        } else {
            let user_friendly_reason = format_user_friendly_error(error);
            let detailed_reason = format!("Failed after {}/{} retries [{:?}]: {}", 
                current_retry_count, 
                job_helpers::MAX_RETRY_COUNT, 
                error,
                user_friendly_reason
            );
            
            error!("Job {} permanently failed after exhausting all retries. Job details: task_type={}, session_id={}, created_at={}, project_directory={}. Retry history: {}/{} attempts. Final error [{:?}]: {}", 
                job_id, 
                job_copy.task_type,
                job_copy.session_id, 
                job_copy.created_at,
                job_copy.project_directory.as_deref().unwrap_or("N/A"),
                current_retry_count,
                job_helpers::MAX_RETRY_COUNT,
                error,
                error.to_string()
            );
            
            // Log enhanced retry metadata if available
            log_retry_history_context(job_id, &job_copy.metadata);
            log_job_metadata_context(job_id, &job_copy.metadata);
            
            detailed_reason
        };
        
        error!("PERMANENT JOB FAILURE: Job {} has been marked as permanently failed. Reason: {}", job_id, failure_reason);
        
        // Update job status to failed with user-friendly error message
        let user_facing_error = format_user_error(error);
        if let Err(e) = background_job_repo.update_job_status(
            job_id,
            &JobStatus::Failed,
            Some(&user_facing_error)
        ).await {
            error!("Critical error: Failed to update job {} status to failed in database: {}. This may lead to inconsistent state!", job_id, e);
        }
        
        // Emit job status change event with user-friendly message
        if let Err(e) = emit_job_status_change(
            app_handle,
            job_id,
            &JobStatus::Failed.to_string(),
            Some(&user_facing_error)
        ) {
            error!("Failed to emit job status change event for permanently failed job {}: {}. UI may not reflect current state.", job_id, e);
        }
        
        Ok(JobFailureHandlingResult::PermanentFailure(failure_reason))
    }
}


/// Create a user-friendly error message based on AppError
fn format_user_friendly_error(error: &AppError) -> String {
    match error {
        AppError::NetworkError(_) => "Network connection issue. Please check your internet connection and try again.".to_string(),
        AppError::HttpError(msg) => {
            if let Some(status) = extract_http_status_code(msg) {
                match status {
                    429 => "Rate limit exceeded. Please wait a moment before trying again.".to_string(),
                    500..=599 => "Server is temporarily unavailable. Please try again later.".to_string(),
                    401 | 403 => "Authentication failed. Please check your credentials.".to_string(),
                    404 => "Requested resource not found.".to_string(),
                    _ => format!("HTTP error ({}). Please try again.", status),
                }
            } else {
                "Network request failed. Please try again.".to_string()
            }
        },
        AppError::OpenRouterError(_) => "AI service temporarily unavailable. Please try again in a moment.".to_string(),
        AppError::ValidationError(_) => "Invalid input data. Please check your request and try again.".to_string(),
        AppError::AuthError(_) => "Authentication failed. Please check your credentials.".to_string(),
        AppError::TokenLimitExceededError(_) => "Input is too long for the selected model. Please reduce the content size or choose a different model.".to_string(),
        AppError::ConfigError(_) => "Configuration error. Please check your settings.".to_string(),
        AppError::FileSystemError(_) => "File access error. Please check file permissions and try again.".to_string(),
        AppError::JobError(msg) if msg.to_lowercase().contains("timeout") => "Operation timed out. Please try again.".to_string(),
        _ => truncate_error_for_display(&error.to_string(), 150),
    }
}

/// Create a user-facing error message that combines technical context with user-friendly language
fn format_user_error(error: &AppError) -> String {
    let friendly_message = format_user_friendly_error(error);
    
    // For some error types, add the technical detail in a user-friendly way
    match error {
        AppError::HttpError(msg) => {
            if let Some(status) = extract_http_status_code(msg) {
                format!("{} (Error code: {})", friendly_message, status)
            } else {
                friendly_message
            }
        },
        AppError::InternalError(_) => friendly_message,
        _ => {
            let error_type = std::any::type_name::<AppError>().split("::").last().unwrap_or("Unknown");
            format!("{} (Type: {})", friendly_message, error_type)
        }
    }
}

/// Truncate error message for display while preserving important information
fn truncate_error_for_display(error_message: &str, max_length: usize) -> String {
    if error_message.len() <= max_length {
        error_message.to_string()
    } else {
        format!("{}...", &error_message[..max_length.saturating_sub(3)])
    }
}

/// Log job metadata context for debugging
fn log_job_metadata_context(job_id: &str, metadata: &Option<String>) {
    if let Some(metadata) = metadata {
        if let Ok(meta_json) = serde_json::from_str::<serde_json::Value>(metadata) {
            if let Some(model) = meta_json.get("model").and_then(|m| m.as_str()) {
                error!("Failed job {} was using model: {}", job_id, model);
            }
            if let Some(priority) = meta_json.get("jobPriorityForWorker").and_then(|p| p.as_str()) {
                error!("Failed job {} had priority: {}", job_id, priority);
            }
            if let Some(app_error_type) = meta_json.get("app_error_type").and_then(|t| t.as_str()) {
                error!("Failed job {} detected AppError type: {}", job_id, app_error_type);
            }
        }
    }
}

/// Log retry history context for debugging
fn log_retry_history_context(job_id: &str, metadata: &Option<String>) {
    if let Some(metadata) = metadata {
        if let Ok(meta_json) = serde_json::from_str::<serde_json::Value>(metadata) {
            if let Some(errors) = meta_json.get("errors").and_then(|e| e.as_array()) {
                error!("Failed job {} retry history ({} attempts):", job_id, errors.len());
                for (i, error_entry) in errors.iter().enumerate() {
                    if let Some(error_msg) = error_entry.get("message").and_then(|m| m.as_str()) {
                        let timestamp = error_entry.get("timestamp").and_then(|t| t.as_str()).unwrap_or("Unknown");
                        let error_type = error_entry.get("app_error_type").and_then(|t| t.as_str()).unwrap_or("Unknown");
                        error!("  Attempt {}: [{}] {} - {}", i + 1, error_type, timestamp, truncate_error_for_display(error_msg, 100));
                    }
                }
            }
        }
    }
}

// Helper functions that need to be accessible in this module
use crate::jobs::job_helpers::{extract_http_status_code};

/// Emit a job status change event
fn emit_job_status_change(
    app_handle: &AppHandle,
    job_id: &str,
    status: &str,
    message: Option<&str>,
) -> AppResult<()> {
    let event = JobStatusChangeEvent {
        job_id: job_id.to_string(),
        status: status.to_string(),
        message: message.map(|s| s.to_string()),
    };
    
    if let Err(e) = app_handle.emit("job_status_change", event) {
        error!("Failed to emit job status change event for job {}: {}", job_id, e);
        return Err(AppError::TauriError(format!("Failed to emit job status change event: {}", e)));
    }
    
    debug!("Emitted job status change event for job {}: status={}, message={:?}", 
        job_id, status, message);
        
    Ok(())
}

/// Re-queue a job with a delay for retry processing
async fn re_queue_job_with_delay(
    app_handle: &AppHandle,
    db_job: &BackgroundJob,
    delay_ms: u64,
) -> AppResult<()> {
    // Get the job queue
    let queue = get_job_queue().await?;
    
    // Convert the database job back to a Rust Job struct
    let job = convert_db_job_to_job(db_job)?;
    
    // Re-queue with the delay
    queue.enqueue_with_delay(job, JobPriority::Normal, delay_ms).await?;
    
    debug!("Re-queued job {} with {}ms delay for retry", db_job.id, delay_ms);
    
    Ok(())
}

/// Convert a BackgroundJob from the database to a Rust Job struct
fn convert_db_job_to_job(db_job: &BackgroundJob) -> AppResult<Job> {
    // Parse the task type safely
    let task_type = TaskType::from_str(&db_job.task_type)
        .map_err(|e| AppError::JobError(format!("Failed to parse task type '{}': {}", db_job.task_type, e)))?;
    
    // Deserialize the payload from metadata
    let payload = job_payload_utils::deserialize_job_payload(
        &db_job.task_type, 
        db_job.metadata.as_deref()
    )?;
    
    // Create the Job struct
    let job = Job {
        id: db_job.id.clone(),
        job_type: task_type,
        payload,
        created_at: db_job.created_at.to_string(),
        session_id: db_job.session_id.clone(),
        task_type_str: db_job.task_type.clone(),
        project_directory: db_job.project_directory.clone(),
        process_after: None, // Will be set by the queue when delay is applied
    };
    
    Ok(job)
}

/// Handle workflow job completion by checking if the job is part of a workflow
/// and delegating to the WorkflowOrchestrator if needed
async fn handle_workflow_job_completion(
    job_id: &str,
    result: &JobProcessResult,
    app_handle: &AppHandle,
) -> AppResult<()> {
    // Get the completed job from the database to check if it's part of a workflow
    let background_job_repo = app_handle.state::<Arc<BackgroundJobRepository>>();
    let job = match background_job_repo.get_job_by_id(job_id).await? {
        Some(job) => job,
        None => {
            debug!("Job {} not found in database for workflow check", job_id);
            return Ok(());
        }
    };

    // Parse metadata to check for workflowId
    let metadata = match &job.metadata {
        Some(meta) => meta,
        None => {
            debug!("Job {} has no metadata, not part of a workflow", job_id);
            return Ok(());
        }
    };

    let metadata_value: serde_json::Value = match serde_json::from_str(metadata) {
        Ok(val) => val,
        Err(e) => {
            debug!("Failed to parse metadata for job {}: {}", job_id, e);
            return Ok(());
        }
    };

    // Check if this job has a workflowId
    let workflow_id = match metadata_value.get("workflowId") {
        Some(serde_json::Value::String(id)) => id.clone(),
        _ => {
            debug!("Job {} has no workflowId, not part of a workflow", job_id);
            return Ok(());
        }
    };

    info!("Job {} is part of workflow {}, notifying WorkflowOrchestrator", job_id, workflow_id);

    // Get the workflow orchestrator and update job status
    match get_workflow_orchestrator().await {
        Ok(orchestrator) => {
            // Update job status
            orchestrator.update_job_status(job_id, result.status.clone(), result.error.clone()).await?;
            
            // Store stage data if response is available
            if let Some(response) = &result.response {
                if let Ok(response_json) = serde_json::from_str::<serde_json::Value>(response) {
                    orchestrator.store_stage_data(job_id, response_json).await?;
                }
            }
            
            // The orchestrator will handle stage completion internally via update_job_status
            info!("Successfully notified WorkflowOrchestrator about job {} completion", job_id);
        }
        Err(e) => {
            error!("Failed to get workflow orchestrator for job {}: {}", job_id, e);
            // Continue without workflow handling
        }
    }

    Ok(())
}