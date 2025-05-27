use std::sync::Arc;
use chrono::{DateTime, Utc, Duration};
use dashmap::DashMap;

// Define structures
#[derive(Debug, Clone)]
pub struct Auth0PendingCodeInfo {
    pub authorization_code: String,
    pub tauri_csrf_token: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct PendingToken {
    pub id_token: String,
    pub refresh_token: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct Auth0StateStoreValue {
    pub polling_id: String,
    pub tauri_csrf_token: String,
    pub pkce_challenge: String,
    pub created_at: DateTime<Utc>,
}


// Type aliases for our stores
pub type PollingStore = Arc<DashMap<String, Auth0PendingCodeInfo>>;
pub type Auth0StateStore = Arc<DashMap<String, Auth0StateStoreValue>>;

// Utility module for store management
pub mod store_utils {
    use super::*;
    use std::time::Duration as StdDuration;
    use tokio::time::interval;
    use tokio::spawn;
    use log::info;

    // Main function to start cleanup task
    pub fn start_cleanup_task(polling_store: PollingStore, auth0_state_store: Auth0StateStore) {
        // Default intervals and expiry times
        let polling_interval_secs = 300; // 5 minutes
        let polling_expiry_mins = 30;    // 30 minutes
        
        // Spawn polling store cleanup task
        let ps = polling_store.clone();
        spawn(async move {
            start_polling_store_cleanup(ps, polling_interval_secs, polling_expiry_mins).await;
        });
        
        // Spawn auth0 state store cleanup task
        let ass = auth0_state_store.clone();
        spawn(async move {
            start_auth0_state_cleanup(ass, polling_interval_secs, polling_expiry_mins).await;
        });
        
        info!("Started cleanup task for polling store and auth0 state store");
    }

    // Cleanup function for polling store
    async fn start_polling_store_cleanup(store: PollingStore, interval_secs: u64, expiry_mins: i64) {
        let mut interval = interval(StdDuration::from_secs(interval_secs));
        
        info!("Starting polling store cleanup task (interval: {}s, expiry: {}m)", interval_secs, expiry_mins);
        
        loop {
            interval.tick().await;
            cleanup_polling_store(&store, expiry_mins);
        }
    }
    
    // Remove expired entries from polling store
    fn cleanup_polling_store(store: &PollingStore, expiry_mins: i64) {
        let now = Utc::now();
        let expired_keys: Vec<String> = store
            .iter()
            .filter_map(|entry| {
                let (key, value) = (entry.key().clone(), entry.value().clone());
                if now - value.created_at > Duration::minutes(expiry_mins) {
                    Some(key)
                } else {
                    None
                }
            })
            .collect();
        
        let count = expired_keys.len();
        if count > 0 {
            for key in expired_keys {
                store.remove(&key);
            }
            info!("Cleaned up {} expired entries from polling store", count);
        }
    }

    // Cleanup function for auth0 state store
    async fn start_auth0_state_cleanup(store: Auth0StateStore, interval_secs: u64, expiry_mins: i64) {
        let mut interval = interval(StdDuration::from_secs(interval_secs));
        
        info!("Starting auth0 state store cleanup task (interval: {}s, expiry: {}m)", interval_secs, expiry_mins);
        
        loop {
            interval.tick().await;
            cleanup_auth0_state_store(&store, expiry_mins);
        }
    }
    
    // Remove expired entries from auth0 state store
    fn cleanup_auth0_state_store(store: &Auth0StateStore, expiry_mins: i64) {
        let now = Utc::now();
        let expired_keys: Vec<String> = store
            .iter()
            .filter_map(|entry| {
                let (key, value) = (entry.key().clone(), entry.value().clone());
                if now - value.created_at > Duration::minutes(expiry_mins) {
                    Some(key)
                } else {
                    None
                }
            })
            .collect();
        
        let count = expired_keys.len();
        if count > 0 {
            for key in expired_keys {
                store.remove(&key);
            }
            info!("Cleaned up {} expired entries from auth0 state store", count);
        }
    }
}
