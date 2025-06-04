use std::sync::Arc;
use std::collections::HashMap;
use log::{info, warn, error, debug};
use tokio::sync::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{JobStatus, TaskType};
use crate::jobs::types::JobPayload;
use crate::utils::job_creation_utils;
use crate::jobs::workflow_types::{
    WorkflowState, WorkflowStatus, WorkflowStage, WorkflowStageJob,
    WorkflowDefinition, WorkflowStageDefinition
};
use crate::jobs::workflow_cleanup::WorkflowCleanupHandler;
use crate::jobs::workflow_cancellation::WorkflowCancellationHandler;

use super::event_emitter;
use super::payload_builder;
use super::stage_scheduler;
use super::query_service;
use super::state_updater;

/// Start a new workflow using abstract workflow definitions
pub async fn start_workflow_internal(
    workflows: &Mutex<HashMap<String, WorkflowState>>,
    app_handle: &AppHandle,
    workflow_definitions: &Mutex<HashMap<String, Arc<WorkflowDefinition>>>,
    workflow_definition_name: String,
    session_id: String,
    task_description: String,
    project_directory: String,
    excluded_paths: Vec<String>,
    timeout_ms: Option<u64>,
) -> AppResult<String> {
    let workflow_id = Uuid::new_v4().to_string();
    info!("Starting workflow '{}': {}", workflow_definition_name, workflow_id);

    // Get the workflow definition
    let workflow_definition = {
        let definitions = workflow_definitions.lock().await;
        definitions.get(&workflow_definition_name)
            .cloned()
            .ok_or_else(|| AppError::JobError(format!("Workflow definition not found: {}", workflow_definition_name)))?
    };

    // Create initial workflow state
    let mut workflow_state = WorkflowState::new(
        workflow_id.clone(),
        workflow_definition_name.clone(),
        session_id.clone(),
        task_description.clone(),
        project_directory.clone(),
        excluded_paths.clone(),
        timeout_ms,
    );

    workflow_state.status = WorkflowStatus::Running;

    // Emit workflow started event
    event_emitter::emit_workflow_status_event_internal(app_handle, &workflow_state, "Workflow started").await;

    // Find and start the first stage(s) - those with no dependencies
    let entry_stages = workflow_definition.get_entry_stages();

    if entry_stages.is_empty() {
        return Err(AppError::JobError(format!("No entry stages found in workflow definition: {}", workflow_definition_name)));
    }

    // Store the workflow state and create entry stage jobs in the same lock scope
    {
        let mut workflows_guard = workflows.lock().await;
        workflows_guard.insert(workflow_id.clone(), workflow_state.clone());

        // Create all entry stage jobs while holding the lock
        for entry_stage in entry_stages {
            create_abstract_stage_job_with_lock(&mut workflows_guard, app_handle, &workflow_state, entry_stage, &workflow_definition).await?;
        }
    }

    info!("Started workflow '{}' with ID: {}", workflow_definition_name, workflow_id);
    Ok(workflow_id)
}

/// Cancel a workflow and all its pending/running jobs
pub async fn cancel_workflow_internal(
    workflows: &Mutex<HashMap<String, WorkflowState>>,
    app_handle: &AppHandle,
    workflow_cancellation_handler: &Arc<WorkflowCancellationHandler>,
    workflow_id: &str,
) -> AppResult<()> {
    cancel_workflow_with_reason_internal(
        workflows,
        app_handle,
        workflow_cancellation_handler,
        workflow_id,
        "User requested cancellation"
    ).await
}

/// Cancel a workflow and all its pending/running jobs with a specific reason
pub async fn cancel_workflow_with_reason_internal(
    workflows: &Mutex<HashMap<String, WorkflowState>>,
    app_handle: &AppHandle,
    workflow_cancellation_handler: &Arc<WorkflowCancellationHandler>,
    workflow_id: &str,
    reason: &str,
) -> AppResult<()> {
    // Use the WorkflowCancellationHandler to cancel all associated jobs
    let cancellation_result = workflow_cancellation_handler
        .cancel_workflow(workflow_id, reason, app_handle)
        .await?;

    info!("Canceled {} jobs for workflow {}, {} failures", 
          cancellation_result.canceled_jobs.len(), 
          workflow_id,
          cancellation_result.failed_cancellations.len());

    // Update the workflow state to canceled
    let mut workflows_guard = workflows.lock().await;
    if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
        workflow_state.status = WorkflowStatus::Canceled;
        workflow_state.updated_at = chrono::Utc::now().timestamp_millis();
        workflow_state.completed_at = Some(workflow_state.updated_at);
        workflow_state.error_message = Some(reason.to_string());
        
        info!("Workflow {} marked as canceled: {}", workflow_id, reason);
    } else {
        return Err(AppError::JobError(format!("Workflow not found: {}", workflow_id)));
    }
    
    // Emit workflow canceled event
    let workflow_state = query_service::get_workflow_status_internal(workflows, workflow_id).await?;
    event_emitter::emit_workflow_status_event_internal(app_handle, &workflow_state, &format!("Workflow canceled: {}", reason)).await;
    
    Ok(())
}

/// Pause a workflow - prevents new stages from starting
pub async fn pause_workflow_internal(
    workflows: &Mutex<HashMap<String, WorkflowState>>,
    app_handle: &AppHandle,
    workflow_id: &str,
) -> AppResult<()> {
    info!("Pausing workflow: {}", workflow_id);

    let mut workflows_guard = workflows.lock().await;
    if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
        // Only allow pausing if workflow is currently running
        if workflow_state.status != WorkflowStatus::Running {
            return Err(AppError::JobError(format!(
                "Cannot pause workflow {} - current status: {:?}", 
                workflow_id, workflow_state.status
            )));
        }

        workflow_state.status = WorkflowStatus::Paused;
        workflow_state.updated_at = chrono::Utc::now().timestamp_millis();

        // Emit workflow paused event
        emit_workflow_status_event_internal(app_handle, workflow_state, "Workflow paused").await;
        
        info!("Workflow {} marked as paused", workflow_id);
        Ok(())
    } else {
        Err(AppError::JobError(format!("Workflow not found: {}", workflow_id)))
    }
}

/// Resume a paused workflow - allows new stages to start
pub async fn resume_workflow_internal(
    workflows: &Mutex<HashMap<String, WorkflowState>>,
    app_handle: &AppHandle,
    workflow_definitions: &Mutex<HashMap<String, Arc<WorkflowDefinition>>>,
    workflow_id: &str,
) -> AppResult<()> {
    info!("Resuming workflow: {}", workflow_id);

    let workflow_id_clone = workflow_id.to_string();

    {
        let mut workflows_guard = workflows.lock().await;
        if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
            // Only allow resuming if workflow is currently paused
            if workflow_state.status != WorkflowStatus::Paused {
                return Err(AppError::JobError(format!(
                    "Cannot resume workflow {} - current status: {:?}", 
                    workflow_id, workflow_state.status
                )));
            }

            workflow_state.status = WorkflowStatus::Running;
            workflow_state.updated_at = chrono::Utc::now().timestamp_millis();

            // Emit workflow resumed event
            emit_workflow_status_event_internal(app_handle, workflow_state, "Workflow resumed").await;
            
            info!("Workflow {} marked as running", workflow_id);
        } else {
            return Err(AppError::JobError(format!("Workflow not found: {}", workflow_id)));
        }
    }

    // Try to start next stages now that workflow is resumed using abstract workflow definitions
    if let Err(e) = start_next_abstract_stages_internal(workflows, app_handle, workflow_definitions, &workflow_id_clone).await {
        warn!("Failed to start next stages after resuming workflow {}: {}", workflow_id, e);
    }

    Ok(())
}

/// Create and queue a job for a specific workflow stage using abstract workflow definitions
/// This is the canonical method for creating stage jobs with workflow lock held
async fn create_abstract_stage_job_with_lock(
    workflows: &mut HashMap<String, WorkflowState>,
    app_handle: &AppHandle,
    workflow_state: &WorkflowState,
    stage_definition: &WorkflowStageDefinition,
    workflow_definition: &WorkflowDefinition,
) -> AppResult<String> {
    let task_type = stage_definition.task_type;
    
    // Create stage payload based on task type and dependency data
    let job_payload = payload_builder::create_abstract_stage_payload(app_handle, workflow_state, stage_definition, workflow_definition).await?;
    
    // Convert to WorkflowStage for model configuration
    let stage = match task_type {
        TaskType::RegexPatternGeneration => WorkflowStage::GeneratingRegex,
        TaskType::LocalFileFiltering => WorkflowStage::LocalFiltering,
        TaskType::FileRelevanceAssessment => WorkflowStage::FileRelevanceAssessment,
        TaskType::ExtendedPathFinder => WorkflowStage::ExtendedPathFinder,
        TaskType::ExtendedPathCorrection => WorkflowStage::ExtendedPathCorrection,
        _ => return Err(AppError::JobError(format!("Unsupported task type for workflow stage: {:?}", task_type))),
    };
    
    // Get model configuration for the stage
    let model_settings = get_stage_model_config_for_definition(app_handle, stage_definition, &workflow_state.project_directory).await?;

    // Determine API type based on whether the task requires LLM
    let api_type_str = if model_settings.is_some() {
        "openrouter"
    } else {
        "filesystem"
    };

    // Create the background job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &workflow_state.session_id,
        &workflow_state.project_directory,
        api_type_str,
        task_type,
        &stage_definition.stage_name.to_uppercase().replace(" ", "_"),
        &workflow_state.task_description,
        model_settings,
        job_payload,
        10, // High priority for workflow jobs
        Some(workflow_state.workflow_id.clone()), // workflow_id
        Some(stage_definition.stage_name.clone()), // workflow_stage
        Some(serde_json::json!({
            "workflowId": workflow_state.workflow_id,
            "workflowStage": task_type.to_string(),
            "stageName": stage_definition.stage_name
        })),
        app_handle,
    ).await?;

    // Add the stage job to workflow state using the provided mutable reference
    if let Some(workflow) = workflows.get_mut(&workflow_state.workflow_id) {
        let depends_on = if stage_definition.dependencies.is_empty() {
            None
        } else {
            // Find the job ID of the first dependency
            stage_definition.dependencies.first()
                .and_then(|dep_stage_name| {
                    workflow_definition.get_stage(dep_stage_name)
                })
                .and_then(|dep_stage_def| {
                    workflow.stage_jobs.iter()
                        .find(|job| job.task_type == dep_stage_def.task_type)
                })
                .map(|job| job.job_id.clone())
        };
        
        workflow.add_stage_job(stage_definition.stage_name.clone(), task_type, job_id.clone(), depends_on);
    }

    info!("Created abstract stage job {} for stage '{}'", job_id, stage_definition.stage_name);
    Ok(job_id)
}

/// Start the next available abstract stages using workflow definitions
async fn start_next_abstract_stages_internal(
    workflows: &Mutex<HashMap<String, WorkflowState>>,
    app_handle: &AppHandle,
    workflow_definitions: &Mutex<HashMap<String, Arc<WorkflowDefinition>>>,
    workflow_id: &str,
) -> AppResult<()> {
    let workflow_state = {
        let workflows_guard = workflows.lock().await;
        workflows_guard.get(workflow_id).cloned()
            .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))?
    };

    // Check if workflow is paused - don't start new stages
    if workflow_state.status == WorkflowStatus::Paused {
        debug!("Workflow {} is paused, not starting new stages", workflow_id);
        return Ok(());
    }

    // Get the workflow definition using the workflow state's definition name
    let workflow_definition = {
        let definitions = workflow_definitions.lock().await;
        definitions.get(&workflow_state.workflow_definition_name)
            .cloned()
            .ok_or_else(|| AppError::JobError(format!("Workflow definition not found: {}", workflow_state.workflow_definition_name)))?
    };

    // Find all stages that can be executed in parallel using abstract definitions
    let next_stages = stage_scheduler::find_next_abstract_stages_to_execute_internal(&workflow_state, &workflow_definition).await;

    if next_stages.is_empty() {
        // Check if all stages are completed - will be handled by calling function
        debug!("No stages ready to execute for workflow: {}", workflow_id);
    } else {
        // Check concurrency limits before starting all stages
        let max_concurrent = stage_scheduler::get_max_concurrent_stages_internal().await;
        let currently_running = stage_scheduler::count_running_jobs_in_workflow_internal(
            workflows,
            workflow_id
        ).await;
        let available_slots = max_concurrent.saturating_sub(currently_running);

        if available_slots == 0 {
            debug!("Cannot start more stages for workflow {} - concurrency limit reached ({} running)", workflow_id, currently_running);
            return Ok(());
        }

        // Start eligible stages up to the concurrency limit
        let stages_to_start = next_stages.into_iter().take(available_slots);
        for stage_def in stages_to_start {
            info!("Starting abstract stage: {} for workflow: {}", stage_def.stage_name, workflow_id);
            if let Err(e) = create_abstract_stage_job_internal(
                workflows,
                app_handle,
                &workflow_state, 
                stage_def, 
                &workflow_definition
            ).await {
                error!("Failed to create abstract stage job for {}: {}", stage_def.stage_name, e);
                // Continue with other stages even if one fails to create
            }
        }
    }

    Ok(())
}

/// Create and queue a job for a specific workflow stage using abstract workflow definitions
/// This is the canonical method for creating stage jobs without holding workflow lock
async fn create_abstract_stage_job_internal(
    workflows: &Mutex<HashMap<String, WorkflowState>>,
    app_handle: &AppHandle,
    workflow_state: &WorkflowState,
    stage_definition: &WorkflowStageDefinition,
    workflow_definition: &WorkflowDefinition,
) -> AppResult<String> {
    let mut workflows_guard = workflows.lock().await;
    create_abstract_stage_job_with_lock(&mut workflows_guard, app_handle, workflow_state, stage_definition, workflow_definition).await
}

/// Get model configuration for a stage definition
async fn get_stage_model_config_for_definition(
    app_handle: &AppHandle,
    stage_definition: &WorkflowStageDefinition,
    project_directory: &str,
) -> AppResult<Option<(String, f32, u32)>> {
    // Get settings repository from app state
    let settings_repo = app_handle.state::<Arc<crate::db_utils::settings_repository::SettingsRepository>>().inner().clone();
    
    // Use the refactored function from workflow_utils that takes TaskType directly
    super::workflow_utils::get_stage_model_config(
        app_handle,
        stage_definition.task_type,
        project_directory,
        &settings_repo
    ).await
}

/// Emit workflow status event to frontend (helper function)
async fn emit_workflow_status_event_internal(app_handle: &AppHandle, workflow_state: &WorkflowState, message: &str) {
    event_emitter::emit_workflow_status_event_internal(app_handle, workflow_state, message).await;
}