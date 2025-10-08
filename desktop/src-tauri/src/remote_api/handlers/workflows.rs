use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::workflow_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "workflow.getStatus" => handle_workflow_get_status(&app_handle, req).await,
        "workflow.cancel" => handle_workflow_cancel(&app_handle, req).await,
        "workflow.getResults" => handle_workflow_get_results(&app_handle, req).await,
        "workflows.startFileFinder" => handle_workflows_start_file_finder(&app_handle, req).await,
        "workflows.startWebSearch" => handle_workflows_start_web_search(&app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_workflow_get_status(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid workflowId parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: workflow_id, app_handle
    match workflow_commands::get_workflow_status(workflow_id, app_handle.clone()).await {
        Ok(status) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "status": status })),
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

async fn handle_workflow_cancel(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid workflowId parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: workflow_id, app_handle
    match workflow_commands::cancel_workflow(workflow_id, app_handle.clone()).await {
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

async fn handle_workflow_get_results(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let workflow_id = match request.params.get("workflowId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid workflowId parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Use the legacy version that takes AppHandle instead of State<AppState>
    match workflow_commands::get_workflow_results_legacy(workflow_id, app_handle.clone()).await {
        Ok(results) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "results": results })),
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

/// Handle workflows.startFileFinder request
/// Params: sessionId, taskDescription, projectDirectory, excludedPaths, timeoutMs
/// Response: {"workflowId": workflow_id}
async fn handle_workflows_start_file_finder(
    app_handle: &AppHandle,
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

    let excluded_paths = request
        .params
        .get("excludedPaths")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let timeout_ms = request.params.get("timeoutMs").and_then(|v| v.as_u64());

    match workflow_commands::start_file_finder_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone(),
    )
    .await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "workflowId": response.job_id })),
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

/// Handle workflows.startWebSearch request
/// Params: sessionId, taskDescription, projectDirectory, excludedPaths, timeoutMs
/// Response: {"workflowId": workflow_id}
async fn handle_workflows_start_web_search(
    app_handle: &AppHandle,
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

    let excluded_paths = request
        .params
        .get("excludedPaths")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(Vec::new);

    let timeout_ms = request.params.get("timeoutMs").and_then(|v| v.as_u64());

    match crate::commands::web_search_commands::start_web_search_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone(),
    )
    .await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "workflowId": response.job_id })),
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
