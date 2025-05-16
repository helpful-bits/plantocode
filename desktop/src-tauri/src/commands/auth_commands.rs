use tauri::{command, State, Manager};
use tauri_plugin_stronghold::stronghold::Stronghold;
use log::{info, warn, error};
use crate::error::{AppError, AppResult};
use crate::AppState;
use crate::constants::TOKEN_KEY;

// Store token in Stronghold
#[command]
pub async fn store_token(
    token: String,
    app_state: State<'_, AppState>,
    stronghold: State<'_, Stronghold>,
) -> AppResult<()> {
    // Store in memory
    *app_state.token.lock().map_err(|e| AppError::InternalError(format!("Failed to acquire lock: {}", e)))? = Some(token.clone());

    // Get the store handler from Stronghold
    let store_handler = stronghold.store();

    // Insert the token using the store handler
    store_handler.insert(TOKEN_KEY.as_bytes().to_vec(), token.as_bytes().to_vec(), None)
        .map_err(|e| AppError::StrongholdError(format!("Failed to store token in Stronghold: {}", e)))?;

    // Save Stronghold state to ensure persistence
    stronghold.save()
        .map_err(|e| AppError::StrongholdError(format!("Failed to save token to Stronghold: {}", e)))?;

    info!("Token stored in Stronghold and memory. Stronghold state saved.");
    Ok(())
}

// Retrieve token from Stronghold
#[command]
pub async fn get_stored_token(
    app_state: State<'_, AppState>,
    stronghold: State<'_, Stronghold>,
) -> AppResult<Option<String>> {
    // First check if we have it in memory
    let token_guard = app_state.token.lock().map_err(|e| AppError::InternalError(format!("Failed to acquire lock: {}", e)))?;
    if let Some(token) = &*token_guard {
        return Ok(Some(token.clone()));
    }

    // If not in memory, try to load from Stronghold directly
    drop(token_guard); // Explicitly drop guard to avoid deadlock

    // Get the store handler from Stronghold
    let store_handler = stronghold.store();

    // Get the token using the store handler
    match store_handler.get(TOKEN_KEY.as_bytes()) {
        Ok(Some(bytes)) => {
            // Convert bytes to string
            let token = String::from_utf8(bytes)
                .map_err(|e| AppError::StrongholdError(format!("Invalid UTF-8 data stored in Stronghold: {}", e)))?;

            // Update in-memory cache
            *app_state.token.lock().map_err(|e| AppError::InternalError(format!("Failed to acquire lock: {}", e)))? = Some(token.clone());
            Ok(Some(token))
        },
        Ok(None) => {
            // Token not found in Stronghold
            Ok(None)
        },
        Err(e) => {
            error!("Error retrieving token from Stronghold: {}", e);
            Ok(None)
        }
    }
}

// Clear token from both Stronghold and memory
#[command]
pub async fn clear_stored_token(
    app_state: State<'_, AppState>,
    stronghold: State<'_, Stronghold>,
) -> AppResult<()> {
    // Clear from memory
    *app_state.token.lock().map_err(|e| AppError::InternalError(format!("Failed to acquire lock: {}", e)))? = None;

    // Get the store handler from Stronghold
    let store_handler = stronghold.store();

    // Delete the token using the store handler
    let delete_result = match store_handler.delete(TOKEN_KEY.as_bytes()) {
        Ok(_) => {
            info!("Token cleared from Stronghold and memory");
            Ok(())
        },
        Err(e) => {
            // Handle "not found" errors gracefully
            warn!("Could not clear token from Stronghold: {}", e);
            Ok(()) // Consider this a soft error, since we've cleared from memory
        }
    };

    // Save Stronghold state to ensure persistence, regardless of deletion success
    stronghold.save()
        .map_err(|e| AppError::StrongholdError(format!("Failed to save Stronghold state after clearing token: {}", e)))?;

    info!("Stronghold state saved after token clearance.");
    delete_result
}