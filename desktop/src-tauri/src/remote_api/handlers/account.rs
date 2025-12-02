use crate::remote_api::error::{RpcError, RpcResult};
use crate::remote_api::types::RpcRequest;
use crate::services::AccountDeletionService;
use log::info;
use serde_json::{json, Value};
use tauri::AppHandle;

/// Dispatch account-related RPC requests
pub async fn dispatch(app_handle: AppHandle, req: RpcRequest) -> RpcResult<Value> {
    match req.method.as_str() {
        "account.deleteAccount" => handle_delete_account(app_handle, req).await,
        _ => Err(RpcError::method_not_found(&req.method)),
    }
}

/// Handle account deletion request
async fn handle_delete_account(app_handle: AppHandle, _req: RpcRequest) -> RpcResult<Value> {
    info!("RPC: Handling account.deleteAccount request");

    // Call the AccountDeletionService
    AccountDeletionService::delete_current_account(&app_handle)
        .await
        .map_err(|e| RpcError::internal_error(format!("Account deletion failed: {}", e)))?;

    Ok(json!({
        "success": true,
        "message": "Account deleted successfully"
    }))
}
