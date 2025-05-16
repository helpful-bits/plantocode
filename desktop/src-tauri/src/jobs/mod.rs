pub mod types;
pub mod dispatcher;
pub mod processor_trait;
pub mod processors;
pub mod queue;
pub mod registry;
pub mod scheduler;
pub mod job_payload_utils;
pub mod job_helpers;

use std::sync::Arc;
use log::{info, debug};
use tauri::AppHandle;

use crate::error::AppResult;
use self::processors::{
    ReadDirectoryProcessor,
    PathFinderProcessor,
    ImplementationPlanProcessor,
    RegexGenerationProcessor,
    GuidanceGenerationProcessor,
    PathCorrectionProcessor,
    TextImprovementProcessor,
    TaskEnhancementProcessor,
    VoiceCorrectionProcessor,
    GenerateDirectoryTreeProcessor,
    TextCorrectionPostTranscriptionProcessor,
    GenericLlmStreamProcessor,
    ServerProxyTranscriptionProcessor
};
use self::registry::get_job_registry;
use self::scheduler::{init_job_scheduler, get_job_scheduler};

/// Initialize the job system
pub async fn init_job_system() -> AppResult<()> {
    // Initialize the job registry
    let _registry = registry::init_job_registry().await?;
    
    // Initialize the job queue
    let _queue = queue::init_job_queue(4).await?; // 4 concurrent jobs
    
    info!("Job system core components initialized");
    Ok(())
}

/// Register all job processors
pub async fn register_job_processors(app_handle: &AppHandle) -> AppResult<()> {
    debug!("Registering job processors");
    
    // Get the job registry
    let registry = get_job_registry().await?;
    
    // Create processor instances
    let read_directory_processor = Arc::new(ReadDirectoryProcessor::new());
    let path_finder_processor = Arc::new(PathFinderProcessor::new());
    let implementation_plan_processor = Arc::new(ImplementationPlanProcessor::new());
    let regex_generation_processor = Arc::new(RegexGenerationProcessor::new());
    let guidance_generation_processor = Arc::new(GuidanceGenerationProcessor::new());
    let path_correction_processor = Arc::new(PathCorrectionProcessor::new());
    let text_improvement_processor = Arc::new(TextImprovementProcessor::new());
    let task_enhancement_processor = Arc::new(TaskEnhancementProcessor::new());
    let voice_correction_processor = Arc::new(VoiceCorrectionProcessor::new());
    let generate_directory_tree_processor = Arc::new(GenerateDirectoryTreeProcessor::new());
    let text_correction_post_transcription_processor = Arc::new(TextCorrectionPostTranscriptionProcessor::new());
    let generic_llm_stream_processor = Arc::new(GenericLlmStreamProcessor::new());
    let server_proxy_transcription_processor = Arc::new(ServerProxyTranscriptionProcessor::new(app_handle.clone()));
    
    // Register processors
    registry.register(read_directory_processor).await;
    registry.register(path_finder_processor).await;
    registry.register(implementation_plan_processor).await;
    registry.register(regex_generation_processor).await;
    registry.register(guidance_generation_processor).await;
    registry.register(path_correction_processor).await;
    registry.register(text_improvement_processor).await;
    registry.register(task_enhancement_processor).await;
    registry.register(voice_correction_processor).await;
    registry.register(generate_directory_tree_processor).await;
    registry.register(text_correction_post_transcription_processor).await;
    registry.register(generic_llm_stream_processor).await;
    registry.register(server_proxy_transcription_processor).await;
    
    debug!("Job processors registered");
    Ok(())
}

/// Start the job scheduler
pub async fn start_job_scheduler(app_handle: AppHandle) -> AppResult<()> {
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