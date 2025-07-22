use crate::constants::USE_SESSION_STORAGE;
use crate::error::{AppError, AppResult};
use keyring::{Entry, Error as KeyringError};
use log::{debug, error};

// Constants for token storage
pub const SERVICE_NAME_FOR_KEYRING: &str = "vibe-manager";
// Account name for storing the app's primary auth token in the keyring
pub const ACCOUNT_NAME_FOR_KEYRING: &str = "default";

// Session storage state - in memory only when using session storage mode
use once_cell::sync::Lazy;
use std::sync::RwLock;

static SESSION_TOKEN: Lazy<RwLock<Option<String>>> = Lazy::new(|| RwLock::new(None));

/// Load a token from storage (keyring or session storage based on USE_SESSION_STORAGE flag)
pub async fn load_token() -> AppResult<Option<String>> {
    if USE_SESSION_STORAGE {
        debug!("Loading token from session storage");
        let session_token = SESSION_TOKEN
            .read()
            .map_err(|e| AppError::StorageError(format!("Failed to read session token: {}", e)))?;
        Ok(session_token.clone())
    } else {
        debug!("Loading token from keyring");

        // Get keyring entry
        let entry =
            Entry::new(SERVICE_NAME_FOR_KEYRING, ACCOUNT_NAME_FOR_KEYRING).map_err(|e| {
                error!("Failed to create keyring entry: {}", e);
                AppError::StorageError(format!("Failed to create keyring entry: {}", e))
            })?;

        // Try to get the token
        match entry.get_password() {
            Ok(token) => {
                debug!("Token found in keyring");
                Ok(Some(token))
            }
            Err(e) => {
                // If the error is that the password wasn't found, return None
                if matches!(e, KeyringError::NoEntry) {
                    debug!("No token found in keyring");
                    return Ok(None);
                }

                // Otherwise it's a real error
                error!("Error retrieving token from keyring: {}", e);
                Err(AppError::StorageError(format!(
                    "Failed to retrieve token: {}",
                    e
                )))
            }
        }
    }
}

/// Save a token to storage (keyring or session storage based on USE_SESSION_STORAGE flag)
/// Set token to None to clear it
pub async fn save_token(token: Option<String>) -> AppResult<()> {
    if USE_SESSION_STORAGE {
        match &token {
            Some(token_str) => {
                debug!("Saving token to session storage");
                let mut session_token = SESSION_TOKEN.write().map_err(|e| {
                    AppError::StorageError(format!("Failed to write session token: {}", e))
                })?;
                *session_token = Some(token_str.clone());
                debug!("Token saved to session storage");
            }
            None => {
                debug!("Clearing token from session storage");
                let mut session_token = SESSION_TOKEN.write().map_err(|e| {
                    AppError::StorageError(format!("Failed to write session token: {}", e))
                })?;
                *session_token = None;
                debug!("Token cleared from session storage");
            }
        }
    } else {
        // Get keyring entry
        let entry =
            Entry::new(SERVICE_NAME_FOR_KEYRING, ACCOUNT_NAME_FOR_KEYRING).map_err(|e| {
                error!("Failed to create keyring entry: {}", e);
                AppError::StorageError(format!("Failed to create keyring entry: {}", e))
            })?;

        match token {
            Some(token_str) => {
                debug!("Saving token to keyring");
                // Store token
                entry.set_password(&token_str).map_err(|e| {
                    error!("Failed to store token in keyring: {}", e);
                    AppError::StorageError(format!("Failed to store token: {}", e))
                })?;

                debug!("Token saved to keyring");
            }
            None => {
                debug!("Clearing token from keyring");
                // Try to delete the password
                match entry.delete_credential() {
                    Ok(_) => {
                        debug!("Token cleared from keyring");
                    }
                    Err(e) => {
                        // If the error is that the password wasn't found, that's fine
                        if !matches!(e, KeyringError::NoEntry) {
                            error!("Error removing token from keyring: {}", e);
                            return Err(AppError::StorageError(format!(
                                "Failed to clear token: {}",
                                e
                            )));
                        }
                        debug!("No token found to clear");
                    }
                }
            }
        }
    }

    Ok(())
}
