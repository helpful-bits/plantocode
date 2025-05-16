use tauri::AppHandle;
use crate::error::AppError;
use log::{info, error};

pub mod database;
pub mod services;
pub mod config_init;
pub mod job_system;
pub mod file_management;

pub async fn run_async_initialization(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Starting asynchronous application initialization...");

    // Initialize database first
    if let Err(e) = database::initialize_database(app_handle).await {
        error!("Database initialization failed: {}", e);
        return Err(e);
    }

    // Initialize configuration
    match config_init::initialize_application_configuration(app_handle).await {
        Ok(_) => info!("Application configuration initialized successfully"),
        Err(e) => {
            error!("Application configuration initialization failed: {}. Continuing with initialization...", e);
            // Not returning here to allow the app to continue with default configuration
        }
    }

    // Initialize API clients
    if let Err(e) = services::initialize_api_clients(app_handle).await {
        error!("API client initialization failed: {}", e);
        return Err(e);
    }

    // Fetch runtime AI config - this is optional, so we don't fail if it fails
    match config_init::fetch_and_update_runtime_ai_config(app_handle).await {
        Ok(_) => info!("Runtime AI configuration updated successfully"),
        Err(e) => {
            error!("Failed to fetch runtime AI config: {}. Continuing with default configuration...", e);
            // Not returning here to allow the app to continue with default configuration
        }
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
