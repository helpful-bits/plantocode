use tauri::{AppHandle, Manager};
use crate::error::AppResult;
use crate::models::Session;
use serde_json::Value;
use crate::utils::hash_utils::hash_string;
use std::sync::Arc;

/// Create a new session in the database
#[tauri::command]
pub async fn create_session_command(app_handle: AppHandle, session_data: Session) -> AppResult<Session> {
    let repo = app_handle.state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
        .inner()
        .clone();

    // Calculate project_hash if not provided
    let mut session = session_data;
    if session.project_hash.is_empty() {
        session.project_hash = hash_string(&session.project_directory);
    }

    // Set created_at if not provided
    if session.created_at == 0 {
        session.created_at = chrono::Utc::now().timestamp_millis();
    }

    // Set updated_at
    session.updated_at = chrono::Utc::now().timestamp_millis();

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

    // Get sessions with the given project hash
    let all_sessions = repo.get_all_sessions().await?;
    let project_sessions = all_sessions
        .into_iter()
        .filter(|s| s.project_hash == project_hash)
        .collect();

    Ok(project_sessions)
}

/// Update an existing session
#[tauri::command]
pub async fn update_session_command(app_handle: AppHandle, session_data: Session) -> AppResult<Session> {
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
    let all_sessions = session_repo.get_all_sessions().await?;
    let project_sessions: Vec<Session> = all_sessions
        .into_iter()
        .filter(|s| s.project_hash == project_hash)
        .collect();

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
        // Handle specific fields that need special treatment
        if fields.contains_key("taskDescription") {
            if let Some(task_desc) = fields["taskDescription"].as_str() {
                updated_session.task_description = Some(task_desc.to_string());
            } else if fields["taskDescription"].is_null() {
                updated_session.task_description = None;
            }
        }

        if fields.contains_key("selectedFiles") {
            if let Some(selected_files_arr) = fields["selectedFiles"].as_array() {
                let mut selected_files = Vec::new();
                for file in selected_files_arr {
                    if let Some(file_str) = file.as_str() {
                        selected_files.push(file_str.to_string());
                    }
                }
                updated_session.included_files = Some(selected_files);
            } else if fields["selectedFiles"].is_null() {
                updated_session.included_files = Some(Vec::new());
            }
        }
        
        // Note: The following fields were removed as they don't exist in the Session struct:
        // - xmlPath
        // - regexPatterns
        // - implementationPlanJobId

        // Update timestamp
        updated_session.updated_at = chrono::Utc::now().timestamp_millis();
    }

    // Save the updated session
    repo.update_session(&updated_session).await
}