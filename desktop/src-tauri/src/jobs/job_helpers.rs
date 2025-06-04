use std::sync::Arc;
use log::{debug, warn, error};
use serde_json::json;
use tauri::AppHandle;
use tauri::Manager;
use crate::error::{AppError, AppResult};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::models::BackgroundJob;
use crate::jobs::types::JobWorkerMetadata;
use crate::utils::job_metadata_builder::JobMetadataBuilder;

/// Maximum number of job retries
pub const MAX_RETRY_COUNT: u32 = 3;


/// Update job status to running
pub async fn update_job_status_running(repo: &Arc<BackgroundJobRepository>, job_id: &str) -> AppResult<()> {
    repo.mark_job_running(job_id, Some("Processing...")).await
}

/// Update job status to failed
pub async fn update_job_status_failed(repo: &Arc<BackgroundJobRepository>, job_id: &str, error_message: &str) -> AppResult<()> {
    repo.mark_job_failed(job_id, error_message, None).await
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
    repo.mark_job_completed(job_id, response, None, tokens_sent, tokens_received, total_tokens, None, None).await
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

/// Get just the retry count from a job
pub fn get_retry_count_from_job(job: &BackgroundJob) -> Option<u32> {
    if let Some(metadata) = &job.metadata {
        if let Ok(metadata_value) = serde_json::from_str::<serde_json::Value>(&metadata) {
            if let Some(count) = metadata_value.get("retry_count").and_then(|v| v.as_u64()) {
                return Some(count as u32);
            }
        }
    }
    None
}

/// Get retry information from job metadata and error analysis
pub async fn get_retry_info(job: &BackgroundJob, error_opt: Option<&AppError>) -> (bool, u32) {
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
            } else if let Some(app_error) = error_opt {
                // Use the actual AppError instance to determine retryability
                is_retryable = is_app_error_type_retryable_from_error(app_error);
            } else {
                // Check for stored AppError type/code from previous error analysis
                if let Some(error_type) = metadata_value.get("app_error_type").and_then(|v| v.as_str()) {
                    is_retryable = is_app_error_type_retryable(error_type);
                } else {
                    // Default job types that should not be retried
                    match job.task_type.as_str() {
                        // Configuration or validation errors are not retryable
                        "ConfigValidation" | "DirectoryValidation" => is_retryable = false,
                        // Network operations are typically retryable
                        "VoiceTranscription" | "LlmCompletion" => is_retryable = true,
                        // Default to allowing retry
                        _ => is_retryable = true,
                    }
                }
            }
            
            // Get current retry count
            if let Some(count) = metadata_value.get("retry_count").and_then(|v| v.as_u64()) {
                retry_count = count as u32;
            }
        }
    }
    
    // If we have an AppError instance, use it directly; otherwise fall back to error message analysis
    if error_opt.is_none() {
        // Analyze error message for AppError type indicators and common patterns
        if let Some(error) = &job.error_message {
            // Check for specific AppError type patterns in the error message
            if let Some(app_error_retryable) = determine_retryability_from_error_message(error) {
                is_retryable = app_error_retryable;
            }
        }
    }
    
    (is_retryable, retry_count)
}

/// Determine if an AppError instance is retryable
pub fn is_app_error_type_retryable_from_error(error: &AppError) -> bool {
    match error {
        AppError::NetworkError(_) | AppError::HttpError(_) | AppError::OpenRouterError(_) |
        AppError::ServerProxyError(_) | AppError::ExternalServiceError(_) | AppError::StorageError(_) => true,

        AppError::ValidationError(_) | AppError::ConfigError(_) | AppError::AuthError(_) |
        AppError::TokenLimitExceededError(_) | AppError::AccessDenied(_) | AppError::InvalidArgument(_) |
        AppError::SecurityError(_) | AppError::NotFoundError(_) => false,

        AppError::JobError(msg) => {
            let lower_msg = msg.to_lowercase();
            if lower_msg.contains("timeout") || lower_msg.contains("canceled") {
                true
            } else {
                false
            }
        }
        
        // Default to retryable for other potentially transient errors
        AppError::IoError(_) | AppError::SerdeError(_) | AppError::DatabaseError(_) |
        AppError::TauriError(_) | AppError::KeyringError(_) | AppError::FileSystemError(_) |
        AppError::GitError(_) | AppError::InternalError(_) | AppError::FileLockError(_) |
        AppError::InitializationError(_) | AppError::ApplicationError(_) | AppError::SerializationError(_) |
        AppError::SqlxError(_) | AppError::InvalidResponse(_) | AppError::BillingError(_)
        => true,
    }
}

/// Determine if an AppError type is retryable (legacy function for string-based error types)
pub fn is_app_error_type_retryable(error_type: &str) -> bool {
    match error_type {
        // Retryable AppError types - temporary issues that may resolve
        "NetworkError" => true,
        "HttpError" => true,  // Will be further refined by HTTP status code
        "OpenRouterError" => true,  // Rate limits and temporary API issues
        "ServerProxyError" => true,
        "ExternalServiceError" => true,
        "StorageError" => true,  // Temporary storage issues
        
        // Non-retryable AppError types - permanent issues
        "ValidationError" => false,
        "ConfigError" => false,
        "AuthError" => false,
        "TokenLimitExceededError" => false,
        "AccessDenied" => false,
        "InvalidArgument" => false,
        "SecurityError" => false,
        "NotFoundError" => false,  // File/resource not found is usually permanent
        
        // Contextual - could be either, default to retryable for safety
        "JobError" => true,
        "FileSystemError" => true,  // Could be temporary permissions or disk space
        "DatabaseError" => true,  // Could be temporary connection issues
        "TauriError" => true,
        "InternalError" => true,
        "ApplicationError" => true,
        
        // Default to retryable for unknown error types
        _ => true,
    }
}

/// Analyze error message for AppError type indicators and determine retryability
pub fn determine_retryability_from_error_message(error_message: &str) -> Option<bool> {
    let error_lower = error_message.to_lowercase();
    
    // Network and connection related errors - retryable
    if error_lower.contains("timeout") 
        || error_lower.contains("network") 
        || error_lower.contains("connection") 
        || error_lower.contains("dns") 
        || error_lower.contains("socket") 
        || error_lower.contains("unreachable") {
        return Some(true);
    }
    
    // HTTP status code analysis
    if error_lower.contains("http") {
        // 5xx errors are server-side and typically retryable
        if error_lower.contains("500") || error_lower.contains("502") || error_lower.contains("503") 
            || error_lower.contains("504") || error_lower.contains("internal server error") 
            || error_lower.contains("bad gateway") || error_lower.contains("service unavailable") 
            || error_lower.contains("gateway timeout") {
            return Some(true);
        }
        
        // 429 rate limiting is retryable
        if error_lower.contains("429") || error_lower.contains("rate limit") || error_lower.contains("too many requests") {
            return Some(true);
        }
        
        // 4xx client errors are generally not retryable
        if error_lower.contains("400") || error_lower.contains("401") || error_lower.contains("403") 
            || error_lower.contains("404") || error_lower.contains("bad request") 
            || error_lower.contains("unauthorized") || error_lower.contains("forbidden") 
            || error_lower.contains("not found") {
            return Some(false);
        }
    }
    
    // Validation and configuration errors - not retryable
    if error_lower.contains("validation") 
        || error_lower.contains("invalid input") 
        || error_lower.contains("invalid argument") 
        || error_lower.contains("configuration") 
        || error_lower.contains("config") 
        || error_lower.contains("missing required") 
        || error_lower.contains("parse error") 
        || error_lower.contains("syntax error") {
        return Some(false);
    }
    
    // Authentication and authorization errors - not retryable
    if error_lower.contains("authentication") 
        || error_lower.contains("authorization") 
        || error_lower.contains("access denied") 
        || error_lower.contains("permission denied") 
        || error_lower.contains("unauthorized") 
        || error_lower.contains("token") && (error_lower.contains("invalid") || error_lower.contains("expired")) {
        return Some(false);
    }
    
    // Token limit errors - not retryable (need different model or smaller input)
    if error_lower.contains("token limit") 
        || error_lower.contains("context length") 
        || error_lower.contains("max tokens") 
        || error_lower.contains("input too long") {
        return Some(false);
    }
    
    // If no specific pattern is found, return None to use default logic
    None
}

/// Prepare updated metadata for job retry with comprehensive error context
/// This correctly parses the existing BackgroundJob.metadata (stringified JobWorkerMetadata),
/// adds retry-specific fields to the additional_params, and returns the new serialized metadata string.
pub async fn prepare_retry_metadata(job: &BackgroundJob, new_retry_count: u32, error: &AppError) -> AppResult<String> {
    // Parse the existing metadata as JobWorkerMetadata
    let mut worker_metadata = match &job.metadata {
        Some(metadata_str) => {
            match serde_json::from_str::<JobWorkerMetadata>(metadata_str) {
                Ok(metadata) => metadata,
                Err(e) => {
                    error!("Failed to parse job metadata as JobWorkerMetadata for job {}: {}. Metadata: {}", 
                        job.id, e, metadata_str);
                    return Err(AppError::JobError(
                        format!("Corrupted job metadata prevents retry: {}", e)
                    ));
                }
            }
        },
        None => {
            error!("Job {} has no metadata, cannot safely retry without essential metadata", job.id);
            return Err(AppError::JobError(
                "Missing job metadata prevents retry".to_string()
            ));
        }
    };
    
    // Extract existing additional_params and create a new builder
    let existing_additional_params = worker_metadata.additional_params.take();
    let mut builder = JobMetadataBuilder::from_existing_additional_params(existing_additional_params);
    
    // Store AppError type and retryability directly from the error instance
    let error_variant = format!("{:?}", error).split('(').next().unwrap_or("Unknown").to_string();
    
    // Add retry information to additional_params
    builder = builder
        .retry_count(new_retry_count)
        .custom_field("app_error_type", json!(error_variant))
        .custom_field("retryable", json!(is_app_error_type_retryable_from_error(error)));
    
    // Add comprehensive error entry
    let timestamp = chrono::Utc::now().to_rfc3339();
    let mut error_message = error.to_string();
    
    // Add error classification based on message analysis
    if let Some(classification) = classify_error_by_message(&error_message) {
        builder = builder.custom_field("error_classification", json!(classification));
    }
    
    // Add HTTP status code if it's an HTTP error
    if let Some(status_code) = extract_http_status_code(&error_message) {
        builder = builder.custom_field("http_status_code", json!(status_code));
        // Add status code to error message for the error entry
        error_message = format!("{} (HTTP {})", error_message, status_code);
    }
    
    // Add the error entry with comprehensive context
    builder = builder.add_error(new_retry_count, timestamp, error_message)
        .custom_field("app_error_type", json!(error_variant))
        .custom_field("is_retryable", json!(is_app_error_type_retryable_from_error(error)));
    
    // Add retry strategy information
    builder = builder
        .custom_field("retry_strategy", json!({
            "max_retries": MAX_RETRY_COUNT,
            "backoff_type": "exponential",
            "base_delay_seconds": 2,
            "max_delay_seconds": 60
        }))
        .custom_field("last_retry_at", json!(chrono::Utc::now().to_rfc3339()));
    
    // Update the worker_metadata with the new additional_params
    worker_metadata.additional_params = Some(builder.build_value());
    
    // Serialize the entire JobWorkerMetadata back to a string
    match serde_json::to_string(&worker_metadata) {
        Ok(serialized) => Ok(serialized),
        Err(e) => {
            error!("Failed to serialize updated JobWorkerMetadata for job {}: {}", job.id, e);
            Err(AppError::SerializationError(
                format!("Failed to serialize retry metadata: {}", e)
            ))
        }
    }
}

/// Extract AppError type from error message patterns
pub fn extract_app_error_type_from_message(error_message: &str) -> Option<String> {
    let error_lower = error_message.to_lowercase();
    
    // Check for specific AppError type indicators in the message
    if error_lower.contains("network") || error_lower.contains("connection") || error_lower.contains("dns") {
        Some("NetworkError".to_string())
    } else if error_lower.contains("http") || error_lower.contains("status code") {
        Some("HttpError".to_string())
    } else if error_lower.contains("openrouter") || error_lower.contains("rate limit") {
        Some("OpenRouterError".to_string())
    } else if error_lower.contains("server proxy") || error_lower.contains("proxy") {
        Some("ServerProxyError".to_string())
    } else if error_lower.contains("validation") || error_lower.contains("invalid input") {
        Some("ValidationError".to_string())
    } else if error_lower.contains("config") || error_lower.contains("configuration") {
        Some("ConfigError".to_string())
    } else if error_lower.contains("auth") || error_lower.contains("unauthorized") || error_lower.contains("forbidden") {
        Some("AuthError".to_string())
    } else if error_lower.contains("token limit") || error_lower.contains("context length") {
        Some("TokenLimitExceededError".to_string())
    } else if error_lower.contains("access denied") || error_lower.contains("permission denied") {
        Some("AccessDenied".to_string())
    } else if error_lower.contains("not found") && !error_lower.contains("network") {
        Some("NotFoundError".to_string())
    } else if error_lower.contains("file") || error_lower.contains("directory") {
        Some("FileSystemError".to_string())
    } else if error_lower.contains("database") || error_lower.contains("sql") {
        Some("DatabaseError".to_string())
    } else if error_lower.contains("job") && error_lower.contains("timeout") {
        Some("JobError".to_string())
    } else {
        None
    }
}

/// Classify error by message content for better categorization
pub fn classify_error_by_message(error_message: &str) -> Option<String> {
    let error_lower = error_message.to_lowercase();
    
    if error_lower.contains("timeout") {
        Some("timeout".to_string())
    } else if error_lower.contains("network") || error_lower.contains("connection") {
        Some("connectivity".to_string())
    } else if error_lower.contains("rate limit") || error_lower.contains("429") {
        Some("rate_limiting".to_string())
    } else if error_lower.contains("validation") || error_lower.contains("invalid") {
        Some("validation".to_string())
    } else if error_lower.contains("auth") || error_lower.contains("unauthorized") {
        Some("authentication".to_string())
    } else if error_lower.contains("5") && error_lower.contains("server") {
        Some("server_error".to_string())
    } else if error_lower.contains("4") && (error_lower.contains("client") || error_lower.contains("bad request")) {
        Some("client_error".to_string())
    } else {
        Some("unknown".to_string())
    }
}

/// Extract HTTP status code from error message
pub fn extract_http_status_code(error_message: &str) -> Option<u16> {
    // Look for common HTTP status code patterns
    let status_patterns = [
        (r"status.?code.?(\d{3})", 1),
        (r"http.?(\d{3})", 1),
        (r"(\d{3}).?(error|status)", 1),
    ];
    
    for (pattern, group) in status_patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(captures) = re.captures(error_message) {
                if let Some(status_match) = captures.get(group) {
                    if let Ok(status) = status_match.as_str().parse::<u16>() {
                        // Validate it's a real HTTP status code
                        if (100..600).contains(&status) {
                            return Some(status);
                        }
                    }
                }
            }
        }
    }
    
    None
}