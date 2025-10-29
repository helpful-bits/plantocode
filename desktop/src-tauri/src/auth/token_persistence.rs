use crate::constants::USE_SESSION_STORAGE;
use crate::error::{AppError, AppResult};
use keyring::{Entry, Error as KeyringError};
use log::{debug, error};

// Constants for token storage
pub const SERVICE_NAME_FOR_KEYRING: &str = "plantocode";
// Account name for storing the app's primary auth token in the keyring
pub const ACCOUNT_NAME_FOR_KEYRING: &str = "default";

// Session storage state - in memory only when using session storage mode
use once_cell::sync::Lazy;
use std::sync::RwLock;

static SESSION_TOKEN: Lazy<RwLock<Option<String>>> = Lazy::new(|| RwLock::new(None));

/// Load a token from storage (keyring or session storage based on USE_SESSION_STORAGE flag)
pub async fn load_token() -> AppResult<Option<String>> {
    if USE_SESSION_STORAGE {
        debug!("Loading token from session storage (in-memory only)");
        let session_token = SESSION_TOKEN
            .read()
            .map_err(|e| {
                error!("Failed to acquire read lock on session storage: {}", e);
                AppError::StorageError(format!("Failed to read session token: {}", e))
            })?;

        if session_token.is_some() {
            debug!("Token found in session storage");
        } else {
            debug!("No token found in session storage");
        }

        Ok(session_token.clone())
    } else {
        debug!("Loading token from OS keyring (persistent storage)");

        let entry = Entry::new(SERVICE_NAME_FOR_KEYRING, ACCOUNT_NAME_FOR_KEYRING).map_err(|e| {
            error!("Failed to create keyring entry - OS: {:?}, Error: {}", std::env::consts::OS, e);
            AppError::StorageError(format!("Failed to create keyring entry: {}", e))
        })?;

        match entry.get_password() {
            Ok(token) => {
                debug!("Token successfully retrieved from keyring");
                Ok(Some(token))
            }
            Err(e) => {
                if matches!(e, KeyringError::NoEntry) {
                    debug!("No token entry found in keyring (user not logged in)");
                    return Ok(None);
                }

                error!(
                    "Keyring error - OS: {:?}, Error type: {:?}, Details: {}",
                    std::env::consts::OS,
                    e,
                    e
                );
                Err(AppError::StorageError(format!(
                    "Failed to retrieve token from keyring: {}",
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
            Some(_) => {
                debug!("Saving token to session storage (in-memory)");
                let mut session_token = SESSION_TOKEN.write().map_err(|e| {
                    error!("Failed to acquire write lock on session storage: {}", e);
                    AppError::StorageError(format!("Failed to write session token: {}", e))
                })?;
                *session_token = token.clone();
                debug!("Token saved to session storage successfully");
            }
            None => {
                debug!("Clearing token from session storage");
                let mut session_token = SESSION_TOKEN.write().map_err(|e| {
                    error!("Failed to acquire write lock on session storage: {}", e);
                    AppError::StorageError(format!("Failed to write session token: {}", e))
                })?;
                *session_token = None;
                debug!("Token cleared from session storage successfully");
            }
        }
    } else {
        let entry = Entry::new(SERVICE_NAME_FOR_KEYRING, ACCOUNT_NAME_FOR_KEYRING).map_err(|e| {
            error!("Failed to create keyring entry - OS: {:?}, Error: {}", std::env::consts::OS, e);
            AppError::StorageError(format!("Failed to create keyring entry: {}", e))
        })?;

        match token {
            Some(token_str) => {
                debug!("Saving token to OS keyring (persistent storage)");
                entry.set_password(&token_str).map_err(|e| {
                    error!(
                        "Failed to store token in keyring - OS: {:?}, Error: {}",
                        std::env::consts::OS,
                        e
                    );
                    AppError::StorageError(format!("Failed to store token: {}", e))
                })?;

                debug!("Token saved to keyring successfully");
            }
            None => {
                debug!("Clearing token from OS keyring");
                match entry.delete_credential() {
                    Ok(_) => {
                        debug!("Token cleared from keyring successfully");
                    }
                    Err(e) => {
                        if !matches!(e, KeyringError::NoEntry) {
                            error!(
                                "Failed to clear token from keyring - OS: {:?}, Error: {}",
                                std::env::consts::OS,
                                e
                            );
                            return Err(AppError::StorageError(format!(
                                "Failed to clear token: {}",
                                e
                            )));
                        }
                        debug!("No token found to clear in keyring (already empty)");
                    }
                }
            }
        }
    }

    Ok(())
}
