use tauri::{AppHandle, Manager};
use crate::error::AppError;
use log::{info, error, warn};

pub mod database;
pub mod services;
pub mod config;
pub mod job_system;
pub mod file_management;

/// Run asynchronous initialization steps for the application
/// 
/// This function initializes various subsystems in the following order:
/// 1. Database (critical path)
/// 2. Application configuration 
/// 3. API clients
/// 4. File lock manager
/// 5. Job system
///
/// Runtime AI configuration is no longer loaded during startup.
/// It will be triggered from the renderer layer after Firebase login completes.
pub async fn run_async_initialization(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Starting asynchronous application initialization...");

    // Initialize database first
    if let Err(e) = database::initialize_database(app_handle).await {
        error!("Database initialization failed: {}", e);
        return Err(e);
    }

    // Initialize configuration with Stronghold if available
    info!("Initializing secure configuration storage...");
    match app_handle.try_state::<tauri_plugin_stronghold::stronghold::Stronghold>() {
        Some(stronghold) => {
            // Initialize configuration with Stronghold
            match crate::config::init_config(stronghold.inner()).await {
                Ok(_) => info!("Application configuration initialized with Stronghold successfully"),
                Err(e) => {
                    warn!("Failed to initialize configuration with Stronghold: {}. Falling back to non-secure storage.", e);
                    // Try the fallback method
                    if let Err(e) = crate::config::init_config_without_stronghold().await {
                        warn!("Failed to initialize configuration without Stronghold: {}. Some features may be limited.", e);
                    }
                }
            }
        },
        None => {
            warn!("Stronghold state not available for configuration. Using development fallback.");
            // Use the non-Stronghold version
            if let Err(e) = crate::config::init_config_without_stronghold().await {
                warn!("Failed to initialize configuration without Stronghold: {}. Some features may be limited.", e);
            } else {
                info!("Successfully initialized with development configuration (without secure storage)");
            }
        }
    }

    // Initialize API clients
    if let Err(e) = services::initialize_api_clients(app_handle).await {
        error!("API client initialization failed: {}", e);
        return Err(e);
    }

    // Initialize file lock manager
    if let Err(e) = file_management::initialize_file_lock_manager(app_handle).await {
        error!("File lock manager initialization failed: {}", e);
        return Err(e);
    }

    // Initialize job system
    if let Err(e) = job_system::initialize_job_system(app_handle).await {
        error!("Job system initialization failed: {}", e);
        return Err(e);
    }

    info!("Asynchronous application initialization completed successfully.");
    Ok(())
}