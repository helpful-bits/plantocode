use chrono::Utc;
use log::{debug, error, info, warn};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{Duration, timeout};

use crate::constants::DEFAULT_JOB_TIMEOUT_SECONDS;
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::db_utils::session_repository::SessionRepository;
use crate::error::{AppError, AppResult};
use crate::events::session_events;
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait;
use crate::jobs::queue::{JobPriority, get_job_queue};
use crate::jobs::registry::get_job_registry;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData};
use crate::jobs::workflow_orchestrator::get_workflow_orchestrator;
use crate::jobs::{job_payload_utils, retry_utils};
use crate::models::{BackgroundJob, JobStatus, TaskType};
use crate::services::file_selection_auto_apply::auto_apply_files_for_job;
use serde_json::{Value, json};
use std::str::FromStr;

/// Check if a task type is a file-finding task
fn is_file_finding_task(task_type: &TaskType) -> bool {
    matches!(
        task_type,
        TaskType::RegexFileFilter
            | TaskType::FileRelevanceAssessment
            | TaskType::ExtendedPathFinder
    )
}

/// Standardize file-finding job responses to a consistent format
fn standardize_file_finding_response(response: Value, task_type: &TaskType) -> Value {
    let standardized = match task_type {
        TaskType::RegexFileFilter => {
            // {"filteredFiles": [...]} -> {"files": [...], "count": n}
            if let Some(filtered_files) = response.get("filteredFiles").and_then(|v| v.as_array()) {
                json!({
                    "files": filtered_files,
                    "count": filtered_files.len(),
                    "summary": format!("{} files filtered", filtered_files.len())
                })
            } else {
                response
            }
        }
        TaskType::FileRelevanceAssessment => {
            // File Relevance Assessment already returns standardized format: {"files": [...], "count": n, "summary": "..."}
            // No transformation needed
            response
        }
        TaskType::ExtendedPathFinder => {
            // Extended Path Finder already returns standardized format: {"files": [...], "count": n, "summary": "..."}
            // No transformation needed
            response
        }
        _ => response,
    };

    if let Some(files_array) = standardized.get("files").and_then(|v| v.as_array()) {
        let files: Vec<String> = files_array
            .iter()
            .filter_map(|f| f.as_str().map(|s| s.to_string()))
            .collect();

        let total = files.len();
        let mut abs = 0usize;
        for f in &files {
            if std::path::Path::new(f).is_absolute() {
                abs += 1;
            }
        }
        let rel = total.saturating_sub(abs);
        debug!(
            "StandardizeFileFinding: total={}, rel={}, abs={}",
            total, rel, abs
        );
    }

    standardized
}

// Clean retry system using JobUIMetadata

/// Dispatch a job to be processed
pub async fn dispatch_job(job: Job, app_handle: AppHandle) -> AppResult<()> {
    // Get the job queue - accessor now handles lazy init and waiting
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
    let task_type = job.task_type_str();
    info!("Processing job {} with task type {}", job_id, task_type);

    // Get background job repository
    let background_job_repo = match app_handle.try_state::<Arc<BackgroundJobRepository>>() {
        Some(repo) => repo,
        None => {
            return Err(AppError::InitializationError(
                "BackgroundJobRepository not available in app state. App initialization may be incomplete.".to_string()
            ));
        }
    };

    // Update job status to preparing
    background_job_repo
        .update_job_status(
            &job_id,
            &JobStatus::Preparing,
            Some("Finding available processor..."),
        )
        .await?;

    // Status transition handled by repository method above

    // Check if this is a workflow job - workflows don't have processors
    // They are orchestrated by the WorkflowOrchestrator which creates individual stage jobs
    if matches!(
        job.task_type,
        TaskType::FileFinderWorkflow | TaskType::WebSearchWorkflow
    ) {
        info!(
            "Skipping processor lookup for workflow job {} - will be handled by WorkflowOrchestrator",
            job_id
        );
        // Mark the workflow job as acknowledged since it will be handled by the orchestrator
        background_job_repo
            .update_job_status(
                &job_id,
                &JobStatus::AcknowledgedByWorker,
                Some("Workflow orchestration started"),
            )
            .await?;
        drop(permit);
        return Ok(None);
    }

    // Find a processor for the job
    let processor_opt_result = registry.find_processor(&job).await;

    let processor = match processor_opt_result {
        Ok(p) => p,
        Err(e) => {
            error!(
                "Error finding processor for job {} (task type: {}): {}",
                job_id, task_type, e
            );
            let error_message = format!(
                "Error finding processor for task type '{}': {}",
                task_type, e
            );
            let app_error = AppError::JobError(error_message.clone());
            handle_job_failure_or_retry(&app_handle, &background_job_repo, &job_id, &app_error)
                .await?;
            drop(permit);
            return Ok(Some(JobProcessResult::failure(job_id, error_message)));
        }
    };

    // Update status to show processor was found before marking as running
    background_job_repo
        .update_job_status(&job_id, &JobStatus::Preparing, Some("Processor found"))
        .await?;

    // Mark job as running now that we have a processor
    background_job_repo.mark_job_running(&job_id).await?;

    // Status transition handled by repository method above

    // Process the job with timeout
    let job_result =
        execute_job_with_processor(&job_id, processor.as_ref(), job, app_handle.clone()).await;

    match job_result {
        Ok(result) => {
            info!(
                "Job {} completed successfully with status: {:?}",
                job_id, result.status
            );

            // Reset retry count and log any errors
            if let Err(e) = queue.reset_retry_count(&job_id) {
                error!("Failed to reset retry count for job {}: {}", job_id, e);
            }

            // Handle successful job completion
            handle_job_success(&app_handle, &background_job_repo, &job_id, &result).await?;

            drop(permit);
            Ok(Some(result))
        }
        Err(app_error) => {
            error!(
                "Job {} (task type: {}) failed during processing: {}",
                job_id, task_type, app_error
            );

            // Handle job failure or retry
            let handled =
                handle_job_failure_or_retry(&app_handle, &background_job_repo, &job_id, &app_error)
                    .await?;

            drop(permit);

            // Return None if the job is being retried, or Some with failure result if job permanently failed
            match handled {
                JobFailureHandlingResult::Retrying => {
                    info!("Job {} is being retried after failure", job_id);
                    Ok(None)
                }
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
        processor.process(job, app_handle.clone()),
    )
    .await;

    match timeout_result {
        // Job completed within timeout
        Ok(process_result) => {
            debug!(
                "Job {} completed within timeout ({} seconds)",
                job_id, DEFAULT_JOB_TIMEOUT_SECONDS
            );
            process_result
        }
        // Job timed out
        Err(_elapsed) => {
            let timeout_message = format!(
                "Job {} timed out after {} seconds",
                job_id, DEFAULT_JOB_TIMEOUT_SECONDS
            );
            error!("Timeout occurred: {}", timeout_message);
            warn!(
                "Consider increasing timeout limit for processor: {}",
                processor.name()
            );
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
            info!(
                "Job {} completed successfully with status: {:?}",
                job_id, result.status
            );

            // Get the original job to preserve workflow metadata
            let original_job = background_job_repo
                .get_job_by_id(job_id)
                .await?
                .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;

            // Merge the original metadata with the result metadata
            let merged_metadata = if let Some(original_metadata_str) = &original_job.metadata {
                if let Ok(mut original_metadata) =
                    serde_json::from_str::<serde_json::Value>(original_metadata_str)
                {
                    if let Some(result_metadata) = &result.metadata {
                        if let serde_json::Value::Object(ref mut original_map) = original_metadata {
                            if let serde_json::Value::Object(result_map) = result_metadata {
                                // Merge result metadata into original metadata
                                for (key, value) in result_map {
                                    original_map.insert(key.clone(), value.clone());
                                }
                            }
                        }
                    }
                    serde_json::to_string(&original_metadata).ok()
                } else {
                    // If we can't parse original metadata, just use result metadata
                    result
                        .metadata
                        .as_ref()
                        .and_then(|m| serde_json::to_string(m).ok())
                }
            } else {
                // No original metadata, just use result metadata
                result
                    .metadata
                    .as_ref()
                    .and_then(|m| serde_json::to_string(m).ok())
            };

            let metadata_string = merged_metadata;

            // Extract model_used from metadata if present
            let model_used = if let Some(metadata) = &result.metadata {
                metadata.get("model_used").and_then(|v| v.as_str())
            } else {
                None
            };

            // Extract and potentially standardize response
            let response_str = if let Some(response_data) = &result.response {
                match response_data {
                    JobResultData::Json(value) => {
                        // Standardize file-finding job responses
                        let task_type = TaskType::from_str(&original_job.task_type).ok();
                        let standardized = if let Some(ref tt) = task_type {
                            if is_file_finding_task(tt) {
                                standardize_file_finding_response(value.clone(), tt)
                            } else {
                                value.clone()
                            }
                        } else {
                            value.clone()
                        };
                        serde_json::to_string(&standardized)
                            .unwrap_or_else(|_| "JSON serialization failed".to_string())
                    }
                    JobResultData::Text(text) => text.clone(),
                }
            } else {
                "No response content".to_string()
            };

            // Update job status to completed with comprehensive result data
            // mark_job_completed will handle all fields including actual_cost
            background_job_repo
                .mark_job_completed(
                    job_id,
                    &response_str,
                    metadata_string.as_deref(),
                    result.tokens_sent.map(|v| v as i32),
                    result.tokens_received.map(|v| v as i32),
                    model_used,
                    result.system_prompt_template.as_deref(),
                    result.actual_cost,
                    result.cache_write_tokens,
                    result.cache_read_tokens,
                )
                .await?;

            // Get the completed job from database to extract actual cost
            let completed_job = background_job_repo
                .get_job_by_id(job_id)
                .await?
                .ok_or_else(|| {
                    AppError::NotFoundError(format!("Job {} not found after completion", job_id))
                })?;

            // Job completion event handled by repository method above

            // Centralized auto-apply for file-finding tasks
            // This is the ONLY place auto-apply happens to avoid double-application races
            // Auto-apply discovered files for supported tasks
            if let Some(ref response_json) = serde_json::from_str::<Value>(&response_str).ok() {
                let pool = app_handle
                    .state::<Arc<sqlx::SqlitePool>>()
                    .inner()
                    .clone();
                let session_repo = SessionRepository::new(pool.clone());
                if let Ok(Some(_outcome)) = auto_apply_files_for_job(
                    &pool,
                    &session_repo,
                    app_handle,
                    &completed_job.session_id,
                    job_id,
                    &completed_job.task_type,
                    response_json,
                )
                .await
                {
                    // Always emit session-files-updated after successful auto-apply
                    // Even if no new files were applied, normalization/dedup may have changed the state
                    // Fetch fresh session state from DB after auto-apply commit
                    if let Ok(Some(updated_session)) = session_repo.get_session_by_id(&completed_job.session_id).await {
                        // Emit unified session-files-updated event with fresh state
                        let _ = session_events::emit_session_files_updated(
                            app_handle,
                            &completed_job.session_id,
                            &updated_session.included_files,
                            &updated_session.force_excluded_files,
                        );
                    }
                }
            }

            // Check if this job is part of a workflow and notify WorkflowOrchestrator
            // Use the completed_job's metadata which contains the original workflowId
            if let Some(metadata_str) = &completed_job.metadata {
                debug!("Job {} metadata: {}", job_id, metadata_str);
                if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata_str) {
                    // Check both at root level and inside workflowId field (due to JobUIMetadata structure)
                    let workflow_id = metadata_json
                        .get("workflowId")
                        .and_then(|v| v.as_str())
                        .or_else(|| {
                            // Also check inside the metadata structure itself
                            metadata_json.as_object().and_then(|obj| {
                                obj.values()
                                    .find_map(|v| v.as_object()?.get("workflowId")?.as_str())
                            })
                        });

                    if let Some(workflow_id) = workflow_id {
                        info!(
                            "Job {} is part of workflow {}, notifying WorkflowOrchestrator",
                            job_id, workflow_id
                        );

                        match get_workflow_orchestrator().await {
                            Ok(orchestrator) => {
                                if let Err(e) = orchestrator
                                    .update_job_status(
                                        job_id,
                                        result.status.clone(),
                                        result.error.clone(),
                                        result.response.clone(),
                                        completed_job.actual_cost,
                                    )
                                    .await
                                {
                                    error!(
                                        "Failed to notify WorkflowOrchestrator about job {} completion: {}",
                                        job_id, e
                                    );
                                }
                            }
                            Err(e) => {
                                error!(
                                    "Failed to get workflow orchestrator for job {}: {}",
                                    job_id, e
                                );
                            }
                        }
                    } else {
                        debug!("Job {} metadata does not contain workflowId", job_id);
                        // Log the metadata structure for debugging
                        debug!("Metadata structure: {:?}", metadata_json);
                    }
                } else {
                    warn!("Failed to parse job {} metadata as JSON", job_id);
                }
            } else {
                debug!("Job {} has no metadata", job_id);
            }

            // Check if this is a standalone implementation plan job and send push notification
            // Only send if this is NOT part of a workflow (workflow jobs are handled by WorkflowOrchestrator)
            let is_workflow_job = if let Some(metadata_str) = &completed_job.metadata {
                if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata_str) {
                    metadata_json.get("workflowId").is_some()
                } else {
                    false
                }
            } else {
                false
            };

            // Check if this is an implementation plan job (standalone or workflow)
            let is_implementation_plan = matches!(
                TaskType::from_str(&completed_job.task_type).ok(),
                Some(TaskType::ImplementationPlan) | Some(TaskType::ImplementationPlanMerge)
            );

            if !is_workflow_job && is_implementation_plan {
                // This is a standalone implementation plan job (not part of a workflow)
                // Send push notification (workflow jobs handle notifications separately)
                info!("Detected standalone implementation plan job completion: {}", job_id);
                if let Err(e) = send_implementation_plan_notification(
                    app_handle,
                    &completed_job.session_id,
                    job_id,
                    &completed_job.task_type,
                    completed_job.metadata.as_deref(),
                    model_used,
                )
                .await
                {
                    warn!(
                        "Failed to send implementation plan notification for job {}: {}",
                        job_id, e
                    );
                }
            }

            // Auto-generate markdown for ALL implementation plans (standalone or workflow)
            // so it's ready when user views the plan on mobile
            if is_implementation_plan {
                let app_handle_clone = app_handle.clone();
                let job_id_clone = job_id.to_string();
                tokio::spawn(async move {
                    info!("Auto-generating markdown for completed implementation plan: {}", job_id_clone);
                    match crate::commands::implementation_plan_commands::generate_plan_markdown_command(
                        app_handle_clone,
                        job_id_clone.clone(),
                    )
                    .await
                    {
                        Ok(_) => {
                            info!("Successfully auto-generated markdown for plan: {}", job_id_clone);
                        }
                        Err(e) => {
                            warn!("Failed to auto-generate markdown for plan {}: {:?}", job_id_clone, e);
                        }
                    }
                });
            }
        }
        JobStatus::Failed => {
            let error_message = result
                .error
                .clone()
                .unwrap_or_else(|| "Unknown error".to_string());
            error!("Job {} failed: {}", job_id, error_message);

            let metadata_string = result
                .metadata
                .as_ref()
                .and_then(|m| serde_json::to_string(m).ok());

            // Update job status to failed with detailed error information
            background_job_repo
                .mark_job_failed(
                    job_id,
                    &error_message,
                    metadata_string.as_deref(),
                    None,
                    None,
                    None,
                    result.actual_cost,
                )
                .await?;

            // Job failure event handled by repository method above
        }
        JobStatus::Canceled => {
            // Update job status to canceled with error message
            let cancel_reason = result.error.as_deref().unwrap_or("Job canceled");
            background_job_repo
                .mark_job_canceled(job_id, cancel_reason, None)
                .await?;

            // Job cancellation event handled by repository method above

            // Get the canceled job to access its original metadata
            let canceled_job = background_job_repo
                .get_job_by_id(job_id)
                .await?
                .ok_or_else(|| {
                    AppError::NotFoundError(format!("Job {} not found after cancellation", job_id))
                })?;

            // Check if this job is part of a workflow and notify WorkflowOrchestrator
            // Use the canceled_job's metadata which contains the original workflowId
            if let Some(metadata_str) = &canceled_job.metadata {
                if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata_str) {
                    // Check both at root level and inside workflowId field (due to JobUIMetadata structure)
                    let workflow_id = metadata_json
                        .get("workflowId")
                        .and_then(|v| v.as_str())
                        .or_else(|| {
                            // Also check inside the metadata structure itself
                            metadata_json.as_object().and_then(|obj| {
                                obj.values()
                                    .find_map(|v| v.as_object()?.get("workflowId")?.as_str())
                            })
                        });

                    if let Some(workflow_id) = workflow_id {
                        info!(
                            "Canceled job {} is part of workflow {}, notifying WorkflowOrchestrator",
                            job_id, workflow_id
                        );

                        match get_workflow_orchestrator().await {
                            Ok(orchestrator) => {
                                if let Err(e) = orchestrator
                                    .update_job_status(
                                        job_id,
                                        result.status.clone(),
                                        result.error.clone(),
                                        None,
                                        canceled_job.actual_cost,
                                    )
                                    .await
                                {
                                    error!(
                                        "Failed to notify WorkflowOrchestrator about canceled job {} completion: {}",
                                        job_id, e
                                    );
                                }
                            }
                            Err(e) => {
                                error!(
                                    "Failed to get workflow orchestrator for canceled job {}: {}",
                                    job_id, e
                                );
                            }
                        }
                    }
                }
            }
        }
        _ => {
            warn!(
                "Unexpected job status in handle_job_success: {:?}",
                result.status
            );
        }
    }

    Ok(())
}

/// Result of handling a job failure
enum JobFailureHandlingResult {
    Retrying,
    PermanentFailure(String),
}

/// Handle a job failure by checking if it can be retried
async fn handle_job_failure_or_retry(
    app_handle: &AppHandle,
    background_job_repo: &Arc<BackgroundJobRepository>,
    job_id: &str,
    error: &AppError,
) -> AppResult<JobFailureHandlingResult> {
    // Fetch the job from database
    let job = match background_job_repo.get_job_by_id(job_id).await {
        Ok(Some(job)) => job,
        Ok(None) => {
            error!("Job {} not found in database for failure handling", job_id);
            return Ok(JobFailureHandlingResult::PermanentFailure(
                "Job not found in database".to_string(),
            ));
        }
        Err(e) => {
            error!("Failed to fetch job {} from database: {}", job_id, e);
            return Ok(JobFailureHandlingResult::PermanentFailure(format!(
                "Database error: {}",
                e
            )));
        }
    };

    // Call internal function with the fetched job
    handle_job_failure_or_retry_internal(app_handle, background_job_repo, job_id, error, &job).await
}

/// Internal implementation of failure handling and retry logic with enhanced error context
async fn handle_job_failure_or_retry_internal(
    app_handle: &AppHandle,
    background_job_repo: &Arc<BackgroundJobRepository>,
    job_id: &str,
    error: &AppError,
    job_copy: &BackgroundJob,
) -> AppResult<JobFailureHandlingResult> {
    error!(
        "Failed to process job {} (retry count: {}): {} [AppError Variant: {:?}]",
        job_id,
        retry_utils::get_retry_count_from_job(job_copy).unwrap_or(0),
        error.to_string(),
        error
    );

    // Check if it's a workflow job from job_copy.metadata
    let is_workflow_job = if let Some(meta_str) = &job_copy.metadata {
        if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(meta_str) {
            // Check for workflowId in metadata (could be at root or in task_data)
            metadata_json.get("workflowId").is_some()
                || metadata_json.get("workflow_id").is_some()
                || (metadata_json
                    .get("task_data")
                    .and_then(|td| td.get("workflowId"))
                    .is_some())
        } else {
            false
        }
    } else {
        false
    };

    if is_workflow_job {
        info!(
            "Job {} is part of a workflow. Passing to WorkflowOrchestrator.",
            job_copy.id
        );

        // Ensure job is marked as Failed in DB for the orchestrator to pick up
        let user_facing_error = format_user_error(error);
        if let Err(e) = background_job_repo
            .update_job_status(job_id, &JobStatus::Failed, Some(&user_facing_error))
            .await
        {
            error!(
                "Critical error: Failed to update workflow job {} status to failed in database: {}",
                job_id, e
            );
        }

        // Job failure event handled by repository method above

        // ALWAYS pass to WorkflowOrchestrator if job has workflowId
        match get_workflow_orchestrator().await {
            Ok(orchestrator) => {
                if let Err(e) = orchestrator
                    .update_job_status(
                        &job_id,
                        JobStatus::Failed,
                        Some(error.to_string()),
                        None,
                        job_copy.actual_cost,
                    )
                    .await
                {
                    error!(
                        "Failed to notify WorkflowOrchestrator about job {} failure: {}",
                        job_id, e
                    );
                }
            }
            Err(e) => {
                error!(
                    "Failed to get workflow orchestrator for failed job {}: {}",
                    job_id, e
                );
            }
        }

        return Ok(JobFailureHandlingResult::PermanentFailure(format!(
            "Workflow job failed. Orchestrator will handle: {}",
            error.to_string()
        )));
    }

    // Check if this error type is retryable and get current retry count
    let (is_retryable, current_retry_count) =
        retry_utils::get_retry_info(job_copy, Some(error)).await;

    // Check if we can retry this job
    if is_retryable && current_retry_count < retry_utils::MAX_RETRY_COUNT {
        // Calculate exponential backoff delay
        let retry_delay = retry_utils::calculate_retry_delay(current_retry_count);
        let next_retry_count = current_retry_count + 1;

        warn!(
            "Job {} failed with retryable error [Type: {:?}]. Scheduling retry #{}/{} in {} seconds: {}",
            job_id,
            error,
            next_retry_count,
            retry_utils::MAX_RETRY_COUNT,
            retry_delay,
            error.to_string()
        );

        // Prepare enhanced metadata for the retry using JobUIMetadata structure
        let retry_metadata = match retry_utils::prepare_retry_metadata(
            job_copy,
            next_retry_count,
            error,
        )
        .await
        {
            Ok(metadata) => metadata,
            Err(metadata_error) => {
                error!(
                    "Failed to prepare retry metadata for job {}: {}. Treating as permanent failure.",
                    job_id, metadata_error
                );

                // If metadata preparation fails, treat as permanent failure
                let failure_reason =
                    format!("Failed to prepare retry metadata: {}", metadata_error);

                // Update job status to failed
                let user_facing_error = format_user_error(error);
                if let Err(e) = background_job_repo
                    .update_job_status(job_id, &JobStatus::Failed, Some(&user_facing_error))
                    .await
                {
                    error!(
                        "Critical error: Failed to update job {} status to failed in database: {}. This may lead to inconsistent state!",
                        job_id, e
                    );
                }

                // Job failure event handled by repository method above

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
        if let Err(e) = background_job_repo
            .update_job_status_with_metadata(
                job_id,
                &JobStatus::Queued,
                Some(&retry_message),
                retry_metadata,
            )
            .await
        {
            error!("Failed to schedule job for retry: {}", e);
        }

        // Job retry event handled by repository method above

        // Re-queue the job with delay instead of sleeping
        if let Err(e) =
            re_queue_job_with_delay(app_handle, job_copy, retry_delay as u64 * 1000).await
        {
            error!("Failed to re-queue job {} for retry: {}", job_id, e);
            // If re-queueing fails, treat as permanent failure
            return Ok(JobFailureHandlingResult::PermanentFailure(format!(
                "Failed to schedule retry: {}",
                e
            )));
        }

        Ok(JobFailureHandlingResult::Retrying)
    } else {
        // Job is not retryable or max retries reached - provide detailed failure logging with enhanced context
        let failure_reason = if !is_retryable {
            let user_friendly_reason = format_user_friendly_error(error);
            let detailed_reason = format!(
                "Non-retryable error [{:?}]: {}",
                error, user_friendly_reason
            );

            error!(
                "Job {} permanently failed due to non-retryable {:?} error. Job details: task_type={}, session_id={}, created_at={}. Error: {}",
                job_id,
                error,
                job_copy.task_type,
                job_copy.session_id,
                job_copy.created_at,
                error.to_string()
            );

            // Log additional context if metadata is available
            log_job_metadata_context(job_id, &job_copy.metadata);

            // Log specific error type context
            error!(
                "Job {} failed with AppError type: {:?} (Retryable: false)",
                job_id, error
            );

            detailed_reason
        } else {
            let user_friendly_reason = format_user_friendly_error(error);
            let detailed_reason = format!(
                "Failed after {}/{} retries [{:?}]: {}",
                current_retry_count,
                retry_utils::MAX_RETRY_COUNT,
                error,
                user_friendly_reason
            );

            error!(
                "Job {} permanently failed after exhausting all retries. Job details: task_type={}, session_id={}, created_at={}. Retry history: {}/{} attempts. Final error [{:?}]: {}",
                job_id,
                job_copy.task_type,
                job_copy.session_id,
                job_copy.created_at,
                current_retry_count,
                retry_utils::MAX_RETRY_COUNT,
                error,
                error.to_string()
            );

            // Log enhanced retry metadata if available
            log_retry_history_context(job_id, &job_copy.metadata);
            log_job_metadata_context(job_id, &job_copy.metadata);

            detailed_reason
        };

        error!(
            "PERMANENT JOB FAILURE: Job {} has been marked as permanently failed. Reason: {}",
            job_id, failure_reason
        );

        // Check if job incurred costs and report to server for cancelled job billing
        if let Err(e) = report_cancelled_job_cost_if_needed(app_handle, job_copy).await {
            error!(
                "Failed to report cancelled job cost for job {}: {}",
                job_id, e
            );
            // Don't fail the entire operation if cost reporting fails
        }

        // Update job status to failed with user-friendly error message
        let user_facing_error = format_user_error(error);
        if let Err(e) = background_job_repo
            .update_job_status(job_id, &JobStatus::Failed, Some(&user_facing_error))
            .await
        {
            error!(
                "Critical error: Failed to update job {} status to failed in database: {}. This may lead to inconsistent state!",
                job_id, e
            );
        }

        // Job failure event handled by repository method above

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
        }
        AppError::InternalError(_) => friendly_message,
        _ => {
            let error_type = std::any::type_name::<AppError>()
                .split("::")
                .last()
                .unwrap_or("Unknown");
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
            if let Some(priority) = meta_json
                .get("jobPriorityForWorker")
                .and_then(|p| p.as_str())
            {
                error!("Failed job {} had priority: {}", job_id, priority);
            }
            if let Some(app_error_type) = meta_json.get("app_error_type").and_then(|t| t.as_str()) {
                error!(
                    "Failed job {} detected AppError type: {}",
                    job_id, app_error_type
                );
            }
        }
    }
}

/// Log retry history context for debugging
fn log_retry_history_context(job_id: &str, metadata: &Option<String>) {
    if let Some(metadata) = metadata {
        if let Ok(meta_json) = serde_json::from_str::<serde_json::Value>(metadata) {
            if let Some(errors) = meta_json.get("errors").and_then(|e| e.as_array()) {
                error!(
                    "Failed job {} retry history ({} attempts):",
                    job_id,
                    errors.len()
                );
                for (i, error_entry) in errors.iter().enumerate() {
                    if let Some(error_msg) = error_entry.get("message").and_then(|m| m.as_str()) {
                        let timestamp = error_entry
                            .get("timestamp")
                            .and_then(|t| t.as_str())
                            .unwrap_or("Unknown");
                        let error_type = error_entry
                            .get("app_error_type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("Unknown");
                        error!(
                            "  Attempt {}: [{}] {} - {}",
                            i + 1,
                            error_type,
                            timestamp,
                            truncate_error_for_display(error_msg, 100)
                        );
                    }
                }
            }
        }
    }
}

// Helper functions that need to be accessible in this module
fn extract_http_status_code(error_msg: &str) -> Option<u16> {
    // Simple pattern matching for HTTP status codes
    if let Some(start) = error_msg.find("status ") {
        let start_idx = start + 7; // Skip "status "
        if let Some(end) = error_msg[start_idx..].find(|c: char| !c.is_ascii_digit()) {
            if let Ok(status) = error_msg[start_idx..start_idx + end].parse::<u16>() {
                return Some(status);
            }
        }
    }
    None
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
    let job = job_payload_utils::convert_db_job_to_job(db_job)?;

    // Re-queue with the delay
    queue
        .enqueue_with_delay(job, JobPriority::Normal, delay_ms)
        .await?;

    debug!(
        "Re-queued job {} with {}ms delay for retry",
        db_job.id, delay_ms
    );

    Ok(())
}

/// Report cancelled job cost to server if the job incurred costs
/// This ensures that cancelled jobs that had partial execution costs are still billed
/// Server will extract user_id from JWT token automatically
async fn report_cancelled_job_cost_if_needed(
    app_handle: &AppHandle,
    job: &BackgroundJob,
) -> AppResult<()> {
    // Extract cost and token information from job metadata or actual_cost field
    let (final_cost, token_counts) = extract_job_cost_data(job)?;

    // Only report if there is an actual cost incurred
    if let Some(cost) = final_cost {
        if cost > 0.0 {
            info!(
                "Cancelled job {} has cost ${:.6} that would be reported",
                job.id, cost
            );
        } else {
            debug!("Job {} had zero cost, no billing report needed", job.id);
        }
    } else {
        debug!(
            "Job {} had no cost information, no billing report needed",
            job.id
        );
    }

    Ok(())
}

/// Extract cost and token count data from a background job
fn extract_job_cost_data(job: &BackgroundJob) -> AppResult<(Option<f64>, serde_json::Value)> {
    // First check the actual_cost field from the database
    let final_cost = job.actual_cost;

    // Extract token counts from job fields and metadata
    let mut token_counts = serde_json::json!({
        "input_tokens": job.tokens_sent,
        "output_tokens": job.tokens_received
    });

    // Try to extract additional token information from metadata
    if let Some(metadata_str) = &job.metadata {
        if let Ok(metadata_value) = serde_json::from_str::<serde_json::Value>(metadata_str) {
            // Extract cache token information if available
            if let Some(task_data) = metadata_value.get("task_data") {
                if let Some(cached_input) = task_data.get("cachedInputTokens") {
                    token_counts["cached_input_tokens"] = cached_input.clone();
                }
                if let Some(cache_write) = task_data.get("cacheWriteTokens") {
                    token_counts["cache_write_tokens"] = cache_write.clone();
                }
                if let Some(cache_read) = task_data.get("cacheReadTokens") {
                    token_counts["cache_read_tokens"] = cache_read.clone();
                }

                // Also check for cost in metadata if not in actual_cost field
                if final_cost.is_none() {
                    if let Some(metadata_cost) =
                        task_data.get("actual_cost").and_then(|v| v.as_f64())
                    {
                        return Ok((Some(metadata_cost), token_counts));
                    }
                }
            }
        }
    }

    Ok((final_cost, token_counts))
}

/// Send push notification for standalone implementation plan job completion
async fn send_implementation_plan_notification(
    app_handle: &AppHandle,
    session_id: &str,
    job_id: &str,
    task_type: &str,
    metadata: Option<&str>,
    model_used: Option<&str>,
) -> AppResult<()> {
    use crate::api_clients::client_factory;

    // Get session info to extract project_directory
    let pool = app_handle
        .state::<Arc<sqlx::SqlitePool>>()
        .inner()
        .clone();
    let session_repo = SessionRepository::new(pool.clone());

    let session = match session_repo.get_session_by_id(session_id).await? {
        Some(session) => session,
        None => {
            warn!("Session {} not found for implementation plan notification", session_id);
            return Ok(()); // Don't fail if session not found
        }
    };

    // Extract plan title from metadata if available
    let plan_title = if let Some(metadata_str) = metadata {
        if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata_str) {
            metadata_json
                .get("planTitle")
                .and_then(|v| v.as_str())
                .or_else(|| metadata_json.get("generated_title").and_then(|v| v.as_str()))
                .map(|s| s.to_string())
        } else {
            None
        }
    } else {
        None
    };

    // Get server_proxy_client
    let server_proxy_client = match client_factory::get_server_proxy_client(app_handle).await {
        Ok(client) => client,
        Err(e) => {
            warn!("Server proxy client not available for notification: {}", e);
            return Ok(()); // Don't fail if client not available
        }
    };

    // Construct custom_data JSON
    let custom_data = json!({
        "type": "implementation_plan_complete",
        "jobId": job_id,
        "sessionId": session_id,
        "projectDirectory": session.project_directory,
        "planTitle": plan_title,
        "modelUsed": model_used,
    });

    // Build notification payload
    let notification_title = "Implementation plan ready";
    let notification_body = if let Some(title) = plan_title.as_ref() {
        format!("Your implementation plan '{}' is ready for review", title)
    } else {
        "Your implementation plan is ready for review".to_string()
    };

    let payload = json!({
        "job_id": job_id,
        "title": notification_title,
        "body": notification_body,
        "custom_data": custom_data
    });

    // Send the notification via server proxy client
    server_proxy_client
        .send_job_completed_notification(payload.clone())
        .await?;

    info!(
        "Implementation plan notification sent for job: {} (type: {})",
        job_id, task_type
    );

    // Forward event to device link for real-time sync
    let event_payload = json!({
        "type": "job-completed",
        "payload": payload
    });

    if let Err(e) = app_handle.emit("device-link-event", event_payload) {
        warn!("Failed to emit device-link-event for implementation plan completion: {}", e);
    }

    Ok(())
}
