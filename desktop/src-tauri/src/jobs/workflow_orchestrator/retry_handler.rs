use log::info;
use crate::error::{AppError, AppResult};
use crate::jobs::workflow_types::{WorkflowStage, WorkflowState, WorkflowDefinition};
use crate::utils::job_creation_utils;
use crate::models::{JobStatus, TaskType};
use crate::jobs::types::JobPayload;
use std::collections::{HashSet, VecDeque};

/// Retry a specific workflow stage
pub(super) async fn retry_workflow_stage_internal(
    workflows: &tokio::sync::Mutex<std::collections::HashMap<String, WorkflowState>>,
    workflow_definitions: &tokio::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<WorkflowDefinition>>>,
    app_handle: &tauri::AppHandle,
    workflow_id: &str,
    stage_to_retry: WorkflowStage,
    original_failed_job_id: &str,
) -> AppResult<String> {
    retry_workflow_stage_with_config_internal(
        workflows,
        workflow_definitions,
        app_handle,
        workflow_id,
        stage_to_retry,
        original_failed_job_id,
        None, // No delay by default
        None, // No retry count override by default
    ).await
}

/// Retry a specific workflow stage with configurable delay and retry count
pub(super) async fn retry_workflow_stage_with_config_internal(
    workflows: &tokio::sync::Mutex<std::collections::HashMap<String, WorkflowState>>,
    workflow_definitions: &tokio::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<WorkflowDefinition>>>,
    app_handle: &tauri::AppHandle,
    workflow_id: &str,
    stage_to_retry: WorkflowStage,
    original_failed_job_id: &str,
    delay_ms: Option<u64>,
    retry_attempt: Option<u32>,
) -> AppResult<String> {
    info!("Retrying workflow stage {:?} for workflow {}, original job {}",
              stage_to_retry, workflow_id, original_failed_job_id);

    let workflow_state = {
        let workflows = workflows.lock().await;
        workflows.get(workflow_id)
            .cloned()
            .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))?
    };

    // Get workflow definition for dependency traversal
    let workflow_definition = {
        let definitions = workflow_definitions.lock().await;
        definitions.get("FileFinderWorkflow")
            .ok_or_else(|| AppError::JobError("FileFinderWorkflow definition not found".to_string()))?
            .clone()
    };

    // Reset subsequent stages if necessary
    reset_subsequent_stages_internal(workflows, &workflow_state, &stage_to_retry, &workflow_definition).await?;

    // Convert the WorkflowStage to TaskType to find the corresponding stage definition
    let task_type = super::stage_scheduler::stage_to_task_type_internal(&stage_to_retry);
    
    // Find the stage definition for the retry stage
    let stage_definition = workflow_definition.stages.iter()
        .find(|stage_def| stage_def.task_type == task_type)
        .ok_or_else(|| AppError::JobError(format!(
            "Stage definition not found for retry stage {:?} (task type: {:?})", 
            stage_to_retry, task_type
        )))?;

    // Create retry job using stage job manager approach
    // Get data from the stage before the failed one for payload creation
    let stage_payload = super::payload_builder::create_abstract_stage_payload(app_handle, &workflow_state, stage_definition, &workflow_definition).await?;

    // Get model configuration for the stage
    let model_settings = super::stage_scheduler::get_stage_model_config_internal(&stage_to_retry, &workflow_state.project_directory, app_handle).await?;

    // Determine API type based on whether the task requires LLM
    let api_type_str = if model_settings.is_some() {
        "openrouter"
    } else {
        "filesystem"
    };

    let retry_count = retry_attempt.unwrap_or(1);
    
    let new_job_id = if let Some(delay) = delay_ms {
        // If delay is specified, create job with delay
        job_creation_utils::create_and_queue_background_job_with_delay(
            &workflow_state.session_id,
            &workflow_state.project_directory,
            api_type_str,
            task_type,
            &format!("{}_RETRY_{}", stage_to_retry.display_name().to_uppercase().replace(" ", "_"), retry_count),
            &workflow_state.task_description,
            model_settings,
            stage_payload,
            10, // High priority for workflow jobs
            Some(workflow_id.to_string()), // workflow_id
            Some(stage_to_retry.display_name().to_string()), // workflow_stage
            Some(serde_json::json!({
                "workflowId": workflow_id,
                "workflowStage": stage_to_retry,
                "stageName": stage_to_retry.display_name(),
                "isRetry": true,
                "retryAttempt": retry_count,
                "originalJobId": original_failed_job_id
            })),
            delay,
            app_handle,
        ).await?
    } else {
        // No delay, use regular job creation
        job_creation_utils::create_and_queue_background_job(
            &workflow_state.session_id,
            &workflow_state.project_directory,
            api_type_str,
            task_type,
            &format!("{}_RETRY_{}", stage_to_retry.display_name().to_uppercase().replace(" ", "_"), retry_count),
            &workflow_state.task_description,
            model_settings,
            stage_payload,
            10, // High priority for workflow jobs
            Some(workflow_id.to_string()), // workflow_id
            Some(stage_to_retry.display_name().to_string()), // workflow_stage
            Some(serde_json::json!({
                "workflowId": workflow_id,
                "workflowStage": stage_to_retry,
                "stageName": stage_to_retry.display_name(),
                "isRetry": true,
                "retryAttempt": retry_count,
                "originalJobId": original_failed_job_id
            })),
            app_handle,
        ).await?
    };

    // Update the workflow state to replace the failed job with the new one
    {
        let mut workflows = workflows.lock().await;
        if let Some(workflow) = workflows.get_mut(workflow_id) {
            // Mark the original job as superseded/retried
            workflow.update_stage_job(original_failed_job_id, crate::models::JobStatus::Canceled, Some("Superseded by retry".to_string()));

            // Add the new retry job
            let depends_on = stage_to_retry.previous_stage()
                .and_then(|prev_stage| workflow.get_stage_job_by_name(&prev_stage.display_name()))
                .map(|job| job.job_id.clone());

            workflow.add_stage_job(stage_to_retry.display_name().to_string(), task_type, new_job_id.clone(), depends_on);

            info!("Added retry job {} for stage {:?} in workflow {}", new_job_id, stage_to_retry, workflow_id);
        }
    }

    Ok(new_job_id)
}

/// Reset subsequent stages that might need to be re-executed after a retry (internal helper)
pub(super) async fn reset_subsequent_stages_internal(
    workflows: &tokio::sync::Mutex<std::collections::HashMap<String, WorkflowState>>,
    workflow_state: &WorkflowState,
    retry_stage: &WorkflowStage,
    workflow_definition: &WorkflowDefinition
) -> AppResult<()> {
    // Convert retry stage to task type to find the corresponding stage definition
    let retry_task_type = stage_to_task_type_for_retry(retry_stage);
    
    // Find the stage definition for the retry stage
    let retry_stage_def = workflow_definition.stages.iter()
        .find(|stage_def| stage_def.task_type == retry_task_type)
        .ok_or_else(|| AppError::JobError(format!(
            "Stage definition not found for retry stage {:?} (task type: {:?})", 
            retry_stage, retry_task_type
        )))?;
    
    // Find all subsequent stages using dependency graph traversal
    let subsequent_stage_names = find_subsequent_stages_in_definition(
        workflow_definition, 
        &retry_stage_def.stage_name
    );
    
    // Convert stage names back to task types for job matching
    let subsequent_task_types: Vec<TaskType> = subsequent_stage_names.iter()
        .filter_map(|stage_name| {
            workflow_definition.stages.iter()
                .find(|stage_def| &stage_def.stage_name == stage_name)
                .map(|stage_def| stage_def.task_type)
        })
        .collect();
    
    let mut workflows_guard = workflows.lock().await;
    if let Some(workflow) = workflows_guard.get_mut(&workflow_state.workflow_id) {
        for task_type in subsequent_task_types {
            // Find corresponding WorkflowStage for this task type
            if let Some(workflow_stage) = task_type_to_workflow_stage(task_type) {
                if let Some(stage_job) = workflow.stage_jobs.iter_mut().find(|job| job.stage_name == workflow_stage.to_string()) {
                    if matches!(stage_job.status, JobStatus::Queued | JobStatus::Running) {
                        stage_job.status = JobStatus::Canceled;
                        stage_job.error_message = Some("Cancelled due to retry of earlier stage".to_string());
                        info!("Cancelled stage job {} for stage {:?} due to retry", stage_job.job_id, workflow_stage);
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Find all stages that depend (directly or indirectly) on the given stage in a workflow definition
fn find_subsequent_stages_in_definition(
    workflow_definition: &WorkflowDefinition,
    start_stage_name: &str
) -> Vec<String> {
    let mut subsequent_stages = Vec::new();
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    
    // Start with direct dependents of the retry stage
    let direct_dependents = workflow_definition.get_dependent_stages(start_stage_name);
    for dependent in direct_dependents {
        queue.push_back(dependent.stage_name.clone());
    }
    
    // BFS to find all transitively dependent stages
    while let Some(current_stage_name) = queue.pop_front() {
        if visited.contains(&current_stage_name) {
            continue;
        }
        
        visited.insert(current_stage_name.clone());
        subsequent_stages.push(current_stage_name.clone());
        
        // Add dependents of this stage to the queue
        let dependents = workflow_definition.get_dependent_stages(&current_stage_name);
        for dependent in dependents {
            if !visited.contains(&dependent.stage_name) {
                queue.push_back(dependent.stage_name.clone());
            }
        }
    }
    
    subsequent_stages
}

/// Convert WorkflowStage to TaskType for stage definition lookup
fn stage_to_task_type_for_retry(stage: &WorkflowStage) -> TaskType {
    match stage {
        WorkflowStage::RegexPatternGeneration => TaskType::RegexPatternGeneration,
        WorkflowStage::LocalFileFiltering => TaskType::LocalFileFiltering,
        WorkflowStage::FileRelevanceAssessment => TaskType::FileRelevanceAssessment,
        WorkflowStage::ExtendedPathFinder => TaskType::ExtendedPathFinder,
        WorkflowStage::ExtendedPathCorrection => TaskType::ExtendedPathCorrection,
    }
}

/// Convert TaskType back to WorkflowStage for job matching
fn task_type_to_workflow_stage(task_type: TaskType) -> Option<WorkflowStage> {
    match task_type {
        TaskType::RegexPatternGeneration => Some(WorkflowStage::RegexPatternGeneration),
        TaskType::LocalFileFiltering => Some(WorkflowStage::LocalFileFiltering),
        TaskType::FileRelevanceAssessment => Some(WorkflowStage::FileRelevanceAssessment),
        TaskType::ExtendedPathFinder => Some(WorkflowStage::ExtendedPathFinder),
        TaskType::ExtendedPathCorrection => Some(WorkflowStage::ExtendedPathCorrection),
        _ => None, // Other task types don't correspond to workflow stages
    }
}

