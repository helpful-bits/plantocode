use std::sync::Arc;
use tokio::sync::RwLock;
use log::{info, debug, error};
use crate::error::AppResult;
use crate::auth::token_persistence;

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
    /// 1. Load any persisted token from keyring
    /// 2. Set it in memory for fast access
    pub async fn init(&self) -> AppResult<()> {
        info!("Initializing TokenManager and loading token from keyring");
        
        // Load token from keyring
        let stored_token = token_persistence::load_token().await?;
        
        // Set it in memory
        if let Some(token) = stored_token {
            debug!("Found stored token in keyring, loading into memory");
            // Update in-memory cache
            let mut token_guard = self.token.write().await;
            *token_guard = Some(token);
        } else {
            debug!("No token found in keyring");
        }
        
        debug!("TokenManager initialized");
        Ok(())
    }

    /// Get the current token from memory
    pub async fn get(&self) -> Option<String> {
        let token_guard = self.token.read().await;
        token_guard.clone()
    }

    /// Set a new token in memory and persist to keyring
    pub async fn set(&self, new_token: Option<String>) -> AppResult<()> {
        // Update in-memory cache
        {
            let mut token_guard = self.token.write().await;
            *token_guard = new_token.clone();
            
            match &new_token {
                Some(_) => debug!("TokenManager: Token set in memory cache"),
                None => debug!("TokenManager: Token cleared from memory cache"),
            }
        }
        
        // Persist to keyring
        token_persistence::save_token(new_token).await?;
        debug!("TokenManager: Token persisted to keyring");
        
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