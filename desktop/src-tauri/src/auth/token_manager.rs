use std::sync::Arc;
use tokio::sync::RwLock;

/// Manages authentication tokens for API clients
///
/// TokenManager provides a centralized way to store and retrieve
/// authentication tokens without directly depending on Stronghold.
/// It can be configured with a secure backend for persistent storage.
#[derive(Debug)]
pub struct TokenManager {
    token: RwLock<Option<String>>,
    secure_backend: Option<Arc<dyn SecureStorage>>,
}

impl TokenManager {
    /// Creates a new TokenManager with no token set
    pub fn new() -> Self {
        Self {
            token: RwLock::new(None),
            secure_backend: None,
        }
    }

    /// Gets the current authentication token, if available
    pub async fn get(&self) -> Option<String> {
        let token = self.token.read().await;
        token.clone()
    }

    /// Sets a new authentication token
    pub async fn set(&self, new_token: Option<String>) {
        let mut token = self.token.write().await;
        *token = new_token;
    }

    /// Sets a secure backend for persistent token storage
    /// 
    /// This would be used when Stronghold is fully ready
    pub fn set_secure_backend(&self, backend: ()) {
        self.secure_backend = Some(Arc::new(backend));
    }
}

// For tests
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_set_token() {
        let manager = TokenManager::new();
        assert_eq!(manager.get().await, None);

        // Set a token
        let test_token = "test_token".to_string();
        manager.set(Some(test_token.clone())).await;
        
        // Verify it can be retrieved
        assert_eq!(manager.get().await, Some(test_token));
        
        // Clear the token
        manager.set(None).await;
        assert_eq!(manager.get().await, None);
    }
}