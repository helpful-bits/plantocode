use tauri::AppHandle;
use serde_json::json;
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::config_commands;

pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "config.refreshRuntimeAIConfig" => handle_refresh_runtime_ai_config(app_handle, req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_refresh_runtime_ai_config(app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match config_commands::fetch_runtime_ai_config(app_handle).await {
        Ok(config) => RpcResponse {
            correlation_id: req.correlation_id,
            result: Some(json!({ "config": config })),
            error: None,
            is_final: true,
        },
        Err(error) => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(error.to_string()),
            is_final: true,
        },
    }
}
