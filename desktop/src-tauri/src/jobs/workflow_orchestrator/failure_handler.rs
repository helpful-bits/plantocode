use log::{debug, error, info, warn};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::jobs::workflow_error_handler::WorkflowErrorHandler;
use crate::jobs::workflow_orchestrator;
use crate::jobs::workflow_types::{WorkflowState, WorkflowStatus};

/// Handle failure of a stage (internal function)
pub(super) async fn handle_stage_failure_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    workflow_error_handler: &Arc<WorkflowErrorHandler>,
    app_handle: &AppHandle,
    workflow_id: &str,
    job_id: &str,
    error_message: Option<String>,
) -> AppResult<()> {
    warn!(
        "Handling stage failure for job: {} - {:?}",
        job_id, error_message
    );

    // Find the stage that failed
    let workflow_state = {
        let workflows_guard = workflows.lock().await;
        workflows_guard
            .get(workflow_id)
            .cloned()
            .ok_or_else(|| AppError::JobError(format!("Workflow {} not found", workflow_id)))?
    };

    let stage_job = workflow_state.get_stage_job(job_id).ok_or_else(|| {
        AppError::JobError(format!(
            "Stage job {} not found in workflow {}",
            job_id, workflow_id
        ))
    })?;

    let error_msg =
        error_message.unwrap_or_else(|| "Stage failed without error message".to_string());

    // Convert stage name to WorkflowStage enum
    let workflow_stage =
        crate::jobs::workflow_types::WorkflowStage::from_display_name(&stage_job.name)
            .ok_or_else(|| AppError::JobError(format!("Unknown stage name: {}", stage_job.name)))?;

    // Delegate error handling to the WorkflowErrorHandler
    match workflow_error_handler
        .handle_stage_failure(workflow_id, job_id, workflow_stage, &error_msg)
        .await
    {
        Ok(response) => {
            info!("Error handler response: {}", response.next_action);

            // Properly propagate WorkflowErrorResponse to WorkflowState
            let mut workflows_guard = workflows.lock().await;
            if let Some(workflow) = workflows_guard.get_mut(workflow_id) {
                // Update workflow based on error response
                match response.should_continue {
                    true => {
                        // Workflow should continue - update with recovery information
                        if response.recovery_attempted {
                            // Add recovery information to workflow metadata or logs
                            info!(
                                "Recovery attempted for workflow {}: {}",
                                workflow_id, response.next_action
                            );

                            // If a retry job was created, update the stage job mapping
                            if let Some(retry_job_id) = &response.retry_job_id {
                                debug!(
                                    "New retry job {} created for failed job {} in workflow {}",
                                    retry_job_id, job_id, workflow_id
                                );

                                // The WorkflowErrorHandler has already created the retry job,
                                // and it will be added to the workflow state when it starts
                            }
                        }

                        // For skip strategy, we might need to advance to next stage
                        if response.next_action.contains("Skip") {
                            let stage_job_clone = workflow.get_stage_job(job_id).cloned();
                            // Mark the current stage as completed with a note
                            workflow.update_stage_job(
                                job_id,
                                crate::models::JobStatus::Canceled,
                                Some(format!(
                                    "Skipped due to error recovery: {}",
                                    response.next_action
                                )),
                            );

                            // Try to start next stage immediately
                            drop(workflows_guard); // Release lock before async call

                            // Emit stage event for the skipped stage
                            if let Some(stage_job) = stage_job_clone {
                                super::event_emitter::emit_workflow_stage_event_internal(
                                    app_handle,
                                    workflow_id,
                                    &stage_job,
                                    &crate::models::JobStatus::Canceled,
                                    Some(format!(
                                        "Skipped due to error recovery: {}",
                                        response.next_action
                                    )),
                                )
                                .await;
                            }

                            let orchestrator = app_handle
                                .state::<Arc<workflow_orchestrator::WorkflowOrchestrator>>();
                            if let Err(e) =
                                orchestrator.start_next_abstract_stages(workflow_id).await
                            {
                                error!("Failed to start next stages after skip recovery: {}", e);
                            }
                            return Ok(());
                        }
                    }
                    false => {
                        // Workflow should not continue - mark as failed if not already
                        if workflow.status != WorkflowStatus::Failed {
                            let failure_reason =
                                format!("Error handling decision: {}", response.next_action);
                            workflow.status = WorkflowStatus::Failed;
                            workflow.error_message = Some(failure_reason.clone());
                            workflow.completed_at = Some(chrono::Utc::now().timestamp_millis());
                            workflow.updated_at = workflow.completed_at.unwrap();

                            error!(
                                "Workflow {} marked as failed due to error handling: {}",
                                workflow_id, failure_reason
                            );

                            // Emit workflow failure event
                            drop(workflows_guard); // Release lock before async call
                            super::event_emitter::emit_workflow_status_event_internal(
                                app_handle,
                                &workflow_state,
                                &format!("Workflow failed: {}", failure_reason),
                            )
                            .await;
                            return Ok(());
                        }
                    }
                }

                // Update workflow state with error handling metadata
                workflow.updated_at = chrono::Utc::now().timestamp_millis();
            } else {
                warn!(
                    "Workflow {} not found when trying to update error response",
                    workflow_id
                );
            }
        }
        Err(e) => {
            // If error handling itself fails, fall back to marking workflow as failed
            error!("Error handler failed for workflow {}: {}", workflow_id, e);

            // Update workflow state to reflect error handler failure
            let mut workflows_guard = workflows.lock().await;
            if let Some(workflow) = workflows_guard.get_mut(workflow_id) {
                let failure_reason = format!("Error handler failed: {}", e);
                workflow.status = WorkflowStatus::Failed;
                workflow.error_message = Some(failure_reason.clone());
                workflow.completed_at = Some(chrono::Utc::now().timestamp_millis());
                workflow.updated_at = workflow.completed_at.unwrap();

                // Emit workflow failure event
                let workflow_clone = workflow.clone();
                drop(workflows_guard); // Release lock before async call
                super::event_emitter::emit_workflow_status_event_internal(
                    app_handle,
                    &workflow_clone,
                    &format!("Workflow failed: {}", failure_reason),
                )
                .await;
            } else {
                // Fallback to mark workflow failed directly
                super::state_updater::mark_workflow_failed_internal(
                    workflows,
                    workflow_id,
                    &format!("Error handler failed: {}", e),
                )
                .await?;
            }
        }
    }

    Ok(())
}
