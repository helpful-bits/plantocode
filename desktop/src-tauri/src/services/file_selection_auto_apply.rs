use serde_json::Value;
use sqlx::SqlitePool;
use std::collections::{BTreeSet, HashSet};
use std::sync::Arc;
use tauri::Manager;

use crate::db_utils::session_repository::SessionRepository;
use crate::error::{AppError, AppResult};
use crate::services::{HistoryStateSequencer, SessionCache};

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

/// Extract and sanitize file paths from response JSON.
/// Handles various edge cases:
/// - Stringified JSON arrays (e.g., "[\"file1.txt\", \"file2.txt\"]") are parsed
/// - Non-string elements are discarded
/// - Empty strings are filtered out
/// - Strings that look like JSON arrays are treated as invalid paths
fn extract_files_from_response(response: &Value) -> Vec<String> {
    // Dispatcher standardizes file-finding responses to { files: string[] }
    match response.get("files") {
        Some(Value::Array(arr)) => {
            let mut result = Vec::new();
            for item in arr {
                match item {
                    Value::String(s) => {
                        let trimmed = s.trim();
                        if trimmed.is_empty() {
                            continue;
                        }
                        // Check if this is a stringified JSON array
                        if trimmed.starts_with('[') && trimmed.ends_with(']') {
                            // Attempt to parse as JSON array and flatten
                            if let Ok(nested_arr) = serde_json::from_str::<Vec<Value>>(trimmed) {
                                for nested_item in nested_arr {
                                    if let Value::String(nested_s) = nested_item {
                                        let nested_trimmed = nested_s.trim();
                                        // Reject if still looks like JSON
                                        if !nested_trimmed.is_empty()
                                            && !(nested_trimmed.starts_with('[')
                                                && nested_trimmed.ends_with(']'))
                                        {
                                            result.push(nested_trimmed.to_string());
                                        }
                                    }
                                }
                            }
                            // If parse fails, discard this malformed entry
                        } else {
                            // Normal file path
                            result.push(trimmed.to_string());
                        }
                    }
                    // Skip non-string elements
                    _ => continue,
                }
            }
            result
        }
        Some(Value::String(s)) => {
            // Handle case where files is a stringified JSON array
            let trimmed = s.trim();
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                if let Ok(arr) = serde_json::from_str::<Vec<Value>>(trimmed) {
                    return arr
                        .iter()
                        .filter_map(|v| v.as_str())
                        .map(|s| s.trim().to_string())
                        .filter(|s| {
                            !s.is_empty() && !(s.starts_with('[') && s.ends_with(']'))
                        })
                        .collect();
                }
            }
            vec![]
        }
        _ => vec![],
    }
}

fn parse_file_list(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if let Ok(values) = serde_json::from_str::<Vec<String>>(trimmed) {
        return values
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect();
    }

    trimmed
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

pub async fn auto_apply_files_for_job(
    _pool: &Arc<SqlitePool>,
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

    let current_state = session_repo.get_file_history_state(session_id).await?;
    let (current_included, current_excluded) = if let Some(entry) = current_state
        .entries
        .get(current_state.current_index as usize)
    {
        (
            parse_file_list(&entry.included_files),
            parse_file_list(&entry.force_excluded_files),
        )
    } else {
        let cache = app_handle.state::<Arc<SessionCache>>().inner().clone();
        if let Ok(existing) = cache.get_session(app_handle, session_id).await {
            (existing.included_files, existing.force_excluded_files)
        } else if let Ok(Some(existing)) = session_repo.get_session_by_id(session_id).await {
            (existing.included_files, existing.force_excluded_files)
        } else {
            (Vec::new(), Vec::new())
        }
    };

    let excluded_set: HashSet<String> = current_excluded.iter().cloned().collect();
    let mut included_set: HashSet<String> = current_included.iter().cloned().collect();
    let mut actually_applied = Vec::new();

    for file in files_to_add {
        let trimmed = file.trim();
        if trimmed.is_empty() {
            continue;
        }
        if excluded_set.contains(trimmed) {
            continue;
        }
        if included_set.insert(trimmed.to_string()) {
            actually_applied.push(trimmed.to_string());
        }
    }

    if actually_applied.is_empty() {
        return Ok(None);
    }

    let now = crate::utils::date_utils::get_timestamp();
    let device_id = crate::auth::device_id_manager::get_or_create(app_handle).ok();

    let next_sequence = current_state
        .entries
        .iter()
        .map(|entry| entry.sequence_number)
        .max()
        .unwrap_or(-1)
        + 1;

    let mut included_vec: Vec<String> = included_set.into_iter().collect();
    let mut excluded_vec: Vec<String> = excluded_set.into_iter().collect();
    included_vec.sort();
    excluded_vec.sort();

    let included_json = serde_json::to_string(&included_vec)
        .unwrap_or_else(|_| "[]".to_string());
    let excluded_json = serde_json::to_string(&excluded_vec)
        .unwrap_or_else(|_| "[]".to_string());

    let new_entry = crate::db_utils::session_repository::FileSelectionHistoryEntry {
        included_files: included_json,
        force_excluded_files: excluded_json,
        created_at: now,
        device_id,
        op_type: Some("auto-apply".to_string()),
        sequence_number: next_sequence,
        version: current_state.version,
    };

    let current_index = if current_state.entries.is_empty() {
        0
    } else {
        current_state.current_index as usize
    };

    let mut updated_entries: Vec<_> = if current_state.entries.is_empty() {
        Vec::new()
    } else {
        current_state.entries[..=current_index].to_vec()
    };
    updated_entries.push(new_entry);

    if updated_entries.len() > 50 {
        let trim_start = updated_entries.len() - 50;
        updated_entries = updated_entries.split_off(trim_start);
    }

    let new_index = if updated_entries.is_empty() {
        0
    } else {
        (updated_entries.len() - 1) as i64
    };

    let new_state = crate::db_utils::session_repository::FileHistoryState {
        entries: updated_entries,
        current_index: new_index,
        version: current_state.version,
        checksum: String::new(),
    };

    let sequencer = app_handle.state::<Arc<HistoryStateSequencer>>();
    let _ = sequencer
        .enqueue_sync_files(session_id.to_string(), new_state, current_state.version)
        .await
        .map_err(|e| AppError::InternalError(format!("auto-apply history sync failed: {}", e)))?;

    Ok(Some(AutoApplyOutcome {
        session_id: session_id.to_string(),
        job_id: job_id.to_string(),
        task_type: task_type.to_string(),
        applied_files: actually_applied,
    }))
}
