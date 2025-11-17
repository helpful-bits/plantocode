use crate::error::AppResult;
use crate::remote_api::error::RpcError;
use crate::remote_api::router;
use crate::remote_api::types::{RpcRequest, RpcResponse};
use log::{debug, error};
use serde_json::Value;
use tauri::AppHandle;

/// Dispatch a remote command request to the appropriate handler
///
/// This function takes an RPC request and routes it through the router,
/// then converts the AppResult into an RpcResponse format suitable for
/// sending over the wire.
pub async fn dispatch_remote_command(
    app_handle: &AppHandle,
    request: RpcRequest,
    user_context: &crate::remote_api::types::UserContext,
) -> RpcResponse {
    debug!(
        "Dispatching remote command: method={}, correlation_id={}",
        request.method, request.correlation_id
    );

    // Route the request through the existing router
    let response = router::dispatch(app_handle, request, user_context).await;

    debug!(
        "Command dispatched successfully: correlation_id={}",
        response.correlation_id
    );
    response
}

/// Convert an AppResult into an RpcResponse
///
/// This helper function converts the standard AppResult type used by
/// Tauri commands into the RpcResponse format expected by remote clients.
pub fn serialize_app_result<T>(correlation_id: String, result: AppResult<T>) -> RpcResponse
where
    T: serde::Serialize,
{
    match result {
        Ok(value) => match serde_json::to_value(value) {
            Ok(json_value) => RpcResponse {
                correlation_id,
                result: Some(json_value),
                error: None,
                is_final: true,
            },
            Err(serialization_error) => {
                error!(
                    "Failed to serialize command result: {}",
                    serialization_error
                );
                RpcResponse {
                    correlation_id,
                    result: None,
                    error: Some(RpcError::internal_error(format!("Serialization error: {}", serialization_error))),
                    is_final: true,
                }
            }
        },
        Err(app_error) => RpcResponse {
            correlation_id,
            result: None,
            error: Some(RpcError::from(app_error)),
            is_final: true,
        },
    }
}

/// Convert a simple success result into an RpcResponse
pub fn serialize_success_result(correlation_id: String) -> RpcResponse {
    RpcResponse {
        correlation_id,
        result: Some(serde_json::json!({"success": true})),
        error: None,
        is_final: true,
    }
}

/// Convert an error into an RpcResponse
pub fn serialize_error_result(correlation_id: String, error: RpcError) -> RpcResponse {
    RpcResponse {
        correlation_id,
        result: None,
        error: Some(error),
        is_final: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;
    use serde_json::json;

    #[test]
    fn test_serialize_app_result_success() {
        let result: AppResult<i32> = Ok(42);
        let response = serialize_app_result("test-id".to_string(), result);

        assert_eq!(response.correlation_id, "test-id");
        assert_eq!(response.result, Some(json!(42)));
        assert_eq!(response.error, None);
    }

    #[test]
    fn test_serialize_app_result_error() {
        let result: AppResult<i32> = Err(AppError::AuthError("Test error".to_string()));
        let response = serialize_app_result("test-id".to_string(), result);

        assert_eq!(response.correlation_id, "test-id");
        assert_eq!(response.result, None);
        assert!(response.error.is_some());
        let error = response.error.unwrap();
        assert!(error.message.contains("Test error"));
        assert_eq!(error.code, RpcError::UNAUTHORIZED);
    }

    #[test]
    fn test_serialize_success_result() {
        let response = serialize_success_result("test-id".to_string());

        assert_eq!(response.correlation_id, "test-id");
        assert_eq!(response.result, Some(json!({"success": true})));
        assert_eq!(response.error, None);
    }

    #[test]
    fn test_serialize_error_result() {
        let error = RpcError::internal_error("Test error");
        let response = serialize_error_result("test-id".to_string(), error);

        assert_eq!(response.correlation_id, "test-id");
        assert_eq!(response.result, None);
        assert!(response.error.is_some());
        let error = response.error.unwrap();
        assert_eq!(error.message, "Test error");
        assert_eq!(error.code, RpcError::INTERNAL_ERROR);
    }
}
