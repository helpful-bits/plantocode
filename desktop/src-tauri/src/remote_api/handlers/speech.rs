use tauri::AppHandle;
use crate::remote_api::types::{RpcRequest, RpcResponse};

pub async fn dispatch(_app_handle: AppHandle, req: RpcRequest) -> RpcResponse {
    match req.method.as_str() {
        "speech.transcribe" => handle_speech_transcribe(req).await,
        _ => RpcResponse {
            correlation_id: req.correlation_id,
            result: None,
            error: Some(format!("Unknown method: {}", req.method)),
            is_final: true,
        },
    }
}

async fn handle_speech_transcribe(request: RpcRequest) -> RpcResponse {
    RpcResponse {
        correlation_id: request.correlation_id,
        result: None,
        error: Some("Speech transcription not available via RPC".to_string()),
        is_final: true,
    }
}
