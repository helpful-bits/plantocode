use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::remote_api::error::{RpcError, RpcResult};
use crate::commands::{config_commands, settings_commands};

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    let correlation_id = req.correlation_id.clone();
    let result = match req.method.as_str() {
        "settings.getProvidersWithModels" => handle_get_providers_with_models(app_handle, req).await,
        "settings.getDefaultTaskModelSettings" => handle_get_default_task_model_settings(app_handle, req).await,
        "settings.getProjectTaskModelSettings" => handle_get_project_task_model_settings(app_handle, req).await,
        "settings.setProjectTaskSetting" => handle_set_project_task_setting(app_handle, req).await,
        "settings.resetProjectTaskSetting" => handle_reset_project_task_setting(app_handle, req).await,
        "settings.getAppSetting" => handle_get_app_setting(app_handle, req).await,
        "settings.setAppSetting" => handle_set_app_setting(app_handle, req).await,
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

async fn handle_get_providers_with_models(app_handle: AppHandle, _req: RpcRequest) -> RpcResult<Value> {
    let providers = config_commands::get_providers_with_models(app_handle)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "providers": providers }))
}

async fn handle_get_default_task_model_settings(app_handle: AppHandle, _req: RpcRequest) -> RpcResult<Value> {
    let settings = settings_commands::get_server_default_task_model_settings_command(app_handle)
        .await
        .map_err(RpcError::from)?;

    let settings_json = serde_json::from_str::<serde_json::Value>(&settings)
        .map_err(|e| RpcError::internal_error(format!("Failed to parse settings: {}", e)))?;

    Ok(settings_json)
}

async fn handle_get_project_task_model_settings(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let project_directory = req.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let settings = settings_commands::get_project_task_model_settings_command(app_handle, project_directory)
        .await
        .map_err(RpcError::from)?;

    let settings_json = serde_json::from_str::<serde_json::Value>(&settings)
        .map_err(|e| RpcError::internal_error(format!("Failed to parse settings: {}", e)))?;

    Ok(settings_json)
}

async fn handle_set_project_task_setting(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let project_directory = req.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let task_key = req.params.get("taskKey")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskKey"))?
        .to_string();

    let setting_key = req.params.get("settingKey")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: settingKey"))?
        .to_string();

    let value = req.params.get("value")
        .ok_or_else(|| RpcError::invalid_params("Missing param: value"))?
        .clone();

    let value_json = serde_json::to_string(&value).unwrap_or_else(|_| value.to_string());

    settings_commands::set_project_task_setting_command(
        app_handle,
        project_directory,
        task_key,
        setting_key,
        value_json,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_reset_project_task_setting(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let project_directory = req.params.get("projectDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: projectDirectory"))?
        .to_string();

    let task_key = req.params.get("taskKey")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: taskKey"))?
        .to_string();

    let setting_key = req.params.get("settingKey")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: settingKey"))?
        .to_string();

    settings_commands::reset_project_task_setting_command(
        app_handle,
        project_directory,
        task_key,
        setting_key,
    )
    .await
    .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}

async fn handle_get_app_setting(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let key = req.params.get("key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: key"))?
        .to_string();

    let value = settings_commands::get_app_setting(app_handle, key)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "value": value }))
}

async fn handle_set_app_setting(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    let key = req.params.get("key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: key"))?
        .to_string();

    let value = req.params.get("value")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RpcError::invalid_params("Missing param: value"))?
        .to_string();

    settings_commands::set_app_setting(app_handle, key, value)
        .await
        .map_err(RpcError::from)?;

    Ok(json!({ "success": true }))
}
