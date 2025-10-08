use tauri::{AppHandle, Emitter};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::session_commands;
use crate::models::CreateSessionRequest;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "session.create" => handle_session_create(app_handle, req).await,
        "session.get" => handle_session_get(app_handle, req).await,
        "session.list" => handle_session_list(app_handle, req).await,
        "session.update" => handle_session_update(app_handle, req).await,
        "session.delete" => handle_session_delete(app_handle, req).await,
        "session.duplicate" => handle_session_duplicate(app_handle, req).await,
        "session.getTaskDescriptionHistory" => handle_session_get_task_description_history(app_handle, req).await,
        "session.syncTaskDescriptionHistory" => handle_session_sync_task_description_history(app_handle, req).await,
        "session.updateTaskDescription" => handle_session_update_task_description(app_handle, req).await,
        "session.updateFiles" => handle_session_update_files(app_handle, req).await,
        "session.getFileRelationships" => handle_session_get_file_relationships(app_handle, req).await,
        "session.getOverview" => handle_session_get_overview(app_handle, req).await,
        "session.getContents" => handle_session_get_contents(app_handle, req).await,
        "session.updateFileBrowserState" => handle_session_update_file_browser_state(app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

pub async fn handle_session_create(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    let session_request: CreateSessionRequest = match serde_json::from_value(request.params) {
        Ok(req) => req,
        Err(error) => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some(format!("Invalid session request: {}", error)),
                is_final: true,
            };
        }
    };

    match session_commands::create_session_command(app_handle, session_request).await {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "session": session })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_get(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
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

    match session_commands::get_session_command(app_handle, session_id).await {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "session": session })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_list(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    match session_commands::get_sessions_for_project_command(app_handle, project_directory)
        .await
    {
        Ok(sessions) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "sessions": sessions })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_update(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
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

    let update_data = match request.params.get("updateData") {
        Some(data) => data.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid updateData parameter".to_string()),
                is_final: true,
            };
        }
    };

    match session_commands::update_session_fields_command(
        app_handle,
        session_id,
        update_data,
    )
    .await
    {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "session": session })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_delete(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
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

    match session_commands::delete_session_command(app_handle, session_id).await {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_duplicate(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
    let source_session_id = match request.params.get("sourceSessionId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid sourceSessionId parameter".to_string()),
                is_final: true,
            };
        }
    };

    let new_name = request
        .params
        .get("newName")
        .and_then(|v| v.as_str())
        .map(String::from);

    match session_commands::duplicate_session_command(
        app_handle,
        source_session_id,
        new_name,
    )
    .await
    {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "session": session })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_get_task_description_history(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResponse {
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

    match session_commands::get_task_description_history_command(app_handle, session_id)
        .await
    {
        Ok(history) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "history": history })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_sync_task_description_history(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResponse {
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

    let history = match request.params.get("history") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid history parameter".to_string()),
                is_final: true,
            };
        }
    };

    match session_commands::sync_task_description_history_command(
        app_handle,
        session_id,
        history,
    )
    .await
    {
        Ok(_) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "success": true })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_update_task_description(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
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

    let task_description = match request.params.get("taskDescription") {
        Some(Value::String(desc)) => desc.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid taskDescription parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Create update data JSON to only update the taskDescription field
    let update_data = json!({
        "taskDescription": task_description
    });

    match session_commands::update_session_fields_command(
        app_handle,
        session_id,
        update_data,
    )
    .await
    {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "ok": true, "session": session })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_update_files(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
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

    let files_to_add = request
        .params
        .get("filesToAdd")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let files_to_remove = request
        .params
        .get("filesToRemove")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let excluded_to_add = request
        .params
        .get("excludedToAdd")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let excluded_to_remove = request
        .params
        .get("excludedToRemove")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    match session_commands::update_session_files_command(
        app_handle,
        session_id,
        files_to_add,
        files_to_remove,
        excluded_to_add,
        excluded_to_remove,
    )
    .await
    {
        Ok(session) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "session": session })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_get_file_relationships(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResponse {
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

    match session_commands::get_file_relationships_command(app_handle, session_id).await {
        Ok(relationships) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "relationships": relationships })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_get_overview(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
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

    match session_commands::get_session_overview_command(app_handle, session_id).await {
        Ok(overview) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "overview": overview })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_get_contents(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
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

    match session_commands::get_session_contents_command(app_handle, session_id).await {
        Ok(contents) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "contents": contents })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

pub async fn handle_session_update_file_browser_state(
    app_handle: AppHandle,
    request: RpcRequest,
) -> RpcResponse {
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

    let project_directory = match request.params.get("projectDirectory") {
        Some(Value::String(dir)) => dir.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid projectDirectory parameter".to_string()),
                is_final: true,
            };
        }
    };

    let search_term = request
        .params
        .get("searchTerm")
        .and_then(|v| v.as_str())
        .map(String::from);

    let sort_by = request
        .params
        .get("sortBy")
        .and_then(|v| v.as_str())
        .map(String::from);

    let sort_order = request
        .params
        .get("sortOrder")
        .and_then(|v| v.as_str())
        .map(String::from);

    let filter_mode = request
        .params
        .get("filterMode")
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

    match app_handle.emit("session-file-browser-state-updated", payload.clone()) {
        Ok(_) => {}
        Err(e) => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some(format!("Failed to emit event: {e}")),
                is_final: true,
            };
        }
    }

    // NOTE: DeviceLinkClient forwards only when key is 'payload' (not 'data'). Keep consistent for relay.
    match app_handle.emit(
        "device-link-event",
        json!({
            "type": "session-file-browser-state-updated",
            "payload": payload
        }),
    ) {
        Ok(_) => {}
        Err(e) => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some(format!("Failed to emit device-link event: {e}")),
                is_final: true,
            };
        }
    }

    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json!({ "ok": true })),
        error: None,
        is_final: true,
    }
}
