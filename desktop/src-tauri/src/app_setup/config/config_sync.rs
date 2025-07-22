use crate::db_utils::SettingsRepository;
use crate::error::{AppError, AppResult};
use crate::models::RuntimeAIConfig;
use crate::services::config_cache_service::ConfigCache;
use crate::utils::get_timestamp;
use log::{debug, error, info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Configuration synchronization manager
///
/// This module handles automatic synchronization of server configuration
/// with local cached data to prevent stale configuration issues.
pub struct ConfigSyncManager {
    app_handle: AppHandle,
    settings_repo: Arc<SettingsRepository>,
}

impl ConfigSyncManager {
    pub fn new(app_handle: AppHandle, settings_repo: Arc<SettingsRepository>) -> Self {
        Self {
            app_handle,
            settings_repo,
        }
    }

    /// Check if local configuration is stale and needs refreshing
    pub async fn is_config_stale(&self) -> AppResult<bool> {
        const CONFIG_REFRESH_INTERVAL: i64 = 3600; // 1 hour in seconds

        // Get last sync timestamp
        let last_sync_key = "config_last_sync_timestamp";
        let last_sync = match self.settings_repo.get_value(last_sync_key).await? {
            Some(timestamp_str) => timestamp_str.parse::<i64>().unwrap_or(0),
            None => 0,
        };

        let current_time = get_timestamp();
        let is_stale = (current_time - last_sync) > CONFIG_REFRESH_INTERVAL;

        if is_stale {
            debug!(
                "Configuration is stale. Last sync: {}, Current: {}, Interval: {}s",
                last_sync, current_time, CONFIG_REFRESH_INTERVAL
            );
        }

        Ok(is_stale)
    }

    /// Validate that current runtime config matches server expectations
    pub async fn validate_config_integrity(&self) -> AppResult<bool> {
        // Get current runtime config from cache
        let config_cache = self.app_handle.state::<ConfigCache>();
        let runtime_config = match config_cache.lock() {
            Ok(cache_guard) => {
                if let Some(config_value) = cache_guard.get("runtime_ai_config") {
                    match serde_json::from_value::<RuntimeAIConfig>(config_value.clone()) {
                        Ok(config) => config,
                        Err(e) => {
                            error!("Failed to deserialize runtime AI config from cache: {}", e);
                            return Err(AppError::SerializationError(e.to_string()));
                        }
                    }
                } else {
                    warn!("No runtime AI configuration found in cache");
                    return Ok(false);
                }
            }
            Err(e) => {
                error!("Failed to acquire cache lock: {}", e);
                return Err(AppError::InternalError(format!(
                    "Failed to read configuration cache: {}",
                    e
                )));
            }
        };

        // Check if we have any models configured
        let total_models: usize = runtime_config
            .providers
            .iter()
            .map(|p| p.models.len())
            .sum();
        if total_models == 0 {
            warn!("No models available in runtime configuration");
            return Ok(false);
        }

        // Validate that task configurations reference valid models
        let available_model_ids: std::collections::HashSet<String> = runtime_config
            .providers
            .iter()
            .flat_map(|p| p.models.iter().map(|m| &m.id))
            .cloned()
            .collect();

        for (task_name, task_config) in &runtime_config.tasks {
            let model_id = &task_config.model;
            if !available_model_ids.contains(model_id) {
                warn!(
                    "Task '{}' references unavailable model: {}",
                    task_name, model_id
                );
                return Ok(false);
            }
        }

        debug!(
            "Configuration integrity check passed. {} models available",
            total_models
        );
        Ok(true)
    }

    /// Force synchronization with server configuration
    pub async fn force_sync(&self) -> AppResult<()> {
        info!("Forcing configuration synchronization with server");

        // Clear any stale cached data
        self.clear_stale_cache().await?;

        // Fetch fresh configuration from server
        crate::app_setup::config::fetch_and_update_runtime_ai_config(&self.app_handle).await?;

        // Update sync timestamp
        let current_time = get_timestamp();
        self.settings_repo
            .set_value("config_last_sync_timestamp", &current_time.to_string())
            .await?;

        info!("Configuration synchronization completed successfully");
        Ok(())
    }

    /// Clear stale cached configuration data
    async fn clear_stale_cache(&self) -> AppResult<()> {
        debug!("Clearing stale configuration cache");

        // Remove any hardcoded AI settings from local cache
        // These should always come fresh from the server
        let stale_keys = ["ai_settings_available_models", "ai_settings_task_configs"];

        for key in &stale_keys {
            if let Err(e) = self.settings_repo.delete_value(key).await {
                warn!("Failed to delete stale cache key {}: {}", key, e);
            }
        }

        Ok(())
    }

    /// Auto-sync configuration if needed
    pub async fn auto_sync_if_needed(&self) -> AppResult<()> {
        // Check if config is stale
        if self.is_config_stale().await? {
            info!("Configuration is stale, triggering auto-sync");
            self.force_sync().await?;
            return Ok(());
        }

        // Check config integrity
        if !self.validate_config_integrity().await? {
            warn!("Configuration integrity check failed, triggering auto-sync");
            self.force_sync().await?;
            return Ok(());
        }

        debug!("Configuration is fresh and valid, no sync needed");
        Ok(())
    }

    /// Periodic background sync (called by background task)
    pub async fn background_sync(&self) -> AppResult<()> {
        match self.auto_sync_if_needed().await {
            Ok(()) => Ok(()),
            Err(e) => {
                error!("Background configuration sync failed: {}", e);
                // Don't propagate the error for background tasks
                Ok(())
            }
        }
    }
}

/// Initialize configuration sync manager and start background sync
pub async fn initialize_config_sync(app_handle: &AppHandle) -> AppResult<()> {
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    let sync_manager = ConfigSyncManager::new(app_handle.clone(), settings_repo);

    // Perform initial sync check
    sync_manager.auto_sync_if_needed().await?;

    // Start background sync task
    let sync_manager_bg = ConfigSyncManager::new(
        app_handle.clone(),
        app_handle
            .state::<Arc<SettingsRepository>>()
            .inner()
            .clone(),
    );
    let app_handle_bg = app_handle.clone();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1800)); // 30 minutes

        loop {
            interval.tick().await;
            debug!("Running background configuration sync check");

            if let Err(e) = sync_manager_bg.background_sync().await {
                error!("Background configuration sync error: {}", e);
            }
        }
    });

    info!("Configuration sync manager initialized successfully");
    Ok(())
}
