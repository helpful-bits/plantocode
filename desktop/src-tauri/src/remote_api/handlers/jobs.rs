use tauri::{AppHandle, Manager};
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::job_commands;

// Job list filtering architecture:
//
// This handler implements server-side filtering to ensure all clients receive
// pre-filtered, session-scoped job data. This approach eliminates:
// - Client-side filtering complexity
// - UI flicker from over-fetching (100 jobs → 15 after filtering)
// - Inconsistent filtering logic across multiple client platforms
//
// Filtering strategy:
// 1. Workflow exclusion: Filter out internal orchestrator jobs
//    (file_finder_workflow, web_search_workflow) at the SQL query level
//    for optimal performance
//
// This pattern mirrors the implementation in plans.rs and ensures
// mobile and desktop clients operate on identical, pre-filtered datasets.

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "job.list" => handle_job_list(&app_handle, req).await,
        "job.get" => handle_job_get(&app_handle, req).await,
        "job.cancel" => handle_job_cancel(&app_handle, req).await,
        "job.delete" => handle_job_delete(&app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_job_list(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    match job_commands::get_all_visible_jobs_command_with_content(
        project_directory,
        session_id.clone(),
        true,
        app_handle.clone()
    ).await {
        Ok(jobs) => {
            RpcResponse {
                correlation_id: request.correlation_id,
                result: Some(json!({ "jobs": jobs })),
                error: None,
                is_final: true,
            }
        }
        Err(error) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}

async fn handle_job_get(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid jobId parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: job_id, app_handle
    match job_commands::get_background_job_by_id_command(job_id.clone(), app_handle.clone()).await {
        Ok(Some(job)) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "job": job })),
            error: None,
            is_final: true,
        },
        Ok(None) => RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some(format!("Job not found: {}", job_id)),
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

async fn handle_job_cancel(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid jobId parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Fixed parameter order: job_id, app_handle
    match job_commands::cancel_background_job_command(job_id, app_handle.clone()).await {
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

async fn handle_job_delete(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    let job_id = match request.params.get("jobId") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid jobId parameter".to_string()),
                is_final: true,
            };
        }
    };

    match job_commands::delete_background_job_command(job_id, app_handle.clone()).await {
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
