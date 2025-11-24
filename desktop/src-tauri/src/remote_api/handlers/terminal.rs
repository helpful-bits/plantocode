//! Terminal RPC handlers for remote/mobile access.
//!
//! RPC does not stream terminal output inline; instead, clients subscribe to
//! device-link events (terminal.output with base64 data, terminal.exit) and use
//! terminal.getLog or initialLog for catch-up/hydration.

use tauri::{AppHandle, Manager};
use serde_json::{json, Value};
use crate::remote_api::error::{RpcError, RpcResult};
use crate::remote_api::types::RpcRequest;
use crate::commands::{terminal_commands, settings_commands};
use base64;
use uuid;
use sqlx::Row;
use std::sync::Arc;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "terminal.getAvailableShells" => handle_get_available_shells(app_handle, req).await,
        "terminal.getDefaultShell" => handle_get_default_shell(app_handle, req).await,
        "terminal.setDefaultShell" => handle_set_default_shell(app_handle, req).await,
        "terminal.start" => handle_terminal_start(&app_handle, req).await,
        "terminal.open" => handle_terminal_open(&app_handle, req).await,
        "terminal.write" => handle_terminal_write(&app_handle, req).await,
        "terminal.close" => handle_terminal_close(&app_handle, req).await,
        "terminal.execute" => handle_terminal_execute(&app_handle, req).await,
        "terminal.resize" => handle_terminal_resize(&app_handle, req).await,
        "terminal.kill" => handle_terminal_kill(&app_handle, req).await,
        "terminal.detach" => handle_terminal_detach(&app_handle, req).await,
        "terminal.getLog" => handle_terminal_get_log(&app_handle, req).await,
        "terminal.getStatus" => handle_terminal_get_status(app_handle, req).await,
        "terminal.getMetadata" => handle_terminal_get_metadata(app_handle, req).await,
        "terminal.getActiveSessions" => handle_terminal_get_active_sessions(app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

async fn handle_get_available_shells(app_handle: AppHandle, _req: RpcRequest) -> RpcResult<Value> {
    let shells = terminal_commands::get_available_shells_command(app_handle)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "shells": shells }))
}

async fn handle_get_default_shell(app_handle: AppHandle, _req: RpcRequest) -> RpcResult<Value> {
    let shell = settings_commands::get_app_setting(app_handle, "terminal.defaultShell".to_string())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "defaultShell": shell }))
}

async fn handle_set_default_shell(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let default_shell = req
        .params
        .get("defaultShell")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: defaultShell"))?
        .to_string();

    settings_commands::set_app_setting(
        app_handle,
        "terminal.defaultShell".to_string(),
        default_shell,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

/// Start a terminal session via RPC. Returns session metadata plus an initialLog
/// snapshot to hydrate mobile clients and avoid missing initial prompt output.
async fn handle_terminal_start(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    // Extract optional parameters
    let job_id = request
        .params
        .get("jobId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);

    let shell = request
        .params
        .get("shell")
        .and_then(|v| v.as_str())
        .map(String::from);

    let session_id = job_id.unwrap_or_else(|| format!("terminal-session-{}", uuid::Uuid::new_v4()));

    // Query working directory from key_value_store table
    // Desktop app is the authority - mobile must NOT pass working directory
    let working_directory = if let Some(pool) =
        app_handle.try_state::<Arc<sqlx::SqlitePool>>()
    {
        let pool = pool.inner().clone();
        match sqlx::query(
            r#"
            SELECT value
            FROM key_value_store
            WHERE key = ?1
            "#
        )
        .bind("global:global-project-dir")
        .fetch_optional(&*pool)
        .await
        {
            Ok(Some(row)) => {
                match row.try_get::<String, _>("value") {
                    Ok(dir) => Some(dir),
                    Err(_) => None,
                }
            }
            Ok(None) => None,
            Err(_) => None,
        }
    } else {
        None
    };

    let session_info = terminal_commands::start_terminal_session_for_rpc_command(
        app_handle.clone(),
        session_id.clone(),
        working_directory.clone(),
        shell.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    // Fetch initial log snapshot to avoid mobile race condition
    // Cap at 16 KiB to keep response size reasonable
    let mgr = app_handle.state::<std::sync::Arc<crate::services::TerminalManager>>();
    let initial_log_json = mgr.get_log_snapshot_entries(&session_info.session_id, Some(16 * 1024)).await;
    let initial_entries = initial_log_json.get("entries").cloned().unwrap_or(serde_json::json!([]));

    Ok(json!({
        "sessionId": session_info.session_id,
        "workingDirectory": session_info.working_directory,
        "shell": session_info.shell,
        "initialLog": initial_entries
    }))
}

async fn handle_terminal_open(_app_handle: &AppHandle, _request: RpcRequest) -> RpcResult<Value> {
    Err(RpcError::not_implemented("Operation not available via RPC"))
}

async fn handle_terminal_write(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    // Pure approach: explicit parameter determines how to interpret data
    // - "text": plain UTF-8 text string
    // - "data": base64-encoded raw bytes (for keyboard sequences, control codes, etc.)
    let data = if let Some(text) = request.params.get("text").and_then(|v| v.as_str()) {
        // Plain text path - direct UTF-8 encoding
        text.as_bytes().to_vec()
    } else if let Some(data_b64) = request.params.get("data").and_then(|v| v.as_str()) {
        // Raw bytes path - base64 decode (transport encoding only)
        base64::decode(data_b64)
            .map_err(|e| RpcError::invalid_params(format!("Invalid base64 data: {}", e)))?
    } else {
        return Err(RpcError::invalid_params("Missing 'text' or 'data' parameter"));
    };

    terminal_commands::write_terminal_input_command(app_handle.clone(), session_id, data)
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_terminal_close(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    terminal_commands::kill_terminal_session_command(app_handle.clone(), session_id)
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_terminal_execute(_app_handle: &AppHandle, _request: RpcRequest) -> RpcResult<Value> {
    Err(RpcError::not_implemented("Operation not available via RPC"))
}

async fn handle_terminal_resize(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let cols = request
        .params
        .get("cols")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| RpcError::invalid_params("Missing param: cols"))? as u16;

    let rows = request
        .params
        .get("rows")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| RpcError::invalid_params("Missing param: rows"))? as u16;

    terminal_commands::resize_terminal_session_command(
        app_handle.clone(),
        session_id,
        cols,
        rows,
    )
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_terminal_kill(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    handle_terminal_close(app_handle, request).await
}

async fn handle_terminal_detach(_app_handle: &AppHandle, _request: RpcRequest) -> RpcResult<Value> {
    // No-op success - acknowledges client detach action
    Ok(json!({ "success": true }))
}

async fn handle_terminal_get_log(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let mgr = app_handle.state::<std::sync::Arc<crate::services::TerminalManager>>();

    // Cap at 256 KiB to prevent large payloads
    let json = mgr.get_log_snapshot_entries(&session_id, Some(256 * 1024)).await;

    Ok(json)
}

async fn handle_terminal_get_status(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let status_json = terminal_commands::get_terminal_session_status_command(
        app_handle.clone(),
        session_id.clone(),
    )
    .map_err(RpcError::from)?;

    Ok(status_json)
}

async fn handle_terminal_get_metadata(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let metadata = terminal_commands::get_terminal_metadata_command(app_handle.clone(), session_id.clone())
        .map_err(RpcError::from)?;

    Ok(metadata)
}

async fn handle_terminal_get_active_sessions(app_handle: AppHandle, _request: RpcRequest) -> RpcResult<Value> {
    let sessions = terminal_commands::get_active_terminal_sessions_command(app_handle.clone())
        .map_err(RpcError::from)?;

    Ok(json!({ "sessions": sessions }))
}
