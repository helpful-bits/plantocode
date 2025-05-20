use async_trait::async_trait;
use tauri_plugin_stronghold::stronghold::Stronghold;
use crate::error::{AppError, AppResult};
use super::secure_storage_trait::SecureStorage;
use std::sync::Arc;
use std::fmt;
use std::time::Duration;

const STRONGHOLD_CLIENT_NAME: &str = "auth_client";

pub struct StrongholdStorage {
    stronghold: Arc<Stronghold>,
}

impl fmt::Debug for StrongholdStorage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StrongholdStorage")
            .field("stronghold", &"Arc<Stronghold>")
            .finish()
    }
}

impl StrongholdStorage {
    pub fn new(stronghold: Arc<Stronghold>) -> Self {
        Self { stronghold }
    }
}

#[async_trait]
impl SecureStorage for StrongholdStorage {
    async fn set_item(&self, key: &str, value: &str) -> AppResult<()> {
        // Load or create client
        let client = match self.stronghold.load_client(STRONGHOLD_CLIENT_NAME) {
            Ok(client) => client,
            Err(_) => {
                // Client doesn't exist, create it
                self.stronghold.create_client(STRONGHOLD_CLIENT_NAME)
                    .map_err(|e| AppError::StrongholdError(format!("Failed to create Stronghold client: {}", e)))?
            }
        };
        
        // Get store from client
        let store = client.store();
        
        // Insert data - no expiration (None)
        store.insert(key.as_bytes().to_vec(), value.as_bytes().to_vec(), None)
            .map_err(|e| AppError::StrongholdError(format!("Failed to set item in Stronghold: {}", e)))?;
        
        // Save stronghold to persist changes
        self.stronghold.save()
            .map_err(|e| AppError::StrongholdError(format!("Failed to save Stronghold after set_item: {}", e)))
    }

    async fn get_item(&self, key: &str) -> AppResult<Option<String>> {
        // Try to load client
        let client = match self.stronghold.load_client(STRONGHOLD_CLIENT_NAME) {
            Ok(client) => client,
            Err(_) => {
                // If client doesn't exist, then the item doesn't exist either
                return Ok(None);
            }
        };
        
        // Get store from client
        let store = client.store();
        
        // Get the value
        match store.get(key.as_bytes()) {
            Ok(Some(value_bytes)) => {
                let value_str = String::from_utf8(value_bytes)
                    .map_err(|e| AppError::StrongholdError(format!("Failed to decode Stronghold value: {}", e)))?;
                Ok(Some(value_str))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(AppError::StrongholdError(format!("Failed to get item from Stronghold: {}", e))),
        }
    }

    async fn remove_item(&self, key: &str) -> AppResult<()> {
        // Try to load client
        let client = match self.stronghold.load_client(STRONGHOLD_CLIENT_NAME) {
            Ok(client) => client,
            Err(_) => {
                // If client doesn't exist, then the item doesn't exist either
                return Ok(());
            }
        };
        
        // Get store from client
        let store = client.store();
        
        // Delete the item (not 'remove' - the method is named 'delete')
        match store.delete(key.as_bytes()) {
            Ok(_) => {
                // Save stronghold to persist changes
                self.stronghold.save()
                    .map_err(|e| AppError::StrongholdError(format!("Failed to save Stronghold after delete_item: {}", e)))
            }
            Err(e) => {
                // If the key doesn't exist, that's not an error for our API
                if e.to_string().contains("Key not found") {
                    Ok(())
                } else {
                    Err(AppError::StrongholdError(format!("Failed to delete item from Stronghold: {}", e)))
                }
            }
        }
    }
}