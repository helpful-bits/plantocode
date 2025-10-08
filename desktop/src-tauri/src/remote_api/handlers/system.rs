use chrono::Utc;
use serde_json::json;
use tauri::AppHandle;
use crate::remote_api::types::{RpcRequest, RpcResponse};

pub async fn dispatch(_app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "ping" => handle_ping(req).await,
        "echo" => handle_echo(req).await,
        "get_status" => handle_get_status(req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_ping(request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json!({
            "message": "pong",
            "timestamp": Utc::now().to_rfc3339()
        })),
        error: None,
        is_final: true,
    }
}

async fn handle_echo(request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(request.params),
        error: None,
        is_final: true,
    }
}

async fn handle_get_status(request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: Some(json!({
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
        })),
        error: None,
        is_final: true,
    }
}
