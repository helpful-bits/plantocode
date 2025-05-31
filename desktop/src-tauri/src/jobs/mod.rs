pub mod types;
pub mod dispatcher;
pub mod processor_trait;
pub mod processors;
pub mod queue;
pub mod registry;
pub mod scheduler;
pub mod job_payload_utils;
pub mod job_helpers;
pub mod job_processor_utils;
pub mod workflow_types;
pub mod workflow_orchestrator;
pub mod workflow_cleanup;
pub mod workflow_cancellation;
pub mod workflow_error_handler;
// Data flow utilities for workflow stage transitions
pub mod stage_data_extractors;
pub mod stage_data_injectors;

use std::sync::Arc;
use log::{info, debug};
use tauri::AppHandle;

use crate::error::AppResult;
use self::processors::{
    PathFinderProcessor,
    ImplementationPlanProcessor,
    GuidanceGenerationProcessor,
    PathCorrectionProcessor,
    TextImprovementProcessor,
    TaskEnhancementProcessor,
    TextCorrectionProcessor,
    GenericLlmStreamProcessor,
    ServerProxyTranscriptionProcessor,
    RegexSummaryGenerationProcessor,
    RegexPatternGenerationProcessor,
    // Individual workflow stage processors
    DirectoryTreeGenerationProcessor,
    LocalFileFilteringProcessor,
    ExtendedPathFinderProcessor,
    ExtendedPathCorrectionProcessor
};
use self::registry::get_job_registry;
use self::scheduler::{init_job_scheduler, get_job_scheduler};
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
    let text_improvement_processor = Arc::new(TextImprovementProcessor::new());
    let task_enhancement_processor = Arc::new(TaskEnhancementProcessor::new());
    let text_correction_processor = Arc::new(TextCorrectionProcessor::new());
    let generic_llm_stream_processor = Arc::new(GenericLlmStreamProcessor::new());
    let server_proxy_transcription_processor = Arc::new(ServerProxyTranscriptionProcessor::new(app_handle.clone()));
    let regex_summary_generation_processor = Arc::new(RegexSummaryGenerationProcessor::new());
    let regex_pattern_generation_processor = Arc::new(RegexPatternGenerationProcessor::new());
    // Individual workflow stage processors
    let directory_tree_generation_processor = Arc::new(DirectoryTreeGenerationProcessor::new());
    let local_file_filtering_processor = Arc::new(LocalFileFilteringProcessor::new());
    let extended_path_finder_processor = Arc::new(ExtendedPathFinderProcessor::new());
    let extended_path_correction_processor = Arc::new(ExtendedPathCorrectionProcessor::new());
    
    // Register processors
    registry.register(path_finder_processor).await;
    registry.register(implementation_plan_processor).await;
    registry.register(guidance_generation_processor).await;
    registry.register(path_correction_processor).await;
    registry.register(text_improvement_processor).await;
    registry.register(task_enhancement_processor).await;
    registry.register(text_correction_processor).await;
    registry.register(generic_llm_stream_processor).await;
    registry.register(server_proxy_transcription_processor).await;
    registry.register(regex_summary_generation_processor).await;
    registry.register(regex_pattern_generation_processor).await;
    // Individual workflow stage processors
    registry.register(directory_tree_generation_processor).await;
    registry.register(local_file_filtering_processor).await;
    registry.register(extended_path_finder_processor).await;
    registry.register(extended_path_correction_processor).await;
    
    debug!("Job processors registered");
    Ok(())
}

/// Start the job scheduler
pub async fn start_job_scheduler(app_handle: AppHandle) -> AppResult<()> {
    
    // Initialize the workflow orchestrator
    let _workflow_orchestrator = init_workflow_orchestrator(app_handle.clone()).await?;
    debug!("Workflow orchestrator initialized");
    
    // Initialize the job scheduler
    let scheduler = scheduler::init_job_scheduler(app_handle).await?;
    
    // Start the scheduler
    scheduler.start().await?;
    
    info!("Job scheduler started");
    Ok(())
}

/// Shutdown the job system
pub async fn shutdown_jobs() -> AppResult<()> {
    // Get the job scheduler
    let scheduler = get_job_scheduler().await?;
    
    // Shutdown the scheduler
    scheduler.shutdown().await?;
    
    info!("Job system shut down");
    Ok(())
}