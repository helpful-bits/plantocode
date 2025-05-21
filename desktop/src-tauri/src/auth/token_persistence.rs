use keyring::{Entry, Error as KeyringError};
use log::{debug, error};
use crate::error::{AppError, AppResult};

// Constants for token storage
const SERVICE_NAME: &str = "vibe-manager";
const ACCOUNT_NAME: &str = "default";

/// Load a token from the OS keyring
pub async fn load_token() -> AppResult<Option<String>> {
    debug!("Loading token from keyring");

    // Get keyring entry
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| {
            error!("Failed to create keyring entry: {}", e);
            AppError::StorageError(format!("Failed to create keyring entry: {}", e))
        })?;
    
    // Try to get the token
    match entry.get_password() {
        Ok(token) => {
            debug!("Token found in keyring");
            Ok(Some(token))
        },
        Err(e) => {
            // If the error is that the password wasn't found, return None
            if matches!(e, KeyringError::NoEntry) {
                debug!("No token found in keyring");
                return Ok(None);
            }
            
            // Otherwise it's a real error
            error!("Error retrieving token from keyring: {}", e);
            Err(AppError::StorageError(format!("Failed to retrieve token: {}", e)))
        }
    }
}

/// Save a token to keyring secure storage
/// Set token to None to clear it
pub async fn save_token(token: Option<String>) -> AppResult<()> {
    // Get keyring entry
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| {
            error!("Failed to create keyring entry: {}", e);
            AppError::StorageError(format!("Failed to create keyring entry: {}", e))
        })?;
    
    match token {
        Some(token_str) => {
            debug!("Saving token to keyring");
            // Store token
            entry.set_password(&token_str)
                .map_err(|e| {
                    error!("Failed to store token in keyring: {}", e);
                    AppError::StorageError(format!("Failed to store token: {}", e))
                })?;
                
            debug!("Token saved to keyring");
        },
        None => {
            debug!("Clearing token from keyring");
            // Try to delete the password
            match entry.delete_password() {
                Ok(_) => {
                    debug!("Token cleared from keyring");
                },
                Err(e) => {
                    // If the error is that the password wasn't found, that's fine
                    if !matches!(e, KeyringError::NoEntry) {
                        error!("Error removing token from keyring: {}", e);
                        return Err(AppError::StorageError(format!("Failed to clear token: {}", e)));
                    }
                    debug!("No token found to clear");
                }
            }
        }
    }
    
    Ok(())
}