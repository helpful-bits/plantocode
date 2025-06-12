pub mod types;
pub mod dispatcher;
pub mod processor_trait;
pub mod processors;
pub mod queue;
pub mod registry;
pub mod job_payload_utils;
pub mod retry_utils;
pub mod job_processor_utils;
pub mod streaming_handler;
pub mod workflow_types;
pub mod workflow_orchestrator;
pub mod workflow_cleanup;
pub mod workflow_cancellation;
pub mod workflow_error_handler;
// Data flow utilities for workflow stage transitions
pub mod stage_data_extractors;
pub mod stage_data_injectors;

use std::sync::Arc;
use log::{info, debug, error};
use tauri::AppHandle;
use tokio::time::{sleep, Duration};

use crate::error::AppResult;
use crate::db_utils::BackgroundJobRepository;
use crate::models::JobStatus;
use self::processors::{
    PathFinderProcessor,
    ImplementationPlanProcessor,
    GuidanceGenerationProcessor,
    PathCorrectionProcessor,
    TaskEnhancementProcessor,
    TextCorrectionProcessor,
    GenericLlmStreamProcessor,
    RegexSummaryGenerationProcessor,
    RegexPatternGenerationProcessor,
    // Individual workflow stage processors
    LocalFileFilteringProcessor,
    ExtendedPathFinderProcessor,
    // File relevance assessment processor
    FileRelevanceAssessmentProcessor,
    // Subscription lifecycle processor
    SubscriptionLifecycleProcessor,
    // Stale portal session cleanup processor
    StalePortalSessionCleanupProcessor
};
use self::registry::get_job_registry;
use self::workflow_orchestrator::{init_workflow_orchestrator, get_workflow_orchestrator};

/// Initialize the job system
pub async fn init_job_system() -> AppResult<()> {
    // Initialize the job registry
    let _registry = registry::init_job_registry().await?;
    
    // Initialize the job queue with configurable concurrency limit
    let max_concurrent_jobs = crate::config::get_max_concurrent_jobs();
    let _queue = queue::init_job_queue(max_concurrent_jobs).await?;
    
    info!("Job system core components initialized");
    Ok(())
}

/// Register all job processors
pub async fn register_job_processors(app_handle: &AppHandle) -> AppResult<()> {
    debug!("Registering job processors");
    
    // Get the job registry
    let registry = get_job_registry().await?;
    
    // Create processor instances
    let path_finder_processor = Arc::new(PathFinderProcessor::new());
    let implementation_plan_processor = Arc::new(ImplementationPlanProcessor::new());
    let guidance_generation_processor = Arc::new(GuidanceGenerationProcessor::new());
    let path_correction_processor = Arc::new(PathCorrectionProcessor::new());
    let task_enhancement_processor = Arc::new(TaskEnhancementProcessor::new());
    let text_correction_processor = Arc::new(TextCorrectionProcessor::new());
    let generic_llm_stream_processor = Arc::new(GenericLlmStreamProcessor::new());
    let regex_summary_generation_processor = Arc::new(RegexSummaryGenerationProcessor::new());
    let regex_pattern_generation_processor = Arc::new(RegexPatternGenerationProcessor::new());
    // Individual workflow stage processors
    let local_file_filtering_processor = Arc::new(LocalFileFilteringProcessor::new());
    let extended_path_finder_processor = Arc::new(ExtendedPathFinderProcessor::new());
    // File relevance assessment processor
    let file_relevance_assessment_processor = Arc::new(FileRelevanceAssessmentProcessor::new());
    // Subscription lifecycle processor
    let subscription_lifecycle_processor = Arc::new(SubscriptionLifecycleProcessor::new());
    // Stale portal session cleanup processor
    let stale_portal_session_cleanup_processor = Arc::new(StalePortalSessionCleanupProcessor::new());
    
    // Register processors
    registry.register(path_finder_processor).await;
    registry.register(implementation_plan_processor).await;
    registry.register(guidance_generation_processor).await;
    registry.register(path_correction_processor).await;
    registry.register(task_enhancement_processor).await;
    registry.register(text_correction_processor).await;
    registry.register(generic_llm_stream_processor).await;
    registry.register(regex_summary_generation_processor).await;
    registry.register(regex_pattern_generation_processor).await;
    // Individual workflow stage processors
    registry.register(local_file_filtering_processor).await;
    registry.register(extended_path_finder_processor).await;
    // File relevance assessment processor
    registry.register(file_relevance_assessment_processor).await;
    // Subscription lifecycle processor
    registry.register(subscription_lifecycle_processor).await;
    // Stale portal session cleanup processor
    registry.register(stale_portal_session_cleanup_processor).await;
    
    debug!("Job processors registered");
    Ok(())
}

/// Start the job system (workflow orchestrator and background job worker)
pub async fn start_job_system(app_handle: AppHandle) -> AppResult<()> {
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
    Ok(())
}

/// Start the background job worker that continuously processes jobs from the queue
async fn start_job_worker(app_handle: AppHandle) -> AppResult<()> {
    let app_handle_clone = app_handle.clone();
    
    tokio::spawn(async move {
        info!("Background job worker started");
        
        loop {
            match dispatcher::process_next_job(app_handle_clone.clone()).await {
                Ok(Some(result)) => {
                    debug!("Job worker processed job: {} with status: {:?}", 
                        result.job_id, result.status);
                    // Continue processing without delay when jobs are available
                },
                Ok(None) => {
                    // No jobs available, wait a short time before checking again
                    sleep(Duration::from_millis(100)).await;
                },
                Err(e) => {
                    error!("Job worker encountered error: {}", e);
                    // Wait a bit longer on error to avoid tight error loops
                    sleep(Duration::from_secs(1)).await;
                }
            }
        }
    });
    
    Ok(())
}

/// Recover queued jobs from database and load them into the in-memory queue
async fn recover_queued_jobs(app_handle: AppHandle) -> AppResult<()> {
    use tauri::Manager;
    
    // Get the background job repository
    let background_job_repo = app_handle.state::<Arc<BackgroundJobRepository>>();
    
    // Get all active jobs (queued and running) from the database
    let active_jobs = background_job_repo.get_active_jobs().await?;
    
    // Filter to only queued jobs (running jobs are already being processed)
    let queued_jobs: Vec<_> = active_jobs.into_iter()
        .filter(|job| job.status == JobStatus::Queued.to_string())
        .collect();
    
    if queued_jobs.is_empty() {
        debug!("No queued jobs found in database to recover");
        return Ok(());
    }
    
    info!("Found {} queued jobs in database, loading into in-memory queue", queued_jobs.len());
    
    // Get the job queue
    let queue = queue::get_job_queue().await?;
    
    // Convert database jobs back to queue jobs and re-enqueue them
    for db_job in queued_jobs {
        match job_payload_utils::convert_db_job_to_job(&db_job) {
            Ok(job) => {
                let job_id = job.id().to_string();
                match queue.enqueue(job, queue::JobPriority::Normal).await {
                    Ok(()) => {
                        debug!("Recovered and re-queued job: {}", job_id);
                    },
                    Err(e) => {
                        error!("Failed to re-queue recovered job {}: {}", job_id, e);
                        // Mark job as failed if we can't re-queue it
                        if let Err(update_error) = background_job_repo.mark_job_failed(
                            &job_id, 
                            &format!("Failed to re-queue on startup: {}", e),
                            None
                        ).await {
                            error!("Failed to mark job {} as failed: {}", job_id, update_error);
                        }
                    }
                }
            },
            Err(e) => {
                error!("Failed to convert database job {} to queue job: {}", db_job.id, e);
                // Mark job as failed if we can't convert it
                if let Err(update_error) = background_job_repo.mark_job_failed(
                    &db_job.id, 
                    &format!("Failed to convert job data on startup: {}", e),
                    None
                ).await {
                    error!("Failed to mark job {} as failed: {}", db_job.id, update_error);
                }
            }
        }
    }
    
    info!("Job recovery completed");
    Ok(())
}