use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use crate::config::AppSettings;
use crate::db::repositories::{
    ApiUsageRepository, CustomerBillingRepository, ModelRepository, SettingsRepository,
    UserRepository,
};
// use crate::devices::DeviceService; // TODO: Enable when DeviceService is implemented
use crate::handlers::config_handlers::DesktopRuntimeAIConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSpecificModelConfig {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub copy_buttons: Option<Vec<serde_json::Value>>,
    pub allowed_models: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderSettings {
    pub max_files_with_content: Option<u32>,
    pub include_file_contents: Option<bool>,
    pub max_content_size_per_file: Option<u32>,
    pub max_file_count: Option<u32>,
    pub file_content_truncation_chars: Option<u32>,
    pub token_limit_buffer: Option<u32>,
}

/// Cache TTL for runtime AI config (2 minutes)
const CONFIG_CACHE_TTL: Duration = Duration::from_secs(120);

/// Cached runtime AI configuration with automatic background refresh
pub struct RuntimeConfigCache {
    config: RwLock<DesktopRuntimeAIConfig>,
    cached_at: RwLock<Instant>,
    refreshing: AtomicBool,
}

impl RuntimeConfigCache {
    pub fn new(config: DesktopRuntimeAIConfig) -> Self {
        Self {
            config: RwLock::new(config),
            cached_at: RwLock::new(Instant::now()),
            refreshing: AtomicBool::new(false),
        }
    }

    /// Get the cached config. Returns immediately with current cache.
    /// If cache is stale, triggers background refresh for next request.
    pub async fn get(&self) -> DesktopRuntimeAIConfig {
        self.config.read().await.clone()
    }

    /// Check if cache needs refresh (older than TTL)
    pub async fn is_stale(&self) -> bool {
        let cached_at = *self.cached_at.read().await;
        cached_at.elapsed() > CONFIG_CACHE_TTL
    }

    /// Try to start a refresh. Returns true if this call should perform the refresh.
    /// Uses compare_exchange to ensure only one refresh runs at a time.
    pub fn try_start_refresh(&self) -> bool {
        self.refreshing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    /// Update the cached config and reset the timestamp
    pub async fn update(&self, new_config: DesktopRuntimeAIConfig) {
        let mut config = self.config.write().await;
        let mut cached_at = self.cached_at.write().await;
        *config = new_config;
        *cached_at = Instant::now();
        self.refreshing.store(false, Ordering::SeqCst);
    }

    /// Mark refresh as complete (used on error to allow retry)
    pub fn finish_refresh(&self) {
        self.refreshing.store(false, Ordering::SeqCst);
    }
}

/// Application state shared across request handlers
#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<AppSettings>,
    pub api_usage_repository: Arc<ApiUsageRepository>,
    pub model_repository: Arc<ModelRepository>,
    pub customer_billing_repository: Arc<CustomerBillingRepository>,
    pub user_repository: Arc<UserRepository>,
    pub settings_repository: Arc<SettingsRepository>,
    pub runtime_ai_config: Arc<RuntimeConfigCache>,
    // pub device_service: Option<Arc<DeviceService>>, // TODO: Enable when DeviceService is implemented
}
