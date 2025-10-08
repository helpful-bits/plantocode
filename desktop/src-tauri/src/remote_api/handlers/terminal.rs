use tauri::{AppHandle, Manager};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::{terminal_commands, settings_commands};
use base64;
use uuid;

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

async fn handle_terminal_start(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    // Extract optional parameters
    let job_id = request
        .params
        .get("jobId")
        .and_then(|v| v.as_str())
        .map(String::from);

    let shell = request
        .params
        .get("shell")
        .and_then(|v| v.as_str())
        .map(String::from);

    let working_directory = request
        .params
        .get("workingDirectory")
        .and_then(|v| v.as_str())
        .map(String::from);

    // Generate a session ID if not provided in jobId
    let session_id = job_id.unwrap_or_else(|| format!("session-{}", uuid::Uuid::new_v4()));

    match terminal_commands::start_terminal_session_for_rpc_command(
        app_handle.clone(),
        session_id.clone(),
        working_directory.clone(),
        shell.clone(),
    )
    .await
    {
        Ok(session_info) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({
                "sessionId": session_info.session_id,
                "workingDirectory": session_info.working_directory,
                "shell": session_info.shell
            })),
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

    let data = match request.params.get("data") {
        Some(Value::String(data_str)) => {
            // Check if the string looks like base64 (alphanumeric + / + = padding)
            if data_str
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
                && data_str.len() % 4 == 0
            {
                // Try to decode as base64
                match base64::decode(data_str) {
                    Ok(decoded) => decoded,
                    Err(_) => data_str.as_bytes().to_vec(), // Fall back to raw string if decode fails
                }
            } else {
                data_str.as_bytes().to_vec()
            }
        }
        Some(Value::Array(data_arr)) => data_arr
            .iter()
            .filter_map(|v| v.as_u64())
            .map(|u| u as u8)
            .collect(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid data parameter".to_string()),
                is_final: true,
            };
        }
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
