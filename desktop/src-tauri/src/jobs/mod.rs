pub mod dispatcher;
pub mod embedded_workflows;
pub mod job_payload_utils;
pub mod job_processor_utils;
pub mod processor_trait;
pub mod processors;
pub mod queue;
pub mod registry;
pub mod retry_utils;
pub mod streaming_handler;
pub mod types;
pub mod workflow_cancellation;
pub mod workflow_cleanup;
pub mod workflow_error_handler;
pub mod workflow_orchestrator;
pub mod workflow_types;
// Data flow utilities for workflow stage transitions

use log::{debug, error, info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::time::{Duration, sleep};

use self::processors::{
    // Individual workflow stage processors
    ExtendedPathFinderProcessor,
    // File relevance assessment processor
    FileRelevanceAssessmentProcessor,
    GenericLlmStreamProcessor,
    ImplementationPlanMergeProcessor,
    ImplementationPlanProcessor,
    PathCorrectionProcessor,
    RegexFileFilterProcessor,
    RootFolderSelectionProcessor,
    TaskRefinementProcessor,
    TextImprovementProcessor,
    VideoAnalysisProcessor,
    WebSearchExecutorProcessor,
    WebSearchPromptsGeneratorProcessor,
};
use self::registry::get_job_registry;
use self::workflow_orchestrator::{get_workflow_orchestrator, init_workflow_orchestrator};
use crate::db_utils::{BackgroundJobRepository, SessionRepository, SettingsRepository};
use crate::error::{AppError, AppResult};
use crate::models::JobStatus;
use crate::services::SystemPromptCacheService;
use crate::utils::file_lock_manager::FileLockManager;

/// Initialize the job system
pub async fn init_job_system() -> AppResult<()> {
    // Initialize the job registry
    let _registry = registry::init_job_registry().await?;

    // Initialize the job queue with hardcoded concurrency limit
    let _queue = queue::init_job_queue().await?;

    info!("Job system core components initialized");
    Ok(())
}

/// Register all job processors
pub async fn register_job_processors(app_handle: &AppHandle) -> AppResult<()> {
    debug!("Registering job processors");

    // Get the job registry
    let registry = get_job_registry().await?;

    // Create processor instances
    let implementation_plan_processor = Arc::new(ImplementationPlanProcessor::new());
    let path_correction_processor = Arc::new(PathCorrectionProcessor::new());
    let task_refinement_processor = Arc::new(TaskRefinementProcessor::new());
    let text_improvement_processor = Arc::new(TextImprovementProcessor::new());
    let generic_llm_stream_processor = Arc::new(GenericLlmStreamProcessor::new());
    let regex_file_filter_processor = Arc::new(RegexFileFilterProcessor::new());
    let root_folder_selection_processor = Arc::new(RootFolderSelectionProcessor::new());
    // Individual workflow stage processors
    let extended_path_finder_processor = Arc::new(ExtendedPathFinderProcessor::new());
    // File relevance assessment processor
    let file_relevance_assessment_processor = Arc::new(FileRelevanceAssessmentProcessor::new());

    let web_search_prompts_generator = Arc::new(WebSearchPromptsGeneratorProcessor::new());
    let web_search_executor = Arc::new(WebSearchExecutorProcessor::new());
    let implementation_plan_merge_processor = Arc::new(ImplementationPlanMergeProcessor::new());
    let video_analysis_processor = Arc::new(VideoAnalysisProcessor);

    // Register processors
    registry.register(implementation_plan_processor).await;
    registry.register(path_correction_processor).await;
    registry.register(task_refinement_processor).await;
    registry.register(text_improvement_processor).await;
    registry.register(generic_llm_stream_processor).await;
    registry.register(regex_file_filter_processor).await;
    registry.register(root_folder_selection_processor).await;
    // Individual workflow stage processors
    registry.register(extended_path_finder_processor).await;
    // File relevance assessment processor
    registry.register(file_relevance_assessment_processor).await;
    registry.register(web_search_prompts_generator).await;
    registry.register(web_search_executor).await;
    registry.register(implementation_plan_merge_processor).await;
    registry.register(video_analysis_processor).await;

    debug!("Job processors registered");
    Ok(())
}

/// Wait for all core services required by the job system to initialize
async fn wait_for_core_services(app_handle: &AppHandle) -> AppResult<()> {
    use tauri::Manager;

    const MAX_WAIT_TIME_MS: u64 = 30000; // 30 seconds max wait
    const CHECK_INTERVAL_MS: u64 = 100; // Check every 100ms
    let mut elapsed_ms = 0;

    while elapsed_ms < MAX_WAIT_TIME_MS {
        let mut missing_services = Vec::new();

        // Check for database pool
        if app_handle.try_state::<sqlx::SqlitePool>().is_none() {
            missing_services.push("SqlitePool");
        }

        // Check for repositories required by job processors
        if app_handle
            .try_state::<Arc<BackgroundJobRepository>>()
            .is_none()
        {
            missing_services.push("BackgroundJobRepository");
        }
        if app_handle.try_state::<Arc<SessionRepository>>().is_none() {
            missing_services.push("SessionRepository");
        }
        if app_handle.try_state::<Arc<SettingsRepository>>().is_none() {
            missing_services.push("SettingsRepository");
        }

        // Note: SystemPromptCacheService is optional - may not be available on first run before authentication
        if app_handle.try_state::<Arc<FileLockManager>>().is_none() {
            missing_services.push("FileLockManager");
        }

        // If all services are available, we're ready
        if missing_services.is_empty() {
            debug!("All core services are initialized and ready for job system");
            return Ok(());
        }

        // Wait a bit before retrying
        sleep(Duration::from_millis(CHECK_INTERVAL_MS)).await;
        elapsed_ms += CHECK_INTERVAL_MS;

        if elapsed_ms % 5000 == 0 {
            // Log every 5 seconds
            info!(
                "Waiting for core services initialization... ({}ms elapsed). Missing: {:?}",
                elapsed_ms, missing_services
            );
        }
    }

    // Determine which services are still missing for error message
    let mut missing_services = Vec::new();
    if app_handle.try_state::<sqlx::SqlitePool>().is_none() {
        missing_services.push("SqlitePool");
    }
    if app_handle
        .try_state::<Arc<BackgroundJobRepository>>()
        .is_none()
    {
        missing_services.push("BackgroundJobRepository");
    }
    if app_handle.try_state::<Arc<SessionRepository>>().is_none() {
        missing_services.push("SessionRepository");
    }
    if app_handle.try_state::<Arc<SettingsRepository>>().is_none() {
        missing_services.push("SettingsRepository");
    }
    // Note: SystemPromptCacheService is optional and not required for job system startup
    if app_handle.try_state::<Arc<FileLockManager>>().is_none() {
        missing_services.push("FileLockManager");
    }

    Err(AppError::InitializationError(format!(
        "Core services did not initialize within {}ms. Missing services: {:?}",
        MAX_WAIT_TIME_MS, missing_services
    )))
}

/// Start the job system (workflow orchestrator and background job worker)
pub async fn start_job_system(app_handle: AppHandle) -> AppResult<()> {
    // Wait for all core services to be fully initialized before starting job system
    wait_for_core_services(&app_handle).await?;
    debug!("Core services confirmed ready for job system");

    // Initialize the workflow orchestrator
    let _workflow_orchestrator = init_workflow_orchestrator(app_handle.clone()).await?;
    debug!("Workflow orchestrator initialized");

    // Recover queued jobs from database and load them into the in-memory queue
    recover_queued_jobs(app_handle.clone()).await?;
    debug!("Queued jobs recovered from database");

    // Start the background job worker
    start_job_worker(app_handle.clone()).await?;
    debug!("Background job worker started");

    info!("Job system started");
    
    let payload = serde_json::json!({
        "ts": chrono::Utc::now().to_rfc3339(),
        "status": "ready"
    });
    let _ = app_handle.emit("orchestrator:initialized", payload);
    
    Ok(())
}

/// Start multiple background job workers that continuously process jobs from the queue concurrently
async fn start_job_worker(app_handle: AppHandle) -> AppResult<()> {
    // Get the concurrency limit from the job queue
    let queue = queue::get_job_queue().await?;
    let max_concurrent_jobs = queue.get_concurrency_limit().await;

    info!("Starting {} concurrent job workers", max_concurrent_jobs);

    // Spawn multiple worker tasks for concurrent job processing
    for worker_id in 0..max_concurrent_jobs {
        let app_handle_clone = app_handle.clone();

        tokio::spawn(async move {
            info!("Background job worker {} started", worker_id);

            loop {
                match dispatcher::process_next_job(app_handle_clone.clone()).await {
                    Ok(Some(result)) => {
                        debug!(
                            "Job worker {} processed job: {} with status: {:?}",
                            worker_id, result.job_id, result.status
                        );
                        // Continue processing without delay when jobs are available
                    }
                    Ok(None) => {
                        // No jobs available, wait a short time before checking again
                        sleep(Duration::from_millis(100)).await;
                    }
                    Err(e) => {
                        error!("Job worker {} encountered error: {}", worker_id, e);
                        // Wait a bit longer on error to avoid tight error loops
                        sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });
    }

    Ok(())
}

/// Recover queued jobs from database and load them into the in-memory queue
async fn recover_queued_jobs(app_handle: AppHandle) -> AppResult<()> {
    use tauri::Manager;

    // Get the background job repository
    let background_job_repo = match app_handle.try_state::<Arc<BackgroundJobRepository>>() {
        Some(repo) => repo,
        None => {
            return Err(AppError::InitializationError(
                "Background job repository not yet initialized. Please wait for app initialization to complete.".to_string()
            ));
        }
    };

    // Get all active jobs (queued and running) from the database
    let active_jobs = background_job_repo.get_active_jobs().await?;

    // Filter to only queued jobs (running jobs are already being processed)
    let queued_jobs: Vec<_> = active_jobs
        .into_iter()
        .filter(|job| job.status == JobStatus::Queued.to_string())
        .collect();

    if queued_jobs.is_empty() {
        info!("Job recovery completed: no queued jobs found in database");
        return Ok(());
    }

    info!(
        "Found {} queued jobs in database, loading into in-memory queue",
        queued_jobs.len()
    );

    // Get the job queue
    let queue = queue::get_job_queue().await?;

    // Track recovery statistics
    let mut recovered_count = 0;
    let mut failed_count = 0;

    // Convert database jobs back to queue jobs and re-enqueue them
    for db_job in queued_jobs {
        match job_payload_utils::convert_db_job_to_job(&db_job) {
            Ok(job) => {
                let job_id = job.id().to_string();
                match queue.enqueue(job, queue::JobPriority::Normal).await {
                    Ok(()) => {
                        recovered_count += 1;
                    }
                    Err(e) => {
                        error!("Failed to re-queue recovered job {}: {}", job_id, e);
                        failed_count += 1;
                        // Mark job as failed if we can't re-queue it
                        if let Err(update_error) = background_job_repo
                            .mark_job_failed(
                                &job_id,
                                &format!("Failed to re-queue on startup: {}", e),
                                None,
                                None,
                                None,
                                None,
                                None, // actual_cost
                            )
                            .await
                        {
                            error!("Failed to mark job {} as failed: {}", job_id, update_error);
                        }
                    }
                }
            }
            Err(e) => {
                error!(
                    "Failed to convert database job {} to queue job: {}",
                    db_job.id, e
                );
                failed_count += 1;
                // Mark job as failed if we can't convert it
                if let Err(update_error) = background_job_repo
                    .mark_job_failed(
                        &db_job.id,
                        &format!("Failed to convert job data on startup: {}", e),
                        None,
                        None,
                        None,
                        None,
                        None, // actual_cost
                    )
                    .await
                {
                    error!(
                        "Failed to mark job {} as failed: {}",
                        db_job.id, update_error
                    );
                }
            }
        }
    }

    info!(
        "Job recovery completed: {} jobs recovered successfully, {} jobs failed",
        recovered_count, failed_count
    );
    Ok(())
}
