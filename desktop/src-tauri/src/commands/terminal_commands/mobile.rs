use crate::error::AppResult;
use tauri::{command, AppHandle};


#[command]
pub async fn read_terminal_log_command(
    _app_handle: AppHandle,
    _job_id: String
) -> AppResult<String> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[command]
pub async fn clear_terminal_log_command(
    _app_handle: AppHandle,
    _job_id: String
) -> AppResult<()> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[command]
pub async fn delete_terminal_log_command(
    _app_handle: AppHandle,
    _job_id: String
) -> AppResult<()> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[tauri::command]
pub async fn start_terminal_session_command(
    _app_handle: AppHandle,
    _window: tauri::Window,
    _job_id: String,
    _options: Option<serde_json::Value>,
    _output: tauri::ipc::Channel<Vec<u8>>,
) -> AppResult<()> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[tauri::command]
pub async fn write_terminal_input_command(
    _app_handle: AppHandle,
    _job_id: String,
    _data: Vec<u8>,
) -> AppResult<()> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[tauri::command]
pub async fn send_ctrl_c_to_terminal_command(
    _app_handle: AppHandle,
    _job_id: String,
) -> AppResult<()> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[tauri::command]
pub async fn kill_terminal_session_command(
    _app_handle: AppHandle,
    _job_id: String,
) -> AppResult<()> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[tauri::command]
pub async fn resize_terminal_session_command(
    _app_handle: AppHandle,
    _job_id: String,
    _cols: u16,
    _rows: u16,
) -> AppResult<()> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[tauri::command]
pub async fn get_terminal_session_status_command(
    _app_handle: AppHandle,
    _job_id: String,
) -> AppResult<serde_json::Value> {
    Ok(serde_json::json!({
        "status": "unavailable",
        "reason": "Terminal is not supported on mobile."
    }))
}

#[command]
pub async fn get_terminal_prerequisites_status_command(
    _app_handle: AppHandle,
) -> AppResult<serde_json::Value> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[command]
pub async fn check_terminal_dependencies_command(
    _app_handle: AppHandle,
) -> AppResult<serde_json::Value> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}

#[tauri::command]
pub async fn attach_terminal_output_command(
    _app_handle: tauri::AppHandle,
    _window: tauri::Window,
    _job_id: String,
    _output: tauri::ipc::Channel<Vec<u8>>,
) -> Result<(), crate::error::AppError> {
    Err(crate::error::AppError::TerminalError("Terminal is not supported on mobile.".into()))
}