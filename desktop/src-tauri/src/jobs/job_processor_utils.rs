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
use crate::jobs::types::JobStatusChangeEvent;

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


/// Finalizes job success with response and usage information
/// 
/// ## Server-Authoritative Cost Handling
/// Extracts the `actual_cost` from the `llm_usage.cost` field, which is the definitive, 
/// server-calculated cost. This cost is saved to the `background_jobs` table and should 
/// be treated as the single source of truth for billing and user-facing cost display.
/// The `llm_usage.cost` field is the definitive, server-calculated cost and should be treated
/// as the single source of truth for billing and display purposes.
/// 
/// ## Other Parameters
/// - Ensures all token counts (tokens_sent, tokens_received, total_tokens) are correctly updated from OpenRouterUsage
/// - The metadata parameter accepts Option<serde_json::Value> for type safety and flexibility
/// - Correctly merges provided metadata (additional_params) into existing JobWorkerMetadata structure
/// - Centralized finalization logic used by LlmTaskRunner and other processors
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
    let (tokens_sent, tokens_received) = if let Some(usage) = &llm_usage {
        (Some(usage.prompt_tokens), Some(usage.completion_tokens))
    } else {
        (None, None)
    };
    
    let db_job = repo.get_job_by_id(job_id).await?.ok_or_else(|| AppError::NotFoundError(format!("Job {} not found for finalization", job_id)))?;
    
    let actual_cost = llm_usage.as_ref().and_then(|usage| usage.cost)
        .or_else(|| {
            db_job.metadata.as_deref()
                .and_then(|metadata_str| serde_json::from_str::<Value>(metadata_str).ok())
                .and_then(|metadata_value| {
                    metadata_value.get("task_data")
                        .and_then(|task_data| task_data.get("actual_cost"))
                        .and_then(|v| v.as_f64())
                })
        });
    
    let final_metadata = if let Some(metadata_str) = db_job.metadata.as_deref() {
        if let Ok(mut ui_meta) = serde_json::from_str::<JobUIMetadata>(metadata_str) {
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
            
            if let Value::Object(ref mut task_map) = ui_meta.task_data {
                if let Some(cost) = actual_cost {
                    task_map.insert("actual_cost".to_string(), serde_json::json!(cost));
                }
                
                // Store cache token information from server usage object
                if let Some(usage) = &llm_usage {
                    if let Some(cached_input) = usage.cached_input_tokens {
                        task_map.insert("cachedInputTokens".to_string(), serde_json::json!(cached_input));
                    }
                    if let Some(cache_write) = usage.cache_write_tokens {
                        task_map.insert("cacheWriteTokens".to_string(), serde_json::json!(cache_write));
                    }
                    if let Some(cache_read) = usage.cache_read_tokens {
                        task_map.insert("cacheReadTokens".to_string(), serde_json::json!(cache_read));
                    }
                }
            }
            
            ui_meta
        } else {
            let default_payload = crate::jobs::types::JobPayload::GenericLlmStream(
                crate::jobs::types::GenericLlmStreamPayload {
                    prompt_text: "Job finalization".to_string(),
                    system_prompt: None,
                    metadata: None,
                }
            );
            
            let mut task_data = metadata.unwrap_or_else(|| serde_json::json!({}));
            if let Value::Object(ref mut task_map) = task_data {
                if let Some(cost) = actual_cost {
                    task_map.insert("actual_cost".to_string(), serde_json::json!(cost));
                }
                
                // Store cache token information from server usage object
                if let Some(usage) = &llm_usage {
                    if let Some(cached_input) = usage.cached_input_tokens {
                        task_map.insert("cachedInputTokens".to_string(), serde_json::json!(cached_input));
                    }
                    if let Some(cache_write) = usage.cache_write_tokens {
                        task_map.insert("cacheWriteTokens".to_string(), serde_json::json!(cache_write));
                    }
                    if let Some(cache_read) = usage.cache_read_tokens {
                        task_map.insert("cacheReadTokens".to_string(), serde_json::json!(cache_read));
                    }
                }
            } else {
                let mut cache_data = serde_json::Map::new();
                if let Some(cost) = actual_cost {
                    cache_data.insert("actual_cost".to_string(), serde_json::json!(cost));
                }
                
                // Store cache token information from server usage object
                if let Some(usage) = &llm_usage {
                    if let Some(cached_input) = usage.cached_input_tokens {
                        cache_data.insert("cachedInputTokens".to_string(), serde_json::json!(cached_input));
                    }
                    if let Some(cache_write) = usage.cache_write_tokens {
                        cache_data.insert("cacheWriteTokens".to_string(), serde_json::json!(cache_write));
                    }
                    if let Some(cache_read) = usage.cache_read_tokens {
                        cache_data.insert("cacheReadTokens".to_string(), serde_json::json!(cache_read));
                    }
                }
                
                task_data = serde_json::Value::Object(cache_data);
            }
            
            crate::utils::job_ui_metadata_builder::JobUIMetadataBuilder::new(default_payload)
                .task_data(task_data)
                .build()
        }
    } else {
        let default_payload = crate::jobs::types::JobPayload::GenericLlmStream(
            crate::jobs::types::GenericLlmStreamPayload {
                prompt_text: "Job finalization".to_string(),
                system_prompt: None,
                metadata: None,
            }
        );
        
        let mut task_data = metadata.unwrap_or_else(|| serde_json::json!({}));
        if let Value::Object(ref mut task_map) = task_data {
            if let Some(cost) = actual_cost {
                task_map.insert("actual_cost".to_string(), serde_json::json!(cost));
            }
            
            // Store cache token information from server usage object
            if let Some(usage) = &llm_usage {
                if let Some(cached_input) = usage.cached_input_tokens {
                    task_map.insert("cachedInputTokens".to_string(), serde_json::json!(cached_input));
                }
                if let Some(cache_write) = usage.cache_write_tokens {
                    task_map.insert("cacheWriteTokens".to_string(), serde_json::json!(cache_write));
                }
                if let Some(cache_read) = usage.cache_read_tokens {
                    task_map.insert("cacheReadTokens".to_string(), serde_json::json!(cache_read));
                }
            }
        } else {
            let mut cache_data = serde_json::Map::new();
            if let Some(cost) = actual_cost {
                cache_data.insert("actual_cost".to_string(), serde_json::json!(cost));
            }
            
            // Store cache token information from server usage object
            if let Some(usage) = &llm_usage {
                if let Some(cached_input) = usage.cached_input_tokens {
                    cache_data.insert("cachedInputTokens".to_string(), serde_json::json!(cached_input));
                }
                if let Some(cache_write) = usage.cache_write_tokens {
                    cache_data.insert("cacheWriteTokens".to_string(), serde_json::json!(cache_write));
                }
                if let Some(cache_read) = usage.cache_read_tokens {
                    cache_data.insert("cacheReadTokens".to_string(), serde_json::json!(cache_read));
                }
            }
            
            task_data = serde_json::Value::Object(cache_data);
        }
        
        crate::utils::job_ui_metadata_builder::JobUIMetadataBuilder::new(default_payload)
            .task_data(task_data)
            .build()
    };
    
    let final_metadata_str = serde_json::to_string(&final_metadata)
        .map_err(|e| AppError::SerializationError(format!("Failed to serialize JobUIMetadata for job {}: {}", job_id, e)))?;
    
    repo.mark_job_completed(
        job_id,
        response_content,
        Some(&final_metadata_str),
        tokens_sent,
        tokens_received,
        Some(model_used),
        Some(system_prompt_template),
        actual_cost,
    ).await?;
    
    info!("Job {} completed successfully", job_id);
    
    // Emit final job status to frontend
    emit_job_status_change(
        app_handle,
        job_id,
        "completed",
        Some("Job completed successfully"),
        actual_cost,
    )?;
    
    Ok(())
}

/// Finalizes job failure with error message, optional structured error information, and cost tracking
/// 
/// ## Partial Usage Tracking for Failed Jobs
/// Even when jobs fail mid-stream, the server proxy attempts to return partial usage information
/// including any costs incurred up to the point of failure. This function properly logs this
/// partial usage and cost data to ensure that even failed jobs that incurred costs are tracked
/// accurately for billing purposes.
/// 
/// The `llm_usage` parameter contains server-authoritative cost information (if available) and
/// should be treated as the ground truth for any costs incurred during the failed job execution.
/// The `llm_usage.cost` field is the definitive, server-calculated cost and should be treated
/// as the single source of truth for billing and display purposes.
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
            // No usage info available when job not found, including no cost
            repo.mark_job_failed(job_id, error_message, None, None, None, None, None).await?;
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
                
                // Store cache token information from server usage object for failed jobs
                if let Some(usage) = &llm_usage {
                    if let Some(cached_input) = usage.cached_input_tokens {
                        task_map.insert("cachedInputTokens".to_string(), serde_json::json!(cached_input));
                    }
                    if let Some(cache_write) = usage.cache_write_tokens {
                        task_map.insert("cacheWriteTokens".to_string(), serde_json::json!(cache_write));
                    }
                    if let Some(cache_read) = usage.cache_read_tokens {
                        task_map.insert("cacheReadTokens".to_string(), serde_json::json!(cache_read));
                    }
                }
            } else {
                let mut failure_data = serde_json::Map::new();
                failure_data.insert("failure_info".to_string(), error_info);
                
                // Store cache token information from server usage object for failed jobs
                if let Some(usage) = &llm_usage {
                    if let Some(cached_input) = usage.cached_input_tokens {
                        failure_data.insert("cachedInputTokens".to_string(), serde_json::json!(cached_input));
                    }
                    if let Some(cache_write) = usage.cache_write_tokens {
                        failure_data.insert("cacheWriteTokens".to_string(), serde_json::json!(cache_write));
                    }
                    if let Some(cache_read) = usage.cache_read_tokens {
                        failure_data.insert("cacheReadTokens".to_string(), serde_json::json!(cache_read));
                    }
                }
                
                ui_meta.task_data = serde_json::Value::Object(failure_data);
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

    // Extract token counts and cost from server response for tracking partial usage in failed jobs
    let (tokens_sent, tokens_received) = if let Some(usage) = &llm_usage {
        (Some(usage.prompt_tokens), Some(usage.completion_tokens))
    } else {
        (None, None)
    };

    // Extract actual cost from LLM usage, with fallback to metadata
    let actual_cost = llm_usage.as_ref().and_then(|usage| usage.cost)
        .or_else(|| {
            current_job.metadata.as_deref()
                .and_then(|metadata_str| serde_json::from_str::<Value>(metadata_str).ok())
                .and_then(|metadata_value| {
                    metadata_value.get("task_data")
                        .and_then(|task_data| task_data.get("actual_cost"))
                        .and_then(|v| v.as_f64())
                })
        });
    
    // Mark the job as failed with usage tracking
    repo.mark_job_failed(
        job_id, 
        error_message, 
        updated_metadata_str.as_deref(),
        tokens_sent,
        tokens_received,
        model_used.as_deref(),
        actual_cost,
    ).await?;
    
    error!("Job {} failed: {}", job_id, error_message);
    
    // Emit final job status to frontend
    emit_job_status_change(
        app_handle,
        job_id,
        "failed",
        Some(error_message),
        actual_cost,
    )?;
    
    Ok(())
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

/// Emit a job status change event
pub fn emit_job_status_change(
    app_handle: &AppHandle,
    job_id: &str,
    status: &str,
    message: Option<&str>,
    actual_cost: Option<f64>,
) -> AppResult<()> {
    let event = JobStatusChangeEvent {
        job_id: job_id.to_string(),
        status: status.to_string(),
        message: message.map(|s| s.to_string()),
        actual_cost,
    };
    
    if let Err(e) = app_handle.emit("job_status_change", event) {
        error!("Failed to emit job status change event for job {}: {}", job_id, e);
        return Err(AppError::TauriError(format!("Failed to emit job status change event: {}", e)));
    }
    
    debug!("Emitted job status change event for job {}: status={}, message={:?}", 
        job_id, status, message);
        
    Ok(())
}