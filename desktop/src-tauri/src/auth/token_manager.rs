use std::sync::Arc;
use tokio::sync::RwLock;
use log::{info, debug, error};
use crate::error::{AppResult, AppError};
use crate::auth::token_persistence;
use crate::constants::USE_SESSION_STORAGE;

#[derive(Debug)]
pub struct TokenManager {
    token: RwLock<Option<String>>,
}

impl TokenManager {
    pub fn new() -> Self {
        info!("TokenManager initialized");
        Self {
            token: RwLock::new(None),
        }
    }

    /// Initialize the TokenManager and load any stored token
    ///
    /// This should be called during app initialization to:
    /// 1. Load any persisted token from storage (keyring or session storage)
    /// 2. Set it in memory for fast access
    pub async fn init(&self) -> AppResult<()> {
        let storage_type = if USE_SESSION_STORAGE { "session storage" } else { "keyring" };
        info!("Initializing TokenManager and loading token from {}", storage_type);
        
        // Load token from storage
        let stored_token = token_persistence::load_token().await?;
        
        // Set it in memory
        if let Some(token) = stored_token {
            debug!("Found stored token in {}, loading into memory", storage_type);
            // Update in-memory cache
            let mut token_guard = self.token.write().await;
            *token_guard = Some(token);
        } else {
            debug!("No token found in {}", storage_type);
        }
        
        debug!("TokenManager initialized");
        Ok(())
    }

    /// Get the current token from memory with timeout protection
    pub async fn get(&self) -> Option<String> {
        use tokio::time::{timeout, Duration};
        
        match timeout(Duration::from_secs(5), async {
            let token_guard = self.token.read().await;
            token_guard.clone()
        }).await {
            Ok(token) => token,
            Err(_) => {
                error!("Timeout getting token from TokenManager");
                None
            }
        }
    }

    /// Set a new token in memory and persist to keyring with timeout protection
    pub async fn set(&self, new_token: Option<String>) -> AppResult<()> {
        use tokio::time::{timeout, Duration};
        
        // Update in-memory cache with timeout protection
        match timeout(Duration::from_secs(5), async {
            let mut token_guard = self.token.write().await;
            *token_guard = new_token.clone();
            
            match &new_token {
                Some(_) => debug!("TokenManager: Token set in memory cache"),
                None => debug!("TokenManager: Token cleared from memory cache"),
            }
        }).await {
            Ok(_) => {},
            Err(_) => {
                error!("Timeout setting token in memory cache");
                return Err(AppError::StorageError("Timeout updating token in memory".to_string()));
            }
        }
        
        // Persist to storage with timeout protection
        match timeout(Duration::from_secs(10), token_persistence::save_token(new_token.clone())).await {
            Ok(result) => result?,
            Err(_) => {
                error!("Timeout persisting token to storage");
                return Err(AppError::StorageError("Timeout persisting token to storage".to_string()));
            }
        }
        
        let storage_type = if USE_SESSION_STORAGE { "session storage" } else { "keyring" };
        debug!("TokenManager: Token persisted to {}", storage_type);
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    #[ignore] // Ignore by default as it might interact with the system keyring
    async fn test_get_set_token_in_memory() {
        let token_manager = TokenManager::new();
        
        // Initially null
        assert_eq!(token_manager.get().await, None);
        
        // Set a value (this test only tests in-memory functionality)
        let test_token = "test_token".to_string();
        // We're modifying the in-memory state only for testing
        {
            let mut token_guard = token_manager.token.write().await;
            *token_guard = Some(test_token.clone());
        }
        
        // Get should return the value
        assert_eq!(token_manager.get().await, Some(test_token));
        
        // Clear it
        {
            let mut token_guard = token_manager.token.write().await;
            *token_guard = None;
        }
        
        // Should be null again
        assert_eq!(token_manager.get().await, None);
    }
}