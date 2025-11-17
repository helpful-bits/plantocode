use tauri::{AppHandle, Emitter, Manager};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::remote_api::error::{RpcError, RpcResult};
use crate::commands::session_commands;
use crate::models::CreateSessionRequest;
use crate::db_utils::session_repository::{SessionRepository, TaskHistoryState, FileHistoryState};
use crate::services::history_state_sequencer::HistoryStateSequencer;
use crate::services::session_cache::SessionCache;
use std::sync::Arc;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let correlation_id = req.correlation_id.clone();
    let result = match req.method.as_str() {
        "session.create" => handle_session_create(app_handle, req).await,
        "session.get" => handle_session_get(app_handle, req).await,
        "session.list" => handle_session_list(app_handle, req).await,
        "session.update" => handle_session_update(app_handle, req).await,
        "session.delete" => handle_session_delete(app_handle, req).await,
        "session.duplicate" => handle_session_duplicate(app_handle, req).await,
        "session.rename" => handle_session_rename(app_handle, req).await,
        "session.getTaskDescriptionHistory" => handle_session_get_task_description_history(app_handle, req).await,
        "session.syncTaskDescriptionHistory" => handle_session_sync_task_description_history(app_handle, req).await,
        "session.updateFiles" => handle_session_update_files(app_handle, req).await,
        "session.getFileRelationships" => handle_session_get_file_relationships(app_handle, req).await,
        "session.getOverview" => handle_session_get_overview(app_handle, req).await,
        "session.getContents" => handle_session_get_contents(app_handle, req).await,
        "session.updateFileBrowserState" => handle_session_update_file_browser_state(app_handle, req).await,
        "session.getHistoryState" => handle_session_get_history_state_rpc(app_handle, req).await,
        "session.syncHistoryState" => handle_session_sync_history_state_rpc(app_handle, req).await,
        "session.mergeHistoryState" => handle_session_merge_history_state_rpc(app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    };

    match result {
        Ok(value) => RpcResponse {
            correlation_id,
            result: Some(value),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id,
            result: None,
            error: Some(error),
            is_final: true,
        },
    }
}

pub async fn handle_session_create(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_request: CreateSessionRequest = serde_json::from_value(request.params)
        .map_err(|e| RpcError::invalid_params(format!("Invalid session request: {}", e)))?;

    let session = session_commands::create_session_command(app_handle, session_request)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "session": session }))
}

pub async fn handle_session_get(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let session = session_commands::get_session_command(app_handle, session_id)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "session": session }))
}

pub async fn handle_session_list(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let sessions = session_commands::get_sessions_for_project_command(app_handle, project_directory)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "sessions": sessions }))
}

pub async fn handle_session_update(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let update_data = request.params.get("updateData")
        .ok_or_else(|| RpcError::invalid_params("Missing param: updateData"))?
        .clone();

    let session = session_commands::update_session_fields_command(
        app_handle,
        session_id,
        update_data,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "session": session }))
}

pub async fn handle_session_delete(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    session_commands::delete_session_command(app_handle, session_id)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

pub async fn handle_session_duplicate(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let source_session_id = request.params.get("sourceSessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sourceSessionId"))?
        .to_string();

    let new_name = request.params.get("newName")
        .and_then(|v| v.as_str())
        .map(String::from);

    let session = session_commands::duplicate_session_command(
        app_handle,
        source_session_id,
        new_name,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "session": session }))
}

pub async fn handle_session_rename(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    // Normalize both "newName" and legacy "name" for compatibility
    let new_name = request.params.get("newName")
        .and_then(|v| v.as_str())
        .or_else(|| request.params.get("name").and_then(|v| v.as_str()))
        .ok_or_else(|| RpcError::invalid_params("Missing param: newName"))?
        .to_string();

    session_commands::rename_session_command(app_handle, session_id, new_name)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

pub async fn handle_session_get_task_description_history(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let history = session_commands::get_task_description_history_command(app_handle, session_id)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "history": history }))
}

pub async fn handle_session_sync_task_description_history(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let history: Vec<String> = request.params.get("history")
        .and_then(|v| v.as_array())
        .ok_or_else(|| RpcError::invalid_params("Missing param: history"))?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();

    session_commands::sync_task_description_history_command(
        app_handle.clone(),
        session_id.clone(),
        history.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    let last_entry = history.last().cloned().unwrap_or_default();
    let payload = json!({
        "sessionId": session_id,
        "taskDescription": last_entry
    });

    if let Err(e) = app_handle.emit("session-history-synced", payload.clone()) {
        eprintln!("Failed to emit session-history-synced event: {}", e);
    }

    if let Err(e) = app_handle.emit("device-link-event", json!({
        "type": "session-history-synced",
        "payload": payload
    })) {
        eprintln!("Failed to emit device-link event: {}", e);
    }

    Ok(json!({ "success": true }))
}

pub async fn handle_session_update_files(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let files_to_add = request.params.get("filesToAdd")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let files_to_remove = request.params.get("filesToRemove")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let excluded_to_add = request.params.get("excludedToAdd")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let excluded_to_remove = request.params.get("excludedToRemove")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let session = session_commands::update_session_files_command(
        app_handle,
        session_id,
        files_to_add,
        files_to_remove,
        excluded_to_add,
        excluded_to_remove,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "session": session }))
}

pub async fn handle_session_get_file_relationships(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let relationships = session_commands::get_file_relationships_command(app_handle, session_id)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "relationships": relationships }))
}

pub async fn handle_session_get_overview(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let overview = session_commands::get_session_overview_command(app_handle, session_id)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "overview": overview }))
}

pub async fn handle_session_get_contents(app_handle: AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let contents = session_commands::get_session_contents_command(app_handle, session_id)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "contents": contents }))
}

pub async fn handle_session_update_file_browser_state(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request.params.get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let project_directory = request.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let search_term = request.params.get("searchTerm")
        .and_then(|v| v.as_str())
        .map(String::from);

    let sort_by = request.params.get("sortBy")
        .and_then(|v| v.as_str())
        .map(String::from);

    let sort_order = request.params.get("sortOrder")
        .and_then(|v| v.as_str())
        .map(String::from);

    let filter_mode = request.params.get("filterMode")
        .and_then(|v| v.as_str())
        .map(String::from);

    let payload = json!({
        "sessionId": session_id,
        "projectDirectory": project_directory,
        "searchTerm": search_term,
        "sortBy": sort_by,
        "sortOrder": sort_order,
        "filterMode": filter_mode
    });

    app_handle.emit("session-file-browser-state-updated", payload.clone())
        .map_err(|e| RpcError::internal_error(format!("Failed to emit event: {e}")))?;

    // NOTE: DeviceLinkClient forwards only when key is 'payload' (not 'data'). Keep consistent for relay.
    app_handle.emit(
        "device-link-event",
        json!({
            "type": "session-file-browser-state-updated",
            "payload": payload
        }),
    )
    .map_err(|e| RpcError::internal_error(format!("Failed to emit device-link event: {e}")))?;

    Ok(json!({ "ok": true }))
}

async fn handle_session_get_history_state(
    app: AppHandle,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let session_id = params["sessionId"]
        .as_str()
        .ok_or("Missing sessionId")?
        .to_string();
    let kind = params["kind"]
        .as_str()
        .ok_or("Missing kind")?
        .to_string();

    let db = app.state::<Arc<sqlx::SqlitePool>>();
    let repo = SessionRepository::new(db.inner().clone());

    let state = if kind == "task" {
        let task_state = repo.get_task_history_state(&session_id)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_value(&task_state).map_err(|e| e.to_string())?
    } else if kind == "files" {
        let file_state = repo.get_file_history_state(&session_id)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_value(&file_state).map_err(|e| e.to_string())?
    } else {
        return Err("Invalid kind".to_string());
    };

    Ok(state)
}

pub async fn handle_session_get_history_state_rpc(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    handle_session_get_history_state(app_handle, request.params)
        .await
        .map_err(RpcError::internal_error)
}

async fn handle_session_sync_history_state(
    app: AppHandle,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let session_id = params["sessionId"]
        .as_str()
        .ok_or("Missing sessionId")?
        .to_string();
    let kind = params["kind"]
        .as_str()
        .ok_or("Missing kind")?
        .to_string();
    let expected_version = params["expectedVersion"]
        .as_i64()
        .ok_or("Missing expectedVersion")?;

    let sequencer = app.state::<Arc<HistoryStateSequencer>>();

    let result = if kind == "task" {
        let state: TaskHistoryState = serde_json::from_value(params["state"].clone())
            .map_err(|e| e.to_string())?;
        let updated = sequencer.enqueue_sync_task(session_id, state, expected_version).await?;
        serde_json::to_value(&updated).map_err(|e| e.to_string())?
    } else if kind == "files" {
        let state: FileHistoryState = serde_json::from_value(params["state"].clone())
            .map_err(|e| e.to_string())?;
        let updated = sequencer.enqueue_sync_files(session_id, state, expected_version).await?;
        serde_json::to_value(&updated).map_err(|e| e.to_string())?
    } else {
        return Err("Invalid kind".to_string());
    };

    Ok(result)
}

pub async fn handle_session_sync_history_state_rpc(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    handle_session_sync_history_state(app_handle, request.params)
        .await
        .map_err(RpcError::internal_error)
}

async fn handle_session_merge_history_state(
    app: AppHandle,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let session_id = params["sessionId"]
        .as_str()
        .ok_or("Missing sessionId")?
        .to_string();
    let kind = params["kind"]
        .as_str()
        .ok_or("Missing kind")?
        .to_string();

    let sequencer = app.state::<Arc<HistoryStateSequencer>>();

    let result = if kind == "task" {
        let remote_state: TaskHistoryState = serde_json::from_value(params["remoteState"].clone())
            .map_err(|e| e.to_string())?;
        let merged = sequencer.enqueue_merge_task(session_id, remote_state).await?;
        serde_json::to_value(&merged).map_err(|e| e.to_string())?
    } else if kind == "files" {
        let remote_state: FileHistoryState = serde_json::from_value(params["remoteState"].clone())
            .map_err(|e| e.to_string())?;
        let merged = sequencer.enqueue_merge_files(session_id, remote_state).await?;
        serde_json::to_value(&merged).map_err(|e| e.to_string())?
    } else {
        return Err("Invalid kind".to_string());
    };

    Ok(result)
}

pub async fn handle_session_merge_history_state_rpc(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    handle_session_merge_history_state(app_handle, request.params)
        .await
        .map_err(RpcError::internal_error)
}
