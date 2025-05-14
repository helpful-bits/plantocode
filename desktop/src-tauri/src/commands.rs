// Define Tauri commands for native functionality
use tauri::{command, State};
use serde::{Serialize};
use std::sync::{Mutex};
use tauri_plugin_stronghold::stronghold::Stronghold;

// Stronghold constants for secure token storage
const STRONGHOLD_CLIENT_NAME: &str = "vibe_manager_client";
const STRONGHOLD_TOKEN_KEY: &str = "auth_token";


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
    
    // Store in Stronghold
    let mut client = match stronghold.get_client(STRONGHOLD_CLIENT_NAME) {
        Ok(client) => client,
        Err(_) => stronghold.create_client(STRONGHOLD_CLIENT_NAME).map_err(CommandError::from)?,
    };
    client.store.insert(STRONGHOLD_TOKEN_KEY.into(), token.as_bytes().to_vec(), None).map_err(CommandError::from)?;
    stronghold.write_client(STRONGHOLD_CLIENT_NAME).map_err(CommandError::from)?;
    
    println!("Token stored in Stronghold and memory");
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
    
    // If not in memory, try to load from Stronghold
    match stronghold.get_client(STRONGHOLD_CLIENT_NAME) {
        Ok(client) => {
            match client.store.get(STRONGHOLD_TOKEN_KEY.as_bytes()).map_err(CommandError::from)? {
                Some(bytes) => {
                    match String::from_utf8(bytes) {
                        Ok(loaded_token) => {
                            // Update in-memory cache
                            drop(token_guard); // Explicitly drop guard to avoid deadlock
                            *app_state.token.lock().unwrap() = Some(loaded_token.clone());
                            Ok(Some(loaded_token))
                        }
                        Err(e) => Err(CommandError::from(e)),
                    }
                }
                None => Ok(None), // Key not found in Stronghold
            }
        }
        Err(_) => {
            // Client not found or other error loading, treat as token not found
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
    
    // Clear from Stronghold
    match stronghold.get_client(STRONGHOLD_CLIENT_NAME) {
        Ok(mut client) => {
            client.store.delete(STRONGHOLD_TOKEN_KEY.as_bytes()).map_err(CommandError::from)?;
            stronghold.write_client(STRONGHOLD_CLIENT_NAME).map_err(CommandError::from)?;
        }
        Err(_) => {
            // Client not found, effectively token is already cleared from Stronghold or was never there
        }
    }
    
    println!("Token cleared from Stronghold and memory");
    Ok(())
}

