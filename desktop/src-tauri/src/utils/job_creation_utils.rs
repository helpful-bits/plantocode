use uuid::Uuid;
use serde_json::Value;
use log::info;

use crate::models::{BackgroundJob, TaskType, JobStatus};
use crate::error::{AppError, AppResult};
use crate::utils::get_timestamp;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Creates and queues a background job with consistent parameter handling
///
/// This helper encapsulates the common logic used across different job creation
/// commands to reduce duplication and improve maintainability.
///
/// # Arguments
/// * `session_id` - The session ID to associate with this job
/// * `project_dir` - The project directory path
/// * `api_type_str` - The API type to use (e.g., "openrouter")
/// * `task_type_enum` - The task type enum value
/// * `job_type_for_worker` - The job type string to include in metadata
/// * `prompt_text` - The prompt text to include in the job
/// * `model_settings` - A tuple of (model, temperature, max_tokens)
/// * `payload_for_worker` - The serialized payload JSON to include in metadata
/// * `priority` - The job priority (higher is more important)
/// * `extra_metadata` - Optional additional metadata to include
///
/// # Returns
/// The job ID string if successful, or an AppError if something fails
pub async fn create_and_queue_background_job(
    session_id: &str,
    project_dir: &str,
    api_type_str: &str,
    task_type_enum: TaskType,
    job_type_for_worker: &str,
    prompt_text: &str,
    model_settings: (String, f32, u32),
    payload_for_worker: Value,
    priority: i64,
    extra_metadata: Option<Value>,
    app_handle: &AppHandle,
) -> AppResult<String> {
    // Create a unique job ID
    let job_id = format!("job_{}", Uuid::new_v4());
    
    // Clone and inject job_id into payload if it's an object
    let mut payload_with_job_id = payload_for_worker.clone();
    if let Value::Object(ref mut obj) = payload_with_job_id {
        obj.insert("backgroundJobId".to_string(), Value::String(job_id.clone()));
    }
    
    // Serialize the payload for inclusion in metadata
    let payload_json = serde_json::to_string(&payload_with_job_id)
        .map_err(|e| AppError::SerializationError(format!("Failed to serialize payload: {}", e)))?;
    
    // Prepare the base metadata
    let mut metadata = serde_json::json!({
        "jobTypeForWorker": job_type_for_worker,
        "jobPayloadForWorker": payload_json,
        "jobPriorityForWorker": priority,
    });
    
    // Add any extra metadata fields if provided
    if let Some(extra) = extra_metadata {
        if let Some(obj) = metadata.as_object_mut() {
            if let Some(extra_obj) = extra.as_object() {
                for (key, value) in extra_obj {
                    obj.insert(key.clone(), value.clone());
                }
            }
        }
    }
    
    // Convert metadata to string
    let metadata_str = metadata.to_string();
    
    // Extract model settings
    let (model, temperature, max_tokens) = model_settings;
    
    // Create the background job object
    let timestamp = get_timestamp();
    let job_to_save = BackgroundJob {
        id: job_id.clone(),
        session_id: session_id.to_string(),
        api_type: api_type_str.to_string(),
        task_type: task_type_enum.to_string(),
        status: JobStatus::Queued.to_string(),
        created_at: timestamp,
        updated_at: Some(timestamp),
        start_time: None,
        end_time: None,
        last_update: None,
        prompt: prompt_text.to_string(),
        response: None,
        project_directory: Some(project_dir.to_string()),
        tokens_sent: None,
        tokens_received: None,
        total_tokens: None,
        chars_received: None,
        status_message: None,
        error_message: None,
        model_used: Some(model),
        max_output_tokens: if max_tokens > 0 { Some(max_tokens as i32) } else { None },
        temperature: Some(temperature),
        include_syntax: None,
        metadata: Some(metadata_str),
        system_prompt_id: None, // Will be set by the processor when it gets the system prompt
    };
    
    // Get the background job repository from app state
    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();
    
    // Save the job to the database
    repo.create_job(&job_to_save)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create background job: {}", e)))?;
    
    // Note: We now use TaskType directly instead of converting from job_type_for_worker
    
    // Create the appropriate JobPayload based on task type
    let job_payload = match task_type_enum {
        TaskType::PathFinder => {
            let path_finder_payload: crate::jobs::types::PathFinderPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize PathFinderPayload: {}", e)))?;
            crate::jobs::types::JobPayload::PathFinder(path_finder_payload)
        },
        TaskType::ImplementationPlan => {
            let impl_plan_payload: crate::jobs::types::ImplementationPlanPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize ImplementationPlanPayload: {}", e)))?;
            crate::jobs::types::JobPayload::ImplementationPlan(impl_plan_payload)
        },
        TaskType::GuidanceGeneration => {
            let guidance_payload: crate::jobs::types::GuidanceGenerationPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize GuidanceGenerationPayload: {}", e)))?;
            crate::jobs::types::JobPayload::GuidanceGeneration(guidance_payload)
        },
        TaskType::PathCorrection => {
            let path_correction_payload: crate::jobs::types::PathCorrectionPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize PathCorrectionPayload: {}", e)))?;
            crate::jobs::types::JobPayload::PathCorrection(path_correction_payload)
        },
        TaskType::TextImprovement => {
            let text_improvement_payload: crate::jobs::types::TextImprovementPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize TextImprovementPayload: {}", e)))?;
            crate::jobs::types::JobPayload::TextImprovement(text_improvement_payload)
        },
        TaskType::TaskEnhancement => {
            let task_enhancement_payload: crate::jobs::types::TaskEnhancementPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize TaskEnhancementPayload: {}", e)))?;
            crate::jobs::types::JobPayload::TaskEnhancement(task_enhancement_payload)
        },
        TaskType::TextCorrection => {
            let text_correction_payload: crate::jobs::types::TextCorrectionPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize TextCorrectionPayload: {}", e)))?;
            crate::jobs::types::JobPayload::TextCorrection(text_correction_payload)
        },
        TaskType::GenericLlmStream => {
            let generic_llm_payload: crate::jobs::types::GenericLlmStreamPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize GenericLlmStreamPayload: {}", e)))?;
            crate::jobs::types::JobPayload::GenericLlmStream(generic_llm_payload)
        },
        TaskType::VoiceTranscription => {
            let transcription_payload: crate::jobs::types::VoiceTranscriptionPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize VoiceTranscriptionPayload: {}", e)))?;
            crate::jobs::types::JobPayload::VoiceTranscription(transcription_payload)
        },
        TaskType::RegexSummaryGeneration => {
            let regex_summary_payload: crate::jobs::processors::regex_summary_generation_processor::RegexSummaryGenerationPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize RegexSummaryGenerationPayload: {}", e)))?;
            crate::jobs::types::JobPayload::RegexSummaryGeneration(regex_summary_payload)
        },
        TaskType::RegexPatternGeneration => {
            let regex_pattern_payload: crate::jobs::types::RegexPatternGenerationPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize RegexPatternGenerationPayload: {}", e)))?;
            crate::jobs::types::JobPayload::RegexPatternGeneration(regex_pattern_payload)
        },
        TaskType::VoiceTranscription => {
            let transcription_payload: crate::jobs::types::VoiceTranscriptionPayload = 
                serde_json::from_value(payload_with_job_id)
                .map_err(|e| AppError::SerializationError(format!("Failed to deserialize VoiceTranscriptionPayload for VoiceTranscription: {}", e)))?;
            crate::jobs::types::JobPayload::VoiceTranscription(transcription_payload)
        },
        _ => {
            return Err(AppError::JobError(format!("Unsupported task type for job creation: {:?}", task_type_enum)));
        }
    };

    // Create a Job struct for the queue
    let job_for_queue = crate::jobs::types::Job {
        id: job_id.clone(),
        job_type: task_type_enum,
        payload: job_payload,
        created_at: timestamp.to_string(),
        session_id: session_id.to_string(),
        task_type_str: task_type_enum.to_string(),
        project_directory: Some(project_dir.to_string()),
    };
    
    // Dispatch the job to the queue
    crate::jobs::dispatcher::dispatch_job(job_for_queue, app_handle.clone())
        .await
        .map_err(|e| AppError::JobError(format!("Failed to dispatch job: {}", e)))?;
    
    info!("Created and queued {} job: {}", task_type_enum.to_string(), job_id);
    
    // Return the job ID
    Ok(job_id)
}