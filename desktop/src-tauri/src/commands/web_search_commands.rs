use crate::AppState;
use crate::db_utils::BackgroundJobRepository;
use crate::jobs::types::{
    JobPayload, WebSearchExecutionPayload, WebSearchPromptsGenerationPayload,
    WebSearchWorkflowPayload,
};
use crate::jobs::workflow_orchestrator::get_workflow_orchestrator;
use crate::models::{JobCommandResponse, TaskType};
use crate::utils::{config_resolver, job_creation_utils};
use log::info;
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn start_web_search_prompts_generation_job(
    session_id: String,
    task_description: String,
    project_directory: String,
    app_handle: AppHandle,
) -> Result<JobCommandResponse, String> {
    info!(
        "Starting standalone web search prompts generation job for session: {}",
        session_id
    );

    let model_settings = config_resolver::resolve_model_settings(
        &app_handle,
        TaskType::WebSearchPromptsGeneration,
        &project_directory,
        None,
        None,
        None,
    )
    .await
    .map_err(|e| format!("Failed to resolve model settings: {}", e))?;

    let payload = JobPayload::WebSearchPromptsGeneration(WebSearchPromptsGenerationPayload {
        task_description: task_description.clone(),
    });

    let job_id = job_creation_utils::create_and_queue_background_job(
        &session_id,
        &project_directory,
        "openrouter",
        TaskType::WebSearchPromptsGeneration,
        "WEB_SEARCH_PROMPTS_GENERATION",
        &task_description,
        model_settings,
        payload,
        10,
        None,
        Some("WebSearchPromptsGeneration".to_string()),
        None,
        &app_handle,
    )
    .await
    .map_err(|e| format!("Failed to create job: {}", e))?;

    Ok(JobCommandResponse { job_id })
}

/// Start a new web search workflow using WorkflowOrchestrator
#[tauri::command]
pub async fn start_web_search_workflow(
    session_id: String,
    task_description: String,
    project_directory: String,
    excluded_paths: Vec<String>,
    timeout_ms: Option<u64>,
    app_handle: AppHandle,
) -> Result<JobCommandResponse, String> {
    info!(
        "Starting web search workflow for task: {}",
        task_description
    );

    // Preflight touch: ensure queue is ready/lazily initialized before creating jobs
    if let Err(e) = crate::jobs::queue::get_job_queue().await {
        log::debug!(
            "Preflight job queue readiness check: {e:?} (proceeding, accessor handles waiting/lazy init)"
        );
    }

    // Validate required fields
    if session_id.is_empty() {
        return Err("Session ID is required".to_string());
    }

    if task_description.trim().len() < 10 {
        return Err("Task description must be at least 10 characters".to_string());
    }

    if project_directory.is_empty() {
        return Err("Project directory is required".to_string());
    }

    // First create a master BackgroundJob for the workflow
    let workflow_payload = WebSearchWorkflowPayload {
        task_description: task_description.clone(),
        session_id: session_id.clone(),
        project_directory: project_directory.clone(),
        excluded_paths: excluded_paths.clone(),
        timeout_ms,
    };

    let workflow_id = job_creation_utils::create_and_queue_background_job(
        &session_id,
        &project_directory,
        "workflow",
        TaskType::WebSearchWorkflow,
        "WEB_SEARCH_WORKFLOW",
        &task_description,
        None, // workflows don't need LLM settings
        JobPayload::WebSearchWorkflow(workflow_payload),
        10,   // High priority for workflows
        None, // workflow_id - will be the job ID itself
        None, // workflow_stage
        None, // metadata
        &app_handle,
    )
    .await
    .map_err(|e| format!("Failed to create workflow job: {}", e))?;

    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator()
        .await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;

    // Start the workflow via the orchestrator using the WebSearchWorkflow definition
    orchestrator
        .start_workflow(
            workflow_id.clone(),
            "WebSearchWorkflow".to_string(),
            session_id,
            task_description,
            project_directory,
            excluded_paths,
            timeout_ms,
        )
        .await
        .map_err(|e| format!("Failed to start workflow: {}", e))?;

    info!("Started web search workflow: {}", workflow_id);

    Ok(JobCommandResponse {
        job_id: workflow_id,
    })
}

/// Continue workflow from a completed web search prompts generation job
#[tauri::command]
pub async fn continue_workflow_from_job_command(
    job_id: String,
    app_handle: AppHandle,
) -> Result<JobCommandResponse, String> {
    info!("Continuing workflow from job: {}", job_id);

    // Get repository from app state
    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();

    // Fetch the job from the database
    let job = repo
        .get_job_by_id(&job_id)
        .await
        .map_err(|e| format!("Failed to fetch job: {}", e))?
        .ok_or_else(|| "Job not found".to_string())?;

    // Validate it's a completed web search prompts generation job
    if job.task_type != "web_search_prompts_generation" {
        return Err(format!(
            "Job is not a web search prompts generation job, got: {}",
            job.task_type
        ));
    }

    if job.status != "completed" {
        return Err(format!(
            "Job is not completed, current status: {}",
            job.status
        ));
    }

    // Extract prompts from the job response
    let response = job
        .response
        .ok_or_else(|| "Job has no response data".to_string())?;

    let response_json: serde_json::Value = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse job response: {}", e))?;

    let prompts = response_json
        .get("prompts")
        .and_then(|p| p.as_array())
        .ok_or_else(|| "No prompts found in job response".to_string())?
        .iter()
        .filter_map(|p| p.as_str())
        .map(String::from)
        .collect::<Vec<String>>();

    if prompts.is_empty() {
        return Err("No valid prompts found in job response".to_string());
    }

    info!("Found {} prompts to execute", prompts.len());

    // Get session info from the original job
    let session_id = job.session_id.clone();

    // Extract project directory and task description from job metadata
    let metadata: serde_json::Value = job
        .metadata
        .and_then(|m| serde_json::from_str(&m).ok())
        .unwrap_or_default();

    let project_directory = metadata
        .get("projectDirectory")
        .and_then(|p| p.as_str())
        .map(String::from)
        .unwrap_or_else(|| "default".to_string());

    let task_description = metadata
        .get("taskDescription")
        .and_then(|t| t.as_str())
        .map(String::from)
        .unwrap_or_else(|| format!("Web search execution from job {}", job_id));

    // Get model settings for WebSearchExecution using centralized resolver
    let model_settings = config_resolver::resolve_model_settings(
        &app_handle,
        TaskType::WebSearchExecution,
        &project_directory,
        None, // No specific model override
        None, // No temperature override
        None, // No max tokens override
    )
    .await
    .map_err(|e| format!("Failed to get model settings: {}", e))?;

    // Determine API type based on whether the task requires LLM (same as workflow)
    let api_type_str = if model_settings.is_some() {
        "openrouter"
    } else {
        "filesystem"
    };

    // Create web search execution payload
    let execution_payload = WebSearchExecutionPayload {
        prompts: prompts.clone(),
    };

    // Create metadata matching workflow structure
    let job_metadata = json!({
        "continuedFromJob": job_id,
        "promptsCount": prompts.len(),
        "taskDescription": task_description,
        "projectDirectory": project_directory,
        "workflowTaskDescription": task_description,
        "stageName": "WebSearchExecution",
        "isStandalone": true
    });

    // Create and queue the web search execution job with proper settings
    let new_job_id = job_creation_utils::create_and_queue_background_job(
        &session_id,
        &project_directory,
        api_type_str,
        TaskType::WebSearchExecution,
        "WEB_SEARCH_EXECUTION",
        &task_description,
        model_settings,
        JobPayload::WebSearchExecution(execution_payload),
        10,                                     // High priority
        None,                                   // No workflow ID - this is a standalone job
        Some("WebSearchExecution".to_string()), // workflow_stage for UI display
        Some(job_metadata),
        &app_handle,
    )
    .await
    .map_err(|e| format!("Failed to create web search execution job: {}", e))?;

    info!("Created web search execution job: {}", new_job_id);

    Ok(JobCommandResponse { job_id: new_job_id })
}
