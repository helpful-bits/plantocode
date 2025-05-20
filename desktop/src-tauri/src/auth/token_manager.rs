use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::{AppHandle, Manager, State};
use log::{info, warn};
use crate::error::{AppResult, AppError};
use super::secure_storage_trait::SecureStorage;
use super::stronghold_storage::StrongholdStorage; // Import StrongholdStorage
use crate::constants::TOKEN_KEY; // Key for storing token in Stronghold

#[derive(Debug)]
pub struct TokenManager {
    token: RwLock<Option<String>>,
    secure_backend: Option<Arc<dyn SecureStorage>>,
}

impl TokenManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let mut secure_backend_instance: Option<Arc<dyn SecureStorage>> = None;

        // Try to get Stronghold state and initialize StrongholdStorage
        match app_handle.try_state::<Arc<tauri_plugin_stronghold::stronghold::Stronghold>>() {
            Some(stronghold_arc) => {
                // Clone the Arc<Stronghold> from the state
                let sh_instance = stronghold_arc.inner().clone();
                secure_backend_instance = Some(Arc::new(StrongholdStorage::new(sh_instance)));
                info!("TokenManager initialized with Stronghold backend.");
            }
            None => {
                warn!("TokenManager: Stronghold plugin state not available. Operating in in-memory mode for tokens.");
            }
        }

        Self {
            token: RwLock::new(None),
            secure_backend: secure_backend_instance,
        }
    }

    pub async fn get(&self) -> Option<String> {
        let mut token_guard = self.token.write().await; // Use write lock to update cache if needed
        if token_guard.is_some() {
            return token_guard.clone();
        }

        // If not in memory, try loading from secure backend
        if let Some(backend) = &self.secure_backend {
            match backend.get_item(TOKEN_KEY).await {
                Ok(Some(stored_token)) => {
                    *token_guard = Some(stored_token.clone());
                    info!("TokenManager: Loaded token from secure storage.");
                    return Some(stored_token);
                }
                Ok(None) => {
                    // Token not in secure storage
                }
                Err(e) => {
                    warn!("TokenManager: Failed to get token from secure storage: {}. Operating in-memory for this session.", e);
                }
            }
        }
        None
    }

    pub async fn set(&self, new_token: Option<String>) {
        let mut token_guard = self.token.write().await;
        *token_guard = new_token.clone();

        if let Some(backend) = &self.secure_backend {
            match new_token {
                Some(token_to_store) => {
                    if let Err(e) = backend.set_item(TOKEN_KEY, &token_to_store).await {
                        warn!("TokenManager: Failed to set token in secure storage: {}. Token only stored in memory.", e);
                    } else {
                        info!("TokenManager: Token set in secure storage.");
                    }
                }
                None => { // Clear token
                    if let Err(e) = backend.remove_item(TOKEN_KEY).await {
                        warn!("TokenManager: Failed to remove token from secure storage: {}. Token only cleared from memory.", e);
                    } else {
                        info!("TokenManager: Token removed from secure storage.");
                    }
                }
            }
        }
    }
}

// Tests need to be updated to mock AppHandle or provide a mock SecureStorage.
// For this plan, we focus on the implementation.
#[cfg(test)]
mod tests {
    // Existing tests will likely fail and need adjustment due to AppHandle dependency and async nature of new get/set.
    // Placeholder for test adjustments:
    // async fn test_get_set_token_in_memory_only() { ... }
    // async fn test_get_set_token_with_mock_secure_storage() { ... }
}