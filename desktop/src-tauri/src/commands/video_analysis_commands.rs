use crate::jobs::types::{JobPayload, VideoAnalysisPayload};
use crate::models::{JobCommandResponse, TaskType};
use crate::utils::{config_resolver, job_creation_utils};
use crate::utils::hash_utils::generate_project_hash;
use crate::utils::unified_prompt_system::{UnifiedPromptContextBuilder, UnifiedPromptProcessor};
use tauri::{command, AppHandle, Manager};
use log::{debug, info, error};
use serde_json;

#[command]
pub async fn start_video_analysis_job(
    app_handle: AppHandle,
    session_id: String,
    project_directory: String,
    video_path: String,
    prompt: String,
    duration_ms: i64,
) -> Result<JobCommandResponse, String> {
    info!("Starting video analysis job for file: {}", video_path);
    
    // Resolve model settings from project configuration
    let model_settings = config_resolver::resolve_model_settings(
        &app_handle,
        TaskType::VideoAnalysis,
        &project_directory,
        None, // no model override
        None, // no temperature override
        None, // no max_tokens override
    )
    .await
    .map_err(|e| format!("Failed to resolve model settings: {}", e))?;
    
    let (resolved_model, resolved_temperature, resolved_max_tokens) = model_settings
        .ok_or_else(|| "Failed to get model settings for video analysis".to_string())?;
    
    debug!("Video analysis parameters - model: {}, temperature: {}, max_tokens: {}, duration_ms: {}", 
        resolved_model, resolved_temperature, resolved_max_tokens, duration_ms);

    // Generate project hash
    let project_hash = generate_project_hash(&project_directory);
    
    // Create unified prompt context with the combined prompt
    let context = UnifiedPromptContextBuilder::new(
        project_directory.clone(),
        TaskType::VideoAnalysis,
        prompt.clone(),
    )
    .build();
    
    // Create prompt processor and compose prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &app_handle)
        .await
        .map_err(|e| format!("Failed to compose prompt: {}", e))?;
    
    let payload = VideoAnalysisPayload {
        video_path: video_path.clone(),
        prompt: prompt.clone(),
        model: resolved_model.clone(),
        temperature: resolved_temperature,
        system_prompt: Some(composed_prompt.system_prompt),
        duration_ms,
    };
    
    let job_id = job_creation_utils::create_and_queue_background_job(
        &session_id,
        &project_directory,
        "openrouter",
        TaskType::VideoAnalysis,
        "VIDEO_ANALYSIS",
        &prompt, // Store the actual prompt in the background job table
        Some((resolved_model, resolved_temperature, resolved_max_tokens)),
        JobPayload::VideoAnalysis(payload),
        10, // priority
        None, // workflow_id
        Some("VideoAnalysis".to_string()),
        Some(serde_json::json!({ "videoPath": video_path })), // additional_params
        &app_handle,
    )
    .await
    .map_err(|e| format!("Failed to create job: {}", e))?;

    let pool = app_handle.state::<sqlx::SqlitePool>().inner();
    if let Err(e) = crate::db_utils::temp_file_repository::register_temp_file(pool, &video_path, Some(&job_id)).await {
        error!("Failed to register video file as temp file: {}", e);
    }

    Ok(JobCommandResponse { job_id })
}
