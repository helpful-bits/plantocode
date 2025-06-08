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
        title_regex: session_data.title_regex,
        content_regex: session_data.content_regex,
        negative_title_regex: session_data.negative_title_regex,
        negative_content_regex: session_data.negative_content_regex,
        title_regex_description: session_data.title_regex_description,
        content_regex_description: session_data.content_regex_description,
        negative_title_regex_description: session_data.negative_title_regex_description,
        negative_content_regex_description: session_data.negative_content_regex_description,
        regex_summary_explanation: None,
        is_regex_active: session_data.is_regex_active.unwrap_or(true),
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

        // Handle title_regex
        if fields.contains_key("titleRegex") {
            if let Some(title_regex) = fields["titleRegex"].as_str() {
                updated_session.title_regex = Some(title_regex.to_string());
            } else if fields["titleRegex"].is_null() {
                updated_session.title_regex = None;
            }
        }

        // Handle content_regex
        if fields.contains_key("contentRegex") {
            if let Some(content_regex) = fields["contentRegex"].as_str() {
                updated_session.content_regex = Some(content_regex.to_string());
            } else if fields["contentRegex"].is_null() {
                updated_session.content_regex = None;
            }
        }

        // Handle negative_title_regex
        if fields.contains_key("negativeTitleRegex") {
            if let Some(negative_title_regex) = fields["negativeTitleRegex"].as_str() {
                updated_session.negative_title_regex = Some(negative_title_regex.to_string());
            } else if fields["negativeTitleRegex"].is_null() {
                updated_session.negative_title_regex = None;
            }
        }

        // Handle negative_content_regex
        if fields.contains_key("negativeContentRegex") {
            if let Some(negative_content_regex) = fields["negativeContentRegex"].as_str() {
                updated_session.negative_content_regex = Some(negative_content_regex.to_string());
            } else if fields["negativeContentRegex"].is_null() {
                updated_session.negative_content_regex = None;
            }
        }

        // Handle is_regex_active
        if fields.contains_key("isRegexActive") {
            if let Some(is_regex_active) = fields["isRegexActive"].as_bool() {
                updated_session.is_regex_active = is_regex_active;
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

        // Handle title_regex_description
        if fields.contains_key("titleRegexDescription") {
            if let Some(title_regex_description) = fields["titleRegexDescription"].as_str() {
                updated_session.title_regex_description = Some(title_regex_description.to_string());
            } else if fields["titleRegexDescription"].is_null() {
                updated_session.title_regex_description = None;
            }
        }

        // Handle content_regex_description
        if fields.contains_key("contentRegexDescription") {
            if let Some(content_regex_description) = fields["contentRegexDescription"].as_str() {
                updated_session.content_regex_description = Some(content_regex_description.to_string());
            } else if fields["contentRegexDescription"].is_null() {
                updated_session.content_regex_description = None;
            }
        }

        // Handle negative_title_regex_description
        if fields.contains_key("negativeTitleRegexDescription") {
            if let Some(negative_title_regex_description) = fields["negativeTitleRegexDescription"].as_str() {
                updated_session.negative_title_regex_description = Some(negative_title_regex_description.to_string());
            } else if fields["negativeTitleRegexDescription"].is_null() {
                updated_session.negative_title_regex_description = None;
            }
        }

        // Handle negative_content_regex_description
        if fields.contains_key("negativeContentRegexDescription") {
            if let Some(negative_content_regex_description) = fields["negativeContentRegexDescription"].as_str() {
                updated_session.negative_content_regex_description = Some(negative_content_regex_description.to_string());
            } else if fields["negativeContentRegexDescription"].is_null() {
                updated_session.negative_content_regex_description = None;
            }
        }

        // Handle regex_summary_explanation
        if fields.contains_key("regexSummaryExplanation") {
            if let Some(regex_summary_explanation) = fields["regexSummaryExplanation"].as_str() {
                updated_session.regex_summary_explanation = Some(regex_summary_explanation.to_string());
            } else if fields["regexSummaryExplanation"].is_null() {
                updated_session.regex_summary_explanation = None;
            }
        }

        // Update timestamp
        updated_session.updated_at = chrono::Utc::now().timestamp_millis();
    }

    // Save the updated session
    repo.update_session(&updated_session).await
}