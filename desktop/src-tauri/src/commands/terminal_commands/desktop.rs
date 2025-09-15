use crate::error::{AppError, AppResult};
use crate::db_utils::terminal_sessions_repository::{TerminalSessionsRepository, TerminalSession};
use crate::services::terminal_manager::{TerminalManager, TerminalSessionOptions};
use crate::auth::TokenManager;
use crate::AppState;
use log::{info, warn, error};
use std::sync::Arc;
use tauri::{command, AppHandle, Manager};
use chrono;
use serde_json::json;

#[command]
pub async fn append_terminal_log_command(
    app_handle: AppHandle,
    job_id: String, 
    chunk: String
) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();
    
    // First ensure the session exists, if not create it
    if repo.get_session_by_job_id(&job_id).await?.is_none() {
        // Create a minimal session if it doesn't exist
        let session = crate::db_utils::terminal_sessions_repository::TerminalSession {
            id: format!("session_{}", uuid::Uuid::new_v4()),
            job_id: job_id.clone(),
            status: "running".to_string(),
            process_pid: None,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
            last_output_at: Some(chrono::Utc::now().timestamp()),
            exit_code: None,
            working_directory: None,
            environment_vars: None,
            title: None,
            output_log: Some(String::new()),
        };
        repo.create_session(&session).await?;
    }
    
    repo.append_output_log(&job_id, &chunk).await
        .map_err(|e| AppError::DatabaseError(format!("Failed to append terminal log for job {}: {}", job_id, e)))
}

#[command]
pub async fn read_terminal_log_command(
    app_handle: AppHandle,
    job_id: String
) -> AppResult<String> {
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();
    
    // If no session exists, return empty string instead of error
    match repo.get_session_by_job_id(&job_id).await {
        Ok(Some(_)) => {
            // Session exists, get the log
            repo.get_output_log(&job_id).await
                .map_err(|e| AppError::DatabaseError(format!("Failed to read terminal log for job {}: {}", job_id, e)))
        }
        Ok(None) => {
            // No session exists yet, return empty string
            Ok(String::new())
        }
        Err(e) => {
            // Database error
            Err(AppError::DatabaseError(format!("Failed to check terminal session for job {}: {}", job_id, e)))
        }
    }
}

#[command]
pub async fn clear_terminal_log_command(
    app_handle: AppHandle,
    job_id: String
) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();
    repo.clear_output_log(&job_id).await
        .map_err(|e| AppError::DatabaseError(format!("Failed to clear terminal log for job {}: {}", job_id, e)))
}

#[command]
pub async fn delete_terminal_log_command(
    app_handle: AppHandle,
    job_id: String
) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();
    repo.delete_session_by_job_id(&job_id).await
        .map_err(|e| AppError::DatabaseError(format!("Failed to delete terminal session for job {}: {}", job_id, e)))
}

#[tauri::command]
pub async fn start_terminal_session_command(
    app_handle: AppHandle,
    window: tauri::Window,
    job_id: String,
    options: Option<TerminalSessionOptions>,
    output: tauri::ipc::Channel<Vec<u8>>,
) -> AppResult<()> {
    let terminal_manager = app_handle
        .state::<Arc<TerminalManager>>()
        .inner()
        .clone();
    
    terminal_manager.start_session(&job_id, options, output, window).await
        .map_err(|e| AppError::TerminalError(format!("Failed to start terminal session for job {}: {}", job_id, e)))
}

#[tauri::command]
pub async fn write_terminal_input_command(
    app_handle: AppHandle,
    job_id: String,
    data: Vec<u8>,
) -> AppResult<()> {
    let terminal_manager = app_handle
        .state::<Arc<TerminalManager>>()
        .inner()
        .clone();
    
    terminal_manager.write_input(&job_id, data).await
        .map_err(|e| AppError::TerminalError(format!("Failed to write input to terminal session for job {}: {}", job_id, e)))
}

#[tauri::command]
pub async fn send_ctrl_c_to_terminal_command(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<()> {
    let terminal_manager = app_handle
        .state::<Arc<TerminalManager>>()
        .inner()
        .clone();
    
    terminal_manager.send_ctrl_c(&job_id).await
        .map_err(|e| AppError::TerminalError(format!("Failed to send Ctrl+C to terminal session for job {}: {}", job_id, e)))
}

#[tauri::command]
pub async fn kill_terminal_session_command(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<()> {
    let terminal_manager = app_handle
        .state::<Arc<TerminalManager>>()
        .inner()
        .clone();
    
    terminal_manager.kill_session(&job_id).await
        .map_err(|e| AppError::TerminalError(format!("Failed to kill terminal session for job {}: {}", job_id, e)))
}

#[tauri::command]
pub async fn resize_terminal_session_command(
    app_handle: AppHandle,
    job_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    let terminal_manager = app_handle
        .state::<Arc<TerminalManager>>()
        .inner()
        .clone();
    
    terminal_manager.resize_session(&job_id, cols, rows).await
        .map_err(|e| AppError::TerminalError(format!("Failed to resize terminal session for job {}: {}", job_id, e)))
}

#[tauri::command]
pub async fn get_terminal_session_status_command(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<serde_json::Value> {
    let terminal_manager = app_handle
        .state::<Arc<TerminalManager>>()
        .inner()
        .clone();
    
    let status = terminal_manager.get_status(&job_id).await;
    Ok(status)
}

#[command]
pub async fn get_terminal_prerequisites_status_command(
    app_handle: AppHandle,
) -> AppResult<serde_json::Value> {
    let app_state = app_handle.state::<AppState>();
    let token_manager = app_handle.state::<Arc<TokenManager>>();

    let server_selected = app_state.get_server_url().is_some();

    let user_authenticated = token_manager.get().await.is_some();

    let api_clients_ready = app_state.is_api_clients_ready();

    let mut message = None;
    if !server_selected {
        message = Some("Server not selected".to_string());
    } else if !user_authenticated {
        message = Some("User not authenticated".to_string());
    } else if !api_clients_ready {
        message = Some("API clients not ready".to_string());
    }

    Ok(json!({
        "serverSelected": server_selected,
        "userAuthenticated": user_authenticated,
        "apiClientsReady": api_clients_ready,
        "message": message
    }))
}

#[command]
pub async fn check_terminal_dependencies_command(
    _app_handle: AppHandle,
) -> AppResult<serde_json::Value> {
    let mut available_clis = Vec::new();

    let cli_names = ["claude", "cursor", "codex", "gemini"];
    for cli_name in &cli_names {
        if which::which(cli_name).is_ok() {
            available_clis.push(cli_name.to_string());
        }
    }

    let default_shell = if cfg!(unix) {
        std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
    } else {
        "powershell.exe".to_string()
    };

    Ok(json!({
        "availableCliTools": available_clis,
        "defaultShell": default_shell
    }))
}