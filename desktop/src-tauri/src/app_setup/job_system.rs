use crate::error::AppError;
use crate::jobs;
use log::info;
use tauri::AppHandle;

pub async fn initialize_job_system(app_handle: &AppHandle) -> Result<(), AppError> {
    // Initialize job system
    jobs::init_job_system()
        .await
        .map_err(|e| AppError::JobError(format!("Failed to initialize job system: {}", e)))?;

    info!("Job system initialized");

    // Register job processors
    jobs::register_job_processors(app_handle)
        .await
        .map_err(|e| AppError::JobError(format!("Failed to register job processors: {}", e)))?;

    info!("Job processors registered");

    // Start job system (workflow orchestrator only)
    jobs::start_job_system(app_handle.clone())
        .await
        .map_err(|e| AppError::JobError(format!("Failed to start job system: {}", e)))?;

    info!("Job system started");

    Ok(())
}
