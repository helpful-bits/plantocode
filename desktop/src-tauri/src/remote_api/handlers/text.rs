use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::text_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "text.enhance" => handle_text_enhance(&app_handle, req).await,
        "text.refine" => handle_text_refine(&app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_text_enhance(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
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

    let text = match request.params.get("text") {
        Some(Value::String(text)) => text.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid text parameter".to_string()),
                is_final: true,
            };
        }
    };

    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    match text_commands::improve_text_command(
        session_id,
        text,
        None,
        project_directory,
        app_handle.clone(),
    )
    .await
    {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
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

async fn handle_text_refine(app_handle: &AppHandle, request: RpcRequest) -> RpcResponse {
    // Extract sessionId (required)
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

    // Extract text (required)
    let text = match request.params.get("text") {
        Some(Value::String(text)) => text.clone(),
        _ => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Missing or invalid text parameter".to_string()),
                is_final: true,
            };
        }
    };

    // Extract projectDirectory (optional)
    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Extract relevantFiles (optional)
    let relevant_files = request
        .params
        .get("relevantFiles")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<String>>()
        });

    // Call refine_text_command
    match text_commands::refine_text_command(
        session_id,
        text,
        relevant_files,
        project_directory,
        app_handle.clone(),
    ).await {
        Ok(response) => RpcResponse {
            correlation_id: request.correlation_id,
            result: Some(json!({ "jobId": response.job_id })),
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
