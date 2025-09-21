use crate::AppState;
use crate::auth::TokenManager;
use crate::db_utils::terminal_sessions_repository::{TerminalSession, TerminalSessionsRepository};
use crate::error::{AppError, AppResult};
use crate::services::terminal_manager::{TerminalManager, TerminalSessionOptions};
use crate::services::terminal_health_monitor::{HealthCheckResult, HealthHistoryEntry, RecoveryAction};
use chrono;
use dirs;
use log::{error, info, warn};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, command};
use tokio::fs;

#[command]
pub async fn read_terminal_log_command(app_handle: AppHandle, job_id: String) -> AppResult<String> {
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();

    // If no session exists, return empty string instead of error
    match repo.get_session_by_job_id(&job_id).await {
        Ok(Some(_)) => {
            // Session exists, get the log
            repo.get_output_log(&job_id).await.map_err(|e| {
                AppError::DatabaseError(format!(
                    "Failed to read terminal log for job {}: {}",
                    job_id, e
                ))
            })
        }
        Ok(None) => {
            // No session exists yet, return empty string
            Ok(String::new())
        }
        Err(e) => {
            // Database error
            Err(AppError::DatabaseError(format!(
                "Failed to check terminal session for job {}: {}",
                job_id, e
            )))
        }
    }
}

#[command]
pub async fn clear_terminal_log_command(app_handle: AppHandle, job_id: String) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();
    repo.clear_output_log(&job_id).await.map_err(|e| {
        AppError::DatabaseError(format!(
            "Failed to clear terminal log for job {}: {}",
            job_id, e
        ))
    })
}

#[command]
pub async fn delete_terminal_log_command(app_handle: AppHandle, job_id: String) -> AppResult<()> {
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();
    repo.delete_session_by_job_id(&job_id).await.map_err(|e| {
        AppError::DatabaseError(format!(
            "Failed to delete terminal session for job {}: {}",
            job_id, e
        ))
    })
}

#[tauri::command]
pub async fn start_terminal_session_command(
    app_handle: AppHandle,
    window: tauri::Window,
    job_id: String,
    options: Option<TerminalSessionOptions>,
    output: tauri::ipc::Channel<Vec<u8>>,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

    terminal_manager
        .start_session(&job_id, options, output, window)
        .await
        .map_err(|e| {
            AppError::TerminalError(format!(
                "Failed to start terminal session for job {}: {}",
                job_id, e
            ))
        })
}

fn extension_from_filename(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
}

fn extension_from_mime(mime_type: &Option<String>) -> Option<String> {
    mime_type
        .as_deref()
        .and_then(|mime| mime.split('/').nth(1))
        .map(|ext| ext.to_ascii_lowercase())
}

fn default_extension() -> String {
    "png".to_string()
}

fn derive_extension(file_name: &Option<String>, mime_type: &Option<String>) -> String {
    file_name
        .as_deref()
        .and_then(extension_from_filename)
        .or_else(|| extension_from_mime(mime_type))
        .unwrap_or_else(default_extension)
}

fn build_image_filename(extension: &str) -> String {
    let timestamp = chrono::Utc::now().timestamp_millis();
    format!("vibe-image-{}.{}", timestamp, extension)
}

#[tauri::command]
pub async fn save_pasted_image_command(
    app_handle: AppHandle,
    job_id: String,
    file_name: Option<String>,
    mime_type: Option<String>,
    data: Vec<u8>,
) -> AppResult<String> {
    if data.is_empty() {
        return Err(AppError::TerminalError(
            "Clipboard image data was empty".into(),
        ));
    }

    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();

    let session = repo
        .get_session_by_job_id(&job_id)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to load terminal session for {}: {}",
                job_id, e
            ))
        })?
        .ok_or_else(|| AppError::TerminalError(format!("Terminal session {} not found", job_id)))?;

    let working_directory = session
        .working_directory
        .clone()
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| dirs::home_dir())
        .ok_or_else(|| {
            AppError::TerminalError("Unable to resolve working directory for image paste".into())
        })?;

    let images_dir = working_directory
        .join(".vibe-manager")
        .join("pasted-images");
    fs::create_dir_all(&images_dir).await.map_err(|e| {
        AppError::TerminalError(format!(
            "Failed to create images directory {:?}: {}",
            images_dir, e
        ))
    })?;

    let extension = derive_extension(&file_name, &mime_type);
    let file_name = build_image_filename(&extension);
    let file_path = images_dir.join(file_name);

    fs::write(&file_path, data).await.map_err(|e| {
        AppError::TerminalError(format!("Failed to write image {:?}: {}", file_path, e))
    })?;

    file_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::TerminalError("Image path contained invalid UTF-8".into()))
}

#[tauri::command]
pub async fn attach_terminal_output_command(
    app_handle: tauri::AppHandle,
    job_id: String,
    output: tauri::ipc::Channel<Vec<u8>>,
) -> AppResult<serde_json::Value> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();

    // Check if session exists first
    match repo.get_session_by_job_id(&job_id).await {
        Ok(Some(_)) => {
            // Session exists, try to attach
            match terminal_manager
                .attach_client(&job_id, output, &app_handle)
                .await
            {
                Ok(_) => {
                    info!("Successfully attached to terminal session: {}", job_id);
                    Ok(json!({
                        "status": "attached",
                        "message": "Connected to terminal session"
                    }))
                }
                Err(e) => {
                    error!("Failed to attach to terminal session {}: {}", job_id, e);
                    Err(AppError::TerminalAttachmentFailed(format!(
                        "Connection lost. Retrying... Error: {}", e
                    )))
                }
            }
        }
        Ok(None) => {
            warn!("Terminal session not found: {}", job_id);
            Err(AppError::TerminalSessionNotFound(
                "Session ended. Click to start new session".to_string()
            ))
        }
        Err(e) => {
            error!("Database error checking session {}: {}", job_id, e);
            Err(AppError::DatabaseError(format!(
                "Failed to check session status: {}", e
            )))
        }
    }
}

#[tauri::command]
pub async fn write_terminal_input_command(
    app_handle: AppHandle,
    job_id: String,
    data: Vec<u8>,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

    terminal_manager
        .write_input(&job_id, data)
        .await
        .map_err(|e| {
            AppError::TerminalError(format!(
                "Failed to write input to terminal session for job {}: {}",
                job_id, e
            ))
        })
}

#[tauri::command]
pub async fn send_ctrl_c_to_terminal_command(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

    terminal_manager.send_ctrl_c(&job_id).await.map_err(|e| {
        AppError::TerminalError(format!(
            "Failed to send Ctrl+C to terminal session for job {}: {}",
            job_id, e
        ))
    })
}

#[tauri::command]
pub async fn kill_terminal_session_command(app_handle: AppHandle, job_id: String) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

    terminal_manager.kill_session(&job_id).await.map_err(|e| {
        AppError::TerminalError(format!(
            "Failed to kill terminal session for job {}: {}",
            job_id, e
        ))
    })
}

#[tauri::command]
pub async fn resize_terminal_session_command(
    app_handle: AppHandle,
    job_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

    terminal_manager
        .resize_session(&job_id, cols, rows)
        .await
        .map_err(|e| {
            AppError::TerminalError(format!(
                "Failed to resize terminal session for job {}: {}",
                job_id, e
            ))
        })
}

#[tauri::command]
pub async fn get_terminal_session_status_command(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<serde_json::Value> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

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

#[tauri::command]
pub async fn start_terminal_session_remote_command(
    app_handle: AppHandle,
    job_id: String,
    options: Option<TerminalSessionOptions>,
    client_id: String,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

    // Start the session internally (without UI channel)
    terminal_manager
        .start_session_internal(&job_id, options)
        .await?;

    // Attach the remote client
    terminal_manager
        .attach_remote_client(&job_id, client_id)
        .await?;

    Ok(())
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

#[tauri::command]
pub async fn detach_terminal_remote_client_command(
    app_handle: AppHandle,
    job_id: String,
    client_id: String,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

    terminal_manager
        .detach_remote_client(&job_id, &client_id)
        .await
        .map_err(|e| {
            AppError::TerminalError(format!(
                "Failed to detach remote client {} from terminal session {}: {}",
                client_id, job_id, e
            ))
        })
}

#[tauri::command]
pub async fn get_session_health_command(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<serde_json::Value> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();

    // Check database session state
    let db_session = match repo.get_session_by_job_id(&job_id).await {
        Ok(Some(session)) => session,
        Ok(None) => {
            return Ok(json!({
                "healthy": false,
                "reason": "session_not_found",
                "message": "Session not found in database",
                "recovery_hint": "Create a new session"
            }));
        }
        Err(e) => {
            return Ok(json!({
                "healthy": false,
                "reason": "database_error",
                "message": format!("Database error: {}", e),
                "recovery_hint": "Try again or restart application"
            }));
        }
    };

    // Check terminal manager status
    let status = terminal_manager.get_status(&job_id).await;
    let is_pty_alive = status.get("running").and_then(|v| v.as_bool()).unwrap_or(false);
    let has_clients = status.get("client_count").and_then(|v| v.as_u64()).unwrap_or(0) > 0;

    let healthy = is_pty_alive && (has_clients || db_session.status == "starting");

    Ok(json!({
        "healthy": healthy,
        "pty_alive": is_pty_alive,
        "has_clients": has_clients,
        "db_status": db_session.status,
        "working_directory": db_session.working_directory,
        "reason": if !healthy {
            if !is_pty_alive { "pty_dead" }
            else if !has_clients { "no_clients" }
            else { "unknown" }
        } else { "healthy" },
        "recovery_hint": if !healthy {
            if !is_pty_alive { "Restart the terminal session" }
            else if !has_clients { "Reconnect to the session" }
            else { "Unknown issue - try restarting" }
        } else { "No action needed" }
    }))
}

#[tauri::command]
pub async fn recover_terminal_session_command(
    app_handle: AppHandle,
    job_id: String,
    recovery_type: String,
) -> AppResult<serde_json::Value> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();

    info!("Attempting recovery for session {} with type: {}", job_id, recovery_type);

    match recovery_type.as_str() {
        "restart_pty" => {
            // Kill existing session if it exists
            let _ = terminal_manager.kill_session(&job_id).await;

            // Wait a bit for cleanup
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            // Get session options from database
            let session = repo.get_session_by_job_id(&job_id).await
                .map_err(|e| AppError::TerminalRecoveryError(format!("Failed to get session data for recovery: {}", e)))?
                .ok_or_else(|| AppError::TerminalRecoveryError("Session not found for recovery".to_string()))?;

            // Start fresh session internally
            let options = Some(crate::services::terminal_manager::TerminalSessionOptions {
                working_directory: Some(session.working_directory.unwrap_or_else(|| ".".to_string())),
                environment: Some(std::collections::HashMap::new()),
                rows: Some(24),
                cols: Some(80),
            });

            match terminal_manager.start_session_internal(&job_id, options).await {
                Ok(_) => {
                    info!("Successfully restarted PTY for session: {}", job_id);
                    Ok(json!({
                        "success": true,
                        "action": "pty_restarted",
                        "message": "Terminal process restarted successfully"
                    }))
                }
                Err(e) => {
                    error!("Failed to restart PTY for session {}: {}", job_id, e);
                    Err(AppError::TerminalRecoveryError(format!(
                        "Failed to restart terminal process: {}", e
                    )))
                }
            }
        }
        "clear_session" => {
            // Clean up everything and mark for fresh start
            let _ = terminal_manager.kill_session(&job_id).await;
            let _ = repo.delete_session_by_job_id(&job_id).await;

            info!("Cleared session data for fresh start: {}", job_id);
            Ok(json!({
                "success": true,
                "action": "session_cleared",
                "message": "Session cleared for fresh start"
            }))
        }
        "force_reconnect" => {
            // Force refresh session status in database
            match repo.update_session_status(&job_id, "starting", None).await {
                Ok(_) => {
                    info!("Forced session status refresh for: {}", job_id);
                    Ok(json!({
                        "success": true,
                        "action": "status_refreshed",
                        "message": "Session status refreshed"
                    }))
                }
                Err(e) => {
                    error!("Failed to refresh session status for {}: {}", job_id, e);
                    Err(AppError::TerminalRecoveryError(format!(
                        "Failed to refresh session status: {}", e
                    )))
                }
            }
        }
        _ => {
            warn!("Unknown recovery type requested: {}", recovery_type);
            Err(AppError::TerminalRecoveryError(format!(
                "Unknown recovery type: {}. Valid types: restart_pty, clear_session, force_reconnect",
                recovery_type
            )))
        }
    }
}

#[tauri::command]
pub async fn list_active_terminal_sessions_command(
    app_handle: AppHandle,
) -> AppResult<Vec<serde_json::Value>> {
    let repo = app_handle
        .state::<Arc<TerminalSessionsRepository>>()
        .inner()
        .clone();

    let sessions = repo.list_active_sessions().await.map_err(|e| {
        AppError::DatabaseError(format!("Failed to list active terminal sessions: {}", e))
    })?;

    let session_values = sessions
        .into_iter()
        .map(|session| {
            json!({
                "jobId": session.job_id,
                "status": session.status,
                "processId": session.process_pid,
                "createdAt": session.created_at,
                "lastOutputAt": session.last_output_at,
                "workingDirectory": session.working_directory,
                "title": session.title
            })
        })
        .collect();

    Ok(session_values)
}

// Enhanced health monitoring commands

#[tauri::command]
pub async fn register_terminal_health_session(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();
    let health_monitor = terminal_manager.get_health_monitor();

    health_monitor.register_session(&job_id);
    info!("Registered terminal session {} for health monitoring", job_id);

    Ok(())
}

#[tauri::command]
pub async fn unregister_terminal_health_session(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();
    let health_monitor = terminal_manager.get_health_monitor();

    health_monitor.unregister_session(&job_id);
    info!("Unregistered terminal session {} from health monitoring", job_id);

    Ok(())
}

#[tauri::command]
pub async fn get_terminal_health_status(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<HealthCheckResult> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();
    let health_monitor = terminal_manager.get_health_monitor();

    health_monitor.get_health_status(&job_id).await.map_err(|e| {
        AppError::TerminalError(format!(
            "Failed to get health status for session {}: {}",
            job_id, e
        ))
    })
}

#[tauri::command]
pub async fn get_terminal_health_history(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<Vec<HealthHistoryEntry>> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();
    let health_monitor = terminal_manager.get_health_monitor();

    health_monitor.get_health_history(&job_id).map_err(|e| {
        AppError::TerminalError(format!(
            "Failed to get health history for session {}: {}",
            job_id, e
        ))
    })
}

#[tauri::command]
pub async fn trigger_terminal_recovery(
    app_handle: AppHandle,
    job_id: String,
    action: RecoveryAction,
) -> AppResult<()> {
    let terminal_manager = app_handle.state::<Arc<TerminalManager>>().inner().clone();

    // Perform recovery using the terminal manager's recovery logic
    match terminal_manager.health_check(&job_id).await {
        Ok(health_status) => {
            terminal_manager.auto_recover(&job_id, health_status).await.map_err(|e| {
                AppError::TerminalError(format!(
                    "Failed to perform recovery for session {}: {}",
                    job_id, e
                ))
            })
        }
        Err(e) => {
            warn!("Could not check health before recovery for session {}: {}", job_id, e);
            // Still attempt recovery with the specified action
            match action {
                RecoveryAction::SendPrompt => {
                    match terminal_manager.write_input(&job_id, b"\r".to_vec()).await {
                        Ok(()) => {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            terminal_manager.write_input(&job_id, b"echo 'health-check-alive'\r".to_vec()).await
                                .map_err(|e| AppError::TerminalError(format!("Send prompt recovery failed: {}", e)))
                        }
                        Err(e) => Err(AppError::TerminalError(format!("Send prompt recovery failed: {}", e)))
                    }
                }
                RecoveryAction::Interrupt => {
                    terminal_manager.send_ctrl_c(&job_id).await
                        .map_err(|e| AppError::TerminalError(format!("Interrupt recovery failed: {}", e)))
                }
                RecoveryAction::Restart => {
                    terminal_manager.kill_session(&job_id).await
                        .map_err(|e| AppError::TerminalError(format!("Restart recovery failed: {}", e)))
                }
                _ => {
                    warn!("Recovery action {:?} not implemented for manual trigger", action);
                    Ok(())
                }
            }
        }
    }
}
