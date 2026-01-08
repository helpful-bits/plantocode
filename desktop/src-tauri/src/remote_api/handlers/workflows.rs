use tauri::{AppHandle, Manager};
use serde_json::{json, Value};
use std::sync::Arc;
use crate::remote_api::error::{RpcError, RpcResult};
use crate::remote_api::types::RpcRequest;
use crate::commands::workflow_commands;
use crate::db_utils::SessionRepository;

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
/// Accepts two parameter forms for compatibility:
/// Form A (desktop): sessionId, taskDescription, projectDirectory, excludedPaths, timeoutMs
/// Form B (mobile): sessionId, query, maxResults, timeoutMs (projectDirectory/excludedPaths optional)
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

    // Accept either taskDescription (Form A) or query (Form B)
    let task_description = if let Some(td) = request.params.get("taskDescription").and_then(|v| v.as_str()) {
        td.to_string()
    } else if let Some(query) = request.params.get("query").and_then(|v| v.as_str()) {
        // Form B: synthesize taskDescription from query
        query.to_string()
    } else {
        return Err(RpcError::invalid_params("Missing param: taskDescription or query"));
    };

    // projectDirectory: required for Form A, optional for Form B (derive from session if missing)
    let project_directory = if let Some(pd) = request.params.get("projectDirectory").and_then(|v| v.as_str()) {
        pd.to_string()
    } else {
        // Try to derive from session
        let pool = app_handle.try_state::<Arc<sqlx::SqlitePool>>()
            .ok_or_else(|| RpcError::database_error("Database not available"))?
            .inner()
            .clone();
        let session_repo = SessionRepository::new(pool);
        match session_repo.get_session_by_id(&session_id).await {
            Ok(Some(session)) => session.project_directory,
            Ok(None) => return Err(RpcError::invalid_params("Session not found and projectDirectory not provided")),
            Err(_) => return Err(RpcError::invalid_params("Failed to lookup session and projectDirectory not provided")),
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
