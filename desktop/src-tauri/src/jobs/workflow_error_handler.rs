use std::sync::Arc;
use log::{info, warn, error};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::utils::error_utils::log_workflow_error;
use crate::jobs::queue::{get_job_queue, JobPriority};
use crate::jobs::workflow_types::{
    WorkflowStage, ErrorRecoveryConfig, RecoveryStrategy, WorkflowErrorResponse
};
use crate::jobs::workflow_orchestrator::get_workflow_orchestrator;
use crate::utils::job_creation_utils;
use crate::models::TaskType;

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
            RecoveryStrategy::RetrySpecificStage { job_id, stage: retry_stage, attempt_count } => {
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

        // Get the workflow orchestrator to recreate the stage job
        let orchestrator = get_workflow_orchestrator().await?;
        let workflow_state = orchestrator.get_workflow_status(workflow_id).await?;
        
        // Create a new retry job for this stage
        let task_type = self.stage_to_task_type(&stage);
        let stage_payload = self.create_stage_payload(&workflow_state, &stage).await?;
        let (model, temperature, max_tokens) = self.get_stage_model_config(&stage, &workflow_state.project_directory).await?;

        // Create the retry job
        let retry_job_id = job_creation_utils::create_and_queue_background_job(
            &workflow_state.session_id,
            &workflow_state.project_directory,
            "workflow_stage_retry",
            task_type,
            &format!("{}_RETRY_{}", stage.display_name().to_uppercase().replace(" ", "_"), new_retry_count),
            &workflow_state.task_description,
            Some((model, temperature, max_tokens)),
            stage_payload,
            10, // High priority for workflow jobs
            Some(serde_json::json!({
                "workflowId": workflow_id,
                "workflowStage": stage,
                "stageName": stage.display_name(),
                "retryAttempt": new_retry_count,
                "originalJobId": failed_job_id
            })),
            &self.app_handle,
        ).await?;

        // If delay is specified, log it (actual delay would need queue support)
        if delay_ms > 0 {
            info!("Would delay retry job {} by {}ms", retry_job_id, delay_ms);
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

    /// Convert workflow stage to TaskType
    fn stage_to_task_type(&self, stage: &WorkflowStage) -> TaskType {
        match stage {
            WorkflowStage::GeneratingDirTree => TaskType::DirectoryTreeGeneration,
            WorkflowStage::GeneratingRegex => TaskType::RegexPatternGeneration,
            WorkflowStage::LocalFiltering => TaskType::LocalFileFiltering,
            WorkflowStage::InitialPathFinder => TaskType::PathFinder,
            WorkflowStage::InitialPathCorrection => TaskType::PathCorrection,
            WorkflowStage::ExtendedPathFinder => TaskType::ExtendedPathFinder,
            WorkflowStage::ExtendedPathCorrection => TaskType::ExtendedPathCorrection,
        }
    }

    /// Create payload for a specific stage (similar to WorkflowOrchestrator)
    async fn create_stage_payload(
        &self, 
        workflow_state: &crate::jobs::workflow_types::WorkflowState, 
        stage: &WorkflowStage
    ) -> AppResult<serde_json::Value> {
        match stage {
            WorkflowStage::GeneratingDirTree => {
                Ok(serde_json::json!({
                    "sessionId": workflow_state.session_id,
                    "taskDescription": workflow_state.task_description,
                    "projectDirectory": workflow_state.project_directory,
                    "excludedPaths": workflow_state.excluded_paths,
                    "workflowId": workflow_state.workflow_id
                }))
            }
            WorkflowStage::GeneratingRegex => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for regex generation".to_string()))?;
                
                Ok(serde_json::json!({
                    "sessionId": workflow_state.session_id,
                    "taskDescription": workflow_state.task_description,
                    "projectDirectory": workflow_state.project_directory,
                    "directoryTree": directory_tree,
                    "workflowId": workflow_state.workflow_id
                }))
            }
            WorkflowStage::LocalFiltering => {
                let regex_patterns = workflow_state.intermediate_data.raw_regex_patterns
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Regex patterns not available for local filtering".to_string()))?;
                
                Ok(serde_json::json!({
                    "sessionId": workflow_state.session_id,
                    "taskDescription": workflow_state.task_description,
                    "projectDirectory": workflow_state.project_directory,
                    "regexPatterns": regex_patterns,
                    "workflowId": workflow_state.workflow_id
                }))
            }
            WorkflowStage::InitialPathFinder => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for path finding".to_string()))?;
                
                Ok(serde_json::json!({
                    "sessionId": workflow_state.session_id,
                    "taskDescription": workflow_state.task_description,
                    "projectDirectory": workflow_state.project_directory,
                    "directoryTree": directory_tree,
                    "includedFiles": workflow_state.intermediate_data.locally_filtered_files,
                    "excludedFiles": workflow_state.excluded_paths,
                    "workflowId": workflow_state.workflow_id
                }))
            }
            WorkflowStage::InitialPathCorrection => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for path correction".to_string()))?;
                
                Ok(serde_json::json!({
                    "sessionId": workflow_state.session_id,
                    "taskDescription": workflow_state.task_description,
                    "projectDirectory": workflow_state.project_directory,
                    "directoryTree": directory_tree,
                    "pathsToCorrect": workflow_state.intermediate_data.initial_unverified_paths,
                    "workflowId": workflow_state.workflow_id
                }))
            }
            WorkflowStage::ExtendedPathFinder => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for extended path finding".to_string()))?;
                
                let mut current_verified = workflow_state.intermediate_data.initial_verified_paths.clone();
                current_verified.extend(workflow_state.intermediate_data.initial_corrected_paths.clone());
                
                Ok(serde_json::json!({
                    "sessionId": workflow_state.session_id,
                    "taskDescription": workflow_state.task_description,
                    "projectDirectory": workflow_state.project_directory,
                    "directoryTree": directory_tree,
                    "currentVerified": current_verified,
                    "excludedFiles": workflow_state.excluded_paths,
                    "workflowId": workflow_state.workflow_id
                }))
            }
            WorkflowStage::ExtendedPathCorrection => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for extended path correction".to_string()))?;
                
                Ok(serde_json::json!({
                    "sessionId": workflow_state.session_id,
                    "taskDescription": workflow_state.task_description,
                    "projectDirectory": workflow_state.project_directory,
                    "directoryTree": directory_tree,
                    "pathsToCorrect": workflow_state.intermediate_data.extended_unverified_paths,
                    "workflowId": workflow_state.workflow_id
                }))
            }
        }
    }

    /// Get model configuration for a specific stage
    async fn get_stage_model_config(&self, stage: &WorkflowStage, project_directory: &str) -> AppResult<(String, f32, u32)> {
        let task_type = self.stage_to_task_type(stage);
        
        let model = crate::config::get_model_for_task_with_project(task_type, project_directory, &self.app_handle)
            .await
            .unwrap_or_else(|_| "file-finder-hybrid".to_string());
        let temperature = crate::config::get_temperature_for_task_with_project(task_type, project_directory, &self.app_handle)
            .await
            .unwrap_or(0.5);
        let max_tokens = crate::config::get_max_tokens_for_task_with_project(task_type, project_directory, &self.app_handle)
            .await
            .unwrap_or(4000);

        Ok((model, temperature, max_tokens))
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
        orchestrator.retry_workflow_stage(workflow_id, stage_job.stage.clone(), failed_stage_job_id).await
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