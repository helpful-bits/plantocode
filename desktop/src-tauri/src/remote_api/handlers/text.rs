use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::error::{RpcError, RpcResult};
use crate::remote_api::types::RpcRequest;
use crate::commands::text_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "text.enhance" => handle_text_enhance(&app_handle, req).await,
        "text.refine" => handle_text_refine(&app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

async fn handle_text_enhance(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let text = request
        .params
        .get("text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: text"))?
        .to_string();

    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let response = text_commands::improve_text_command(
        session_id,
        text,
        None,
        project_directory,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "jobId": response.job_id }))
}

async fn handle_text_refine(app_handle: &AppHandle, request: RpcRequest) -> RpcResult<Value> {
    let session_id = request
        .params
        .get("sessionId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: sessionId"))?
        .to_string();

    let text = request
        .params
        .get("text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: text"))?
        .to_string();

    let project_directory = request
        .params
        .get("projectDirectory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let relevant_files = request
        .params
        .get("relevantFiles")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<String>>()
        });

    let response = text_commands::refine_text_command(
        session_id,
        text,
        relevant_files,
        project_directory,
        app_handle.clone(),
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "jobId": response.job_id }))
}
