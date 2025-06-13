use uuid::Uuid;
use serde_json::Value;
use log::{info, warn};

use crate::models::{BackgroundJob, TaskType, JobStatus};
use crate::error::{AppError, AppResult};
use crate::utils::get_timestamp;
use crate::jobs::types::{JobPayload, JobUIMetadata};
use crate::utils::job_ui_metadata_builder::{JobUIMetadataBuilder, create_simple_job_ui_metadata, create_workflow_job_ui_metadata};
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
/// * `api_type_str` - The API type to use (e.g., "openrouter", "filesystem")
/// * `task_type_enum` - The task type enum value
/// * `job_type_for_worker` - The job type string to include in metadata
/// * `prompt_text` - The prompt text to include in the job
/// * `model_settings` - Optional tuple of (model, temperature, max_tokens), None for local tasks
/// * `payload_for_worker` - The typed JobPayload to include in metadata
/// * `priority` - The job priority (higher is more important)
/// * `workflow_id` - Optional workflow identifier for multi-stage workflows
/// * `workflow_stage` - Optional workflow stage identifier
/// * `additional_params` - Optional additional parameters to include
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
    model_settings: Option<(String, f32, u32)>,
    payload_for_worker: JobPayload,
    priority: i64,
    workflow_id: Option<String>,
    workflow_stage: Option<String>,
    additional_params: Option<Value>,
    app_handle: &AppHandle,
) -> AppResult<String> {
    // Ensure task settings exist for this task type and session
    ensure_task_settings_exist(session_id, project_dir, task_type_enum, app_handle).await?;
    
    // Create a unique job ID
    let job_id = format!("job_{}", Uuid::new_v4());
    
    // Inject job_id into the payload by cloning and updating it
    let mut payload_with_job_id = payload_for_worker.clone();
    inject_job_id_into_payload(&mut payload_with_job_id, &job_id);
    
    // Use the typed payload directly
    let typed_job_payload = payload_with_job_id;
    
    // Create UI-optimized metadata using the new clean structure
    let ui_metadata = if let (Some(workflow_id), Some(_workflow_stage)) = (workflow_id.clone(), workflow_stage.clone()) {
        // Workflow job
        let mut workflow_metadata = create_workflow_job_ui_metadata(
            typed_job_payload.clone(),
            workflow_id,
        );
        
        // Add model settings to workflow job metadata if available
        if let Some((ref model, temp, max_tokens)) = model_settings {
            if let serde_json::Value::Object(ref mut task_data_map) = workflow_metadata.task_data {
                task_data_map.insert("model".to_string(), serde_json::Value::String(model.clone()));
                task_data_map.insert("temperature".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(temp as f64).unwrap_or_else(|| serde_json::Number::from(0))));
                task_data_map.insert("max_tokens".to_string(), serde_json::Value::Number(serde_json::Number::from(max_tokens)));
            }
        }
        
        workflow_metadata
    } else {
        // Simple job
        let mut builder = JobUIMetadataBuilder::new(typed_job_payload.clone());
        
        // Create task data starting with model settings if available
        let mut task_data = serde_json::json!({});
        if let Some((ref model, temp, max_tokens)) = model_settings {
            task_data["model"] = serde_json::Value::String(model.clone());
            task_data["temperature"] = serde_json::Value::Number(serde_json::Number::from_f64(temp as f64).unwrap_or_else(|| serde_json::Number::from(0)));
            task_data["max_tokens"] = serde_json::Value::Number(serde_json::Number::from(max_tokens));
        }
        
        // Merge with any additional task-specific data
        if let Some(additional_data) = additional_params {
            if let (serde_json::Value::Object(task_map), serde_json::Value::Object(additional_map)) = (&mut task_data, &additional_data) {
                for (key, value) in additional_map {
                    task_map.insert(key.clone(), value.clone());
                }
            }
        }
        
        builder = builder.task_data(task_data);
        builder.build()
    };
    
    // Serialize the UI metadata to string for database storage
    let metadata_str = serde_json::to_string(&ui_metadata)
        .map_err(|e| AppError::SerializationError(format!("Failed to serialize JobUIMetadata: {}", e)))?;
    
    // Extract model settings (if provided) or set appropriate values for local tasks
    let (model_used, temperature, max_output_tokens) = if let Some((model, temp, max_tokens)) = model_settings {
        (Some(model), Some(temp), if max_tokens > 0 { Some(max_tokens as i32) } else { None })
    } else {
        // For local tasks (where model_settings is None), set model_used to the task type
        // to clearly indicate what type of processing was performed
        (Some(task_type_enum.to_string()), None, None)
    };
    
    // Create the background job object
    let timestamp = get_timestamp();
    let job_to_save = BackgroundJob {
        id: job_id.clone(),
        session_id: session_id.to_string(),
        task_type: task_type_enum.to_string(),
        status: JobStatus::Queued.to_string(),
        prompt: prompt_text.to_string(),
        response: None,
        error_message: None,
        tokens_sent: None,
        tokens_received: None,
        model_used,
        metadata: Some(metadata_str),
        created_at: timestamp,
        updated_at: Some(timestamp),
        start_time: None,
        end_time: None,
    };
    
    // Get the background job repository from app state
    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();
    
    // Save the job to the database
    repo.create_job(&job_to_save)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create background job: {}", e)))?;
    
    // Create a Job struct for the queue using the already typed payload
    let job_for_queue = crate::jobs::types::Job {
        id: job_id.clone(),
        job_type: task_type_enum,
        payload: typed_job_payload,
        session_id: session_id.to_string(),
        process_after: None, // New jobs are ready for immediate processing
        created_at: crate::utils::date_utils::get_timestamp(),
    };
    
    // Dispatch the job to the queue
    crate::jobs::dispatcher::dispatch_job(job_for_queue, app_handle.clone())
        .await
        .map_err(|e| AppError::JobError(format!("Failed to dispatch job: {}", e)))?;
    
    info!("Created and queued {} job: {}", task_type_enum.to_string(), job_id);
    
    // Return the job ID
    Ok(job_id)
}

/// Create and queue a background job with delay support
/// This is a specialized version of the job creation utility that supports delayed execution
pub async fn create_and_queue_background_job_with_delay(
    session_id: &str,
    project_dir: &str,
    api_type_str: &str,
    task_type_enum: TaskType,
    job_type_for_worker: &str,
    prompt_text: &str,
    model_settings: Option<(String, f32, u32)>,
    payload_for_worker: JobPayload,
    priority: i64,
    workflow_id: Option<String>,
    workflow_stage: Option<String>,
    additional_params: Option<serde_json::Value>,
    delay_ms: u64,
    app_handle: &tauri::AppHandle,
) -> AppResult<String> {
    // For now, we'll log the delay and fall back to immediate execution
    // TODO: Implement actual delay support in the job queue
    info!("Creating delayed job with {}ms delay (delay not yet implemented)", delay_ms);
    
    // Use the regular job creation for now
    create_and_queue_background_job(
        session_id,
        project_dir,
        api_type_str,
        task_type_enum,
        job_type_for_worker,
        prompt_text,
        model_settings,
        payload_for_worker,
        priority,
        workflow_id,
        workflow_stage,
        additional_params,
        app_handle,
    ).await
}

/// Helper function to inject job ID into a JobPayload
/// 
/// This function ensures that all payload variants that contain a `background_job_id` field
/// receive the proper job ID. Payload variants without this field are explicitly handled
/// in the catch-all case.
fn inject_job_id_into_payload(payload: &mut JobPayload, job_id: &str) {
    // Note: background_job_id field has been removed from payload structures
    // This function is kept for potential future payload modifications
    match payload {
        JobPayload::PathFinder(_) => {},
        JobPayload::ImplementationPlan(_) => {},
        JobPayload::GuidanceGeneration(_) => {},
        JobPayload::PathCorrection(_) => {},
        JobPayload::TaskEnhancement(_) => {},
        JobPayload::TextCorrection(_) => {},
        JobPayload::GenericLlmStream(_) => {},
        JobPayload::RegexPatternGeneration(_) => {},
        
        // Workflow stage payloads
        JobPayload::LocalFileFiltering(_) => {},
        JobPayload::ExtendedPathFinder(_) => {},
        JobPayload::RegexPatternGenerationWorkflow(_) => {},
        JobPayload::FileRelevanceAssessment(_) => {},
        
        // Server proxy payloads (do not have background_job_id fields)
        JobPayload::OpenRouterLlm(_) => {
            // This payload type intentionally does not have background_job_id field
            // as it is processed by external services and doesn't need internal job tracking
        }
        
        // Subscription lifecycle payloads
        JobPayload::SubscriptionLifecycle(_) => {
            // SubscriptionLifecycle payloads are handled by specific processors
            // and don't need background_job_id field injection
        }
    }
}

/// Ensure task settings exist for a specific session and task type
/// This function initializes task settings from project/global defaults if they don't exist
async fn ensure_task_settings_exist(
    session_id: &str, 
    project_dir: &str, 
    task_type: TaskType,
    app_handle: &AppHandle
) -> AppResult<()> {
    let settings_repo = app_handle.state::<Arc<crate::db_utils::settings_repository::SettingsRepository>>().inner().clone();
    let task_type_str = task_type.to_string();
    
    // Check if task settings already exist
    match settings_repo.get_task_settings(session_id, &task_type_str).await {
        Ok(Some(_)) => {
            // Settings already exist, no need to create
            return Ok(());
        }
        Ok(None) => {
            // Settings don't exist, need to create them
        }
        Err(e) => {
            warn!("Error checking existing task settings for session {} and task type {}: {}", session_id, task_type_str, e);
            // Continue and try to create settings
        }
    }
    
    // Only create settings for tasks that require LLM configuration
    if !task_type.requires_llm() {
        return Ok(());
    }
    
    info!("Creating task settings for session {} and task type {}", session_id, task_type_str);
    
    // Get model configuration from project/global settings
    let model = crate::config::get_model_for_task_with_project(task_type, project_dir, app_handle)
        .await
        .map_err(|e| AppError::ConfigError(format!("Failed to get model for task type {}: {}", task_type_str, e)))?;
    
    let temperature = crate::config::get_temperature_for_task_with_project(task_type, project_dir, app_handle)
        .await
        .ok(); // Temperature is optional
    
    let max_tokens = crate::config::get_max_tokens_for_task_with_project(task_type, project_dir, app_handle)
        .await
        .unwrap_or(4000) as i32; // Use safe default if config fails
    
    // Create the task settings
    let task_settings = crate::models::TaskSettings {
        session_id: session_id.to_string(),
        task_type: task_type_str.clone(),
        model,
        max_tokens,
        temperature,
    };
    
    // Save to database
    settings_repo.set_task_settings(&task_settings).await
        .map_err(|e| AppError::DatabaseError(format!("Failed to save task settings for {}: {}", task_type_str, e)))?;
    
    info!("Created task settings for session {} and task type {}: model={}, max_tokens={}, temperature={:?}", 
          session_id, task_type_str, task_settings.model, task_settings.max_tokens, task_settings.temperature);
    
    Ok(())
}