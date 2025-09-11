use crate::error::AppError;
use crate::jobs;
use log::{info, debug};
use tauri::AppHandle;
use tokio::sync::OnceCell;

// Global flag to prevent duplicate job system startup
static JOB_SYSTEM_STARTED: OnceCell<()> = OnceCell::const_new();

/// Light initialization phase - creates queue and registry only
pub async fn initialize_job_system_light(app_handle: &AppHandle) -> Result<(), AppError> {
    // Initialize job system core components (queue and registry)
    jobs::init_job_system()
        .await
        .map_err(|e| AppError::JobError(format!("Failed to initialize job system: {}", e)))?;

    info!("Job system light initialized (queue and registry ready)");

    Ok(())
}

/// Full start phase - registers processors and starts workers/orchestrator
pub async fn start_job_system(app_handle: &AppHandle) -> Result<(), AppError> {
    // Check if job system is already started (idempotent guard)
    if JOB_SYSTEM_STARTED.get().is_some() {
        debug!("Job system already started, skipping");
        return Ok(());
    }

    // Register job processors
    jobs::register_job_processors(app_handle)
        .await
        .map_err(|e| AppError::JobError(format!("Failed to register job processors: {}", e)))?;

    info!("Job processors registered");

    // Start job system (workflow orchestrator and workers)
    jobs::start_job_system(app_handle.clone())
        .await
        .map_err(|e| AppError::JobError(format!("Failed to start job system: {}", e)))?;

    info!("Job system started (workers and orchestrator online)");

    // Mark as started after successful initialization
    let _ = JOB_SYSTEM_STARTED.set(());

    Ok(())
}

// Keep the old function for backwards compatibility if needed
pub async fn initialize_job_system(app_handle: &AppHandle) -> Result<(), AppError> {
    initialize_job_system_light(app_handle).await?;
    start_job_system(app_handle).await?;
    Ok(())
}
