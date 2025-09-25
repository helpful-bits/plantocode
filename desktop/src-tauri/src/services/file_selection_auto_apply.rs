use serde_json::Value;
use sqlx::SqlitePool;
use std::collections::BTreeSet;
use std::sync::Arc;

use crate::db_utils::session_repository::SessionRepository;
use crate::error::{AppError, AppResult};

/// Auto-apply discovered files service
/// - Persists into sessions.included_files / sessions.force_excluded_files (newline-delimited TEXT).
/// - Only for file_relevance_assessment and extended_path_finder jobs.
/// - Dedupe, trim; when including a file, ensure it is removed from force_excluded_files for consistency.
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

fn merge_newline_list(existing: &str) -> BTreeSet<String> {
    existing
        .lines()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

pub async fn auto_apply_files_for_job(
    pool: &Arc<SqlitePool>,
    session_repo: &SessionRepository,
    session_id: &str,
    job_id: &str,
    task_type: &str,
    response_json: &Value,
) -> AppResult<Option<AutoApplyOutcome>> {
    // Limit to supported types
    let is_supported = matches!(task_type, "file_relevance_assessment" | "extended_path_finder");
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

    // Load current session
    let session_opt = session_repo
        .get_session_by_id(session_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to load session {}: {}", session_id, e)))?;

    let mut session = match session_opt {
        Some(s) => s,
        None => return Ok(None),
    };

    // Merge included_files (newline list) with new files; remove from force_excluded_files
    let mut included = merge_newline_list(&session.included_files.join("\n"));
    let mut excluded = merge_newline_list(&session.force_excluded_files.join("\n"));

    let mut actually_applied = Vec::new();
    for f in &files_set {
        if !included.contains(f) {
            actually_applied.push(f.clone());
        }
        included.insert(f.clone());
        excluded.remove(f);
    }

    // Only update if we actually applied new files
    if actually_applied.is_empty() {
        return Ok(None);
    }

    // Persist updates
    session.included_files = included.into_iter().collect::<Vec<_>>();
    session.force_excluded_files = excluded.into_iter().collect::<Vec<_>>();

    session_repo
        .update_session(&session)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to persist auto-applied files for session {}: {}", session_id, e)))?;

    Ok(Some(AutoApplyOutcome {
        session_id: session_id.to_string(),
        job_id: job_id.to_string(),
        task_type: task_type.to_string(),
        applied_files: actually_applied,
    }))
}