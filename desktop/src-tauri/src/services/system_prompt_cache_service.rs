use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::collections::HashMap;
use tokio::time::{sleep, interval};
use tokio::sync::RwLock;
use log::{info, warn, debug, error};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::api_clients::ServerProxyClient;
use crate::models::DefaultSystemPrompt;

/// In-memory cache entry for system prompts
#[derive(Clone)]
pub struct CacheEntry {
    pub prompt: DefaultSystemPrompt,
    pub cached_at: u64,
}

/// System prompt cache service that manages automatic refresh
/// Uses ONLY in-memory storage with 5-minute TTL (no database persistence)
pub struct SystemPromptCacheService {
    server_client: Arc<ServerProxyClient>,
    cache_ttl_seconds: u64,
    // In-memory cache with RwLock for thread safety
    pub cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
}

impl SystemPromptCacheService {
    /// Create a new cache service with 5-minute TTL
    pub fn new(server_client: Arc<ServerProxyClient>) -> Self {
        Self {
            server_client,
            cache_ttl_seconds: 300, // 5 minutes
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Check if the in-memory cache is expired or empty
    pub async fn is_cache_expired(&self) -> AppResult<bool> {
        debug!("Checking in-memory system prompts cache expiry...");
        
        let cache = self.cache.read().await;
        
        if cache.is_empty() {
            debug!("In-memory cache is empty - cache is considered expired");
            return Ok(true);
        }
        
        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| AppError::ConfigError(format!("System time error: {}", e)))?
            .as_secs();
        
        // Find the oldest cache entry
        let oldest_cache_time = cache
            .values()
            .map(|entry| entry.cached_at)
            .min()
            .unwrap_or(0);
        
        let age_seconds = current_time - oldest_cache_time;
        let is_expired = age_seconds > self.cache_ttl_seconds;
        
        debug!(
            "Cache age: {} seconds, TTL: {} seconds, expired: {}",
            age_seconds, self.cache_ttl_seconds, is_expired
        );
        
        Ok(is_expired)
    }

    /// Refresh system prompts cache from server if expired
    pub async fn refresh_if_expired(&self) -> AppResult<bool> {
        if self.is_cache_expired().await? {
            info!("System prompts cache expired, refreshing from server...");
            self.force_refresh().await?;
            Ok(true)
        } else {
            debug!("System prompts cache is still fresh");
            Ok(false)
        }
    }

    /// Force refresh system prompts cache from server
    pub async fn force_refresh(&self) -> AppResult<()> {
        info!("Force refreshing in-memory system prompts cache from server");
        
        match self.server_client.get_default_system_prompts().await {
            Ok(server_prompts) => {
                let current_time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|e| AppError::ConfigError(format!("System time error: {}", e)))?
                    .as_secs();
                
                let mut cache = self.cache.write().await;
                cache.clear(); // Clear old cache
                
                let mut cached_count = 0;
                for prompt_value in server_prompts {
                    // Parse the server response into our DefaultSystemPrompt structure
                    if let Some(task_type) = prompt_value.get("task_type").and_then(|v| v.as_str()) {
                        if let Some(system_prompt) = prompt_value.get("system_prompt").and_then(|v| v.as_str()) {
                            let default_id = format!("default_{}", task_type);
                            let id = prompt_value.get("id").and_then(|v| v.as_str())
                                .unwrap_or(&default_id);
                            let description = prompt_value.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());
                            let version = prompt_value.get("version").and_then(|v| v.as_str()).unwrap_or("1.0");
                            
                            let default_prompt = DefaultSystemPrompt {
                                id: id.to_string(),
                                task_type: task_type.to_string(),
                                system_prompt: system_prompt.to_string(),
                                description,
                                version: version.to_string(),
                                created_at: current_time as i64,
                                updated_at: current_time as i64,
                            };
                            
                            cache.insert(task_type.to_string(), CacheEntry {
                                prompt: default_prompt,
                                cached_at: current_time,
                            });
                            
                            cached_count += 1;
                            debug!("Cached system prompt for task type: {}", task_type);
                        } else {
                            warn!("System prompt missing system_prompt field for prompt: {:?}", prompt_value);
                        }
                    } else {
                        warn!("System prompt missing task_type field for prompt: {:?}", prompt_value);
                    }
                }
                
                info!("Successfully cached {} default system prompts in memory", cached_count);
                Ok(())
            }
            Err(e) => {
                warn!("Failed to refresh system prompts cache from server: {}. Using existing cache if available.", e);
                // Don't treat as fatal error - continue with existing cache
                Err(e)
            }
        }
    }

    /// Start background refresh service that checks every 60 seconds
    pub async fn start_background_refresh(self: Arc<Self>, app_handle: AppHandle) {
        info!("Starting system prompts background refresh service (60s interval, 5min TTL)");
        
        let mut refresh_interval = interval(Duration::from_secs(60)); // Check every minute
        
        loop {
            refresh_interval.tick().await;
            
            // Check if app is still running (skip for now - we'll use a different approach)
            // TODO: Implement proper app lifecycle checking for Tauri v2
            
            // Attempt to refresh if expired
            if let Err(e) = self.refresh_if_expired().await {
                debug!("Background refresh attempt failed: {}", e);
                // Continue running even if refresh fails
            }
        }
        
        info!("System prompts background refresh service stopped");
    }

    /// Get fresh system prompt from in-memory cache, refreshing if needed
    pub async fn get_fresh_system_prompt(&self, task_type: &str) -> AppResult<Option<DefaultSystemPrompt>> {
        // Check if cache is expired and refresh if needed
        self.refresh_if_expired().await?;
        
        // Get the prompt from in-memory cache
        let cache = self.cache.read().await;
        if let Some(entry) = cache.get(task_type) {
            debug!("Retrieved system prompt for task type '{}' from in-memory cache", task_type);
            Ok(Some(entry.prompt.clone()))
        } else {
            debug!("No system prompt found in cache for task type '{}'", task_type);
            Ok(None)
        }
    }
}

/// Initialize the in-memory system prompt cache service and start background refresh
pub async fn initialize_cache_service(app_handle: &AppHandle) -> AppResult<()> {
    info!("Initializing in-memory system prompt cache service...");
    
    let server_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
    
    let cache_service = Arc::new(SystemPromptCacheService::new(server_client));
    
    // Store service in app state for access from other parts of the app
    app_handle.manage(cache_service.clone());
    
    // Start background refresh task
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        cache_service.start_background_refresh(app_handle_clone).await;
    });
    
    info!("In-memory system prompt cache service initialized successfully");
    Ok(())
}