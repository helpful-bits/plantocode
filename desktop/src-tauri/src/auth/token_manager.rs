use std::sync::Arc;
use tokio::sync::RwLock;
use log::{info, debug};
use crate::error::AppResult;

#[derive(Debug)]
pub struct TokenManager {
    token: RwLock<Option<String>>,
}

impl TokenManager {
    pub fn new() -> Self {
        info!("TokenManager initialized as in-memory cache only");
        Self {
            token: RwLock::new(None),
        }
    }

    pub async fn get(&self) -> Option<String> {
        let token_guard = self.token.read().await;
        token_guard.clone()
    }

    pub async fn set(&self, new_token: Option<String>) -> AppResult<()> {
        let mut token_guard = self.token.write().await;
        *token_guard = new_token.clone();
        
        match &new_token {
            Some(_) => debug!("TokenManager: Token set in memory cache"),
            None => debug!("TokenManager: Token cleared from memory cache"),
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_get_set_token_in_memory() {
        let token_manager = TokenManager::new();
        
        // Initially null
        assert_eq!(token_manager.get().await, None);
        
        // Set a value
        let test_token = "test_token".to_string();
        token_manager.set(Some(test_token.clone())).await.unwrap();
        
        // Get should return the value
        assert_eq!(token_manager.get().await, Some(test_token));
        
        // Clear it
        token_manager.set(None).await.unwrap();
        
        // Should be null again
        assert_eq!(token_manager.get().await, None);
    }
}