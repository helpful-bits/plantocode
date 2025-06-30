use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashMap;
use tokio::sync::RwLock;
use log::{info, warn, debug, error};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::api_clients::ServerProxyClient;
use crate::models::DefaultSystemPrompt;

const CACHE_TTL_SECONDS: u64 = 300;

/// In-memory cache entry for system prompts
#[derive(Clone)]
pub struct CacheEntry {
    pub prompt: Option<DefaultSystemPrompt>,
    pub cached_at: u64,
}

/// System prompt cache service that manages automatic refresh
/// Uses ONLY in-memory storage with 5-minute TTL (no database persistence)
pub struct SystemPromptCacheService {
    server_client: Arc<ServerProxyClient>,
    // In-memory cache with RwLock for thread safety
    pub cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
}

impl SystemPromptCacheService {
    /// Create a new cache service with 5-minute TTL
    pub fn new(server_client: Arc<ServerProxyClient>) -> Self {
        Self {
            server_client,
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }


    /// Get fresh system prompt from in-memory cache, refreshing if needed
    pub async fn get_fresh_system_prompt(&self, task_type: &str) -> AppResult<Option<DefaultSystemPrompt>> {
        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| AppError::ConfigError(format!("System time error: {}", e)))?
            .as_secs();
        
        // Check cache for given task_type
        {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.get(task_type) {
                let age_seconds = current_time - entry.cached_at;
                if age_seconds <= CACHE_TTL_SECONDS {
                    debug!("Retrieved system prompt for task type '{}' from in-memory cache", task_type);
                    return Ok(entry.prompt.clone());
                }
            }
        }
        
        // If missing/expired, acquire write lock
        let mut cache = self.cache.write().await;
        
        // Double-check if prompt was added by another thread
        if let Some(entry) = cache.get(task_type) {
            let age_seconds = current_time - entry.cached_at;
            if age_seconds <= CACHE_TTL_SECONDS {
                return Ok(entry.prompt.clone());
            }
        }
        
        // Fetch from server
        match self.server_client.get_default_system_prompt(task_type).await {
            Ok(prompt) => {
                // Cache the result (including None)
                cache.insert(task_type.to_string(), CacheEntry {
                    prompt: prompt.clone(),
                    cached_at: current_time,
                });
                
                debug!("Cached system prompt for task type '{}' (found: {})", task_type, prompt.is_some());
                Ok(prompt)
            }
            Err(e) => {
                warn!("Failed to fetch system prompt for task type '{}': {}", task_type, e);
                Err(e)
            }
        }
    }
}

/// Initialize the in-memory system prompt cache service
pub async fn initialize_cache_service(app_handle: &AppHandle) -> AppResult<()> {
    info!("Initializing in-memory system prompt cache service...");
    
    let server_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
    
    let cache_service = Arc::new(SystemPromptCacheService::new(server_client));
    
    // Store service in app state for access from other parts of the app
    app_handle.manage(cache_service.clone());
    
    info!("In-memory system prompt cache service initialized successfully");
    Ok(())
}