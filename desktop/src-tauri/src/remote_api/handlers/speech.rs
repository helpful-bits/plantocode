use tauri::AppHandle;
use crate::remote_api::error::{RpcError, RpcResult};
use crate::remote_api::types::RpcRequest;
use serde_json::Value;

pub async fn dispatch(_app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "speech.transcribe" => handle_speech_transcribe(req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

async fn handle_speech_transcribe(_request: RpcRequest) -> RpcResult<Value> {
    Err(RpcError::not_implemented("Speech transcription is not available via RPC"))
}
