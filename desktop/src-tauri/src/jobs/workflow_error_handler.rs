use std::sync::Arc;
use log::{info, warn, error};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::utils::error_utils::log_workflow_error;
use crate::jobs::queue::get_job_queue;
use crate::jobs::workflow_types::{
    WorkflowStage, ErrorRecoveryConfig, RecoveryStrategy, WorkflowErrorResponse
};
use crate::jobs::workflow_orchestrator::get_workflow_orchestrator;

/// Service responsible for managing errors that occur within a workflow
pub struct WorkflowErrorHandler {
    background_job_repository: Arc<BackgroundJobRepository>,
    error_recovery_config: ErrorRecoveryConfig,
    app_handle: AppHandle,
}

impl WorkflowErrorHandler {
    /// Create a new WorkflowErrorHandler
    pub fn new(
        background_job_repository: Arc<BackgroundJobRepository>, 
        app_handle: AppHandle
    ) -> Self {
        Self {
            background_job_repository,
            error_recovery_config: ErrorRecoveryConfig::default(),
            app_handle,
        }
    }

    /// Create a new WorkflowErrorHandler with custom error recovery configuration
    pub fn new_with_config(
        background_job_repository: Arc<BackgroundJobRepository>,
        error_recovery_config: ErrorRecoveryConfig,
        app_handle: AppHandle,
    ) -> Self {
        Self {
            background_job_repository,
            error_recovery_config,
            app_handle,
        }
    }

    /// Handle a stage failure within a workflow
    pub async fn handle_stage_failure(
        &self,
        workflow_id: &str,
        failed_job_id: &str,
        stage: WorkflowStage,
        error: &str,
    ) -> AppResult<WorkflowErrorResponse> {
        info!("Handling stage failure for workflow {}, job {}, stage {:?}: {}", 
              workflow_id, failed_job_id, stage, error);

        // Create comprehensive error message with workflow context
        let stage_display_name = stage.display_name();
        let comprehensive_error = format!(
            "Workflow stage '{}' failed in workflow '{}' (job: {}): {}",
            stage_display_name, workflow_id, failed_job_id, error
        );

        // Log the error with workflow context
        let app_error = AppError::JobError(comprehensive_error.clone());
        log_workflow_error(
            &app_error,
            "Stage failure",
            Some(workflow_id),
            Some(&format!("{:?}", stage)),
            Some(failed_job_id)
        );

        // Get the recovery strategy for this stage
        let stage_name = format!("{:?}", stage);
        let strategy = self.error_recovery_config.strategy_map
            .get(&stage_name)
            .cloned()
            .unwrap_or_else(|| self.error_recovery_config.default_strategy.clone());

        // Log recovery strategy choice
        info!("Using recovery strategy {:?} for stage {:?} in workflow {}", 
              strategy, stage, workflow_id);

        // Implement the recovery strategy
        match strategy {
            RecoveryStrategy::RetryStage { max_attempts, delay_ms } => {
                self.handle_retry_strategy(
                    workflow_id, 
                    failed_job_id, 
                    stage, 
                    max_attempts, 
                    delay_ms,
                    &comprehensive_error
                ).await
            }
            RecoveryStrategy::RetrySpecificStage { job_id, stage_name, task_type, attempt_count } => {
                // Convert task_type to WorkflowStage for the retry
                let retry_stage = crate::jobs::workflow_types::WorkflowStage::from_task_type(&task_type)
                    .ok_or_else(|| AppError::JobError(format!("Cannot determine workflow stage from task type: {:?}", task_type)))?;
                self.handle_specific_stage_retry(
                    workflow_id,
                    &job_id,
                    retry_stage,
                    attempt_count,
                    &comprehensive_error
                ).await
            }
            RecoveryStrategy::AbortWorkflow => {
                self.handle_abort_strategy(workflow_id, &comprehensive_error).await
            }
            RecoveryStrategy::SkipStage => {
                self.handle_skip_strategy(workflow_id, stage, &comprehensive_error).await
            }
        }
    }

    /// Handle retry strategy for a failed stage
    async fn handle_retry_strategy(
        &self,
        workflow_id: &str,
        failed_job_id: &str,
        stage: WorkflowStage,
        max_attempts: u32,
        delay_ms: u64,
        comprehensive_error: &str,
    ) -> AppResult<WorkflowErrorResponse> {
        // Get current retry count for the job
        let queue = get_job_queue().await?;
        let current_retry_count = queue.get_retry_count(failed_job_id)?;

        if current_retry_count >= max_attempts {
            warn!("Job {} has reached max retry attempts ({}), aborting workflow {}", 
                  failed_job_id, max_attempts, workflow_id);
            let abort_message = format!("Max retry attempts ({}) exceeded for stage '{}'. Original error: {}", 
                                      max_attempts, stage.display_name(), comprehensive_error);
            return self.handle_abort_strategy(workflow_id, &abort_message).await;
        }

        // Increment retry count
        let new_retry_count = queue.increment_retry_count(failed_job_id)?;
        info!("Retrying stage {:?} for workflow {}, attempt {} of {}", 
              stage, workflow_id, new_retry_count, max_attempts);

        // Delegate to the WorkflowOrchestrator's retry mechanism
        let orchestrator = get_workflow_orchestrator().await?;
        
        // Use the orchestrator's centralized retry functionality with delay and retry count
        match orchestrator.retry_workflow_stage_with_config(
            workflow_id, 
            stage.clone(), 
            failed_job_id,
            Some(delay_ms),
            Some(new_retry_count),
        ).await {
            Ok(retry_job_id) => {
                // If delay is specified, log it (actual delay would need queue support)
                if delay_ms > 0 {
                    info!("Would delay retry job {} by {}ms (delay not yet implemented in queue)", retry_job_id, delay_ms);
                }

                Ok(WorkflowErrorResponse {
                    error_handled: true,
                    recovery_attempted: true,
                    next_action: format!("Retrying stage '{}' with job {} (attempt {} of {}). Original error: {}", 
                                       stage.display_name(), retry_job_id, new_retry_count, max_attempts, comprehensive_error),
                    should_continue: true,
                    retry_job_id: Some(retry_job_id),
                })
            }
            Err(e) => {
                error!("Failed to retry stage {:?} for workflow {}: {}", stage, workflow_id, e);
                let abort_message = format!("Failed to retry stage '{}': {}. Original error: {}", 
                                          stage.display_name(), e, comprehensive_error);
                self.handle_abort_strategy(workflow_id, &abort_message).await
            }
        }
    }

    /// Handle abort strategy for a workflow
    async fn handle_abort_strategy(
        &self,
        workflow_id: &str,
        error: &str,
    ) -> AppResult<WorkflowErrorResponse> {
        warn!("Aborting workflow {} due to: {}", workflow_id, error);

        // Get the workflow orchestrator to mark the workflow as failed with comprehensive error message
        let orchestrator = get_workflow_orchestrator().await?;
        if let Err(e) = orchestrator.mark_workflow_failed(workflow_id, error).await {
            error!("Failed to mark workflow {} as failed: {}", workflow_id, e);
        }

        Ok(WorkflowErrorResponse {
            error_handled: true,
            recovery_attempted: false,
            next_action: format!("Workflow '{}' has been aborted. Reason: {}", workflow_id, error),
            should_continue: false,
            retry_job_id: None,
        })
    }

    /// Handle skip strategy for a stage
    async fn handle_skip_strategy(
        &self,
        workflow_id: &str,
        stage: WorkflowStage,
        comprehensive_error: &str,
    ) -> AppResult<WorkflowErrorResponse> {
        warn!("Skipping stage {:?} for workflow {}", stage, workflow_id);

        // Get the workflow orchestrator to progress to the next stage
        let orchestrator = get_workflow_orchestrator().await?;
        
        // Try to start the next stage if there is one
        if let Some(_next_stage) = stage.next_stage() {
            // This would require exposing a method to start a specific stage
            // For now, we'll just log that we would skip to the next stage
            info!("Would skip to next stage");
        } else {
            // If this was the last stage, mark workflow as completed
            if let Err(e) = orchestrator.mark_workflow_completed(workflow_id).await {
                error!("Failed to mark workflow {} as completed after skipping last stage: {}", workflow_id, e);
            }
        }

        Ok(WorkflowErrorResponse {
            error_handled: true,
            recovery_attempted: true,
            next_action: format!("Skipped stage '{}' and continuing with workflow. Original error: {}", 
                               stage.display_name(), comprehensive_error),
            should_continue: true,
            retry_job_id: None,
        })
    }


    /// Retry a specific failed stage within a workflow
    pub async fn retry_failed_stage(
        &self,
        workflow_id: &str,
        failed_stage_job_id: &str,
    ) -> AppResult<String> {
        info!("Retrying failed stage for workflow {}, job {}", workflow_id, failed_stage_job_id);

        // Get the workflow orchestrator to access workflow state
        let orchestrator = get_workflow_orchestrator().await?;
        let workflow_state = orchestrator.get_workflow_status(workflow_id).await?;
        
        // Find the failed job in the workflow
        let stage_job = workflow_state.get_stage_job(failed_stage_job_id)
            .ok_or_else(|| AppError::JobError(format!("Job {} not found in workflow {}", failed_stage_job_id, workflow_id)))?;
        
        // Verify the job is indeed failed
        if stage_job.status != crate::models::JobStatus::Failed {
            return Err(AppError::JobError(format!("Job {} is not in failed state, current status: {:?}", failed_stage_job_id, stage_job.status)));
        }

        // Use the workflow orchestrator to retry this specific stage
        let stage = WorkflowStage::from_task_type(&stage_job.task_type)
            .ok_or_else(|| AppError::JobError(format!("Cannot determine workflow stage from task type: {:?}", stage_job.task_type)))?;
        orchestrator.retry_workflow_stage(workflow_id, stage, failed_stage_job_id).await
    }

    /// Handle specific stage retry strategy
    async fn handle_specific_stage_retry(
        &self,
        workflow_id: &str,
        failed_job_id: &str,
        stage: WorkflowStage,
        attempt_count: u32,
        comprehensive_error: &str,
    ) -> AppResult<WorkflowErrorResponse> {
        info!("Handling specific stage retry for workflow {}, job {}, stage {:?}, attempt {}", 
              workflow_id, failed_job_id, stage, attempt_count);

        // Get the workflow orchestrator to recreate the stage job
        let orchestrator = get_workflow_orchestrator().await?;
        
        // Use the workflow orchestrator's retry functionality
        match orchestrator.retry_workflow_stage(workflow_id, stage.clone(), failed_job_id).await {
            Ok(new_job_id) => {
                Ok(WorkflowErrorResponse {
                    error_handled: true,
                    recovery_attempted: true,
                    next_action: format!("Retrying specific stage '{}' with new job {} (attempt {}). Original error: {}", 
                                       stage.display_name(), new_job_id, attempt_count, comprehensive_error),
                    should_continue: true,
                    retry_job_id: Some(new_job_id),
                })
            }
            Err(e) => {
                error!("Failed to retry specific stage {:?} for workflow {}: {}", stage, workflow_id, e);
                let abort_message = format!("Failed to retry stage '{}': {}. Original error: {}", 
                                          stage.display_name(), e, comprehensive_error);
                self.handle_abort_strategy(workflow_id, &abort_message).await
            }
        }
    }

}