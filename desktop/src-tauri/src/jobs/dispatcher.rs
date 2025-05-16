use std::sync::Arc;
use log::{info, error, debug, warn};
use tauri::{AppHandle, Manager, Emitter};
use tokio::time::{timeout, Duration};

use crate::constants::DEFAULT_JOB_TIMEOUT_SECONDS;
use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobProcessResult, JobStatusChangeEvent};
use crate::jobs::queue::{get_job_queue, JobPriority};
use crate::jobs::registry::get_job_registry;
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::models::{JobStatus, BackgroundJob};
use crate::jobs::job_helpers;

// Maximum retry count for jobs
const MAX_RETRIES: u32 = 3;

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
            debug!("No jobs in queue");
            // Drop the permit
            drop(permit);
            return Ok(None);
        }
    };
    
    let job_id = job.id().to_string();
    info!("Processing job {} with task type {}", job_id, job.task_type_str);
    
    // Update job status to running
    let background_job_repo = app_handle.state::<Arc<BackgroundJobRepository>>();
    background_job_repo.update_job_status(&job_id, &JobStatus::Running.to_string(), None).await?;
    
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
            error!("Error finding processor for job {}: {}", job_id, e);
            let error_message = format!("Error finding processor: {}", e);
             background_job_repo.update_job_status(
                &job_id,
                &JobStatus::Failed.to_string(),
                Some(&error_message),
            ).await?;
            emit_job_status_change(
                &app_handle,
                &job_id,
                &JobStatus::Failed.to_string(),
                Some(&error_message),
            )?;
            drop(permit);
            return Ok(Some(JobProcessResult::failure(job_id, error_message)));
        }
    };
    
    // Process the job with timeout
    let timeout_result = timeout(
        Duration::from_secs(DEFAULT_JOB_TIMEOUT_SECONDS),
        processor.process(job, app_handle.clone())
    ).await;
    
    let result = match timeout_result {
        // Job completed within timeout
        Ok(process_result) => match process_result {
            Ok(result) => result,
            Err(e) => {
                let error_message = format!("Failed to process job {}: {}", job_id, e);
                error!("{}", error_message);
                
                // Get a copy of the job to access its metadata
                let job_copy_result = background_job_repo.get_job_by_id(&job_id).await;
                let job_copy: BackgroundJob = match job_copy_result {
                    Ok(Some(j)) => j,
                    Ok(None) => {
                        error!("Job {} not found in DB for retry logic. Failing permanently.", job_id);
                        // Emit job status change event for failure
                        emit_job_status_change(
                            &app_handle,
                            &job_id,
                            &JobStatus::Failed.to_string(),
                            Some("Job data not found for retry processing."),
                        )?;
                        drop(permit); // Release permit before returning
                        return Ok(Some(JobProcessResult::failure(job_id, "Job data not found for retry processing.".to_string())));
                    }
                    Err(e) => {
                        error!("Failed to fetch job {} from DB for retry logic: {}. Failing permanently.", job_id, e);
                        // Emit job status change event for failure
                        emit_job_status_change(
                            &app_handle,
                            &job_id,
                            &JobStatus::Failed.to_string(),
                            Some("Database error during retry processing."),
                        )?;
                        drop(permit); // Release permit before returning
                        return Ok(Some(JobProcessResult::failure(job_id, "Database error during retry processing.".to_string())));
                    }
                };
                
                // Check if this error type is retryable and get current retry count
                let (is_retryable, current_retry_count) = job_helpers::get_retry_info(&job_copy).await;
                
                // Check if we can retry this job
                if is_retryable && current_retry_count < job_helpers::MAX_RETRY_COUNT {
                    // Calculate exponential backoff delay
                    let retry_delay = job_helpers::calculate_retry_delay(current_retry_count);
                    let next_retry_count = current_retry_count + 1;
                    
                    warn!("Job {} failed with retryable error. Scheduling retry #{} in {} seconds: {}", 
                        job_id, next_retry_count, retry_delay, error_message);
                    
                    // Prepare metadata for the retry
                    let retry_metadata = job_helpers::prepare_retry_metadata(&job_copy, next_retry_count, &error_message).await;
                    
                    // Update job status to queued with retry metadata
                    let retry_message = format!("Retry #{} scheduled (will retry in {} seconds). Last error: {}", 
                        next_retry_count, retry_delay, e);
                        
                    if let Err(e) = background_job_repo.update_job_status_with_metadata(
                        &job_id,
                        &JobStatus::Queued.to_string(),
                        Some(&retry_message),
                        retry_metadata
                    ).await {
                        error!("Failed to schedule job for retry: {}", e);
                    }
                    
                    // Emit job status change event
                    emit_job_status_change(
                        &app_handle,
                        &job_id,
                        &JobStatus::Queued.to_string(),
                        Some(&retry_message)
                    )?;
                    
                    // Drop the permit
                    drop(permit);
                    
                    // Sleep to implement the backoff delay
                    tokio::time::sleep(tokio::time::Duration::from_secs(retry_delay as u64)).await;
                    
                    return Ok(None);
                } else {
                    // Job is not retryable or max retries reached
                    let failure_reason = if !is_retryable {
                        format!("Non-retryable error: {}", error_message)
                    } else {
                        format!("Failed after {} retries. Last error: {}", current_retry_count, error_message)
                    };
                    
                    error!("Job {} permanently failed: {}", job_id, failure_reason);
                    
                    // Update job status to failed
                    if let Err(e) = background_job_repo.update_job_status(
                        &job_id,
                        &JobStatus::Failed.to_string(),
                        Some(&failure_reason)
                    ).await {
                        error!("Failed to update job status to failed: {}", e);
                    }
                    
                    // Emit job status change event
                    emit_job_status_change(
                        &app_handle,
                        &job_id,
                        &JobStatus::Failed.to_string(),
                        Some(&failure_reason)
                    )?;
                    
                    // Drop the permit
                    drop(permit);
                    
                    return Ok(Some(JobProcessResult::failure(job_id, failure_reason)));
                }
            }
        },
        // Job timed out
        Err(_elapsed) => {
            let timeout_message = format!("Job {} timed out after {} seconds", job_id, DEFAULT_JOB_TIMEOUT_SECONDS);
            error!("{}", timeout_message);
            
            // Get a copy of the job to access its metadata
            let job_copy_result = background_job_repo.get_job_by_id(&job_id).await;
            let job_copy: BackgroundJob = match job_copy_result {
                Ok(Some(j)) => j,
                Ok(None) => {
                    error!("Job {} not found in DB for timeout retry logic. Failing permanently.", job_id);
                    // Emit job status change event for failure
                    emit_job_status_change(
                        &app_handle,
                        &job_id,
                        &JobStatus::Failed.to_string(),
                        Some("Job data not found for timeout retry processing."),
                    )?;
                    drop(permit); // Release permit before returning
                    return Ok(Some(JobProcessResult::failure(job_id, "Job data not found for timeout retry processing.".to_string())));
                }
                Err(e) => {
                    error!("Failed to fetch job {} from DB for timeout retry logic: {}. Failing permanently.", job_id, e);
                    // Emit job status change event for failure
                    emit_job_status_change(
                        &app_handle,
                        &job_id,
                        &JobStatus::Failed.to_string(),
                        Some("Database error during timeout retry processing."),
                    )?;
                    drop(permit); // Release permit before returning
                    return Ok(Some(JobProcessResult::failure(job_id, "Database error during timeout retry processing.".to_string())));
                }
            };
            
            // Timeouts are generally retryable - check retry count
            let (_, current_retry_count) = job_helpers::get_retry_info(&job_copy).await;
            
            // Check if we can retry this job
            if current_retry_count < job_helpers::MAX_RETRY_COUNT {
                // Calculate exponential backoff delay
                let retry_delay = job_helpers::calculate_retry_delay(current_retry_count);
                let next_retry_count = current_retry_count + 1;
                
                warn!("Job {} timed out. Scheduling retry #{} in {} seconds", 
                    job_id, next_retry_count, retry_delay);
                
                // Prepare metadata for the retry
                let retry_metadata = job_helpers::prepare_retry_metadata(&job_copy, next_retry_count, &timeout_message).await;
                
                // Update job status to queued with retry metadata
                let retry_message = format!("Retry #{} scheduled after timeout", next_retry_count);
                    
                if let Err(e) = background_job_repo.update_job_status_with_metadata(
                    &job_id,
                    &JobStatus::Queued.to_string(),
                    Some(&retry_message),
                    retry_metadata
                ).await {
                    error!("Failed to schedule job for retry after timeout: {}", e);
                }
                
                // Emit job status change event
                emit_job_status_change(
                    &app_handle,
                    &job_id,
                    &JobStatus::Queued.to_string(),
                    Some(&retry_message)
                )?;
                
                // Drop the permit
                drop(permit);
                
                // Sleep to implement the backoff delay
                tokio::time::sleep(tokio::time::Duration::from_secs(retry_delay as u64)).await;
                
                return Ok(None);
            } else {
                // Max retries reached
                let failure_reason = format!("Failed after {} retries. Job timed out after {} seconds", 
                    current_retry_count, DEFAULT_JOB_TIMEOUT_SECONDS);
                
                error!("Job {} permanently failed due to timeout: {}", job_id, failure_reason);
                
                // Update job status to failed
                if let Err(e) = background_job_repo.update_job_status(
                    &job_id,
                    &JobStatus::Failed.to_string(),
                    Some(&failure_reason)
                ).await {
                    error!("Failed to update job status to failed after timeout: {}", e);
                }
                
                // Emit job status change event
                emit_job_status_change(
                    &app_handle,
                    &job_id,
                    &JobStatus::Failed.to_string(),
                    Some(&failure_reason)
                )?;
                
                // Drop the permit
                drop(permit);
                
                return Ok(Some(JobProcessResult::failure(job_id, failure_reason)));
            }
        }
    };
    
    // Reset retry count
    queue.reset_retry_count(&job_id);
    
    // Update job status based on result
    match result.status {
        JobStatus::Completed => {
            // Update job status to completed
            background_job_repo.update_job_status(
                &job_id,
                &JobStatus::Completed.to_string(),
                None,
            ).await?;
            
            // Update job response
            if let Some(response) = &result.response {
                background_job_repo.update_job_response(
                    &job_id, 
                    response, 
                    Some(JobStatus::Completed), 
                    None, 
                    result.tokens_sent, 
                    result.tokens_received, 
                    result.total_tokens, 
                    result.chars_received
                ).await?;
            }
            
            // Emit job status change event
            emit_job_status_change(
                &app_handle,
                &job_id,
                &JobStatus::Completed.to_string(),
                None,
            )?;
        },
        JobStatus::Failed => {
            // Update job status to failed
            let error_message = result.error.clone().unwrap_or_else(|| "Unknown error".to_string());
            background_job_repo.update_job_status(
                &job_id,
                &JobStatus::Failed.to_string(),
                Some(&error_message),
            ).await?;
            
            // Emit job status change event
            emit_job_status_change(
                &app_handle,
                &job_id,
                &JobStatus::Failed.to_string(),
                Some(&error_message),
            )?;
        },
        _ => {
            warn!("Unexpected job status: {:?}", result.status);
        }
    }
    
    // Drop the permit
    drop(permit);
    
    Ok(Some(result))
}

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
    
    app_handle.emit("job_status_change", event)
        .map_err(|e| AppError::TauriError(format!("Failed to emit job status change event: {}", e)))?;
        
    Ok(())
}