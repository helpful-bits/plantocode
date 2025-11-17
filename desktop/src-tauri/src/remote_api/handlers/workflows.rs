use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::error::{RpcError, RpcResult};
use crate::remote_api::types::RpcRequest;
use crate::commands::workflow_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "workflow.getStatus" => handle_workflow_get_status(&app_handle, req).await,
        "workflow.cancel" => handle_workflow_cancel(&app_handle, req).await,
        "workflow.getResults" => handle_workflow_get_results(&app_handle, req).await,
        "workflows.startFileFinder" => handle_workflows_start_file_finder(&app_handle, req).await,
        "workflows.startWebSearch" => handle_workflows_start_web_search(&app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

async fn handle_workflow_get_status(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let workflow_id = request
        .params
        .get("workflowId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: workflowId"))?
        .to_string();

    let status = workflow_commands::get_workflow_status(workflow_id, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "status": status }))
}

async fn handle_workflow_cancel(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let workflow_id = request
        .params
        .get("workflowId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: workflowId"))?
        .to_string();

    workflow_commands::cancel_workflow(workflow_id, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_workflow_get_results(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let workflow_id = request
        .params
        .get("workflowId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: workflowId"))?
        .to_string();

    let results = workflow_commands::get_workflow_results_legacy(workflow_id, app_handle.clone())
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "results": results }))
}

/// Handle workflows.startFileFinder request
/// Params: sessionId, taskDescription, projectDirectory, excludedPaths, timeoutMs
/// Response: {"workflowId": workflow_id}
async fn handle_workflows_start_file_finder(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let task_description = request
        .params
        .get("taskDescription")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskDescription"))?
        .to_string();

    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

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

    let response = workflow_commands::start_file_finder_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "workflowId": response.job_id }))
}

/// Handle workflows.startWebSearch request
/// Params: sessionId, taskDescription, projectDirectory, excludedPaths, timeoutMs
/// Response: {"workflowId": workflow_id}
async fn handle_workflows_start_web_search(
    app_handle: &AppHandle,
    request: RpcRequest,
) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let task_description = request
        .params
        .get("taskDescription")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskDescription"))?
        .to_string();

    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

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

    let response = crate::commands::web_search_commands::start_web_search_workflow(
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "workflowId": response.job_id }))
}
