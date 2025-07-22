use crate::error::AppError;
use crate::services::config_cache_service::{ConfigCache, refresh_config_cache};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::time::{Duration, interval};
use tracing::{error, info, instrument, warn};

/// Cache health metrics and monitoring data
#[derive(Debug, Clone)]
pub struct CacheHealthMetrics {
    pub cache_size: usize,
    pub last_refresh_timestamp: u64,
    pub cache_age_seconds: u64,
    pub stale_entries_count: usize,
    pub health_score: f64,
    pub is_healthy: bool,
}

/// Cache health monitoring service
pub struct CacheHealthMonitor {
    app_handle: AppHandle,
    max_cache_age_seconds: u64,
    health_check_interval_seconds: u64,
}

impl CacheHealthMonitor {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            max_cache_age_seconds: 300,        // 5 minutes
            health_check_interval_seconds: 60, // 1 minute
        }
    }

    /// Monitors cache health continuously in background
    #[instrument(skip(self))]
    pub async fn monitor_cache_health(&self) {
        info!("Starting cache health monitoring service");

        // Add stability delay before main loop
        tokio::time::sleep(Duration::from_secs(10)).await;

        let mut health_interval = interval(Duration::from_secs(self.health_check_interval_seconds));

        loop {
            health_interval.tick().await;

            match self.cache_health_check().await {
                Ok(metrics) => {
                    if !metrics.is_healthy {
                        warn!(
                            "Cache health check failed. Health score: {:.2}, Age: {}s",
                            metrics.health_score, metrics.cache_age_seconds
                        );

                        // Trigger automatic cache refresh for unhealthy cache
                        if let Err(e) = self.handle_unhealthy_cache().await {
                            error!("Failed to handle unhealthy cache: {}", e);
                        }
                    } else {
                        info!(
                            "Cache health check passed. Health score: {:.2}, Size: {} entries",
                            metrics.health_score, metrics.cache_size
                        );
                    }
                }
                Err(e) => {
                    error!("Cache health check failed: {}", e);
                }
            }
        }
    }

    /// Performs comprehensive cache health check
    #[instrument(skip(self))]
    pub async fn cache_health_check(&self) -> Result<CacheHealthMetrics, AppError> {
        info!("Performing cache health check");

        let cache = self.app_handle.state::<ConfigCache>();

        let (cache_size, cache_entries) = match cache.lock() {
            Ok(cache_guard) => {
                let size = cache_guard.len();
                let entries = cache_guard.clone();
                (size, entries)
            }
            Err(e) => {
                error!("Failed to acquire cache lock during health check: {}", e);
                return Err(AppError::ConfigError(format!(
                    "Failed to access cache: {}",
                    e
                )));
            }
        };

        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Get last refresh timestamp (stored in cache metadata)
        let last_refresh_timestamp = self.get_last_refresh_timestamp(&cache_entries);
        let cache_age_seconds = current_time.saturating_sub(last_refresh_timestamp);

        // Count stale entries
        let stale_entries_count = self.count_stale_entries(&cache_entries);

        // Calculate health score
        let health_score =
            self.calculate_health_score(cache_size, cache_age_seconds, stale_entries_count);

        // Determine if cache is healthy
        let is_healthy = health_score >= 0.7 && cache_age_seconds <= self.max_cache_age_seconds;

        let metrics = CacheHealthMetrics {
            cache_size,
            last_refresh_timestamp,
            cache_age_seconds,
            stale_entries_count,
            health_score,
            is_healthy,
        };

        info!("Cache health metrics: {:?}", metrics);
        Ok(metrics)
    }

    /// Handles unhealthy cache by triggering refresh
    #[instrument(skip(self))]
    async fn handle_unhealthy_cache(&self) -> Result<(), AppError> {
        info!("Handling unhealthy cache - triggering refresh");

        // Invalidate stale cache entries
        self.invalidate_stale_cache_entries().await?;

        // Trigger cache refresh
        refresh_config_cache(&self.app_handle).await?;

        // Update last refresh timestamp
        self.update_last_refresh_timestamp().await?;

        info!("Successfully handled unhealthy cache");
        Ok(())
    }

    /// Invalidates stale cache entries
    #[instrument(skip(self))]
    async fn invalidate_stale_cache_entries(&self) -> Result<(), AppError> {
        info!("Invalidating stale cache entries");

        let cache = self.app_handle.state::<ConfigCache>();

        match cache.lock() {
            Ok(mut cache_guard) => {
                let current_time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                // Remove entries older than max age
                let keys_to_remove: Vec<String> = cache_guard
                    .iter()
                    .filter_map(|(key, value)| {
                        if let Some(timestamp) = self.extract_timestamp_from_value(value) {
                            if current_time.saturating_sub(timestamp) > self.max_cache_age_seconds {
                                Some(key.clone())
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    })
                    .collect();

                for key in keys_to_remove {
                    cache_guard.remove(&key);
                    info!("Removed stale cache entry: {}", key);
                }

                Ok(())
            }
            Err(e) => {
                error!("Failed to acquire cache lock for invalidation: {}", e);
                Err(AppError::ConfigError(format!(
                    "Failed to invalidate cache: {}",
                    e
                )))
            }
        }
    }

    /// Updates last refresh timestamp in cache metadata
    #[instrument(skip(self))]
    async fn update_last_refresh_timestamp(&self) -> Result<(), AppError> {
        let cache = self.app_handle.state::<ConfigCache>();

        match cache.lock() {
            Ok(mut cache_guard) => {
                let current_time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                cache_guard.insert(
                    "_cache_metadata_last_refresh".to_string(),
                    JsonValue::Number(serde_json::Number::from(current_time)),
                );

                info!("Updated cache refresh timestamp to: {}", current_time);
                Ok(())
            }
            Err(e) => {
                error!("Failed to update cache timestamp: {}", e);
                Err(AppError::ConfigError(format!(
                    "Failed to update cache metadata: {}",
                    e
                )))
            }
        }
    }

    /// Gets last refresh timestamp from cache metadata
    #[instrument(skip(self, cache_entries))]
    fn get_last_refresh_timestamp(&self, cache_entries: &HashMap<String, JsonValue>) -> u64 {
        cache_entries
            .get("_cache_metadata_last_refresh")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    }

    /// Counts stale entries in cache
    #[instrument(skip(self, cache_entries))]
    fn count_stale_entries(&self, cache_entries: &HashMap<String, JsonValue>) -> usize {
        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        cache_entries
            .iter()
            .filter(|(key, value)| {
                if key.starts_with("_cache_metadata_") {
                    return false; // Skip metadata entries
                }

                if let Some(timestamp) = self.extract_timestamp_from_value(value) {
                    current_time.saturating_sub(timestamp) > self.max_cache_age_seconds
                } else {
                    false
                }
            })
            .count()
    }

    /// Calculates health score based on cache metrics
    #[instrument(skip(self))]
    fn calculate_health_score(
        &self,
        cache_size: usize,
        cache_age_seconds: u64,
        stale_entries_count: usize,
    ) -> f64 {
        let mut score = 1.0;

        // Penalize empty cache
        if cache_size == 0 {
            score *= 0.1;
        }

        // Penalize old cache
        let age_ratio = cache_age_seconds as f64 / self.max_cache_age_seconds as f64;
        if age_ratio > 1.0 {
            score *= 0.3; // Severely penalize very old cache
        } else if age_ratio > 0.5 {
            score *= 1.0 - (age_ratio - 0.5) * 0.8; // Gradually penalize aging cache
        }

        // Penalize stale entries
        if cache_size > 0 {
            let stale_ratio = stale_entries_count as f64 / cache_size as f64;
            score *= 1.0 - (stale_ratio * 0.5); // Penalize up to 50% for all stale entries
        }

        score.max(0.0).min(1.0)
    }

    /// Extracts timestamp from cache value (if available)
    #[instrument(skip(self, value))]
    fn extract_timestamp_from_value(&self, value: &JsonValue) -> Option<u64> {
        // Try to extract timestamp from nested objects
        if let Some(obj) = value.as_object() {
            if let Some(timestamp) = obj.get("_timestamp") {
                return timestamp.as_u64();
            }
        }

        // For now, assume all entries are fresh if no timestamp is available
        None
    }
}

/// Initializes cache health monitoring service
#[instrument(skip(app_handle, _token_manager))]
pub async fn initialize_cache_health_monitor(
    app_handle: &AppHandle,
    _token_manager: Arc<crate::auth::token_manager::TokenManager>,
) -> Result<(), AppError> {
    info!("Initializing cache health monitor");

    let monitor = CacheHealthMonitor::new(app_handle.clone());

    // Start background monitoring task
    tokio::spawn(async move {
        monitor.monitor_cache_health().await;
    });

    info!("Cache health monitor initialized successfully");
    Ok(())
}

/// Gets current cache health metrics (public API)
#[instrument(skip(app_handle))]
pub async fn get_cache_health_metrics(
    app_handle: &AppHandle,
) -> Result<CacheHealthMetrics, AppError> {
    let monitor = CacheHealthMonitor::new(app_handle.clone());
    monitor.cache_health_check().await
}
