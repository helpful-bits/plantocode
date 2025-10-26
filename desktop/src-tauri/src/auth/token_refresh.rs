use crate::auth::{TokenManager, device_id_manager, token_introspection};
use crate::error::{AppError, AppResult};
use crate::models::AuthDataResponse;
use crate::AppState;
use log::{debug, error, info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

/// Global mutex for deduplicating concurrent refresh attempts
static REFRESH_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// Refresh app JWT via server endpoint
/// This is the shared refresh logic used by both Tauri commands and API clients
///
/// IMPORTANT: Token clearing occurs ONLY when the refresh endpoint returns 401
pub async fn refresh_app_jwt_via_server(app_handle: &AppHandle) -> AppResult<()> {
    let token_manager = app_handle.state::<Arc<TokenManager>>();
    let app_state = app_handle.state::<AppState>();

    // Get current token
    let current_token = token_manager
        .get()
        .await
        .ok_or_else(|| AppError::AuthError("No app JWT found".to_string()))?;

    // Get server URL
    let server_url = app_state.get_server_url().ok_or_else(|| {
        AppError::ConfigError("No server URL configured. Please select a server region first.".to_string())
    })?;

    let refresh_url = format!("{}/api/auth0/refresh-app-token", server_url.trim_end_matches('/'));

    // Get device ID
    let device_id = device_id_manager::get_or_create(app_handle)?;

    // Make refresh request
    let response = app_state
        .client
        .post(&refresh_url)
        .header("Authorization", format!("Bearer {}", current_token))
        .header("x-device-id", device_id)
        .send()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to refresh token: {}", e)))?;

    let status = response.status();

    if status == 401 {
        // ONLY clear token on 401 from refresh endpoint
        warn!("Refresh endpoint returned 401, clearing token");
        token_manager.set(None).await?;
        return Err(AppError::AuthError("Refresh token invalid or expired".to_string()));
    }

    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::ExternalServiceError(format!(
            "Token refresh failed: {}",
            error_text
        )));
    }

    // Parse response
    let auth_response: AuthDataResponse = response
        .json()
        .await
        .map_err(|e| AppError::SerdeError(format!("Failed to parse refresh response: {}", e)))?;

    // Store new token
    token_manager.set(Some(auth_response.token)).await?;

    info!("Token refreshed successfully");

    // Note: Device link re-registration will happen automatically on next connection attempt
    // We don't spawn it here to avoid circular type dependencies

    Ok(())
}

/// Refresh with deduplication using singleflight pattern
/// Multiple concurrent calls will wait for the same refresh operation
pub async fn refresh_with_dedup(app_handle: &AppHandle) -> AppResult<()> {
    let _lock = REFRESH_LOCK.lock().await;
    debug!("Acquired refresh lock, performing refresh");
    refresh_app_jwt_via_server(app_handle).await
}

/// Ensure token is fresh (proactively refresh if expiring within threshold)
///
/// This prevents hitting the token expiry by refreshing early
/// min_ttl_secs: minimum seconds of validity required (e.g., 300 for 5 minutes)
pub async fn ensure_fresh_token(app_handle: &AppHandle, min_ttl_secs: i64) -> AppResult<()> {
    let token_manager = app_handle.state::<Arc<TokenManager>>();

    if let Some(token) = token_manager.get().await {
        if token_introspection::is_expiring_within(&token, min_ttl_secs) {
            debug!("Token expiring within {} seconds, refreshing proactively", min_ttl_secs);
            refresh_with_dedup(app_handle).await?;
        }
    }

    Ok(())
}

/// Check if error message indicates device binding validation failure
pub fn contains_device_binding_mismatch(message: &str) -> bool {
    message.contains("Device binding validation failed")
        || message.contains("Device ID mismatch")
}
