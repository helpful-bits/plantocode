use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::job_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "job.list" => handle_job_list(&app_handle, req).await,
        "job.get" => handle_job_get(&app_handle, req).await,
        "job.cancel" => handle_job_cancel(&app_handle, req).await,
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

    match job_commands::get_all_visible_jobs_command(project_directory, session_id, app_handle.clone()).await {
        Ok(jobs) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobs": jobs })),
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
    match job_commands::get_background_job_by_id_command(job_id, app_handle.clone()).await {
        Ok(job) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "job": job })),
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
