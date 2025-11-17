use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::remote_api::error::{RpcError, RpcResult};
use crate::commands::settings_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let correlation_id = req.correlation_id.clone();
    let result = match req.method.as_str() {
        "systemPrompts.getProject" => handle_get_project(app_handle, req).await,
        "systemPrompts.setProject" => handle_set_project(app_handle, req).await,
        "systemPrompts.resetProject" => handle_reset_project(app_handle, req).await,
        "systemPrompts.getDefault" => handle_get_default(app_handle, req).await,
        "systemPrompts.isProjectCustomized" => handle_is_project_customized(app_handle, req).await,
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

async fn handle_get_project(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let project_directory = req.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let task_type = req.params.get("taskType")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskType"))?
        .to_string();

    let prompt = settings_commands::get_project_system_prompt_command(app_handle, project_directory, task_type)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "systemPrompt": prompt }))
}

async fn handle_set_project(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let project_directory = req.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let task_type = req.params.get("taskType")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskType"))?
        .to_string();

    let system_prompt = req.params.get("systemPrompt")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: systemPrompt"))?
        .to_string();

    settings_commands::set_project_system_prompt_command(
        app_handle,
        project_directory,
        task_type,
        system_prompt,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_reset_project(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let project_directory = req.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let task_type = req.params.get("taskType")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskType"))?
        .to_string();

    settings_commands::reset_project_system_prompt_command(
        app_handle,
        project_directory,
        task_type,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_get_default(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let task_type = req.params.get("taskType")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskType"))?
        .to_string();

    let prompt = settings_commands::fetch_default_system_prompt_from_server(app_handle, task_type)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "systemPrompt": prompt }))
}

async fn handle_is_project_customized(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let project_directory = req.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let task_type = req.params.get("taskType")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskType"))?
        .to_string();

    let is_customized = settings_commands::is_project_system_prompt_customized_command(
        app_handle,
        project_directory,
        task_type,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "isCustom": is_customized, "isCustomized": is_customized }))
}
