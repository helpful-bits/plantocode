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

    // Initialize configuration
    info!("Initializing configuration storage...");
    if let Err(e) = crate::config::init_config().await {
        warn!("Failed to initialize configuration: {}. Some features may be limited.", e);
    } else {
        info!("Secure token storage handled by keyring");
    }

    // Initialize API clients
    if let Err(e) = services::initialize_api_clients(app_handle).await {
        error!("API client initialization failed: {}", e);
        return Err(e);
    }
    
    // Initialize TokenManager with keyring integration
    // (this must come after API clients are initialized)
    if let Some(token_manager) = app_handle.try_state::<std::sync::Arc<crate::auth::TokenManager>>() {
        if let Err(e) = token_manager.init().await {
            error!("TokenManager initialization with keyring failed: {}", e);
            return Err(e);
        }
        info!("TokenManager initialized with keyring persistence");
    } else {
        error!("TokenManager not found in app state");
        return Err(AppError::ConfigError("TokenManager not found in app state".to_string()));
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