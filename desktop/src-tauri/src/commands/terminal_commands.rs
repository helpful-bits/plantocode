use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Window, command};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub session_id: String,
    pub working_directory: Option<String>,
    pub shell: Option<String>,
}

#[command]
pub async fn start_terminal_session_command(
    app: AppHandle,
    window: Window,
    session_id: String,
    options: Option<serde_json::Value>,
    output: Channel<Vec<u8>>,
) -> Result<(), String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    let wd = options
        .as_ref()
        .and_then(|o| o.get("workingDirectory"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let cols = options
        .as_ref()
        .and_then(|o| o.get("cols"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u16);
    let rows = options
        .as_ref()
        .and_then(|o| o.get("rows"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u16);
    mgr.start_session(session_id, wd, cols, rows, Some(output))
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub fn attach_terminal_output_command(
    app: AppHandle,
    session_id: String,
    output: Channel<Vec<u8>>,
) -> Result<(), String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.attach(&session_id, Some(output)).map_err(|e| e.to_string())
}

#[command]
pub fn write_terminal_input_command(
    app: AppHandle,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.write_input(&session_id, data)
        .map_err(|e| e.to_string())
}

#[command]
pub fn resize_terminal_session_command(
    app: AppHandle,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.resize(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[command]
pub fn kill_terminal_session_command(app: AppHandle, session_id: String) -> Result<(), String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.kill(&session_id).map_err(|e| e.to_string())
}

#[command]
pub fn get_terminal_session_status_command(
    app: AppHandle,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    let status_json = mgr.status(&session_id);

    // If the manager returns "stopped" but we have a restored session in DB, return "restored"
    if status_json.get("status") == Some(&serde_json::Value::String("stopped".to_string())) {
        // Check if this is actually a restored session
        // The status method should handle this internally and return "restored" for DB sessions
    }

    Ok(status_json)
}

#[command]
pub fn list_terminal_sessions_command(app: AppHandle) -> Result<Vec<String>, String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    Ok(mgr.get_active_sessions())
}

#[command]
pub async fn restore_terminal_sessions_command(app: AppHandle) -> Result<Vec<String>, String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.restore_sessions().await.map_err(|e| e.to_string())
}

#[command]
pub fn get_active_terminal_sessions_command(app: AppHandle) -> Result<Vec<String>, String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    Ok(mgr.get_active_sessions())
}

#[command]
pub fn reconnect_terminal_session_command(
    app: AppHandle,
    session_id: String,
    output: Channel<Vec<u8>>,
) -> Result<bool, String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.reconnect_to_session(&session_id, Some(output))
        .map_err(|e| e.to_string())
}

/// RPC-specific terminal session creation (headless mode).
/// Output is streamed via device-link events (terminal.output/terminal.exit) for mobile clients.
/// Desktop local UI uses a separate start path with a Channel for low-latency rendering.
pub async fn start_terminal_session_for_rpc_command(
    app: AppHandle,
    session_id: String,
    working_directory: Option<String>,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalSessionInfo, String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();

    // Check if session already exists and is actively running (not restored)
    let status = mgr.status(&session_id);
    if let Some(status_str) = status.get("status").and_then(|v| v.as_str()) {
        if status_str == "running" {
            // Session is actively running with live PTY, return its info
            let wd = mgr.get_session_working_directory(&session_id)
                .or(working_directory.clone())
                .or_else(|| std::env::current_dir().ok().and_then(|p| p.to_str().map(String::from)));

            return Ok(TerminalSessionInfo {
                session_id,
                working_directory: wd,
                shell,
            });
        }
        // If restored or stopped, fall through to start new PTY session below
    }
    // If stopped or doesn't exist, proceed to start new session below...

    // Start the session using the existing terminal manager
    mgr.start_session(
        session_id.clone(),
        working_directory.clone(),
        cols,
        rows,
        None, // RPC path runs headless; output relayed via device-link events
    )
    .await
    .map_err(|e| e.to_string())?;

    // Determine the shell - use the provided shell or detect the default
    let detected_shell = shell.unwrap_or_else(|| {
        if cfg!(windows) {
            "cmd.exe".to_string()
        } else if cfg!(target_os = "macos") {
            "/bin/zsh".to_string()
        } else {
            "/bin/bash".to_string()
        }
    });

    Ok(TerminalSessionInfo {
        session_id,
        working_directory,
        shell: Some(detected_shell),
    })
}

#[command]
pub async fn clear_terminal_log_command(
    app: AppHandle,
    session_id: String,
    clear_db: bool,
) -> Result<(), String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.clear_log(&session_id, clear_db)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub fn get_terminal_metadata_command(
    app: AppHandle,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.get_metadata(&session_id)
        .ok_or_else(|| "Session not found".to_string())
}

#[command]
pub fn graceful_exit_terminal_command(app: AppHandle, session_id: String) -> Result<(), String> {
    let mgr = app.state::<std::sync::Arc<crate::services::TerminalManager>>();
    mgr.graceful_exit(&session_id).map_err(|e| e.to_string())
}

#[command]
pub async fn get_available_shells_command(_app_handle: AppHandle) -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let candidates = vec!["pwsh.exe", "powershell.exe", "cmd.exe"];
        let mut found = Vec::new();
        for c in candidates {
            if which::which(c).is_ok() {
                found.push(c.to_string());
            }
        }
        found.sort();
        found.dedup();
        Ok(found)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let candidates = vec!["/bin/zsh", "/bin/bash", "/usr/local/bin/fish", "/opt/homebrew/bin/fish"];
        let mut found = Vec::new();
        for c in candidates {
            if std::path::Path::new(c).exists() {
                found.push(c.to_string());
            }
        }
        found.sort();
        found.dedup();
        Ok(found)
    }
}
