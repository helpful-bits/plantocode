use serde_json::Value;
use sqlx::SqlitePool;
use std::collections::BTreeSet;
use std::sync::Arc;
use tauri::Manager;

use crate::db_utils::session_repository::SessionRepository;
use crate::error::{AppError, AppResult};

/// Auto-apply discovered files service
/// - Backend auto-apply is additive-only and respects user force_excluded_files;
///   items in excluded are never re-included by backend jobs.
/// - Concurrency is hardened in repository with BEGIN IMMEDIATE.
/// - Persists into sessions.included_files / sessions.force_excluded_files (newline-delimited TEXT).
/// - Only for file_relevance_assessment and extended_path_finder jobs.
#[derive(Debug)]
pub struct AutoApplyOutcome {
    pub session_id: String,
    pub job_id: String,
    pub task_type: String,
    pub applied_files: Vec<String>,
}

fn extract_files_from_response(response: &Value) -> Vec<String> {
    // Dispatcher standardizes file-finding responses to { files: string[] }
    match response.get("files") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .collect(),
        _ => vec![],
    }
}

pub async fn auto_apply_files_for_job(
    pool: &Arc<SqlitePool>,
    session_repo: &SessionRepository,
    app_handle: &tauri::AppHandle,
    session_id: &str,
    job_id: &str,
    task_type: &str,
    response_json: &Value,
) -> AppResult<Option<AutoApplyOutcome>> {
    // Limit to supported types
    let is_supported = matches!(
        task_type,
        "file_relevance_assessment" | "extended_path_finder"
    );
    if !is_supported {
        return Ok(None);
    }

    // Extract files from standardized payload
    let files = extract_files_from_response(response_json);
    if files.is_empty() {
        return Ok(None);
    }

    // Sanitize and dedupe via BTreeSet (stable order)
    let files_set: BTreeSet<String> = files.into_iter().collect();
    if files_set.is_empty() {
        return Ok(None);
    }

    // Convert to vec for the atomic merge operation
    let files_to_add: Vec<String> = files_set.into_iter().collect();

    log::debug!(
        "auto_apply_files_for_job: session={}, task_type={}, files_to_add={}",
        session_id,
        task_type,
        files_to_add.len()
    );

    // Use cache to merge files respecting exclusions
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let actually_applied = cache
        .merge_included_respecting_exclusions(app_handle, session_id, &files_to_add)
        .await?;

    // Only return outcome if we actually applied new files
    if actually_applied.is_empty() {
        return Ok(None);
    }

    Ok(Some(AutoApplyOutcome {
        session_id: session_id.to_string(),
        job_id: job_id.to_string(),
        task_type: task_type.to_string(),
        applied_files: actually_applied,
    }))
}
