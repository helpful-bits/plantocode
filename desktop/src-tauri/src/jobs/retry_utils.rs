use crate::error::{AppError, AppResult};
use crate::jobs::types::JobUIMetadata;
use crate::models::BackgroundJob;
use log::{debug, error};
use serde_json::json;
use std::sync::Arc;

/// Maximum number of job retries
pub const MAX_RETRY_COUNT: u32 = 3;

/// Get retry count from job metadata
pub fn get_retry_count_from_job(job: &BackgroundJob) -> Option<u32> {
    if let Some(metadata_str) = &job.metadata {
        if let Ok(ui_metadata) = serde_json::from_str::<JobUIMetadata>(metadata_str) {
            if let Some(retry_count) = ui_metadata.task_data.get("retry_count") {
                return retry_count.as_u64().map(|c| c as u32);
            }
        }
    }
    None
}

/// Calculate retry delay using exponential backoff
pub fn calculate_retry_delay(retry_count: u32) -> u32 {
    let base_delay_seconds = 2;
    let max_delay_seconds = 60;
    let exp_delay = base_delay_seconds * (2u32.pow(retry_count));
    let jitter = (retry_count as f64 * 0.1).round() as u32;
    std::cmp::min(exp_delay + jitter, max_delay_seconds)
}

/// Prepare updated metadata for job retry
pub async fn prepare_retry_metadata(
    job: &BackgroundJob,
    new_retry_count: u32,
    error: &AppError,
) -> AppResult<String> {
    let metadata_str = job
        .metadata
        .as_ref()
        .ok_or_else(|| AppError::JobError("Job metadata is missing".to_string()))?;

    let mut ui_metadata: JobUIMetadata = serde_json::from_str(metadata_str)
        .map_err(|e| AppError::JobError(format!("Failed to parse JobUIMetadata: {}", e)))?;

    // Add retry information to task_data
    let retry_info = json!({
        "retry_count": new_retry_count,
        "error_type": format!("{:?}", error),
        "error_message": error.to_string(),
        "last_retry_at": chrono::Utc::now().to_rfc3339()
    });

    if let serde_json::Value::Object(ref mut task_map) = ui_metadata.task_data {
        task_map.insert("retry_count".to_string(), json!(new_retry_count));
        task_map.insert("retry_info".to_string(), retry_info);
    } else {
        ui_metadata.task_data = json!({
            "retry_count": new_retry_count,
            "retry_info": retry_info
        });
    }

    serde_json::to_string(&ui_metadata).map_err(|e| {
        AppError::SerializationError(format!("Failed to serialize retry metadata: {}", e))
    })
}

/// Get retry information from job metadata
pub async fn get_retry_info(job: &BackgroundJob, error_opt: Option<&AppError>) -> (bool, u32) {
    let current_retry_count = get_retry_count_from_job(job).unwrap_or(0);

    let is_retryable = match error_opt {
        Some(error) => match error {
            AppError::ConfigError(_)
            | AppError::ValidationError(_)
            | AppError::SerializationError(_) => false,
            _ => true,
        },
        None => true,
    };

    (is_retryable, current_retry_count)
}
