use crate::error::AppResult;
use crate::models::{
    CreateSessionRequest, FileSelectionHistoryEntry, FileSelectionHistoryEntryWithTimestamp,
    Session,
};
use crate::utils::hash_utils::hash_string;
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
    };

    log::debug!("Constructed session object: {:?}", session);

    // Create the session
    repo.create_session(&session).await?;

    // Return the created session
    Ok(session)
}

/// Get a session by ID
#[tauri::command]
pub async fn get_session_command(
    app_handle: AppHandle,
    session_id: String,
) -> AppResult<Option<Session>> {
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    repo.get_session_by_id(&session_id).await
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

    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Update the session
    repo.update_session(&session_data).await?;

    // Return the updated session
    Ok(session_data)
}

/// Delete a session and cancel any related background jobs
#[tauri::command]
pub async fn delete_session_command(app_handle: AppHandle, session_id: String) -> AppResult<()> {
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

    // Then delete the session (this will cascade to related records)
    session_repo.delete_session(&session_id).await
}

/// Rename a session
#[tauri::command]
pub async fn rename_session_command(
    app_handle: AppHandle,
    session_id: String,
    name: String,
) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the current session
    let session = match repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => {
            return Err(crate::error::AppError::NotFoundError(format!(
                "Session with ID {} not found",
                session_id
            )));
        }
    };

    // Update with new name
    let mut updated_session = session;
    updated_session.name = name;

    // Save the updated session
    repo.update_session(&updated_session).await
}

/// Update a session's project directory and hash
#[tauri::command]
pub async fn update_session_project_directory_command(
    app_handle: AppHandle,
    session_id: String,
    project_directory: String,
) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the current session
    let session = match repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => {
            return Err(crate::error::AppError::NotFoundError(format!(
                "Session with ID {} not found",
                session_id
            )));
        }
    };

    // Update with new project directory and hash
    let mut updated_session = session;
    updated_session.project_directory = project_directory.clone();
    updated_session.project_hash = hash_string(&project_directory);

    // Save the updated session
    repo.update_session(&updated_session).await
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
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the current session
    let session = match repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => {
            return Err(crate::error::AppError::NotFoundError(format!(
                "Session with ID {} not found",
                session_id
            )));
        }
    };

    // Create a mutable copy of the session to update
    let mut updated_session = session.clone();

    // Update the fields based on the provided JSON
    if let Some(fields) = fields_to_update.as_object() {
        // Handle name
        if fields.contains_key("name") {
            if let Some(name) = fields["name"].as_str() {
                updated_session.name = name.to_string();
            }
        }

        // Handle project_directory (and recalculate project_hash)
        if fields.contains_key("projectDirectory") {
            if let Some(project_dir) = fields["projectDirectory"].as_str() {
                updated_session.project_directory = project_dir.to_string();
                updated_session.project_hash = hash_string(&project_dir);
            }
        }

        // Handle task_description (track changes for history)
        if fields.contains_key("taskDescription") {
            if let Some(task_desc) = fields["taskDescription"].as_str() {
                updated_session.task_description = Some(task_desc.to_string());
            } else if fields["taskDescription"].is_null() {
                updated_session.task_description = None;
            }
        }

        // Handle search_term
        if fields.contains_key("searchTerm") {
            if let Some(search_term) = fields["searchTerm"].as_str() {
                updated_session.search_term = Some(search_term.to_string());
            } else if fields["searchTerm"].is_null() {
                updated_session.search_term = None;
            }
        }

        // Handle search_selected_files_only
        if fields.contains_key("searchSelectedFilesOnly") {
            if let Some(search_selected_files_only) = fields["searchSelectedFilesOnly"].as_bool() {
                updated_session.search_selected_files_only = search_selected_files_only;
            }
        }

        // Handle model_used
        if fields.contains_key("modelUsed") {
            if let Some(model_used) = fields["modelUsed"].as_str() {
                updated_session.model_used = Some(model_used.to_string());
            } else if fields["modelUsed"].is_null() {
                updated_session.model_used = None;
            }
        }

        // Handle included_files (maps to selectedFiles from frontend)
        if fields.contains_key("selectedFiles") || fields.contains_key("includedFiles") {
            let key = if fields.contains_key("selectedFiles") {
                "selectedFiles"
            } else {
                "includedFiles"
            };
            if let Some(included_files_arr) = fields[key].as_array() {
                let mut included_files = Vec::new();
                for file in included_files_arr {
                    if let Some(file_str) = file.as_str() {
                        included_files.push(file_str.to_string());
                    }
                }
                updated_session.included_files = included_files;
            } else if fields[key].is_null() {
                updated_session.included_files = vec![];
            }
        }

        // Handle force_excluded_files (maps to forceExcludedFiles from frontend)
        if fields.contains_key("forceExcludedFiles") {
            if let Some(force_excluded_files_arr) = fields["forceExcludedFiles"].as_array() {
                let mut force_excluded_files = Vec::new();
                for file in force_excluded_files_arr {
                    if let Some(file_str) = file.as_str() {
                        force_excluded_files.push(file_str.to_string());
                    }
                }
                updated_session.force_excluded_files = force_excluded_files;
            } else if fields["forceExcludedFiles"].is_null() {
                updated_session.force_excluded_files = vec![];
            }
        }

        // Handle video_analysis_prompt
        if fields.contains_key("videoAnalysisPrompt") {
            if let Some(video_prompt) = fields["videoAnalysisPrompt"].as_str() {
                updated_session.video_analysis_prompt = Some(video_prompt.to_string());
            } else if fields["videoAnalysisPrompt"].is_null() {
                updated_session.video_analysis_prompt = None;
            }
        }
    }

    // Detect if task description changed
    let task_description_changed = session.task_description != updated_session.task_description;

    // Save the updated session
    repo.update_session(&updated_session).await?;

    // Always emit session-updated for any field change
    let session_json = serde_json::to_value(&updated_session)
        .map_err(|e| format!("json err: {e}"))?;
    crate::events::session_events::emit_session_updated(&app_handle, &session_id, &session_json)?;

    // Keep history-synced for backward compatibility if task description changed
    if task_description_changed {
        if let Some(ref new_desc) = updated_session.task_description {
            let _ = repo.append_task_description_history(&session_id, new_desc).await;
            let _ = app_handle.emit("session-history-synced", serde_json::json!({
                "sessionId": &session_id,
                "taskDescription": new_desc
            }));
            let _ = app_handle.emit("device-link-event", serde_json::json!({
                "type": "session-history-synced",
                "payload": {
                    "sessionId": &session_id,
                    "taskDescription": new_desc
                }
            }));
        }
    }

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
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the source session
    let source_session = match repo.get_session_by_id(&source_session_id).await? {
        Some(s) => s,
        None => {
            return Err(crate::error::AppError::NotFoundError(format!(
                "Session with ID {} not found",
                source_session_id
            )));
        }
    };

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
    };

    // Create the new session
    repo.create_session(&new_session).await?;

    // Emit session-created event
    let _ = app_handle.emit(
        "session-created",
        serde_json::json!({
            "session": &new_session
        }),
    );

    // Emit device-link event for remote devices
    let _ = app_handle.emit(
        "device-link-event",
        serde_json::json!({
            "type": "session-created",
            "payload": {
                "session": &new_session
            }
        }),
    );

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
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the current session
    let session = match repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => {
            return Err(crate::error::AppError::NotFoundError(format!(
                "Session with ID {} not found",
                session_id
            )));
        }
    };

    // Convert to sets for efficient operations (clone to avoid moving)
    let mut included_set: HashSet<String> = session.included_files.clone().into_iter().collect();
    let mut excluded_set: HashSet<String> =
        session.force_excluded_files.clone().into_iter().collect();

    // Apply delta operations with mutual exclusivity
    for file in files_to_add {
        included_set.insert(file.clone());
        excluded_set.remove(&file); // Remove from excluded if adding to included
    }

    for file in files_to_remove {
        included_set.remove(&file);
    }

    for file in excluded_to_add {
        excluded_set.insert(file.clone());
        included_set.remove(&file); // Remove from included if adding to excluded
    }

    for file in excluded_to_remove {
        excluded_set.remove(&file);
    }

    // Convert back to vectors
    let mut updated_session = session;
    updated_session.included_files = included_set.into_iter().collect();
    updated_session.force_excluded_files = excluded_set.into_iter().collect();

    // Update the session
    repo.update_session(&updated_session).await?;

    // Emit session-files-updated event
    let _ = app_handle.emit(
        "session-files-updated",
        serde_json::json!({
            "sessionId": &session_id,
            "includedFiles": &updated_session.included_files,
            "forceExcludedFiles": &updated_session.force_excluded_files
        }),
    );

    // Emit device-link event
    let _ = app_handle.emit(
        "device-link-event",
        serde_json::json!({
            "type": "session-files-updated",
            "payload": {
                "sessionId": &session_id,
                "includedFiles": &updated_session.included_files,
                "forceExcludedFiles": &updated_session.force_excluded_files
            }
        }),
    );

    Ok(updated_session)
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
    let repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the session
    let session = match repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => {
            return Err(crate::error::AppError::NotFoundError(format!(
                "Session with ID {} not found",
                session_id
            )));
        }
    };

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
    let session_repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let job_repo = app_handle
        .state::<Arc<crate::db_utils::background_job_repository::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Get the session
    let session = match session_repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => {
            return Err(crate::error::AppError::NotFoundError(format!(
                "Session with ID {} not found",
                session_id
            )));
        }
    };

    // Get jobs for this session
    let jobs = job_repo.get_jobs_by_session_id(&session_id).await?;

    // Count jobs by status
    let completed_jobs = jobs.iter().filter(|j| j.status == "completed").count();
    let failed_jobs = jobs.iter().filter(|j| j.status == "failed").count();
    let active_jobs = jobs
        .iter()
        .filter(|j| j.status != "completed" && j.status != "failed" && j.status != "canceled")
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
    let session_repo = app_handle
        .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let job_repo = app_handle
        .state::<Arc<crate::db_utils::background_job_repository::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Get the session
    let session = match session_repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => {
            return Err(crate::error::AppError::NotFoundError(format!(
                "Session with ID {} not found",
                session_id
            )));
        }
    };

    // Get jobs for this session
    let jobs = job_repo.get_jobs_by_session_id(&session_id).await?;

    // Filter implementation plan jobs
    let plan_jobs: Vec<serde_json::Value> = jobs
        .iter()
        .filter(|j| j.task_type == "implementation_plan" && j.status == "completed")
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

