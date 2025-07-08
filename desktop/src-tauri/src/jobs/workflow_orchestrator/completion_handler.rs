use std::sync::Arc;
use log::{debug, error, info, warn};
use crate::error::{AppError, AppResult};
use crate::jobs::workflow_orchestrator::data_extraction;
use crate::jobs::workflow_types::{WorkflowState, WorkflowStage, WorkflowDefinition};
use crate::models::TaskType;

/// Handle successful completion of a stage
pub(super) async fn handle_stage_completion_internal(
    workflows: &tokio::sync::Mutex<std::collections::HashMap<String, WorkflowState>>,
    orchestrator: &super::WorkflowOrchestrator,
    workflow_id: &str,
    job_id: &str,
    job_result_data: Option<crate::jobs::types::JobResultData>,
    store_stage_data_fn: impl Fn(&str, serde_json::Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = crate::error::AppResult<()>> + Send>>
) -> AppResult<()> {
    info!("Handling stage completion for job: {}", job_id);

    // Get the workflow definition and current state
    let (workflow_definition, workflow_state_for_dependency_check) = {
        let workflows_guard = workflows.lock().await;
        let workflow_state = workflows_guard.get(workflow_id)
            .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))?;

        // Find the workflow definition being used
        let workflow_definitions = orchestrator.get_workflow_definitions().await
            .map_err(|e| AppError::JobError(format!("Failed to get workflow definitions: {}", e)))?;
        let workflow_definition = workflow_definitions.get(&workflow_state.workflow_definition_name)
            .cloned() // Clone the Arc<WorkflowDefinition>
            .ok_or_else(|| AppError::JobError(format!("Workflow definition '{}' not found for workflow {}", workflow_state.workflow_definition_name, workflow_id)))?;

        (workflow_definition, workflow_state.clone())
    };

    // Extract and store stage data from the completed job
    // If data extraction fails, explicitly fail the stage
    if let Err(e) = data_extraction::extract_and_store_stage_data_internal(
        &orchestrator.app_handle,
        job_id,
        &workflow_state_for_dependency_check,
        job_result_data,
        store_stage_data_fn
    ).await {
        warn!("Stage data extraction failed for job {}: {} - failing the stage", job_id, e);
        
        // Explicitly fail the stage
        orchestrator.handle_stage_failure(&workflow_id, job_id, Some(e.to_string())).await?;
        return Err(AppError::JobError(format!("Stage data extraction failed for stage {}: {}", job_id, e)));
    }
    
    debug!("Successfully extracted and stored stage data from job {}", job_id);

    // Log current workflow state for debugging
    debug!("Checking workflow completion for workflow {} after stage completion", workflow_id);

    // Re-fetch workflow state after data extraction to get updated intermediate_data
    let workflow_state_for_payload_building = {
        let workflows_guard = workflows.lock().await;
        workflows_guard.get(workflow_id)
            .ok_or_else(|| AppError::JobError(format!("Workflow not found after data extraction: {}", workflow_id)))?
            .clone()
    };
    // Lock is released here

    // Get the TaskType of the job that just finished
    let task_type = workflow_state_for_payload_building.stages.iter()
        .find(|stage_job| stage_job.job_id == job_id)
        .map(|stage_job| stage_job.task_type.clone())
        .ok_or_else(|| AppError::JobError(format!("Stage job not found for job_id: {}", job_id)))?;

    if task_type == TaskType::FileRelevanceAssessment {
        let token_count = workflow_state_for_payload_building.intermediate_data.ai_filtered_files_token_count;
        if token_count.unwrap_or(0) >= 120_000 {
            info!("Extended path finding stages are being skipped due to large file context size ({} tokens)", token_count.unwrap_or(0));
            let mut workflows_guard = workflows.lock().await;
            if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
                workflow_state.intermediate_data.extended_verified_paths = workflow_state.intermediate_data.ai_filtered_files.clone();
            }
            drop(workflows_guard);
            orchestrator.mark_workflow_completed(workflow_id).await?;
            return Ok(());
        }
    }


    // Find next stages that can be executed based on the workflow definition (use updated state after data extraction)
    let next_stages = super::stage_scheduler::find_next_abstract_stages_to_execute_internal(&workflow_state_for_payload_building, &workflow_definition).await;

    debug!("Found {} next stages to execute for workflow {}", next_stages.len(), workflow_id);
    for stage in &next_stages {
        debug!("Next stage eligible: {} (task_type: {:?})", stage.stage_name, stage.task_type);
    }

    if next_stages.is_empty() {
        // Check if workflow should stop due to cancellation or failure
        if workflow_state_for_payload_building.should_stop() {
            if workflow_state_for_payload_building.has_cancelled() {
                orchestrator.mark_workflow_failed(workflow_id, "Workflow stopped due to user cancellation").await?;
                info!("Workflow {} stopped due to cancellation", workflow_id);
            } else if workflow_state_for_payload_building.has_failed() {
                orchestrator.mark_workflow_failed(workflow_id, "Workflow stopped due to stage failure").await?;
                info!("Workflow {} stopped due to failure", workflow_id);
            }
        } else {
            // Check if workflow is complete
            let is_complete = super::workflow_utils::is_workflow_complete(&workflow_state_for_payload_building, &workflow_definition);
            debug!("Workflow {} completion check: {}", workflow_id, is_complete);
            
            if is_complete {
                orchestrator.mark_workflow_completed(workflow_id).await?;
                info!("Workflow {} completed successfully", workflow_id);
            } else {
                debug!("Workflow {} not complete - checking individual stage status", workflow_id);
                for stage_job in &workflow_state_for_payload_building.stages {
                    debug!("Stage {:?} ({}): status={:?}", stage_job.task_type, stage_job.job_id, stage_job.status);
                }
                
                // If workflow is stalled (no stages can progress and workflow isn't complete), explicitly fail it
                orchestrator.mark_workflow_failed(workflow_id, "Workflow stalled: no new stages can be started, but workflow is not complete.").await?;
            }
        }
    } else {
        // Check concurrency limits before starting new stages
        let max_concurrent = super::stage_scheduler::get_max_concurrent_stages_internal().await;
        let currently_running = super::stage_scheduler::count_running_jobs_in_workflow_internal(
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
            info!("Starting next stage: {} for workflow: {}", stage_def.stage_name, workflow_id);
            if let Err(e) = orchestrator.create_abstract_stage_job(&workflow_state_for_payload_building, stage_def, &workflow_definition).await {
                error!("Failed to create next stage job for {}: {}", stage_def.stage_name, e);
            }
        }
    }

    Ok(())
}

