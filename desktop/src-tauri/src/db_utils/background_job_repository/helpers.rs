use crate::error::AppResult;
use crate::models::{BackgroundJob, BackgroundJobSummary, ErrorDetails};
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use serde_json::{Value, Map};
use std::str::FromStr;
use crate::models::JobStatus;

/// Helper function to deep merge JSON values
pub(super) fn deep_merge_json(target: &mut serde_json::Map<String, Value>, key: &str, value: Value) {
    match target.get_mut(key) {
        Some(existing) => {
            if let (Some(existing_obj), Some(value_obj)) =
                (existing.as_object_mut(), value.as_object())
            {
                // Both are objects, merge recursively
                for (k, v) in value_obj {
                    deep_merge_json(existing_obj, k, v.clone());
                }
            } else {
                // Not both objects, replace the value
                target.insert(key.to_string(), value);
            }
        }
        None => {
            // Key doesn't exist, insert new value
            target.insert(key.to_string(), value);
        }
    }
}

/// Helper function to convert a database row to a BackgroundJob struct
/// Ensures proper retrieval of cost data from database
pub(super) fn row_to_job(row: &SqliteRow) -> AppResult<BackgroundJob> {
    let id: String = row.try_get::<'_, String, _>("id")?;
    let session_id: String = row.try_get::<'_, String, _>("session_id")?;
    let task_type: String = row.try_get::<'_, String, _>("task_type")?;
    let status_raw: String = row.try_get::<'_, String, _>("status")?;
    let status = JobStatus::from_str(&status_raw)
        .map(|s| s.to_string())
        .unwrap_or(status_raw);
    let prompt: String = row.try_get::<'_, String, _>("prompt")?;
    let created_at: i64 = row.try_get::<'_, i64, _>("created_at")?;

    let response: Option<String> = row
        .try_get::<'_, Option<String>, _>("response")
        .unwrap_or(None);
    let error_message: Option<String> = row
        .try_get::<'_, Option<String>, _>("error_message")
        .unwrap_or(None);
    let tokens_sent: Option<i32> = row
        .try_get::<'_, Option<i64>, _>("tokens_sent")
        .map(|v| v.map(|val| val as i32))
        .unwrap_or(None);
    let tokens_received: Option<i32> = row
        .try_get::<'_, Option<i64>, _>("tokens_received")
        .map(|v| v.map(|val| val as i32))
        .unwrap_or(None);
    let cache_write_tokens: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("cache_write_tokens")
        .unwrap_or(None);
    let cache_read_tokens: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("cache_read_tokens")
        .unwrap_or(None);
    let model_used: Option<String> = row
        .try_get::<'_, Option<String>, _>("model_used")
        .unwrap_or(None);
    let metadata: Option<String> = row
        .try_get::<'_, Option<String>, _>("metadata")
        .unwrap_or(None);
    let system_prompt_template: Option<String> = row
        .try_get::<'_, Option<String>, _>("system_prompt_template")
        .unwrap_or(None);
    let updated_at: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("updated_at")
        .unwrap_or(None);
    let start_time: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("start_time")
        .unwrap_or(None);
    let end_time: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("end_time")
        .unwrap_or(None);
    // Retrieve cost from database with proper error handling
    let actual_cost = row
        .try_get::<'_, Option<f64>, _>("actual_cost")
        .unwrap_or(None);
    let is_finalized = row
        .try_get::<'_, Option<bool>, _>("is_finalized")
        .unwrap_or(None);

    // Extract error_details from metadata if present
    let error_details: Option<ErrorDetails> = metadata
        .as_ref()
        .and_then(|meta_str| serde_json::from_str::<Value>(meta_str).ok())
        .and_then(|meta_value| meta_value.get("errorDetails").cloned())
        .and_then(|error_value| serde_json::from_value::<ErrorDetails>(error_value).ok());

    Ok(BackgroundJob {
        id,
        session_id,
        task_type,
        status,
        prompt,
        response,
        error_message,
        tokens_sent,
        tokens_received,
        cache_write_tokens,
        cache_read_tokens,
        model_used,
        actual_cost,
        duration_ms: None,
        metadata,
        system_prompt_template,
        created_at,
        updated_at,
        start_time,
        end_time,
        is_finalized,
        error_details,
    })
}

/// Helper function to convert a database row to a BackgroundJobSummary struct.
/// Reads only summary columns, excluding prompt/response/system_prompt_template/metadata.
/// Maintains status normalization consistent with row_to_job.
pub(super) fn row_to_job_summary(row: &SqliteRow) -> AppResult<BackgroundJobSummary> {
    let id: String = row.try_get::<'_, String, _>("id")?;
    let session_id: String = row.try_get::<'_, String, _>("session_id")?;
    let task_type: String = row.try_get::<'_, String, _>("task_type")?;
    let status_raw: String = row.try_get::<'_, String, _>("status")?;
    // Normalize status using JobStatus enum (consistent with row_to_job)
    let status = JobStatus::from_str(&status_raw)
        .map(|s| s.to_string())
        .unwrap_or(status_raw);
    let error_message: Option<String> = row
        .try_get::<'_, Option<String>, _>("error_message")
        .unwrap_or(None);
    let tokens_sent: Option<i32> = row
        .try_get::<'_, Option<i64>, _>("tokens_sent")
        .map(|v| v.map(|val| val as i32))
        .unwrap_or(None);
    let tokens_received: Option<i32> = row
        .try_get::<'_, Option<i64>, _>("tokens_received")
        .map(|v| v.map(|val| val as i32))
        .unwrap_or(None);
    let cache_write_tokens: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("cache_write_tokens")
        .unwrap_or(None);
    let cache_read_tokens: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("cache_read_tokens")
        .unwrap_or(None);
    let model_used: Option<String> = row
        .try_get::<'_, Option<String>, _>("model_used")
        .unwrap_or(None);
    let actual_cost: Option<f64> = row
        .try_get::<'_, Option<f64>, _>("actual_cost")
        .unwrap_or(None);
    let duration_ms: Option<i64> = None;
    let created_at: i64 = row.try_get::<'_, i64, _>("created_at")?;
    let updated_at: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("updated_at")
        .unwrap_or(None);
    let start_time: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("start_time")
        .unwrap_or(None);
    let end_time: Option<i64> = row
        .try_get::<'_, Option<i64>, _>("end_time")
        .unwrap_or(None);
    let is_finalized: Option<bool> = row
        .try_get::<'_, Option<bool>, _>("is_finalized")
        .unwrap_or(None);
    let plan_title: Option<String> = row
        .try_get::<'_, Option<String>, _>("plan_title")
        .unwrap_or(None);
    let markdown_conversion_status: Option<String> = row
        .try_get::<'_, Option<String>, _>("markdown_conversion_status")
        .unwrap_or(None);

    Ok(BackgroundJobSummary {
        id,
        session_id,
        task_type,
        status,
        error_message,
        tokens_sent,
        tokens_received,
        cache_write_tokens,
        cache_read_tokens,
        model_used,
        actual_cost,
        duration_ms,
        created_at,
        updated_at,
        start_time,
        end_time,
        is_finalized: is_finalized.unwrap_or(false),
        plan_title,
        markdown_conversion_status,
    })
}
