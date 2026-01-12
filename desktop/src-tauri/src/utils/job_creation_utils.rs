use crate::utils::title_generation::{generate_plan_title, generate_plan_title_with_retry};
use log::{debug, error, info, warn};
use serde_json::Value;
use uuid::Uuid;
// tokio::time imports removed - no longer needed for non-blocking title generation

use crate::error::{AppError, AppResult};
use crate::jobs::types::{JobPayload, JobUIMetadata};
use crate::models::{BackgroundJob, JobStatus, RuntimeAIConfig, TaskType};
use crate::services::config_cache_service::ConfigCache;
use crate::utils::get_timestamp;
use crate::utils::hash_utils::hash_string;
use crate::utils::job_ui_metadata_builder::{
    JobUIMetadataBuilder, create_simple_job_ui_metadata, create_workflow_job_ui_metadata,
};
use crate::validation::ConfigValidator;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Helper function to get BackgroundJobRepository from app state
fn get_background_job_repo(
    app_handle: &AppHandle,
) -> Option<Arc<crate::db_utils::BackgroundJobRepository>> {
    app_handle.try_state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .map(|repo| repo.inner().clone())
}

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
pub async fn validate_task_config_before_job_creation(
    task_type: TaskType,
    model_settings: &Option<(String, f32, u32)>,
    app_handle: &AppHandle,
) -> AppResult<()> {
    info!(
        "Validating task configuration before job creation for {:?}",
        task_type
    );

    // Validate that the task type configuration exists
    verify_task_type_configuration_exists(task_type, app_handle).await?;

    // Validate model settings consistency if provided
    if let Some((model, temperature, max_tokens)) = model_settings {
        validate_model_settings_consistency(
            task_type,
            model,
            *temperature,
            *max_tokens,
            app_handle,
        )
        .await?;
    }

    info!("Task configuration validation passed for {:?}", task_type);
    Ok(())
}

/// Verify that task type configuration exists in the runtime config
pub async fn verify_task_type_configuration_exists(
    task_type: TaskType,
    app_handle: &AppHandle,
) -> AppResult<()> {
    // Only validate for tasks that require LLM
    if !task_type.requires_llm() {
        return Ok(());
    }

    let config_cache = app_handle.state::<ConfigCache>();
    let cache_guard = config_cache.lock().map_err(|e| {
        AppError::ConfigError(format!("Failed to acquire config cache lock: {}", e))
    })?;

    let runtime_config_value = cache_guard
        .get("runtime_ai_config")
        .ok_or_else(|| AppError::ConfigError("Runtime AI config not found in cache".to_string()))?;

    let runtime_config: RuntimeAIConfig = serde_json::from_value(runtime_config_value.clone())
        .map_err(|e| {
            AppError::SerializationError(format!("Failed to deserialize runtime config: {}", e))
        })?;

    drop(cache_guard);

    let task_key = task_type.to_string();
    let task_config = runtime_config.tasks.get(&task_key).ok_or_else(|| {
        AppError::ConfigError(format!(
            "Task configuration for '{}' not found in runtime config",
            task_key
        ))
    })?;

    // Validate the configuration is not empty
    if task_config.model.is_empty() {
        return Err(AppError::ConfigError(format!(
            "Task '{}' has empty model configuration",
            task_key
        )));
    }

    if task_config.max_tokens == 0 {
        return Err(AppError::ConfigError(format!(
            "Task '{}' has zero max_tokens configuration",
            task_key
        )));
    }

    if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
        return Err(AppError::ConfigError(format!(
            "Task '{}' has invalid temperature {} (must be 0.0-2.0)",
            task_key, task_config.temperature
        )));
    }

    Ok(())
}

/// Validate model settings consistency between request and available models
pub async fn validate_model_settings_consistency(
    task_type: TaskType,
    model: &str,
    temperature: f32,
    max_tokens: u32,
    app_handle: &AppHandle,
) -> AppResult<()> {
    let config_cache = app_handle.state::<ConfigCache>();
    let cache_guard = config_cache.lock().map_err(|e| {
        AppError::ConfigError(format!("Failed to acquire config cache lock: {}", e))
    })?;

    let runtime_config_value = cache_guard
        .get("runtime_ai_config")
        .ok_or_else(|| AppError::ConfigError("Runtime AI config not found in cache".to_string()))?;

    let runtime_config: RuntimeAIConfig = serde_json::from_value(runtime_config_value.clone())
        .map_err(|e| {
            AppError::SerializationError(format!("Failed to deserialize runtime config: {}", e))
        })?;

    drop(cache_guard);

    // Check if the model exists in available providers
    let available_models: std::collections::HashSet<String> = runtime_config
        .providers
        .iter()
        .flat_map(|p| p.models.iter().map(|m| m.id.clone()))
        .collect();

    if !available_models.contains(model) {
        return Err(AppError::ConfigError(format!(
            "Model '{}' not found in available providers",
            model
        )));
    }

    // Validate parameter ranges
    if temperature < 0.0 || temperature > 2.0 {
        return Err(AppError::ConfigError(format!(
            "Temperature {} is out of valid range [0.0, 2.0]",
            temperature
        )));
    }

    if max_tokens == 0 {
        return Err(AppError::ConfigError(
            "Max tokens cannot be zero".to_string(),
        ));
    }

    info!(
        "Model settings validation passed for task {:?} with model '{}'",
        task_type, model
    );
    Ok(())
}

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
    // STRICT PRE-JOB VALIDATION - FAIL job creation if ANY validation fails
    validate_task_config_before_job_creation(task_type_enum, &model_settings, app_handle).await?;

    // Task settings are no longer stored locally - all configuration comes from server

    // Create a unique job ID
    let job_id = format!("job_{}", Uuid::new_v4());

    // Start background title generation for ImplementationPlan and ImplementationPlanMerge jobs (non-blocking)
    if matches!(task_type_enum, TaskType::ImplementationPlan | TaskType::ImplementationPlanMerge) {
        let job_id_clone = job_id.clone();
        let req_id = format!("{}:title", job_id_clone);
        let td = prompt_text.to_string();
        let app_handle_clone = app_handle.clone();

        tokio::spawn(async move {
            use tokio::time::{timeout, Duration};

            info!("Generating title asynchronously for job {} using GPT-5-mini", job_id_clone);

            // Force GPT-5-mini with appropriate limits for title generation
            let title_model_override = Some(("openai/gpt-5-mini".to_string(), 0.3, 1000));

            // Wrap entire title generation in timeout to prevent indefinite execution
            let title_generation_future = async {
                generate_plan_title_with_retry(&app_handle_clone, &td, Some(req_id), title_model_override, 2, &[500, 1000]).await
            };

            match timeout(Duration::from_secs(30), title_generation_future).await {
                Ok(Ok(Some(generated_title))) => {
                    info!("Successfully generated title for job {}: {}", job_id_clone, generated_title);
                    if let Err(e) = update_job_title_metadata(
                        &app_handle_clone,
                        &job_id_clone,
                        &generated_title,
                    )
                    .await
                    {
                        warn!("Failed to update job title: {:?}", e);
                    }
                }
                Ok(Ok(None)) => {
                    warn!("Title generation returned empty result for job {}", job_id_clone);
                }
                Ok(Err(e)) => {
                    warn!("Background title generation failed for job {}: {:?}", job_id_clone, e);
                }
                Err(_) => {
                    warn!("Title generation timed out after 30 seconds for job {}", job_id_clone);
                }
            }
        });
    }

    // Use default display name (first 120 chars of prompt) - will be updated async if title generation succeeds
    let display_name = prompt_text
        .lines()
        .next()
        .unwrap_or(prompt_text)
        .trim()
        .chars()
        .take(120)
        .collect::<String>();

    // Inject job_id into the payload by cloning and updating it
    let mut payload_with_job_id = payload_for_worker.clone();
    inject_job_id_into_payload(&mut payload_with_job_id, &job_id);

    // Use the typed payload directly
    let typed_job_payload = payload_with_job_id;

    // Create UI-optimized metadata using the new clean structure
    let ui_metadata = if let (Some(workflow_id), Some(_workflow_stage)) =
        (workflow_id.clone(), workflow_stage.clone())
    {
        // Workflow job
        let mut workflow_metadata =
            create_workflow_job_ui_metadata(typed_job_payload.clone(), workflow_id);

        // Add model settings to workflow job metadata if available
        if let Some((ref model, temp, max_tokens)) = model_settings {
            if let serde_json::Value::Object(ref mut task_data_map) = workflow_metadata.task_data {
                task_data_map.insert(
                    "model".to_string(),
                    serde_json::Value::String(model.clone()),
                );
                task_data_map.insert(
                    "temperature".to_string(),
                    serde_json::Value::Number(
                        serde_json::Number::from_f64(temp as f64)
                            .unwrap_or_else(|| serde_json::Number::from(0)),
                    ),
                );
                task_data_map.insert(
                    "maxTokens".to_string(),
                    serde_json::Value::Number(serde_json::Number::from(max_tokens)),
                );
            }
        }

        // Title will be added at the root metadata level below

        workflow_metadata
    } else {
        // Simple job
        let mut builder = JobUIMetadataBuilder::new(typed_job_payload.clone());

        // Create task data starting with model settings if available
        let mut task_data = serde_json::json!({});
        if let Some((ref model, temp, max_tokens)) = model_settings {
            task_data["model"] = serde_json::Value::String(model.clone());
            task_data["temperature"] = serde_json::Value::Number(
                serde_json::Number::from_f64(temp as f64)
                    .unwrap_or_else(|| serde_json::Number::from(0)),
            );
            task_data["maxTokens"] =
                serde_json::Value::Number(serde_json::Number::from(max_tokens));
        }

        // Merge with any additional task-specific data
        if let Some(ref additional_data) = additional_params {
            if let (
                serde_json::Value::Object(task_map),
                serde_json::Value::Object(additional_map),
            ) = (&mut task_data, additional_data)
            {
                for (key, value) in additional_map {
                    task_map.insert(key.clone(), value.clone());
                }
            }
        }

        // Title will be added as planTitle at the root metadata level below

        builder = builder
            .task_data(task_data);
        builder.build()
    };

    // Serialize the UI metadata to JSON value for manipulation
    let mut metadata_value = serde_json::to_value(&ui_metadata).map_err(|e| {
        AppError::SerializationError(format!("Failed to serialize JobUIMetadata: {}", e))
    })?;

    // Add additional workflow parameters at the top level for workflow jobs
    if let Some(ref additional_data) = additional_params {
        if let serde_json::Value::Object(additional_map) = additional_data {
            if let serde_json::Value::Object(metadata_map) = &mut metadata_value {
                for (key, value) in additional_map {
                    metadata_map.insert(key.clone(), value.clone());
                }
            }
        }
    }

    // Add planTitle field for UI to display the generated title
    if let serde_json::Value::Object(metadata_map) = &mut metadata_value {
        metadata_map.insert("planTitle".to_string(), serde_json::Value::String(display_name.clone()));
    }

    // Convert back to string for database storage
    let metadata_str = serde_json::to_string(&metadata_value).map_err(|e| {
        AppError::SerializationError(format!("Failed to serialize final metadata: {}", e))
    })?;

    // Extract model settings (if provided) or set appropriate values for local tasks
    let (model_used, temperature, max_output_tokens) =
        if let Some((model, temp, max_tokens)) = model_settings {
            (
                Some(model),
                Some(temp),
                if max_tokens > 0 {
                    Some(max_tokens as i32)
                } else {
                    None
                },
            )
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
        cache_write_tokens: None,
        cache_read_tokens: None,
        model_used,
        actual_cost: None,
        duration_ms: None,
        is_finalized: None,
        metadata: Some(metadata_str),
        system_prompt_template: None,
        created_at: timestamp,
        updated_at: Some(timestamp),
        start_time: None,
        end_time: None,
        error_details: None,
    };

    // Get the background job repository from app state
    let repo = get_background_job_repo(app_handle).ok_or_else(|| {
        AppError::InitializationError(
            "Background job repository not initialized. Please wait for app initialization to complete.".to_string()
        )
    })?;

    // Save the job to the database
    repo.create_job(&job_to_save)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create background job: {}", e)))?;

    // Retrieve the job to get the complete database record
    let new_job = repo.get_job_by_id(&job_id).await?.ok_or_else(|| {
        AppError::DatabaseError(format!("Failed to retrieve newly created job: {}", job_id))
    })?;

    // Job creation event already emitted by repository method above

    // Create a Job struct for the queue using the already typed payload
    let job_for_queue = crate::jobs::types::Job {
        id: job_id.clone(),
        task_type: task_type_enum,
        payload: typed_job_payload,
        session_id: session_id.to_string(),
        process_after: None, // New jobs are ready for immediate processing
        created_at: crate::utils::date_utils::get_timestamp(),
        result_json: None,
    };

    // Dispatch the job to the queue (except for workflow jobs which are handled by the orchestrator)
    match task_type_enum {
        TaskType::FileFinderWorkflow | TaskType::WebSearchWorkflow => {
            // Workflow jobs are handled by the orchestrator, not the dispatcher
            info!("Skipping queue dispatch for workflow job: {}", job_id);
        }
        _ => {
            match crate::jobs::dispatcher::dispatch_job(job_for_queue, app_handle.clone()).await {
                Ok(_) => {
                    // Job dispatched successfully
                }
                Err(e) if e.to_string().contains("Job queue not initialized") => {
                    // Job queue not ready yet, but job is saved in database as Queued
                    // It will be recovered when the job system starts
                    // This broader check catches the error regardless of the exact error type
                    warn!(
                        "Job queue not initialized; job {} persisted as queued and will be recovered when job system starts: {}",
                        job_id, e
                    );
                }
                Err(e) => {
                    // Other errors should be propagated
                    return Err(AppError::JobError(format!("Failed to dispatch job: {}", e)));
                }
            }
        }
    }

    info!(
        "Created and queued {} job: {}",
        task_type_enum.to_string(),
        job_id
    );

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
    info!(
        "Creating delayed job with {}ms delay (delay not yet implemented)",
        delay_ms
    );

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
    )
    .await
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
        JobPayload::ImplementationPlan(_) => {}
        JobPayload::TextImprovement(_) => {}
        JobPayload::GenericLlmStream(_) => {}
        JobPayload::RegexFileFilter(_) => {}
        JobPayload::TaskRefinement(_) => {}

        // Workflow stage payloads
        JobPayload::ExtendedPathFinder(_) => {}
        JobPayload::FileRelevanceAssessment(_) => {}
        JobPayload::WebSearchPromptsGeneration(_) => {}
        JobPayload::WebSearchExecution(_) => {}

        // Server proxy payloads (do not have background_job_id fields)
        JobPayload::OpenRouterLlm(_) => {
            // This payload type intentionally does not have background_job_id field
            // as it is processed by external services and doesn't need internal job tracking
        }

        // Workflow payloads (do not have background_job_id fields)
        JobPayload::FileFinderWorkflow(_) => {}
        JobPayload::WebSearchWorkflow(_) => {}

        // Implementation plan merge payload
        JobPayload::ImplementationPlanMerge(_) => {}

        // Video analysis payload
        JobPayload::VideoAnalysis(_) => {}

        // Root folder selection payload
        JobPayload::RootFolderSelection(_) => {}
    }
}

// Task settings functions removed - all AI configuration now comes from server-side exclusively

/// Updates job metadata with generated title in background
async fn update_job_title_metadata(
    app_handle: &AppHandle,
    job_id: &str,
    generated_title: &str,
) -> Result<(), AppError> {
    use crate::db_utils::BackgroundJobRepository;
    use crate::events::job_events::{JobMetadataUpdatedEvent, emit_job_metadata_updated};
    use std::sync::Arc;

    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();

    let patch = serde_json::json!({
        "generatedTitle": generated_title,
        "planTitle": generated_title,
        "titleSource": "generated"
    });

    // Update job metadata using the patch method
    repo.update_job_metadata(job_id, &patch).await?;

    let job = repo.get_job_by_id(job_id).await?.ok_or_else(|| {
        AppError::DatabaseError(format!("Job {} not found after metadata update", job_id))
    })?;

    emit_job_metadata_updated(
        app_handle,
        JobMetadataUpdatedEvent {
            job_id: job_id.to_string(),
            session_id: job.session_id.clone(),
            metadata_patch: patch,
        },
    );

    info!(
        "Updated job {} with generated title: {}",
        job_id, generated_title
    );
    Ok(())
}
