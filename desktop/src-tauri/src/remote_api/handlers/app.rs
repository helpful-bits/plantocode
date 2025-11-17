use tauri::{AppHandle, Emitter, Manager};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::remote_api::error::{RpcError, RpcResult};
use crate::commands::app_commands;
use crate::db_utils::SettingsRepository;
use std::sync::Arc;
use std::path::PathBuf;
use log::info;

/// Helper function to get SettingsRepository from AppHandle
fn get_settings_repo(app_handle: &AppHandle) -> RpcResult<SettingsRepository> {
    let pool = app_handle.try_state::<Arc<sqlx::SqlitePool>>()
        .ok_or_else(|| RpcError::database_error("Database not available"))?
        .inner()
        .clone();
    Ok(SettingsRepository::new(pool))
}

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "app.getInfo" => handle_app_get_info(req).await,
        "app.setProjectDirectory" => handle_set_project_directory(app_handle, req).await,
        "app.getProjectDirectory" => handle_get_project_directory(app_handle, req).await,
        "app.getActiveSessionId" => handle_get_active_session_id(app_handle, req).await,
        "app.getUserHomeDirectory" => handle_get_user_home_directory(req).await,
        "app.listFolders" => handle_list_folders(req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

async fn handle_app_get_info(_request: RpcRequest) -> RpcResult<Value> {
    let info = app_commands::get_app_info();
    Ok(json!({ "appInfo": info }))
}

async fn handle_set_project_directory(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let dir = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let settings_repo = get_settings_repo(&app_handle)?;

    // Persist the project directory using the correct key
    settings_repo.set_project_directory(&dir).await
        .map_err(RpcError::from)?;

    info!("Project directory updated: {}", dir);

    // Emit frontend event
    if let Err(e) = app_handle.emit("device-link-event", json!({
        "type": "project-directory-updated",
        "payload": {"projectDirectory": dir},
        "relayOrigin": "local"
    })) {
        log::error!("Failed to emit project-directory-updated event: {}", e);
    }

    Ok(json!({"ok": true}))
}

async fn handle_get_project_directory(app_handle: AppHandle, _request: RpcRequest) -> RpcResult<Value> {
    let settings_repo = get_settings_repo(&app_handle)?;

    // Read the project directory using the correct key
    let dir = settings_repo.get_project_directory().await
        .map_err(RpcError::from)?;

    Ok(json!({"projectDirectory": dir}))
}

async fn handle_get_active_session_id(app_handle: AppHandle, _request: RpcRequest) -> RpcResult<Value> {
    let settings_repo = get_settings_repo(&app_handle)?;

    // Read the active session ID
    let session_id = settings_repo.get_active_session_id().await
        .map_err(RpcError::from)?;

    Ok(json!({"sessionId": session_id}))
}

async fn handle_get_user_home_directory(_request: RpcRequest) -> RpcResult<Value> {
    let home = crate::utils::fs_utils::get_home_directory()
        .map_err(RpcError::from)?;

    Ok(json!({"homeDirectory": home}))
}

async fn handle_list_folders(request: RpcRequest) -> RpcResult<Value> {
    let path_str = request.params.get("path")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| RpcError::invalid_params("Missing param: path"))?
        .to_string();

    let path = PathBuf::from(&path_str);

    // Security check: ensure path exists and is readable
    if !path.exists() {
        return Err(RpcError::not_found(format!("Path does not exist: {}", path_str)));
    }

    if !path.is_dir() {
        return Err(RpcError::invalid_params(format!("Path is not a directory: {}", path_str)));
    }

    // Read directory entries in a blocking task to prevent blocking the async runtime
    let path_clone = path.clone();
    let folders = tokio::task::spawn_blocking(move || {
        let entries = std::fs::read_dir(&path_clone)?;

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

        Ok::<_, std::io::Error>(folders)
    })
    .await
    .map_err(|e| RpcError::internal_error(format!("Failed to spawn blocking task: {}", e)))?
    .map_err(|e| RpcError::internal_error(format!("Failed to read directory: {}", e)))?;

    // Get parent directory if not at root
    let parent = path.parent().map(|p| p.to_string_lossy().to_string());

    Ok(json!({
        "currentPath": path_str,
        "parentPath": parent,
        "folders": folders,
    }))
}
