use tauri::{command, State, Manager};
use std::sync::Arc;
use log::{info, warn, error};
use crate::error::{AppError, AppResult};
use crate::AppState;
use crate::constants::TOKEN_KEY;
use crate::auth::TokenManager;

// Store token in TokenManager
#[command]
pub async fn store_token(
    token: String,
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<()> {
    // Store in memory (AppState for backward compatibility)
    *app_state.token.lock().map_err(|e| AppError::InternalError(format!("Failed to acquire lock: {}", e)))? = Some(token.clone());

    // Store in TokenManager
    token_manager.set(Some(token)).await;

    info!("Token stored in TokenManager and app state memory.");
    Ok(())
}

// Retrieve token from TokenManager
#[command]
pub async fn get_stored_token(
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<Option<String>> {
    // Check TokenManager first
    if let Some(token) = token_manager.get().await {
        return Ok(Some(token));
    }

    // Fallback to AppState (backward compatibility)
    // Clone the token from the guard to avoid the Send issue with MutexGuard
    let token_opt = {
        let token_guard = app_state.token.lock().map_err(|e| AppError::InternalError(format!("Failed to acquire lock: {}", e)))?;
        token_guard.clone()
    };
    
    // If we have a token from AppState, sync it with TokenManager
    if let Some(token) = token_opt {
        token_manager.set(Some(token.clone())).await;
        return Ok(Some(token));
    }

    Ok(None)
}

// Clear token from both TokenManager and app state
#[command]
pub async fn clear_stored_token(
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<()> {
    // Clear from app state memory
    *app_state.token.lock().map_err(|e| AppError::InternalError(format!("Failed to acquire lock: {}", e)))? = None;

    // Clear from TokenManager
    token_manager.set(None).await;

    info!("Token cleared from TokenManager and app state memory");
    Ok(())
}