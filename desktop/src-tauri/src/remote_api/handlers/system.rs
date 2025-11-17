use chrono::Utc;
use serde_json::{json, Value};
use tauri::AppHandle;
use crate::remote_api::error::{RpcError, RpcResult};
use crate::remote_api::types::RpcRequest;

pub async fn dispatch(_app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "ping" => handle_ping().await,
        "echo" => handle_echo(req).await,
        "get_status" => handle_get_status().await,
        _ => Err(RpcError::method_not_found(&req.method))
    }
}

async fn handle_ping() -> RpcResult<Value> {
    Ok(json!({
        "message": "pong",
        "timestamp": Utc::now().to_rfc3339()
    }))
}

async fn handle_echo(request: RpcRequest) -> RpcResult<Value> {
    Ok(request.params)
}

async fn handle_get_status() -> RpcResult<Value> {
    Ok(json!({
        "status": "online",
        "version": "1.0.0",
        "timestamp": Utc::now().to_rfc3339(),
        "capabilities": [
            "websocket",
            "rpc",
            "authentication",
            "filesystem",
            "sessions",
            "jobs",
            "workflows"
        ]
    }))
}
