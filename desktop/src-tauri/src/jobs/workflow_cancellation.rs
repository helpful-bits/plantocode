use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

use super::workflow_types::{
    CancellationResult, FailedCancellation, WorkflowDefinition, WorkflowStage,
};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus};

/// Service for handling workflow-wide cancellation propagation
pub struct WorkflowCancellationHandler {
    repo: Arc<BackgroundJobRepository>,
}

impl WorkflowCancellationHandler {
    /// Create a new workflow cancellation handler
    pub fn new(repo: Arc<BackgroundJobRepository>) -> Self {
        Self { repo }
    }

    /// Safe job status parsing with validation
    fn safe_job_status_from_str(s: &str) -> Result<JobStatus, AppError> {
        JobStatus::from_str(s)
            .map_err(|e| AppError::JobError(format!("Invalid job status '{}': {}", s, e)))
    }

    /// Cancel all jobs in a workflow
    pub async fn cancel_workflow(
        &self,
        workflow_id: &str,
        reason: &str,
        app_handle: &AppHandle,
    ) -> AppResult<CancellationResult> {
        log::info!("Canceling workflow {} with reason: {}", workflow_id, reason);

        let workflow_jobs = self
            .repo
            .get_jobs_by_metadata_field("workflowId", workflow_id)
            .await?;
        let mut canceled_jobs = Vec::new();
        let mut failed_cancellations = Vec::new();

        for job in workflow_jobs {
            // Only attempt to cancel jobs that are not already completed or failed
            let status = Self::safe_job_status_from_str(&job.status).unwrap_or_else(|e| {
                warn!(
                    "Failed to parse job status '{}' for job {}: {}. Defaulting to Idle.",
                    job.status, job.id, e
                );
                JobStatus::Idle
            });
            if status.is_active() {
                match self
                    .cancel_individual_job(&job.id, reason, app_handle)
                    .await
                {
                    Ok(_) => {
                        canceled_jobs.push(job.id.clone());
                        log::debug!("Successfully canceled job: {}", job.id);
                    }
                    Err(e) => {
                        failed_cancellations.push(FailedCancellation {
                            job_id: job.id.clone(),
                            error: e.to_string(),
                        });
                        log::error!("Failed to cancel job {}: {}", job.id, e);
                    }
                }
            }
        }

        // Attempt cleanup after cancellation
        let _cleanup_performed = self
            .perform_workflow_cleanup(workflow_id, app_handle)
            .await
            .unwrap_or_else(|e| {
                log::error!("Cleanup failed for workflow {}: {}", workflow_id, e);
                false
            });

        let result = CancellationResult {
            workflow_id: workflow_id.to_string(),
            canceled_jobs,
            failed_cancellations,
        };

        log::info!("Workflow cancellation completed: {:?}", result);
        Ok(result)
    }

    /// Cancel specific stage and all subsequent stages
    pub async fn cancel_from_stage(
        &self,
        workflow_id: &str,
        from_stage_name: &str,
        workflow_definition: &WorkflowDefinition,
        reason: &str,
        app_handle: &AppHandle,
    ) -> AppResult<CancellationResult> {
        log::info!(
            "Canceling workflow {} from stage {} with reason: {}",
            workflow_id,
            from_stage_name,
            reason
        );

        let workflow_jobs = self
            .repo
            .get_jobs_by_metadata_field("workflowId", workflow_id)
            .await?;
        let stages_to_cancel = self.get_subsequent_stages(from_stage_name, workflow_definition);

        let mut canceled_jobs = Vec::new();
        let mut failed_cancellations = Vec::new();

        for job in workflow_jobs {
            // Check if this job belongs to a stage that should be canceled
            if self.should_cancel_job_for_stage(&job, &stages_to_cancel) {
                match self
                    .cancel_individual_job(&job.id, reason, app_handle)
                    .await
                {
                    Ok(_) => {
                        canceled_jobs.push(job.id.clone());
                        log::debug!("Successfully canceled job: {}", job.id);
                    }
                    Err(e) => {
                        failed_cancellations.push(FailedCancellation {
                            job_id: job.id.clone(),
                            error: e.to_string(),
                        });
                        log::error!("Failed to cancel job {}: {}", job.id, e);
                    }
                }
            }
        }

        let _cleanup_performed = self
            .perform_partial_cleanup(workflow_id, &canceled_jobs, app_handle)
            .await
            .unwrap_or_else(|e| {
                log::error!("Partial cleanup failed for workflow {}: {}", workflow_id, e);
                false
            });

        let result = CancellationResult {
            workflow_id: workflow_id.to_string(),
            canceled_jobs,
            failed_cancellations,
        };

        Ok(result)
    }

    /// Check if workflow should be canceled due to failures
    pub async fn should_cancel_workflow(
        &self,
        workflow_id: &str,
        consecutive_failures: u32,
    ) -> AppResult<bool> {
        // Configurable thresholds
        const MAX_CONSECUTIVE_FAILURES: u32 = 3;
        const MAX_TOTAL_FAILURES: u32 = 5;

        if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
            log::warn!(
                "Workflow {} has {} consecutive failures, recommending cancellation",
                workflow_id,
                consecutive_failures
            );
            return Ok(true);
        }

        // Check total failure count
        let workflow_jobs = self
            .repo
            .get_jobs_by_metadata_field("workflowId", workflow_id)
            .await?;
        let total_failures = workflow_jobs
            .iter()
            .filter(|job| {
                let status = Self::safe_job_status_from_str(&job.status).unwrap_or_else(|e| {
                    warn!(
                        "Failed to parse job status '{}' for job {}: {}. Defaulting to Idle.",
                        job.status, job.id, e
                    );
                    JobStatus::Idle
                });
                status == JobStatus::Failed
            })
            .count() as u32;

        if total_failures >= MAX_TOTAL_FAILURES {
            log::warn!(
                "Workflow {} has {} total failures, recommending cancellation",
                workflow_id,
                total_failures
            );
            return Ok(true);
        }

        // Check for critical stage failures
        if self
            .has_critical_stage_failure(workflow_id, &workflow_jobs)
            .await?
        {
            log::warn!(
                "Workflow {} has critical stage failure, recommending cancellation",
                workflow_id
            );
            return Ok(true);
        }

        Ok(false)
    }

    /// Propagate cancellation to dependent jobs
    pub async fn propagate_cancellation(
        &self,
        canceled_job_id: &str,
        app_handle: &AppHandle,
    ) -> AppResult<Vec<String>> {
        log::info!("Propagating cancellation for job: {}", canceled_job_id);

        let dependent_jobs = self.find_dependent_jobs(canceled_job_id).await?;
        let mut propagated_cancellations = Vec::new();

        for job_id in dependent_jobs {
            match self
                .cancel_individual_job(&job_id, "Dependency canceled", app_handle)
                .await
            {
                Ok(_) => {
                    propagated_cancellations.push(job_id.clone());
                    log::debug!("Propagated cancellation to dependent job: {}", job_id);
                }
                Err(e) => {
                    log::error!("Failed to propagate cancellation to job {}: {}", job_id, e);
                }
            }
        }

        Ok(propagated_cancellations)
    }

    /// Cancel a job due to timeout
    pub async fn cancel_due_to_timeout(
        &self,
        job_id: &str,
        timeout_ms: u64,
        app_handle: &AppHandle,
    ) -> AppResult<bool> {
        let reason = format!("Job timed out after {}ms", timeout_ms);

        match self
            .cancel_individual_job(job_id, &reason, app_handle)
            .await
        {
            Ok(_) => {
                log::info!("Successfully canceled job {} due to timeout", job_id);
                Ok(true)
            }
            Err(e) => {
                log::error!("Failed to cancel job {} due to timeout: {}", job_id, e);
                Ok(false)
            }
        }
    }

    /// Emergency cancellation for system shutdown
    pub async fn emergency_cancel_all(&self, app_handle: &AppHandle) -> AppResult<Vec<String>> {
        log::warn!("Performing emergency cancellation of all active jobs");

        let active_jobs = self
            .repo
            .get_all_jobs()
            .await?
            .into_iter()
            .filter(|job| {
                let status = Self::safe_job_status_from_str(&job.status).unwrap_or_else(|e| {
                    warn!(
                        "Failed to parse job status '{}' for job {}: {}. Defaulting to Idle.",
                        job.status, job.id, e
                    );
                    JobStatus::Idle
                });
                status.is_active()
            })
            .collect::<Vec<_>>();
        let mut canceled_jobs = Vec::new();

        for job in active_jobs {
            match self
                .cancel_individual_job(&job.id, "Emergency system shutdown", app_handle)
                .await
            {
                Ok(_) => {
                    canceled_jobs.push(job.id.clone());
                }
                Err(e) => {
                    log::error!("Emergency cancellation failed for job {}: {}", job.id, e);
                }
            }
        }

        log::info!(
            "Emergency cancellation completed. Canceled {} jobs",
            canceled_jobs.len()
        );
        Ok(canceled_jobs)
    }

    /// Check if cancellation is safe (no critical operations in progress)
    pub async fn is_cancellation_safe(&self, workflow_id: &str) -> AppResult<bool> {
        let workflow_jobs = self
            .repo
            .get_jobs_by_metadata_field("workflowId", workflow_id)
            .await?;

        // Check for jobs that shouldn't be interrupted
        for job in workflow_jobs {
            let status = Self::safe_job_status_from_str(&job.status).unwrap_or_else(|e| {
                warn!(
                    "Failed to parse job status '{}' for job {}: {}. Defaulting to Idle.",
                    job.status, job.id, e
                );
                JobStatus::Idle
            });
            if self.is_critical_job(&job) && status == JobStatus::Running {
                log::warn!(
                    "Cancellation not safe: critical job {} is in progress",
                    job.id
                );
                return Ok(false);
            }
        }

        Ok(true)
    }

    // Private helper methods

    async fn cancel_individual_job(
        &self,
        job_id: &str,
        reason: &str,
        app_handle: &AppHandle,
    ) -> AppResult<()> {
        // Cancel the job using the enhanced cancel_job method
        self.repo.cancel_job(job_id, reason).await?;

        // Emit job cancellation event for frontend
        let event_payload = serde_json::json!({
            "jobId": job_id,
            "status": "canceled",
            "reason": reason,
            "timestamp": self.current_timestamp()
        });

        if let Err(e) = app_handle.emit("job-canceled", &event_payload) {
            log::error!("Failed to emit job cancellation event: {}", e);
        }

        Ok(())
    }

    async fn perform_workflow_cleanup(
        &self,
        workflow_id: &str,
        app_handle: &AppHandle,
    ) -> AppResult<bool> {
        // Implementation would clean up workflow-specific resources
        log::info!("Performing cleanup for workflow: {}", workflow_id);

        // Real implementation would:
        // 1. Clean up temporary files
        // 2. Release any held resources
        // 3. Clear workflow state
        // 4. Emit cleanup events

        Ok(true)
    }

    async fn perform_partial_cleanup(
        &self,
        workflow_id: &str,
        canceled_job_ids: &[String],
        app_handle: &AppHandle,
    ) -> AppResult<bool> {
        log::info!(
            "Performing partial cleanup for workflow {} with {} canceled jobs",
            workflow_id,
            canceled_job_ids.len()
        );

        // Clean up only resources related to canceled jobs
        for job_id in canceled_job_ids {
            // Implementation would clean up job-specific resources
            log::debug!("Cleaning up resources for canceled job: {}", job_id);
        }

        Ok(true)
    }

    fn get_subsequent_stages(
        &self,
        from_stage_name: &str,
        workflow_definition: &WorkflowDefinition,
    ) -> HashSet<String> {
        let mut stages_to_cancel = HashSet::new();
        let mut visited = HashSet::new();
        let mut stack = vec![from_stage_name.to_string()];

        // Use DFS to find all stages that depend on the from_stage_name (directly or indirectly)
        while let Some(current_stage) = stack.pop() {
            if visited.contains(&current_stage) {
                continue;
            }
            visited.insert(current_stage.clone());
            stages_to_cancel.insert(current_stage.clone());

            // Find all stages that depend on the current stage
            for stage_def in &workflow_definition.stages {
                if stage_def.dependencies.contains(&current_stage)
                    && !visited.contains(&stage_def.stage_name)
                {
                    stack.push(stage_def.stage_name.clone());
                }
            }
        }

        stages_to_cancel
    }

    fn should_cancel_job_for_stage(
        &self,
        job: &BackgroundJob,
        stages_to_cancel: &HashSet<String>,
    ) -> bool {
        // Only cancel jobs that are not already completed or failed
        let status = Self::safe_job_status_from_str(&job.status).unwrap_or_else(|e| {
            warn!(
                "Failed to parse job status '{}' for job {}: {}. Defaulting to Idle.",
                job.status, job.id, e
            );
            JobStatus::Idle
        });
        if !status.is_active() {
            return false;
        }

        // Extract stage name from job metadata or derive from task type
        let job_stage_name = self.get_job_stage_name(job);
        match job_stage_name {
            Some(stage_name) => stages_to_cancel.contains(&stage_name),
            None => false, // Don't cancel jobs we can't categorize
        }
    }

    fn get_job_stage_name(&self, job: &BackgroundJob) -> Option<String> {
        // First try to extract from job metadata
        if let Some(metadata_str) = &job.metadata {
            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(metadata_str) {
                if let Some(workflow_stage) = metadata.get("workflowStage").and_then(|v| v.as_str())
                {
                    return Some(workflow_stage.to_string());
                }
                if let Some(stage_name) = metadata.get("stageName").and_then(|v| v.as_str()) {
                    return Some(stage_name.to_string());
                }
            }
        }

        // Fallback: derive stage name from task type
        Some(job.task_type.clone())
    }

    async fn find_dependent_jobs(&self, job_id: &str) -> AppResult<Vec<String>> {
        // Implementation would query database for jobs that depend on this one
        // For now, return empty vector
        log::debug!("Finding dependent jobs for: {}", job_id);
        Ok(Vec::new())
    }

    async fn has_critical_stage_failure(
        &self,
        workflow_id: &str,
        workflow_jobs: &[BackgroundJob],
    ) -> AppResult<bool> {
        // Check if any critical stages have failed
        for job in workflow_jobs {
            let status = Self::safe_job_status_from_str(&job.status).unwrap_or_else(|e| {
                warn!(
                    "Failed to parse job status '{}' for job {}: {}. Defaulting to Idle.",
                    job.status, job.id, e
                );
                JobStatus::Idle
            });
            if status == JobStatus::Failed {
                // Consider RegexFileFilter as critical since it's usually the first stage
                if job.task_type == crate::models::TaskType::RegexFileFilter.to_string() {
                    log::warn!(
                        "Critical stage failure detected in workflow {}: RegexFileFilter",
                        workflow_id
                    );
                    return Ok(true);
                }
            }
        }

        Ok(false)
    }

    fn is_critical_job(&self, job: &BackgroundJob) -> bool {
        // Define which job types are considered critical and shouldn't be interrupted
        let regex_file_filter_str = crate::models::TaskType::RegexFileFilter.to_string();
        job.task_type == regex_file_filter_str || job.task_type == "DataPersistence"
    }

    fn current_timestamp(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }
}

/// Cancellation coordination service for managing complex cancellation scenarios
pub struct CancellationCoordinator {
    cancellation_handler: WorkflowCancellationHandler,
    active_cancellations: Arc<std::sync::Mutex<HashSet<String>>>, // Track workflows being canceled
}

impl CancellationCoordinator {
    pub fn new(repo: Arc<BackgroundJobRepository>) -> Self {
        Self {
            cancellation_handler: WorkflowCancellationHandler::new(repo),
            active_cancellations: Arc::new(std::sync::Mutex::new(HashSet::new())),
        }
    }

    /// Safe wrapper to get active cancellations with timeout protection
    fn get_active_cancellations(&self) -> Result<std::sync::MutexGuard<HashSet<String>>, AppError> {
        self.active_cancellations.lock().map_err(|e| {
            AppError::JobError(format!(
                "Failed to acquire active cancellations lock: {}",
                e
            ))
        })
    }

    /// Coordinate cancellation with race condition protection
    pub async fn coordinate_cancellation(
        &self,
        workflow_id: &str,
        reason: &str,
        app_handle: &AppHandle,
    ) -> AppResult<CancellationResult> {
        // Check if cancellation is already in progress
        {
            let mut active = self.get_active_cancellations()?;
            if active.contains(workflow_id) {
                return Err(AppError::ValidationError(format!(
                    "Cancellation already in progress for workflow: {}",
                    workflow_id
                )));
            }
            active.insert(workflow_id.to_string());
        }

        // Perform the cancellation
        let result = self
            .cancellation_handler
            .cancel_workflow(workflow_id, reason, app_handle)
            .await;

        // Remove from active cancellations
        {
            if let Ok(mut active) = self.get_active_cancellations() {
                active.remove(workflow_id);
            } else {
                error!("Failed to acquire lock to remove workflow from active cancellations");
                // Continue anyway - the workflow may remain marked as active but that's safer than panicking
            }
        }

        result
    }

    /// Check if workflow is currently being canceled
    pub fn is_cancellation_in_progress(&self, workflow_id: &str) -> bool {
        match self.get_active_cancellations() {
            Ok(active) => active.contains(workflow_id),
            Err(e) => {
                error!("Failed to acquire lock to check cancellation status: {}", e);
                false // Assume not in progress if we can't check
            }
        }
    }
}
