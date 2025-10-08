use tauri::AppHandle;
use serde_json::json;
use crate::remote_api::types::{RpcRequest, RpcResponse};
use crate::commands::app_commands;

pub async fn dispatch(_app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "app.getInfo" => handle_app_get_info(req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_app_get_info(request: RpcRequest) -> RpcResponse {
    let info = app_commands::get_app_info();
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json!({ "appInfo": info })),
        error: None,
        is_final: true,
    }
}
