use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::auth::TokenManager;
use crate::error::AppResult;
use crate::services::config_cache_service::ConfigCache;
use crate::services::device_link_client::DeviceLinkClient;
use log::{info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Service for handling account deletion operations
pub struct AccountDeletionService;

impl AccountDeletionService {
    /// Delete the current user's account
    ///
    /// This performs a comprehensive account deletion:
    /// 1. Call server to delete account
    /// 2. Shutdown DeviceLinkClient if present
    /// 3. Clear auth token via TokenManager
    /// 4. Clear config cache if applicable
    /// 5. Emit "account-deleted" event
    pub async fn delete_current_account(app_handle: &AppHandle) -> AppResult<()> {
        info!("Starting account deletion process");

        // Step 1: Call server to delete account via ServerProxyClient
        let server_proxy_lock = app_handle
            .state::<Arc<tokio::sync::RwLock<Option<Arc<ServerProxyClient>>>>>()
            .inner()
            .clone();
        let server_proxy_guard = server_proxy_lock.read().await;
        let server_proxy_client = server_proxy_guard.as_ref().ok_or_else(|| {
            warn!("ServerProxyClient not available during account deletion");
            crate::error::AppError::InitializationError(
                "Server proxy client not available".to_string(),
            )
        })?
        .clone();

        // Drop the read guard before making the API call to avoid holding the lock
        drop(server_proxy_guard);

        // Call the server to delete the account
        server_proxy_client.delete_account().await?;
        info!("Account deleted on server");

        // Step 2: Shutdown DeviceLinkClient if present
        if let Some(client) = app_handle.try_state::<Arc<DeviceLinkClient>>() {
            info!("Shutting down DeviceLinkClient during account deletion");
            client.shutdown().await;
        }

        // Step 3: Clear auth token via TokenManager
        let token_manager = app_handle.state::<Arc<TokenManager>>();
        token_manager.set(None).await?;
        info!("Cleared authentication token");

        // Step 4: Clear config cache if applicable
        if let Some(config_cache) = app_handle.try_state::<ConfigCache>() {
            if let Ok(mut cache_guard) = config_cache.lock() {
                cache_guard.clear();
                info!("Cleared config cache");
            } else {
                warn!("Failed to acquire lock on config cache during account deletion");
            }
        }

        // Step 5: Emit "account-deleted" event
        if let Err(e) = app_handle.emit("account-deleted", ()) {
            warn!("Failed to emit account-deleted event: {}", e);
        } else {
            info!("Emitted account-deleted event");
        }

        info!("Account deletion process completed successfully");
        Ok(())
    }
}
