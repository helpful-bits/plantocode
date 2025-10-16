use tauri::{AppHandle, Emitter, Manager};
use serde_json::json;
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::app_commands;
use crate::db_utils::SettingsRepository;
use std::sync::Arc;
use std::path::PathBuf;
use log::info;

/// Helper function to get SettingsRepository from AppHandle
fn get_settings_repo(app_handle: &AppHandle, correlation_id: String) -> Result<SettingsRepository, RpcResponse> {
    let pool = match app_handle.try_state::<Arc<sqlx::SqlitePool>>() {
        Some(pool) => pool.inner().clone(),
        None => {
            return Err(RpcResponse {
                correlation_id,
                result: None,
                error: Some("Database not available".to_string()),
                is_final: true,
            });
        }
    };
    Ok(SettingsRepository::new(pool.clone()))
}

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "app.getInfo" => handle_app_get_info(req).await,
        "app.setProjectDirectory" => handle_set_project_directory(app_handle, req).await,
        "app.getProjectDirectory" => handle_get_project_directory(app_handle, req).await,
        "app.getActiveSessionId" => handle_get_active_session_id(app_handle, req).await,
        "app.getUserHomeDirectory" => handle_get_user_home_directory(req).await,
        "app.listFolders" => handle_list_folders(req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_app_get_info(request: RpcRequest) -> RpcResponse {
    let info = app_commands::get_app_info();
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json!({ "appInfo": info })),
        error: None,
        is_final: true,
    }
}

async fn handle_set_project_directory(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    let dir = match request.params.get("projectDirectory") {
        Some(serde_json::Value::String(d)) if !d.is_empty() => d.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    let settings_repo = match get_settings_repo(&app_handle, request.correlation_id.clone()) {
        Ok(repo) => repo,
        Err(response) => return response,
    };

    // Persist the project directory using the correct key
    match settings_repo.set_project_directory(&dir).await {
        Ok(_) => {
            info!("Project directory updated: {}", dir);

            // Emit frontend event
            if let Err(e) = app_handle.emit("device-link-event", json!({
                "type": "project-directory-updated",
                "payload": {"projectDirectory": dir},
                "relayOrigin": "local"
            })) {
                log::error!("Failed to emit project-directory-updated event: {}", e);
            }

            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(json!({"ok": true})),
                error: None,
                is_final: true,
            }
        }
        Err(e) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Failed to set project directory: {}", e)),
            is_final: true,
        },
    }
}

async fn handle_get_project_directory(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    let settings_repo = match get_settings_repo(&app_handle, request.correlation_id.clone()) {
        Ok(repo) => repo,
        Err(response) => return response,
    };

    // Read the project directory using the correct key
    match settings_repo.get_project_directory().await {
        Ok(Some(dir)) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({"projectDirectory": dir})),
            error: None,
            is_final: true,
        },
        Ok(None) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({"projectDirectory": null})),
            error: None,
            is_final: true,
        },
        Err(e) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Failed to get project directory: {}", e)),
            is_final: true,
        },
    }
}

async fn handle_get_active_session_id(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    let settings_repo = match get_settings_repo(&app_handle, request.correlation_id.clone()) {
        Ok(repo) => repo,
        Err(response) => return response,
    };

    // Read the active session ID
    match settings_repo.get_active_session_id().await {
        Ok(Some(session_id)) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({"sessionId": session_id})),
            error: None,
            is_final: true,
        },
        Ok(None) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({"sessionId": null})),
            error: None,
            is_final: true,
        },
        Err(e) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Failed to get active session ID: {}", e)),
            is_final: true,
        },
    }
}

async fn handle_get_user_home_directory(request: RpcRequest) -> RpcResponse {
    match dirs::home_dir() {
        Some(home) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({"homeDirectory": home.to_string_lossy().to_string()})),
            error: None,
            is_final: true,
        },
        None => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Could not determine home directory".to_string()),
            is_final: true,
        },
    }
}

async fn handle_list_folders(request: RpcRequest) -> RpcResponse {
    let path_str = match request.params.get("path") {
        Some(serde_json::Value::String(p)) if !p.is_empty() => p.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid path parameter".to_string()),
                is_final: true,
            };
        }
    };

    let path = PathBuf::from(&path_str);

    // Security check: ensure path exists and is readable
    if !path.exists() {
        return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Path does not exist: {}", path_str)),
            is_final: true,
        };
    }

    if !path.is_dir() {
        return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Path is not a directory: {}", path_str)),
            is_final: true,
        };
    }

    // Read directory entries
    let entries = match std::fs::read_dir(&path) {
        Ok(entries) => entries,
        Err(e) => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some(format!("Failed to read directory: {}", e)),
                is_final: true,
            };
        }
    };

    let mut folders = Vec::new();

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();

            // Only include directories
            if path.is_dir() {
                if let Some(name) = path.file_name() {
                    // Skip hidden folders (starting with .)
                    let name_str = name.to_string_lossy().to_string();
                    if !name_str.starts_with('.') {
                        folders.push(json!({
                            "name": name_str,
                            "path": path.to_string_lossy().to_string(),
                        }));
                    }
                }
            }
        }
    }

    // Sort folders alphabetically
    folders.sort_by(|a, b| {
        let name_a = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let name_b = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        name_a.cmp(name_b)
    });

    // Get parent directory if not at root
    let parent = path.parent().map(|p| p.to_string_lossy().to_string());

    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json!({
            "currentPath": path_str,
            "parentPath": parent,
            "folders": folders,
        })),
        error: None,
        is_final: true,
    }
}
