// Define Tauri commands for native functionality
use tauri::{command, State};
use serde::{Serialize};
use std::sync::{Mutex};
use tauri_plugin_stronghold::stronghold::Stronghold;
use log::{info, warn, error, debug};

// Stronghold constants for secure token storage
const TOKEN_KEY: &str = "com.vibe-manager.auth.token.v1";


// Type to hold application state
pub struct AppState {
    pub token: Mutex<Option<String>>,
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    message: String,
}

impl<E: std::fmt::Display> From<E> for CommandError {
    fn from(error: E) -> Self {
        CommandError {
            message: error.to_string(),
        }
    }
}

#[command]
pub fn get_app_info() -> String {
    "Vibe Manager Desktop".to_string()
}

// Store token in Stronghold
#[command]
pub async fn store_token(
    token: String,
    app_state: State<'_, AppState>,
    stronghold: State<'_, Stronghold>,
) -> Result<(), CommandError> {
    // Store in memory
    *app_state.token.lock().unwrap() = Some(token.clone());
    
    // Get the store handler from Stronghold
    let store_handler = stronghold.store();
    
    // Insert the token using the store handler
    store_handler.insert(TOKEN_KEY.as_bytes().to_vec(), token.as_bytes().to_vec(), None)
        .map_err(|e| CommandError { message: format!("Failed to store token in Stronghold: {}", e) })?;
    
    // Save Stronghold state to ensure persistence
    stronghold.save()
        .map_err(|e| CommandError { message: format!("Failed to save token to Stronghold: {}", e) })?;
    
    info!("Token stored in Stronghold and memory. Stronghold state saved.");
    Ok(())
}


// Retrieve token from Stronghold
#[command]
pub async fn get_stored_token(
    app_state: State<'_, AppState>,
    stronghold: State<'_, Stronghold>,
) -> Result<Option<String>, CommandError> {
    // First check if we have it in memory
    let token_guard = app_state.token.lock().unwrap();
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
                .map_err(|e| CommandError { message: format!("Invalid UTF-8 data stored in Stronghold: {}", e) })?;
            
            // Update in-memory cache
            *app_state.token.lock().unwrap() = Some(token.clone());
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
) -> Result<(), CommandError> {
    // Clear from memory
    *app_state.token.lock().unwrap() = None;
    
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
        .map_err(|e| CommandError { message: format!("Failed to save Stronghold state after clearing token: {}", e) })?;
    
    info!("Stronghold state saved after token clearance.");
    delete_result
}

