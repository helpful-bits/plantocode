use crate::remote_api::types::{RpcRequest, RpcResponse, UserContext};
use crate::remote_api::error::{into_response, RpcError, RpcResult};
use crate::remote_api::handlers;
use log::{debug, info};
use tauri::AppHandle;
use dashmap::DashMap;
use once_cell::sync::Lazy;
use std::time::{Duration, Instant};
use serde_json::Value;

#[derive(Clone)]
struct CachedResp {
    at: Instant,
    resp: RpcResponse,
}

static IDEMP_CACHE: Lazy<DashMap<String, CachedResp>> = Lazy::new(DashMap::new);
const IDEMP_TTL: Duration = Duration::from_secs(300);

fn idempotent_lookup(key: &str) -> Option<RpcResponse> {
    if let Some(entry) = IDEMP_CACHE.get(key) {
        if entry.at.elapsed() < IDEMP_TTL {
            return Some(entry.resp.clone());
        }
    }
    None
}

fn idempotent_store(key: &str, resp: &RpcResponse) {
    IDEMP_CACHE.insert(
        key.to_string(),
        CachedResp {
            at: Instant::now(),
            resp: resp.clone(),
        },
    );
}

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

    // Check user permissions for certain operations
    if !user_context.permissions.contains(&"rpc".to_string()) {
        let result: RpcResult<Value> = Err(RpcError::forbidden("Insufficient permissions for RPC operations"));
        return into_response(request.correlation_id.clone(), result);
    }

    // Check idempotency cache for mutating methods
    if let Some(key) = &request.idempotency_key {
        if let Some(cached_resp) = idempotent_lookup(key) {
            info!("Idempotency cache hit for key: {}", key);
            return cached_resp;
        }
    }

    // Extract namespace and delegate to appropriate handler
    let response = if let Some(dot_pos) = request.method.find('.') {
        let namespace = &request.method[..dot_pos];

        match namespace {
            // Handlers still returning RpcResponse directly (to be refactored)
            "settings" => handlers::settings::dispatch(app_handle.clone(), request.clone()).await,
            "systemPrompts" => handlers::system_prompts::dispatch(app_handle.clone(), request.clone()).await,
            "session" => handlers::session::dispatch(app_handle.clone(), request.clone()).await,
            "job" => handlers::jobs::dispatch(app_handle.clone(), request.clone()).await,

            // Handlers returning RpcResult<Value> - use central response building
            "system" => {
                let result = handlers::system::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }
            "config" => {
                let result = handlers::config::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }
            "fs" | "files" => {
                let result = handlers::files::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }
            "app" => {
                let result = handlers::app::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }
            "terminal" => {
                let result = handlers::terminal::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }
            "workflow" | "workflows" => {
                let result = handlers::workflows::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }
            "actions" => {
                let result = handlers::actions::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }
            "text" => {
                let result = handlers::text::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }
            "speech" => {
                let result = handlers::speech::dispatch(app_handle.clone(), request.clone()).await;
                into_response(request.correlation_id.clone(), result)
            }

            // Unknown namespace
            _ => {
                let result: RpcResult<Value> = Err(RpcError::method_not_found(format!("Unknown namespace: {}", namespace)));
                into_response(request.correlation_id.clone(), result)
            }
        }
    } else {
        // Methods without namespace (ping, echo, get_status)
        let result = handlers::system::dispatch(app_handle.clone(), request.clone()).await;
        into_response(request.correlation_id.clone(), result)
    };

    // Store response in idempotency cache if key is provided
    if let Some(key) = &request.idempotency_key {
        idempotent_store(key, &response);
    }

    response
}
