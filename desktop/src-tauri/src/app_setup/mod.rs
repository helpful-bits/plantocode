use crate::error::AppError;
use log::{error, info, warn};
use tauri::{AppHandle, Manager};

pub mod config;
pub mod database;
pub mod file_management;
pub mod job_system;
pub mod services;

// Re-export important functions for easy access
pub use services::{initialize_system_prompts, reinitialize_api_clients};

/// Run deferred initialization steps for the application
async fn run_deferred_initialization(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Deferred initialization started");
    
    // Run deferred DB tasks first
    if let Err(e) = database::run_deferred_db_tasks(app_handle).await {
        error!("Deferred DB tasks failed: {}", e);
        return Err(e);
    }
    
    // Initialize system prompts
    if let Err(e) = services::initialize_system_prompts(app_handle).await {
        error!("System prompts initialization failed: {}", e);
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
    
    // Initialize configuration sync manager
    if let Err(e) = config::initialize_config_sync(app_handle).await {
        warn!(
            "Configuration sync initialization failed (non-critical): {}",
            e
        );
        // Don't fail startup for config sync issues
    }
    
    // Schedule backup service with 12-second delay to avoid contention
    info!("Scheduling backup service initialization with delay...");
    let app_handle_backup = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        // Wait 12 seconds to avoid database contention
        tokio::time::sleep(tokio::time::Duration::from_secs(12)).await;
        
        info!("Initializing backup service (delayed)");
        if let Err(e) = services::initialize_backup_service(&app_handle_backup).await {
            error!("Backup service initialization failed: {}", e);
        } else {
            info!("Backup service initialized successfully");
        }
    });
    
    // Sync early in-memory values to DB if not already present
    // This should happen after deferred DB tasks complete and repos are available
    if let Some(settings_repo) = app_handle.try_state::<std::sync::Arc<crate::db_utils::SettingsRepository>>() {
        let app_state = app_handle.state::<crate::AppState>();
        
        if let Some(url) = app_state.get_server_url() {
            if let Ok(None) = settings_repo.get_value("selected_server_url").await {
                if let Err(e) = settings_repo.set_value("selected_server_url", &url).await {
                    warn!("Failed to sync server URL to DB: {}", e);
                }
            }
        }
        
        if app_state.get_onboarding_completed() == Some(true) {
            if let Ok(None) = settings_repo.get_value("onboarding_completed").await {
                if let Err(e) = settings_repo.set_value("onboarding_completed", "true").await {
                    warn!("Failed to sync onboarding status to DB: {}", e);
                }
            }
        }
    }
    
    info!("Deferred initialization completed successfully");
    Ok(())
}

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
/// It will be triggered from the renderer layer after Auth0 login completes.
pub async fn run_async_initialization(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Starting asynchronous application initialization...");

    // Initialize database (light phase) first
    if let Err(e) = database::initialize_database_light(app_handle).await {
        error!("Database light initialization failed: {}", e);
        return Err(e);
    }

    // Spawn deferred initialization asynchronously
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_deferred_initialization(&app_handle_clone).await {
            error!("Deferred initialization failed: {}", e);
        }
    });

    // Configuration will be loaded from server after Auth0 authentication

    // Initialize TokenManager and check for selected server URL
    if let Err(e) = services::initialize_token_manager(app_handle).await {
        error!("TokenManager initialization failed: {}", e);
        return Err(e);
    }

    // Check if there's a selected server URL from settings and reinitialize API clients if found
    let settings_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SettingsRepository>>();
    if let Ok(Some(server_url)) = settings_repo.get_value("selected_server_url").await {
        info!("Found selected server URL: {}, setting in AppState and reinitializing API clients", server_url);
        
        // Update AppState with the server URL
        let app_state = app_handle.state::<crate::AppState>();
        app_state.set_server_url(server_url.clone());
        
        if let Err(e) = services::reinitialize_api_clients(app_handle, server_url).await {
            warn!("Failed to reinitialize API clients with selected server URL: {}", e);
            // Don't fail startup for this, user can select server again
        }
    } else {
        info!("No selected server URL found, API clients will be initialized when user selects a server region");
    }

    info!("Asynchronous application initialization completed successfully.");
    Ok(())
}
