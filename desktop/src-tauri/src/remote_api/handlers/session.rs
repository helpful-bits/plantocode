use tauri::{AppHandle, Emitter, Manager};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::session_commands;
use crate::models::CreateSessionRequest;
use crate::db_utils::session_repository::{SessionRepository, TaskHistoryState, FileHistoryState};
use crate::services::history_state_sequencer::HistoryStateSequencer;
use once_cell::sync::Lazy;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::collections::HashMap;

struct CacheEntry {
    inserted_at: Instant,
    value: serde_json::Value,
}

static SESSION_LIST_CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const CACHE_TTL: Duration = Duration::from_millis(750);
const MAX_ENTRIES: usize = 128;

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
        "session.updateMergeInstructions" => handle_session_update_merge_instructions(app_handle, req).await,
        "session.updateFiles" => handle_session_update_files(app_handle, req).await,
        "session.getFileRelationships" => handle_session_get_file_relationships(app_handle, req).await,
        "session.getOverview" => handle_session_get_overview(app_handle, req).await,
        "session.getContents" => handle_session_get_contents(app_handle, req).await,
        "session.updateFileBrowserState" => handle_session_update_file_browser_state(app_handle, req).await,
        "session.getHistoryState" => handle_session_get_history_state_rpc(app_handle, req).await,
        "session.syncHistoryState" => handle_session_sync_history_state_rpc(app_handle, req).await,
        "session.mergeHistoryState" => handle_session_merge_history_state_rpc(app_handle, req).await,
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

    let cache_key = format!("sessions::{}", project_directory);

    // Check cache
    {
        let cache = SESSION_LIST_CACHE.lock().unwrap();
        if let Some(entry) = cache.get(&cache_key) {
            if entry.inserted_at.elapsed() < CACHE_TTL {
                return RpcResponse {
                    correlation_id: request.correlation_id,
                    result: Some(entry.value.clone()),
                    error: None,
                    is_final: true,
                };
            }
        }
    }

    // Execute actual query
    match session_commands::get_sessions_for_project_command(app_handle, project_directory)
        .await
    {
        Ok(sessions) => {
            let result_value = json!({ "sessions": sessions });

            // Store in cache
            {
                let mut cache = SESSION_LIST_CACHE.lock().unwrap();
                if cache.len() >= MAX_ENTRIES {
                    // Evict oldest
                    if let Some(oldest_key) = cache.iter().min_by_key(|(_, v)| v.inserted_at).map(|(k, _)| k.clone()) {
                        cache.remove(&oldest_key);
                    }
                }
                cache.insert(cache_key, CacheEntry {
                    inserted_at: Instant::now(),
                    value: result_value.clone(),
                });
            }

            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(result_value),
                error: None,
                is_final: true,
            }
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

    let history: Vec<String> = match request.params.get("history") {
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
        app_handle.clone(),
        session_id.clone(),
        history.clone(),
    )
    .await
    {
        Ok(_) => {
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

            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(json!({ "success": true })),
                error: None,
                is_final: true,
            }
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

    let content = match request.params.get("taskDescription") {
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

    match crate::services::task_update_sequencer::TaskUpdateSequencer::enqueue_external_task_description_update(
        &app_handle,
        session_id,
        content,
        crate::services::task_update_sequencer::UpdateSource::Remote,
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
            error: Some(format!("Failed to enqueue: {}", error)),
            is_final: true,
        },
    }
}

pub async fn handle_session_update_merge_instructions(app_handle: AppHandle, request: RpcRequest) -> RpcResponse {
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

    let merge_instructions = match request.params.get("mergeInstructions") {
        Some(Value::String(mi)) => mi.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid mergeInstructions parameter".to_string()),
                is_final: true,
            };
        }
    };

    match crate::services::task_update_sequencer::TaskUpdateSequencer::enqueue_merge_instructions(
        &app_handle,
        session_id,
        merge_instructions,
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
            error: Some(format!("Failed to enqueue: {}", error)),
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
) -> RpcResponse {
    match handle_session_get_history_state(app_handle, request.params).await {
        Ok(state) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(state),
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
) -> RpcResponse {
    match handle_session_sync_history_state(app_handle, request.params).await {
        Ok(result) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(result),
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
) -> RpcResponse {
    match handle_session_merge_history_state(app_handle, request.params).await {
        Ok(result) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(result),
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
