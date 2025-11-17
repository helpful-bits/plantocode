use tauri::AppHandle;
use serde_json::{json, Value};
use crate::remote_api::types::RpcRequest;
use crate::remote_api::error::{RpcError, RpcResult};
use crate::commands::config_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "config.refreshRuntimeAIConfig" => handle_refresh_runtime_ai_config(app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

async fn handle_refresh_runtime_ai_config(app_handle: AppHandle, _req: RpcRequest) -> RpcResult<Value> {
    let config = config_commands::fetch_runtime_ai_config(app_handle).await
        .map_err(RpcError::from)?;

    Ok(json!({ "config": config }))
}
