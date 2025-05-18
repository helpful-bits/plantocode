use tauri::{AppHandle, Manager};
use crate::error::AppError;
use log::{info, error, warn};
use crate::config;

/// Initialize application configuration with Stronghold secure storage
/// 
/// This function attempts to initialize configuration using Stronghold
/// with multiple retries in case the plugin is not immediately available.
/// If all retries fail, it falls back to a non-secure development mode.
pub async fn initialize_secure_storage(app_handle: &AppHandle) -> Result<(), AppError> {
    // Initialize configuration - ensure Stronghold plugin is initialized
    // This is critical for security, but we'll make it fault-tolerant
    
    // Attempt to retrieve Stronghold state with multiple retries
    let mut retry_count = 0;
    let max_retries = 3;
    let retry_delay_ms = 500;
    
    while retry_count < max_retries {
        match app_handle.try_state::<tauri_plugin_stronghold::stronghold::Stronghold>() {
            Some(stronghold) => {
                // Initialize configuration with Stronghold
                if let Err(e) = config::init_config(&stronghold).await {
                    error!("Failed to initialize configuration with Stronghold: {}", e);
                    
                    // If init_config fails, retry after delay
                    tokio::time::sleep(tokio::time::Duration::from_millis(retry_delay_ms)).await;
                    retry_count += 1;
                    continue;
                }
                
                info!("Configuration initialized with Stronghold plugin successfully");
                return Ok(());
            }
            None => {
                // Stronghold not available yet, wait and retry
                if retry_count < max_retries - 1 {
                    warn!("Stronghold plugin state not available, retrying ({}/{})", retry_count + 1, max_retries);
                    tokio::time::sleep(tokio::time::Duration::from_millis(retry_delay_ms)).await;
                    retry_count += 1;
                } else {
                    // We've tried enough times, proceed with dev fallback
                    warn!("Stronghold plugin state not available after {} retries. Using development fallback.", max_retries);
                    
                    // Use the no-Stronghold version for development
                    if let Err(e) = config::init_config_without_stronghold().await {
                        error!("Failed to initialize configuration without Stronghold: {}", e);
                        return Err(AppError::ConfigError(format!("Failed to initialize configuration: {}", e)));
                    }
                    
                    info!("Successfully initialized with development configuration (without secure storage)");
                    return Ok(());
                }
            }
        }
    }
    
    // If we reached here, all retries failed but we'll use development fallback
    warn!("Failed to initialize Stronghold after maximum retries. Using development fallback.");
    
    // Use the no-Stronghold version for development
    if let Err(e) = config::init_config_without_stronghold().await {
        error!("Failed to initialize configuration without Stronghold: {}", e);
        return Err(AppError::ConfigError(format!("Failed to initialize configuration: {}", e)));
    }
    
    info!("Successfully initialized with development configuration (without secure storage)");
    Ok(())
}