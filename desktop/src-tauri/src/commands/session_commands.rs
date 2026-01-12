use crate::error::AppResult;
use crate::models::{
    CreateSessionRequest, FileSelectionHistoryEntryWithTimestamp,
    JobStatus, Session,
};
use crate::utils::hash_utils::{hash_string, sha256_hash};
use crate::db_utils::session_repository::{SessionRepository, TaskHistoryState, FileHistoryState};
use crate::services::history_state_sequencer::HistoryStateSequencer;
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

/// Create a new session in the database
#[tauri::command]
pub async fn create_session_command(
    app_handle: AppHandle,
    session_data: CreateSessionRequest,
) -> AppResult<Session> {
    log::debug!("Creating session with data: {:?}", session_data);

    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    let now = chrono::Utc::now().timestamp_millis();

    // Build the complete session with defaults
    let session = Session {
        id: session_data
            .id
            .unwrap_or_else(|| format!("session_{}_{}", now, uuid::Uuid::new_v4().to_string())),
        name: session_data
            .name
            .unwrap_or_else(|| "Untitled Session".to_string()),
        project_directory: session_data.project_directory.clone(),
        project_hash: session_data
            .project_hash
            .unwrap_or_else(|| hash_string(&session_data.project_directory)),
        task_description: session_data.task_description,
        search_term: session_data.search_term,
        search_selected_files_only: session_data.search_selected_files_only.unwrap_or(false),
        model_used: session_data.model_used.filter(|s| !s.is_empty()),
        created_at: session_data.created_at.unwrap_or(now),
        updated_at: now,
        included_files: session_data.included_files,
        force_excluded_files: session_data.force_excluded_files,
        video_analysis_prompt: session_data.video_analysis_prompt,
        merge_instructions: session_data.merge_instructions,
    };

    log::debug!("Constructed session object: {:?}", session);

    // Create the session in DB first (DB-first for safety)
    repo.create_session(&session).await?;

    // After DB insert, update cache (cache will emit session-updated)
    cache.upsert_session(&app_handle, &session).await?;

    // Emit session-created event
    crate::events::session_events::emit_session_created(&app_handle, &session)?;

    // Return the created session
    Ok(session)
}

/// Get a session by ID
#[tauri::command]
pub async fn get_session_command(
    app_handle: AppHandle,
    session_id: String,
) -> AppResult<Option<Session>> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();

    Ok(Some(cache.get_session(&app_handle, &session_id).await?))
}

/// Get all sessions for a project
#[tauri::command]
pub async fn get_sessions_for_project_command(
    app_handle: AppHandle,
    project_directory: String,
) -> AppResult<Vec<Session>> {
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Calculate the project hash
    let project_hash = hash_string(&project_directory);

    // Get sessions with the given project hash, already ordered by updated_at DESC
    let project_sessions = repo.get_sessions_by_project_hash(&project_hash).await?;

    Ok(project_sessions)
}

/// Update an existing session
#[tauri::command]
pub async fn update_session_command(
    app_handle: AppHandle,
    session_data: Session,
) -> AppResult<Session> {
    log::debug!("Updating session with data: {:?}", session_data);

    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();

    let mut sanitized = session_data.clone();
    if let Ok(existing) = cache.get_session(&app_handle, &session_data.id).await {
        sanitized.task_description = existing.task_description;
        sanitized.included_files = existing.included_files;
        sanitized.force_excluded_files = existing.force_excluded_files;
    }

    // Update the session via cache (cache emits events)
    cache.upsert_session(&app_handle, &sanitized).await?;

    // Return the updated session
    Ok(sanitized)
}

/// Delete a session and cancel any related background jobs
#[tauri::command]
pub async fn delete_session_command(app_handle: AppHandle, session_id: String) -> AppResult<()> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let session_repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let job_repo = app_handle
        .state::<Arc<crate::db_utils::background_job_repository::BackgroundJobRepository>>()
        .inner()
        .clone();

    // First cancel any active jobs for this session
    job_repo.cancel_session_jobs(&session_id).await?;

    // Then delete the session from DB (DB-first for safety)
    session_repo.delete_session(&session_id).await?;

    // Remove from cache
    cache.remove_session(&session_id).await;

    // Emit session-deleted event
    crate::events::session_events::emit_session_deleted(&app_handle, &session_id)?;

    Ok(())
}

/// Rename a session
#[tauri::command]
pub async fn rename_session_command(
    app_handle: AppHandle,
    session_id: String,
    name: String,
) -> AppResult<()> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();

    // Update via cache using partial update
    cache.update_fields_partial(&app_handle, &session_id, &serde_json::json!({"name": name})).await?;

    // Ensure immediate persistence so DB reads reflect the new name
    cache.flush_session_if_dirty(&app_handle, &session_id).await
}

/// Update a session's project directory and hash
#[tauri::command]
pub async fn update_session_project_directory_command(
    app_handle: AppHandle,
    session_id: String,
    project_directory: String,
) -> AppResult<()> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();

    // Compute new hash
    let new_hash = crate::utils::hash_utils::hash_string(&project_directory);

    // Update via cache using partial update
    cache.update_fields_partial(
        &app_handle,
        &session_id,
        &serde_json::json!({
            "projectDirectory": project_directory,
            "projectHash": new_hash
        })
    ).await
}

/// Clear all sessions for a project
#[tauri::command]
pub async fn clear_all_project_sessions_command(
    app_handle: AppHandle,
    project_directory: String,
) -> AppResult<()> {
    let session_repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let job_repo = app_handle
        .state::<Arc<crate::db_utils::background_job_repository::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Get the project hash
    let project_hash = hash_string(&project_directory);

    // Get all sessions for this project
    let project_sessions = session_repo
        .get_sessions_by_project_hash(&project_hash)
        .await?;

    // Cancel all jobs and delete all sessions for this project
    for session in project_sessions {
        // Cancel any active jobs
        job_repo.cancel_session_jobs(&session.id).await?;

        // Delete the session
        session_repo.delete_session(&session.id).await?;
    }

    Ok(())
}

/// Update specific fields of a session
#[tauri::command]
pub async fn update_session_fields_command(
    app_handle: AppHandle,
    session_id: String,
    fields_to_update: Value,
) -> AppResult<Session> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Update via cache using partial update (cache emits session-updated)
    cache.update_fields_partial(&app_handle, &session_id, &fields_to_update).await?;

    // Ensure immediate persistence when name field changes
    if let Some(fields) = fields_to_update.as_object() {
        if fields.contains_key("name") {
            cache.flush_session_if_dirty(&app_handle, &session_id).await?;
        }
    }

    // Get updated session from cache
    let updated_session = cache.get_session(&app_handle, &session_id).await?;

    Ok(updated_session)
}

#[tauri::command]
pub async fn get_task_description_history_command(
    app_handle: AppHandle,
    session_id: String,
) -> AppResult<Vec<String>> {
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    let history_with_timestamps = repo.get_task_description_history(&session_id).await?;
    let descriptions: Vec<String> = history_with_timestamps
        .into_iter()
        .map(|(desc, _)| desc)
        .collect();
    Ok(descriptions)
}

#[tauri::command]
pub async fn sync_task_description_history_command(
    app_handle: AppHandle,
    session_id: String,
    history: Vec<String>,
) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    repo.sync_task_description_history(&session_id, &history)
        .await
}

#[tauri::command]
pub async fn get_file_selection_history_command(
    app_handle: AppHandle,
    session_id: String,
) -> AppResult<Vec<FileSelectionHistoryEntryWithTimestamp>> {
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    let history_tuples = repo.get_file_selection_history(&session_id).await?;

    let mut history = Vec::new();
    for (included_files_text, force_excluded_files_text, created_at) in history_tuples {
        let included_files = included_files_text
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| line.to_string())
            .collect();

        let force_excluded_files = force_excluded_files_text
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| line.to_string())
            .collect();

        history.push(FileSelectionHistoryEntryWithTimestamp {
            included_files,
            force_excluded_files,
            created_at,
        });
    }

    Ok(history)
}

#[tauri::command]
pub async fn sync_file_selection_history_command(
    app_handle: AppHandle,
    session_id: String,
    history: Vec<FileSelectionHistoryEntryWithTimestamp>,
) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Convert to tuples with individual timestamps preserved
    let history_tuples: Vec<(String, String, i64)> = history
        .into_iter()
        .map(|entry| {
            (
                entry.included_files.join("\n"),
                entry.force_excluded_files.join("\n"),
                entry.created_at,
            )
        })
        .collect();

    repo.sync_file_selection_history(&session_id, &history_tuples)
        .await
}

/// Duplicate a session with a new ID and optional new name
#[tauri::command]
pub async fn duplicate_session_command(
    app_handle: AppHandle,
    source_session_id: String,
    new_name: Option<String>,
) -> AppResult<Session> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the source session from cache
    let source_session = cache.get_session(&app_handle, &source_session_id).await?;

    let now = chrono::Utc::now().timestamp_millis();

    // Create new session with cloned data
    let new_session = Session {
        id: format!("session_{}_{}", now, Uuid::new_v4()),
        name: new_name.unwrap_or_else(|| format!("{} (Copy)", source_session.name)),
        project_directory: source_session.project_directory.clone(),
        project_hash: source_session.project_hash.clone(),
        task_description: source_session.task_description.clone(),
        search_term: source_session.search_term.clone(),
        search_selected_files_only: source_session.search_selected_files_only,
        model_used: source_session.model_used.clone(),
        created_at: now,
        updated_at: now,
        included_files: source_session.included_files.clone(),
        force_excluded_files: source_session.force_excluded_files.clone(),
        video_analysis_prompt: source_session.video_analysis_prompt.clone(),
        merge_instructions: source_session.merge_instructions.clone(),
    };

    // Create the new session in DB first (DB-first for safety)
    repo.create_session(&new_session).await?;

    // After DB insert, update cache (cache will emit session-updated)
    cache.upsert_session(&app_handle, &new_session).await?;

    // Emit session-created event
    crate::events::session_events::emit_session_created(&app_handle, &new_session)?;

    Ok(new_session)
}

/// Update session files with delta-based mutations (add/remove with mutual exclusivity)
#[tauri::command]
pub async fn update_session_files_command(
    app_handle: AppHandle,
    session_id: String,
    files_to_add: Vec<String>,
    files_to_remove: Vec<String>,
    excluded_to_add: Vec<String>,
    excluded_to_remove: Vec<String>,
) -> AppResult<Session> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let sequencer = app_handle.state::<Arc<HistoryStateSequencer>>();

    let current_state = repo.get_file_history_state(&session_id).await?;

    let current_entry = current_state.entries.get(current_state.current_index as usize);
    let (current_included, current_excluded) = if let Some(entry) = current_entry {
        (
            parse_file_list(&entry.included_files),
            parse_file_list(&entry.force_excluded_files),
        )
    } else if let Ok(existing) = cache.get_session(&app_handle, &session_id).await {
        (existing.included_files, existing.force_excluded_files)
    } else {
        (Vec::new(), Vec::new())
    };

    let mut included: HashSet<String> = current_included.iter().cloned().collect();
    let mut excluded: HashSet<String> = current_excluded.iter().cloned().collect();

    for file in &files_to_remove {
        included.remove(file);
    }
    for file in &excluded_to_remove {
        excluded.remove(file);
    }
    for file in &files_to_add {
        if !file.trim().is_empty() {
            included.insert(file.clone());
            excluded.remove(file);
        }
    }
    for file in &excluded_to_add {
        if !file.trim().is_empty() {
            excluded.insert(file.clone());
            included.remove(file);
        }
    }

    if included == current_included.iter().cloned().collect::<HashSet<_>>()
        && excluded == current_excluded.iter().cloned().collect::<HashSet<_>>() {
        return cache.get_session(&app_handle, &session_id).await;
    }

    let now = crate::utils::date_utils::get_timestamp();
    let device_id = crate::auth::device_id_manager::get_or_create(&app_handle).ok();

    let mut included_vec: Vec<String> = included.iter().cloned().collect();
    let mut excluded_vec: Vec<String> = excluded.iter().cloned().collect();
    included_vec.sort();
    excluded_vec.sort();

    let included_json = serde_json::to_string(&included_vec)
        .unwrap_or_else(|_| "[]".to_string());
    let excluded_json = serde_json::to_string(&excluded_vec)
        .unwrap_or_else(|_| "[]".to_string());

    let next_sequence = current_state
        .entries
        .iter()
        .map(|entry| entry.sequence_number)
        .max()
        .unwrap_or(-1)
        + 1;

    let new_entry = crate::db_utils::session_repository::FileSelectionHistoryEntry {
        included_files: included_json,
        force_excluded_files: excluded_json,
        created_at: now,
        device_id,
        op_type: Some("user-edit".to_string()),
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

    let checksum = compute_file_history_checksum(&updated_entries, new_index, current_state.version);
    let new_state = FileHistoryState {
        entries: updated_entries,
        current_index: new_index,
        version: current_state.version,
        checksum,
    };

    let _ = sequencer.enqueue_sync_files(session_id.clone(), new_state, current_state.version).await?;

    // Update files via cache (cache emits session-files-updated event)
    // Get updated session from cache
    let updated_session = cache.get_session(&app_handle, &session_id).await?;

    Ok(updated_session)
}

fn compute_file_history_checksum(
    entries: &[crate::db_utils::session_repository::FileSelectionHistoryEntry],
    current_index: i64,
    version: i64,
) -> String {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChecksumEntry {
        included_files: String,
        force_excluded_files: String,
        timestamp_ms: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        device_id: Option<String>,
        sequence_number: i64,
        version: i64,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChecksumData {
        current_index: i64,
        entries: Vec<ChecksumEntry>,
        version: i64,
    }

    let checksum_entries = entries
        .iter()
        .map(|entry| ChecksumEntry {
            included_files: entry.included_files.clone(),
            force_excluded_files: entry.force_excluded_files.clone(),
            timestamp_ms: entry.created_at,
            device_id: entry.device_id.clone(),
            sequence_number: entry.sequence_number,
            version: entry.version,
        })
        .collect();

    let data = ChecksumData {
        current_index,
        entries: checksum_entries,
        version,
    };

    let json = serde_json::to_string(&data).unwrap_or_default();
    sha256_hash(&json)
}

fn parse_file_list(raw: &str) -> Vec<String> {
    if raw.trim().is_empty() {
        return Vec::new();
    }

    if let Ok(values) = serde_json::from_str::<Vec<String>>(raw) {
        return values.into_iter().filter(|v| !v.trim().is_empty()).collect();
    }

    Vec::new()
}

#[tauri::command]
pub async fn broadcast_file_browser_state_command(
    app_handle: tauri::AppHandle,
    session_id: String,
    project_directory: String,
    search_term: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    filter_mode: Option<String>,
) -> Result<(), String> {
    use serde_json::json;

    let payload = json!({
        "sessionId": session_id,
        "projectDirectory": project_directory,
        "searchTerm": search_term,
        "sortBy": sort_by,
        "sortOrder": sort_order,
        "filterMode": filter_mode
    });

    app_handle.emit("session-file-browser-state-updated", payload.clone())
        .map_err(|e| format!("emit failed: {e}"))?;

    // NOTE: DeviceLinkClient forwards only when key is 'payload' (not 'data'). Keep consistent for relay.
    app_handle.emit("device-link-event", json!({
        "type": "session-file-browser-state-updated",
        "payload": payload
    })).map_err(|e| format!("device-link emit failed: {e}"))?;

    Ok(())
}

/// Get file relationships (import dependencies) for session files
#[tauri::command]
pub async fn get_file_relationships_command(
    app_handle: AppHandle,
    session_id: String,
) -> AppResult<Value> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();

    // Get the session from cache
    let session = cache.get_session(&app_handle, &session_id).await?;

    // Parse imports from included files
    let project_path = std::path::Path::new(&session.project_directory);
    let mut relationships: Vec<serde_json::Value> = Vec::new();

    for file_path in &session.included_files {
        let full_path = project_path.join(file_path);

        if !full_path.exists() {
            continue;
        }

        // Read file content
        match tokio::fs::read_to_string(&full_path).await {
            Ok(content) => {
                let imports = parse_imports(&content, file_path);
                if !imports.is_empty() {
                    relationships.push(json!({
                        "file": file_path,
                        "imports": imports
                    }));
                }
            }
            Err(_) => continue,
        }
    }

    Ok(json!({
        "sessionId": session_id,
        "relationships": relationships
    }))
}

/// Helper function to parse imports from file content
fn parse_imports(content: &str, file_path: &str) -> Vec<String> {
    let mut imports = Vec::new();
    let extension = std::path::Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match extension {
        "js" | "jsx" | "ts" | "tsx" => {
            // Match ES6 imports: import ... from 'path'
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("import ") && trimmed.contains(" from ") {
                    if let Some(from_pos) = trimmed.rfind(" from ") {
                        let path_part = &trimmed[from_pos + 6..].trim();
                        if let Some(path) = extract_quoted_string(path_part) {
                            if path.starts_with('.') {
                                imports.push(path);
                            }
                        }
                    }
                }
                // Match require: require('path')
                if trimmed.contains("require(") {
                    if let Some(start) = trimmed.find("require(") {
                        let path_part = &trimmed[start + 8..];
                        if let Some(path) = extract_quoted_string(path_part) {
                            if path.starts_with('.') {
                                imports.push(path);
                            }
                        }
                    }
                }
            }
        }
        "rs" => {
            // Match Rust use statements: use crate::..., use super::..., mod ...
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("use ") || trimmed.starts_with("mod ") {
                    imports.push(trimmed.to_string());
                }
            }
        }
        "py" => {
            // Match Python imports: import ..., from ... import ...
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("import ") || trimmed.starts_with("from ") {
                    imports.push(trimmed.to_string());
                }
            }
        }
        _ => {}
    }

    imports
}

/// Helper to extract quoted strings (single or double quotes)
fn extract_quoted_string(s: &str) -> Option<String> {
    let s = s.trim();
    if s.starts_with('"') || s.starts_with('\'') {
        let quote_char = s.chars().next().unwrap();
        if let Some(end_pos) = s[1..].find(quote_char) {
            return Some(s[1..end_pos + 1].to_string());
        }
    }
    None
}

/// Get session overview with aggregated counts and last activity
#[tauri::command]
pub async fn get_session_overview_command(
    app_handle: AppHandle,
    session_id: String,
) -> AppResult<Value> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let session_repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let job_repo = app_handle
        .state::<Arc<crate::db_utils::background_job_repository::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Get the session from cache
    let session = cache.get_session(&app_handle, &session_id).await?;

    // Get jobs for this session
    let jobs = job_repo.get_jobs_by_session_id(&session_id).await?;

    // Count jobs by status
    let completed_jobs = jobs.iter().filter(|j| j.status == JobStatus::Completed.to_string()).count();
    let failed_jobs = jobs.iter().filter(|j| j.status == JobStatus::Failed.to_string()).count();
    let active_jobs = jobs
        .iter()
        .filter(|j| j.status != JobStatus::Completed.to_string() && j.status != JobStatus::Failed.to_string() && j.status != JobStatus::Canceled.to_string())
        .count();

    // Get task description history count
    let task_history = session_repo
        .get_task_description_history(&session_id)
        .await?;
    let task_history_count = task_history.len();

    // Get file selection history count
    let file_history = session_repo.get_file_selection_history(&session_id).await?;
    let file_history_count = file_history.len();

    // Find last activity timestamp
    let last_activity = jobs
        .iter()
        .filter_map(|j| j.updated_at)
        .max()
        .unwrap_or(session.updated_at);

    Ok(json!({
        "sessionId": session_id,
        "name": session.name,
        "projectDirectory": session.project_directory,
        "createdAt": session.created_at,
        "updatedAt": session.updated_at,
        "lastActivity": last_activity,
        "includedFilesCount": session.included_files.len(),
        "excludedFilesCount": session.force_excluded_files.len(),
        "taskHistoryCount": task_history_count,
        "fileHistoryCount": file_history_count,
        "jobsCount": jobs.len(),
        "completedJobsCount": completed_jobs,
        "failedJobsCount": failed_jobs,
        "activeJobsCount": active_jobs,
    }))
}

/// Get complete session contents including session data, files, and plan summaries
#[tauri::command]
pub async fn get_session_contents_command(
    app_handle: AppHandle,
    session_id: String,
) -> AppResult<Value> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    let session_repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let job_repo = app_handle
        .state::<Arc<crate::db_utils::background_job_repository::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Get the session from cache
    let session = cache.get_session(&app_handle, &session_id).await?;

    // Get jobs for this session
    let jobs = job_repo.get_jobs_by_session_id(&session_id).await?;

    // Filter implementation plan jobs
    let plan_jobs: Vec<serde_json::Value> = jobs
        .iter()
        .filter(|j| j.task_type == "implementation_plan" && j.status == JobStatus::Completed.to_string())
        .map(|j| {
            json!({
                "id": j.id,
                "status": j.status,
                "createdAt": j.created_at,
                "updatedAt": j.updated_at,
            })
        })
        .collect();

    // Get task description history
    let task_history = session_repo
        .get_task_description_history(&session_id)
        .await?;

    Ok(json!({
        "session": session,
        "taskHistory": task_history.into_iter().map(|(desc, ts)| json!({
            "description": desc,
            "timestamp": ts
        })).collect::<Vec<_>>(),
        "plans": plan_jobs,
        "jobsCount": jobs.len(),
    }))
}

#[tauri::command]
pub async fn broadcast_active_session_changed_command(
    app_handle: tauri::AppHandle,
    project_directory: String,
    session_id: Option<String>
) -> Result<(), String> {
    use serde_json::json;
    let payload = json!({
        "type": "active-session-changed",
        "payload": {
            "projectDirectory": project_directory,
            "sessionId": session_id
        },
        "relayOrigin": "local"
    });
    app_handle.emit("device-link-event", payload).map_err(|e| format!("emit failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn get_history_state_command(
    session_id: String,
    kind: String,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let db = app.state::<Arc<sqlx::SqlitePool>>();
    let repo = SessionRepository::new(db.inner().clone());

    if kind == "task" {
        let state = repo.get_task_history_state(&session_id)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_value(&state).map_err(|e| e.to_string())
    } else if kind == "files" {
        let state = repo.get_file_history_state(&session_id)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_value(&state).map_err(|e| e.to_string())
    } else {
        Err("Invalid kind".to_string())
    }
}

#[tauri::command]
pub async fn sync_history_state_command(
    session_id: String,
    kind: String,
    state: serde_json::Value,
    expected_version: i64,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let sequencer = app.state::<Arc<HistoryStateSequencer>>();

    if kind == "task" {
        let task_state: TaskHistoryState = serde_json::from_value(state)
            .map_err(|e| e.to_string())?;
        let result = sequencer.enqueue_sync_task(session_id, task_state, expected_version).await?;
        serde_json::to_value(&result).map_err(|e| e.to_string())
    } else if kind == "files" {
        let file_state: FileHistoryState = serde_json::from_value(state)
            .map_err(|e| e.to_string())?;
        let result = sequencer.enqueue_sync_files(session_id, file_state, expected_version).await?;
        serde_json::to_value(&result).map_err(|e| e.to_string())
    } else {
        Err("Invalid kind".to_string())
    }
}

#[tauri::command]
pub async fn merge_history_state_command(
    session_id: String,
    kind: String,
    remote_state: serde_json::Value,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let sequencer = app.state::<Arc<HistoryStateSequencer>>();

    if kind == "task" {
        let task_state: TaskHistoryState = serde_json::from_value(remote_state)
            .map_err(|e| e.to_string())?;
        let result = sequencer.enqueue_merge_task(session_id, task_state).await?;
        serde_json::to_value(&result).map_err(|e| e.to_string())
    } else if kind == "files" {
        let file_state: FileHistoryState = serde_json::from_value(remote_state)
            .map_err(|e| e.to_string())?;
        let result = sequencer.enqueue_merge_files(session_id, file_state).await?;
        serde_json::to_value(&result).map_err(|e| e.to_string())
    } else {
        Err("Invalid kind".to_string())
    }
}

#[tauri::command]
pub fn get_device_id_command(app: AppHandle) -> Result<String, String> {
    use crate::auth::device_id_manager;

    device_id_manager::get_or_create(&app)
        .map_err(|e| e.to_string())
}
