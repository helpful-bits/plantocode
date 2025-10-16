use crate::db_utils::SettingsRepository;
use crate::remote_api::types::{RpcRequest, RpcResponse, UserContext};
use crate::remote_api::handlers;
use log::{debug, error, info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Dispatch RPC requests to appropriate handlers
///
/// This function routes incoming RPC requests to the appropriate handler
/// based on the method name in the request.
pub async fn dispatch(
    app_handle: &AppHandle,
    request: RpcRequest,
    user_context: &UserContext,
) -> RpcResponse {
    info!(
        "Dispatching RPC request: method={}, correlation_id={}",
        request.method, request.correlation_id
    );
    debug!(
        "User context: user_id={}, device_id={}",
        user_context.user_id, user_context.device_id
    );

    // Check if remote access is allowed
    let pool = match app_handle.try_state::<Arc<sqlx::SqlitePool>>() {
        Some(p) => p.inner().clone(),
        None => {
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Database not available".to_string()),
                is_final: true,
            };
        }
    };
    let settings_repo = SettingsRepository::new(pool.clone());

    match settings_repo.get_device_settings().await {
        Ok(device_settings) => {
            if !device_settings.allow_remote_access {
                return RpcResponse {
                    correlation_id: request.correlation_id,
                    result: None,
                    error: Some("Remote access is disabled".to_string()),
                    is_final: true,
                };
            }

            // For sensitive methods, check if approval is required
            if device_settings.require_approval {
                match request.method.as_str() {
                    "fs.writeFileContent" | "fs.deleteFile" | "terminal.execute" => {
                        // Could implement approval mechanism here
                        // For now, just log
                        warn!("Sensitive operation requested: {}", request.method);
                    }
                    _ => {}
                }
            }
        }
        Err(e) => {
            error!("Failed to get device settings: {}", e);
            return RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some("Failed to check device permissions".to_string()),
                is_final: true,
            };
        }
    }

    // Check user permissions for certain operations
    if !user_context.permissions.contains(&"rpc".to_string()) {
        return RpcResponse {
            correlation_id: request.correlation_id,
            result: None,
            error: Some("Insufficient permissions for RPC operations".to_string()),
            is_final: true,
        };
    }

    // Extract namespace and delegate to appropriate handler
    if let Some(dot_pos) = request.method.find('.') {
        let namespace = &request.method[..dot_pos];

        match namespace {
            "settings" => handlers::settings::dispatch(app_handle.clone(), request).await,
            "systemPrompts" => handlers::system_prompts::dispatch(app_handle.clone(), request).await,
            "session" => handlers::session::dispatch(app_handle.clone(), request).await,
            "terminal" => handlers::terminal::dispatch(app_handle.clone(), request).await,
            "config" => handlers::config::dispatch(app_handle.clone(), request).await,
            "fs" | "files" => handlers::files::dispatch(app_handle.clone(), request).await,
            "job" => handlers::jobs::dispatch(app_handle.clone(), request).await,
            "workflow" | "workflows" => handlers::workflows::dispatch(app_handle.clone(), request).await,
            "actions" => handlers::actions::dispatch(app_handle.clone(), request).await,
            "plans" => handlers::plans::dispatch(app_handle.clone(), request).await,
            "app" => handlers::app::dispatch(app_handle.clone(), request).await,
            "text" => handlers::text::dispatch(app_handle.clone(), request).await,
            "speech" => handlers::speech::dispatch(app_handle.clone(), request).await,
            _ => RpcResponse {
                correlation_id: request.correlation_id,
                result: None,
                error: Some(format!("Unknown namespace: {}", namespace)),
                is_final: true,
            },
        }
    } else {
        // Methods without namespace (ping, echo, get_status)
        handlers::system::dispatch(app_handle.clone(), request).await
    }
}
