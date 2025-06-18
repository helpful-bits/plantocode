use tauri::{AppHandle, Manager};
use crate::error::AppResult;
use crate::models::{Session, CreateSessionRequest};
use serde_json::Value;
use crate::utils::hash_utils::hash_string;
use std::sync::Arc;

/// Create a new session in the database
#[tauri::command]
pub async fn create_session_command(app_handle: AppHandle, session_data: CreateSessionRequest) -> AppResult<Session> {
    log::debug!("Creating session with data: {:?}", session_data);
    
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    let now = chrono::Utc::now().timestamp_millis();
    
    // Build the complete session with defaults
    let session = Session {
        id: session_data.id.unwrap_or_else(|| {
            format!("session_{}_{}", now, uuid::Uuid::new_v4().to_string())
        }),
        name: session_data.name.unwrap_or_else(|| "Untitled Session".to_string()),
        project_directory: session_data.project_directory.clone(),
        project_hash: session_data.project_hash.unwrap_or_else(|| {
            hash_string(&session_data.project_directory)
        }),
        task_description: session_data.task_description,
        search_term: session_data.search_term,
        search_selected_files_only: session_data.search_selected_files_only.unwrap_or(false),
        model_used: session_data.model_used.filter(|s| !s.is_empty()),
        created_at: session_data.created_at.unwrap_or(now),
        updated_at: now,
        included_files: session_data.included_files,
        force_excluded_files: session_data.force_excluded_files,
    };

    log::debug!("Constructed session object: {:?}", session);

    // Create the session
    repo.create_session(&session).await?;

    // Return the created session
    Ok(session)
}

/// Get a session by ID
#[tauri::command]
pub async fn get_session_command(app_handle: AppHandle, session_id: String) -> AppResult<Option<Session>> {
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    repo.get_session_by_id(&session_id).await
}

/// Get all sessions for a project
#[tauri::command]
pub async fn get_sessions_for_project_command(app_handle: AppHandle, project_directory: String) -> AppResult<Vec<Session>> {
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
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
pub async fn update_session_command(app_handle: AppHandle, session_data: Session) -> AppResult<Session> {
    log::debug!("Updating session with data: {:?}", session_data);
    
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Set updated_at timestamp
    let mut session = session_data;
    session.updated_at = chrono::Utc::now().timestamp_millis();

    // Update the session
    repo.update_session(&session).await?;

    // Return the updated session
    Ok(session)
}

/// Delete a session and cancel any related background jobs
#[tauri::command]
pub async fn delete_session_command(app_handle: AppHandle, session_id: String) -> AppResult<()> {
    let session_repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let job_repo = app_handle.state::<Arc<crate::db_utils::background_job_repository::BackgroundJobRepository>>()
        .inner()
        .clone();

    // First cancel any active jobs for this session
    job_repo.cancel_session_jobs(&session_id).await?;

    // Then delete the session (this will cascade to related records)
    session_repo.delete_session(&session_id).await
}

/// Rename a session
#[tauri::command]
pub async fn rename_session_command(app_handle: AppHandle, session_id: String, name: String) -> AppResult<()> {
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the current session
    let session = match repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => return Err(crate::error::AppError::NotFoundError(format!("Session with ID {} not found", session_id))),
    };

    // Update with new name
    let mut updated_session = session;
    updated_session.name = name;
    updated_session.updated_at = chrono::Utc::now().timestamp_millis();

    // Save the updated session
    repo.update_session(&updated_session).await
}

/// Update a session's project directory and hash
#[tauri::command]
pub async fn update_session_project_directory_command(app_handle: AppHandle, session_id: String, project_directory: String) -> AppResult<()> {
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the current session
    let session = match repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => return Err(crate::error::AppError::NotFoundError(format!("Session with ID {} not found", session_id))),
    };

    // Update with new project directory and hash
    let mut updated_session = session;
    updated_session.project_directory = project_directory.clone();
    updated_session.project_hash = hash_string(&project_directory);
    updated_session.updated_at = chrono::Utc::now().timestamp_millis();

    // Save the updated session
    repo.update_session(&updated_session).await
}

/// Clear all sessions for a project
#[tauri::command]
pub async fn clear_all_project_sessions_command(app_handle: AppHandle, project_directory: String) -> AppResult<()> {
    let session_repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();
    let job_repo = app_handle.state::<Arc<crate::db_utils::background_job_repository::BackgroundJobRepository>>()
        .inner()
        .clone();

    // Get the project hash
    let project_hash = hash_string(&project_directory);

    // Get all sessions for this project
    let project_sessions = session_repo.get_sessions_by_project_hash(&project_hash).await?;

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
pub async fn update_session_fields_command(app_handle: AppHandle, session_id: String, fields_to_update: Value) -> AppResult<()> {
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Get the current session
    let session = match repo.get_session_by_id(&session_id).await? {
        Some(s) => s,
        None => return Err(crate::error::AppError::NotFoundError(format!("Session with ID {} not found", session_id))),
    };

    // Create a mutable copy of the session to update
    let mut updated_session = session;

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

        // Handle task_description
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
            let key = if fields.contains_key("selectedFiles") { "selectedFiles" } else { "includedFiles" };
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


        // Update timestamp
        updated_session.updated_at = chrono::Utc::now().timestamp_millis();
    }

    // Save the updated session
    repo.update_session(&updated_session).await
}

#[tauri::command]
pub async fn get_task_description_history_command(app_handle: AppHandle, session_id: String) -> AppResult<Vec<String>> {
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    let history_with_timestamps = repo.get_task_description_history(&session_id).await?;
    let descriptions: Vec<String> = history_with_timestamps.into_iter().map(|(desc, _)| desc).collect();
    Ok(descriptions)
}

#[tauri::command]
pub async fn add_task_description_history_entry_command(app_handle: AppHandle, session_id: String, description: String) -> AppResult<()> {
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    repo.add_task_description_history_entry(&session_id, &description).await
}