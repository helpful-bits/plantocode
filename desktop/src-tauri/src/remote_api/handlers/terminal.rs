//! Terminal RPC handlers for remote/mobile access.
//!
//! RPC does not stream terminal output inline; instead, clients subscribe to
//! device-link events (terminal.output with base64 data, terminal.exit) and use
//! terminal.getLog or initialLog for catch-up/hydration.

use tauri::{AppHandle, Manager};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::{terminal_commands, settings_commands};
use base64;
use uuid;
use sqlx::Row;
use std::sync::Arc;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
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
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_get_available_shells(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match terminal_commands::get_available_shells_command(app_handle).await {
        Ok(shells) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "shells": shells })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_get_default_shell(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match settings_commands::get_app_setting(app_handle, "terminal.defaultShell".to_string()).await {
        Ok(shell) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "defaultShell": shell })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_set_default_shell(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let default_shell = match req.params.get("defaultShell") {
        Some(serde_json::Value::String(shell)) => shell.clone(),
        _ => {
            return RpcResponse {
                correlation_id: req.correlation_id,
                result: None,
                error: Some("Missing or invalid defaultShell parameter".to_string()),
                is_final: true,
            };
        }
    };

    match settings_commands::set_app_setting(
        app_handle,
        "terminal.defaultShell".to_string(),
        default_shell,
    ).await {
        Ok(_) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

/// Start a terminal session via RPC. Returns session metadata plus an initialLog
/// snapshot to hydrate mobile clients and avoid missing initial prompt output.
async fn handle_terminal_start(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
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

    // Generate a session ID if not provided in jobId
    let session_id = job_id.unwrap_or_else(|| format!("session-{}", uuid::Uuid::new_v4()));

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

    match terminal_commands::start_terminal_session_for_rpc_command(
        app_handle.clone(),
        session_id.clone(),
        working_directory.clone(),
        shell.clone(),
    )
    .await
    {
        Ok(session_info) => {
            // Fetch initial log snapshot to avoid mobile race condition
            // Cap at 16 KiB to keep response size reasonable
            let mgr = app_handle.state::<std::sync::Arc<crate::services::TerminalManager>>();
            let initial_log_json = mgr.get_log_snapshot_entries(&session_info.session_id, Some(16 * 1024)).await;
            let initial_entries = initial_log_json.get("entries").cloned().unwrap_or(serde_json::json!([]));

            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(json!({
                    "sessionId": session_info.session_id,
                    "workingDirectory": session_info.working_directory,
                    "shell": session_info.shell,
                    "initialLog": initial_entries
                })),
                error: None,
                is_final: true,
            }
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_terminal_open(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    RpcResponse {
        correlation_id: request.correlation_id,
        result: None,
        error: Some("Terminal open via RPC not supported - use WebSocket instead".to_string()),
        is_final: true,
    }
}

async fn handle_terminal_write(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Pure approach: explicit parameter determines how to interpret data
    // - "text": plain UTF-8 text string
    // - "data": base64-encoded raw bytes (for keyboard sequences, control codes, etc.)
    let data = if let Some(text) = request.params.get("text").and_then(|v| v.as_str()) {
        // Plain text path - direct UTF-8 encoding
        text.as_bytes().to_vec()
    } else if let Some(data_b64) = request.params.get("data").and_then(|v| v.as_str()) {
        // Raw bytes path - base64 decode (transport encoding only)
        match base64::decode(data_b64) {
            Ok(decoded) => decoded,
            Err(e) => {
                return RpcResponse {
                    correlation_id: request.correlation_id,
                    result: None,
                    error: Some(format!("Invalid base64 data: {}", e)),
                    is_final: true,
                };
            }
        }
    } else {
        return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Missing 'text' or 'data' parameter".to_string()),
            is_final: true,
        };
    };

    match terminal_commands::write_terminal_input_command(app_handle.clone(), session_id, data) {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_terminal_close(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    match terminal_commands::kill_terminal_session_command(app_handle.clone(), session_id) {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_terminal_execute(_app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: None,
        error: Some("Terminal execute not implemented - use write instead".to_string()),
        is_final: true,
    }
}

async fn handle_terminal_resize(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let cols = match request.params.get("cols") {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(80) as u16,
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid cols parameter".to_string()),
                is_final: true,
            };
        }
    };

    let rows = match request.params.get("rows") {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(24) as u16,
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid rows parameter".to_string()),
                is_final: true,
            };
        }
    };

    match terminal_commands::resize_terminal_session_command(
        app_handle.clone(),
        session_id,
        cols,
        rows,
    ) {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_terminal_kill(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    handle_terminal_close(app_handle, request).await
}

async fn handle_terminal_detach(_app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    // No-op success - acknowledges client detach action
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json!({ "success": true })),
        error: None,
        is_final: true,
    }
}

async fn handle_terminal_get_log(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let mgr = app_handle.state::<std::sync::Arc<crate::services::TerminalManager>>();

    // Cap at 256 KiB to prevent large payloads
    let json = mgr.get_log_snapshot_entries(&session_id, Some(256 * 1024)).await;

    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json),
        error: None,
        is_final: true,
    }
}

async fn handle_terminal_get_status(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let status_result = terminal_commands::get_terminal_session_status_command(
        app_handle.clone(),
        session_id.clone(),
    );

    match status_result {
        Ok(status_json) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(status_json),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_terminal_get_metadata(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    let session_id = match request.params.get("sessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    match terminal_commands::get_terminal_metadata_command(app_handle.clone(), session_id.clone()) {
        Ok(metadata) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(metadata),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

async fn handle_terminal_get_active_sessions(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    match terminal_commands::get_active_terminal_sessions_command(app_handle.clone()) {
        Ok(sessions) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "sessions": sessions })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}
