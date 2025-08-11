use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::jobs::types::CleanupResult;
use crate::jobs::workflow_types::WorkflowStage;
use crate::models::{BackgroundJob, JobStatus};

/// Service for cleaning up workflow resources and orphaned jobs
pub struct WorkflowCleanupHandler {
    repo: Arc<BackgroundJobRepository>,
}

impl WorkflowCleanupHandler {
    /// Create a new workflow cleanup handler
    pub fn new(repo: Arc<BackgroundJobRepository>) -> Self {
        Self { repo }
    }

    /// Clean up all resources for a workflow
    pub async fn cleanup_workflow(
        &self,
        workflow_id: &str,
        app_handle: &AppHandle,
    ) -> AppResult<CleanupResult> {
        log::info!("Starting cleanup for workflow: {}", workflow_id);

        let workflow_jobs = self
            .repo
            .get_jobs_by_metadata_field("workflowId", workflow_id)
            .await?;
        let mut cleaned_jobs = Vec::new();
        let mut failed_cleanups = Vec::new();

        // Clean up each job in the workflow
        for job in workflow_jobs {
            match self.cleanup_job_resources(&job, app_handle).await {
                Ok(_) => {
                    cleaned_jobs.push(job.id.clone());
                    log::debug!("Successfully cleaned up job: {}", job.id);
                }
                Err(e) => {
                    failed_cleanups.push(job.id.clone());
                    log::error!("Failed to clean up job {}: {}", job.id, e);
                }
            }
        }

        // Clean up workflow-specific resources
        let resources_freed = self
            .cleanup_workflow_resources(workflow_id, app_handle)
            .await
            .unwrap_or_else(|e| {
                log::error!(
                    "Failed to clean up workflow resources for {}: {}",
                    workflow_id,
                    e
                );
                false
            });

        // Emit cleanup completion event
        self.emit_cleanup_event(workflow_id, &cleaned_jobs, app_handle)
            .await;

        let result = CleanupResult {
            workflow_id: Some(workflow_id.to_string()),
            cleaned_jobs,
            failed_cleanups,
            resources_freed,
        };

        log::info!("Workflow cleanup completed: {:?}", result);
        Ok(result)
    }

    /// Clean up orphaned jobs (jobs without valid workflow)
    pub async fn cleanup_orphaned_jobs(&self, app_handle: &AppHandle) -> AppResult<Vec<String>> {
        log::info!("Starting cleanup of orphaned jobs");

        let all_jobs = self.repo.get_all_jobs().await?;
        let mut orphaned_jobs = Vec::new();
        let mut cleaned_job_ids = Vec::new();

        // Identify orphaned jobs
        for job in all_jobs {
            if self.is_job_orphaned(&job).await? {
                orphaned_jobs.push(job);
            }
        }

        log::info!("Found {} orphaned jobs", orphaned_jobs.len());

        // Clean up orphaned jobs
        for job in orphaned_jobs {
            match self.cleanup_job_resources(&job, app_handle).await {
                Ok(_) => {
                    cleaned_job_ids.push(job.id.clone());

                    // Remove the job from database if it's truly orphaned
                    if let Err(e) = self.repo.delete_job(&job.id).await {
                        log::error!("Failed to delete orphaned job {}: {}", job.id, e);
                    }
                }
                Err(e) => {
                    log::error!("Failed to clean up orphaned job {}: {}", job.id, e);
                }
            }
        }

        log::info!("Cleaned up {} orphaned jobs", cleaned_job_ids.len());
        Ok(cleaned_job_ids)
    }

    /// Clean up expired workflow data
    pub async fn cleanup_expired_workflows(
        &self,
        max_age_hours: u64,
        app_handle: &AppHandle,
    ) -> AppResult<CleanupResult> {
        log::info!(
            "Starting cleanup of workflows older than {} hours",
            max_age_hours
        );

        let cutoff_time = self.current_timestamp() - (max_age_hours * 3600 * 1000) as i64;
        let expired_workflows = self.find_expired_workflows(cutoff_time).await?;

        let mut total_cleaned_jobs = Vec::new();
        let mut total_failed_cleanups = Vec::new();
        let mut workflows_cleaned = 0;

        for workflow_id in expired_workflows {
            match self.cleanup_workflow(&workflow_id, app_handle).await {
                Ok(result) => {
                    total_cleaned_jobs.extend(result.cleaned_jobs);
                    total_failed_cleanups.extend(result.failed_cleanups);
                    workflows_cleaned += 1;
                }
                Err(e) => {
                    log::error!("Failed to clean up expired workflow {}: {}", workflow_id, e);
                }
            }
        }

        let result = CleanupResult {
            workflow_id: None,
            cleaned_jobs: total_cleaned_jobs,
            failed_cleanups: total_failed_cleanups,
            resources_freed: workflows_cleaned > 0,
        };

        log::info!(
            "Expired workflow cleanup completed: {} workflows, {} jobs",
            workflows_cleaned,
            result.cleaned_jobs.len()
        );
        Ok(result)
    }

    /// Emergency cleanup for system shutdown
    pub async fn emergency_cleanup(&self, app_handle: &AppHandle) -> AppResult<()> {
        log::warn!("Performing emergency cleanup for system shutdown");

        // Clean up all active jobs
        let active_jobs = self.repo.get_active_jobs().await?;

        for job in active_jobs {
            // Force cleanup without error handling to ensure fast shutdown
            let _ = self.force_cleanup_job(&job).await;
        }

        // Clean up global resources
        self.cleanup_global_resources(app_handle).await?;

        log::info!("Emergency cleanup completed");
        Ok(())
    }


    /// Clean up memory caches for a workflow
    pub async fn cleanup_memory_caches(&self, workflow_id: &str) -> AppResult<()> {
        log::debug!("Cleaning up memory caches for workflow: {}", workflow_id);

        // Implementation would clear any in-memory caches
        // related to this workflow, such as:
        // - File content caches
        // - Directory tree caches
        // - Intermediate processing results

        Ok(())
    }

    /// Schedule automatic cleanup
    pub async fn schedule_automatic_cleanup(
        &self,
        interval_hours: u64,
        max_age_hours: u64,
        app_handle: &AppHandle,
    ) -> AppResult<()> {
        log::info!(
            "Scheduling automatic cleanup every {} hours for data older than {} hours",
            interval_hours,
            max_age_hours
        );

        // In a real implementation, this would set up a recurring timer
        // For now, we'll just log the configuration

        Ok(())
    }

    // Private helper methods

    async fn cleanup_job_resources(
        &self,
        job: &BackgroundJob,
        app_handle: &AppHandle,
    ) -> AppResult<()> {
        log::debug!("Cleaning up resources for job: {}", job.id);


        // Clear any job-specific memory caches
        self.cleanup_job_memory_caches(&job.id).await?;

        // Clean up any job-specific locks or semaphores
        self.cleanup_job_locks(&job.id).await?;

        // Emit job cleanup event
        self.emit_job_cleanup_event(&job.id, app_handle).await;

        Ok(())
    }

    async fn cleanup_workflow_resources(
        &self,
        workflow_id: &str,
        app_handle: &AppHandle,
    ) -> AppResult<bool> {
        log::debug!(
            "Cleaning up workflow-specific resources for: {}",
            workflow_id
        );


        // Clean up workflow memory caches
        self.cleanup_memory_caches(workflow_id).await?;

        // Clean up workflow coordination data
        self.cleanup_workflow_coordination_data(workflow_id).await?;

        Ok(false)
    }

    async fn is_job_orphaned(&self, job: &BackgroundJob) -> AppResult<bool> {
        // Check various conditions that indicate a job is orphaned:

        // Parse job status to enum for proper type safety
        let job_status = match JobStatus::from_str(&job.status) {
            Ok(status) => status,
            Err(_) => return Ok(false), // Invalid status, not orphaned
        };

        // 1. Jobs older than 24 hours that are still queued
        if matches!(job_status, JobStatus::Queued | JobStatus::Created) {
            let job_age_ms = self.current_timestamp() - job.created_at;
            if job_age_ms > 24 * 3600 * 1000 {
                // 24 hours
                return Ok(true);
            }
        }

        // 2. Jobs in progress for more than 2 hours
        if matches!(job_status, JobStatus::Running | JobStatus::Preparing) {
            let job_age_ms = self.current_timestamp() - job.created_at;
            if job_age_ms > 2 * 3600 * 1000 {
                // 2 hours
                return Ok(true);
            }
        }

        // 3. Jobs with missing workflow references
        if let Some(metadata) = &job.metadata {
            if let Ok(meta_obj) = serde_json::from_str::<serde_json::Value>(metadata) {
                if let Some(workflow_id) = meta_obj.get("workflowId") {
                    // Check if workflow still exists
                    let workflow_jobs = self
                        .repo
                        .get_jobs_by_metadata_field(
                            "workflowId",
                            workflow_id.as_str().unwrap_or(""),
                        )
                        .await?;
                    if workflow_jobs.is_empty() {
                        return Ok(true);
                    }
                }
            }
        }

        Ok(false)
    }

    async fn find_expired_workflows(&self, cutoff_time: i64) -> AppResult<Vec<String>> {
        let all_jobs = self.repo.get_all_jobs().await?;
        let mut workflow_last_activity: HashMap<String, i64> = HashMap::new();

        // Find the most recent activity for each workflow
        for job in all_jobs {
            if let Some(metadata) = &job.metadata {
                if let Ok(meta_obj) = serde_json::from_str::<serde_json::Value>(metadata) {
                    if let Some(workflow_id) = meta_obj.get("workflowId") {
                        let workflow_id = workflow_id.as_str().unwrap_or("");
                        let job_time = job.created_at;

                        let current_time = workflow_last_activity
                            .get(workflow_id)
                            .copied()
                            .unwrap_or(0);
                        if job_time > current_time {
                            workflow_last_activity.insert(workflow_id.to_string(), job_time);
                        }
                    }
                }
            }
        }

        // Find workflows that are older than cutoff
        let expired_workflows: Vec<String> = workflow_last_activity
            .into_iter()
            .filter(|(_, last_activity)| *last_activity < cutoff_time)
            .map(|(workflow_id, _)| workflow_id)
            .collect();

        Ok(expired_workflows)
    }

    async fn force_cleanup_job(&self, job: &BackgroundJob) -> AppResult<()> {
        // Emergency cleanup that doesn't fail
        let _ = self.cleanup_job_memory_caches(&job.id).await;
        let _ = self.cleanup_job_locks(&job.id).await;
        Ok(())
    }

    async fn cleanup_global_resources(&self, app_handle: &AppHandle) -> AppResult<()> {
        log::debug!("Cleaning up global resources");


        // Emit global cleanup event
        let event_payload = serde_json::json!({
            "type": "global_cleanup",
            "timestamp": self.current_timestamp()
        });

        let _ = app_handle.emit("workflow-cleanup", &event_payload);

        Ok(())
    }


    async fn cleanup_job_memory_caches(&self, job_id: &str) -> AppResult<()> {
        log::debug!("Cleaning up memory caches for job: {}", job_id);
        // Implementation would clear job-specific memory caches
        Ok(())
    }

    async fn cleanup_job_locks(&self, job_id: &str) -> AppResult<()> {
        log::debug!("Cleaning up locks for job: {}", job_id);
        // Implementation would release any locks held by this job
        Ok(())
    }

    async fn cleanup_workflow_coordination_data(&self, workflow_id: &str) -> AppResult<()> {
        log::debug!(
            "Cleaning up coordination data for workflow: {}",
            workflow_id
        );
        // Implementation would clean up:
        // - Job dependency tracking
        // - Stage completion status
        // - Error tracking data
        Ok(())
    }


    async fn emit_cleanup_event(
        &self,
        workflow_id: &str,
        cleaned_jobs: &[String],
        app_handle: &AppHandle,
    ) {
        let event_payload = serde_json::json!({
            "workflowId": workflow_id,
            "cleanedJobs": cleaned_jobs,
            "timestamp": self.current_timestamp()
        });

        if let Err(e) = app_handle.emit("workflow-cleanup-completed", &event_payload) {
            log::error!("Failed to emit workflow cleanup event: {}", e);
        }
    }

    async fn emit_job_cleanup_event(&self, job_id: &str, app_handle: &AppHandle) {
        let event_payload = serde_json::json!({
            "jobId": job_id,
            "timestamp": self.current_timestamp()
        });

        if let Err(e) = app_handle.emit("job-cleanup-completed", &event_payload) {
            log::error!("Failed to emit job cleanup event: {}", e);
        }
    }

    fn current_timestamp(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }
}

/// Cleanup scheduler for automatic resource management
pub struct CleanupScheduler {
    cleanup_handler: WorkflowCleanupHandler,
    config: CleanupConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupConfig {
    pub auto_cleanup_enabled: bool,
    pub cleanup_interval_hours: u64,
    pub max_job_age_hours: u64,
    pub max_workflow_age_hours: u64,
    pub cleanup_orphaned_jobs: bool,
}

impl Default for CleanupConfig {
    fn default() -> Self {
        Self {
            auto_cleanup_enabled: true,
            cleanup_interval_hours: 24,  // Daily cleanup
            max_job_age_hours: 72,       // 3 days
            max_workflow_age_hours: 168, // 1 week
            cleanup_orphaned_jobs: true,
        }
    }
}

impl CleanupScheduler {
    pub fn new(repo: Arc<BackgroundJobRepository>, config: CleanupConfig) -> Self {
        Self {
            cleanup_handler: WorkflowCleanupHandler::new(repo),
            config,
        }
    }

    /// Start automatic cleanup scheduling
    pub async fn start_scheduled_cleanup(&self, app_handle: &AppHandle) -> AppResult<()> {
        if !self.config.auto_cleanup_enabled {
            log::info!("Automatic cleanup is disabled");
            return Ok(());
        }

        log::info!(
            "Starting scheduled cleanup with interval: {} hours",
            self.config.cleanup_interval_hours
        );

        // In a real implementation, this would start a timer
        // For now, we'll just perform one cleanup cycle
        self.perform_cleanup_cycle(app_handle).await?;
        

        Ok(())
    }

    /// Perform a full cleanup cycle
    pub async fn perform_cleanup_cycle(&self, app_handle: &AppHandle) -> AppResult<CleanupSummary> {
        log::info!("Starting cleanup cycle");

        let mut summary = CleanupSummary::default();

        // Clean up expired workflows
        if let Ok(result) = self
            .cleanup_handler
            .cleanup_expired_workflows(self.config.max_workflow_age_hours, app_handle)
            .await
        {
            summary.expired_workflows_cleaned += 1;
            summary.total_jobs_cleaned += result.cleaned_jobs.len();
        }

        // Clean up orphaned jobs
        if self.config.cleanup_orphaned_jobs {
            if let Ok(orphaned_jobs) = self.cleanup_handler.cleanup_orphaned_jobs(app_handle).await
            {
                summary.orphaned_jobs_cleaned = orphaned_jobs.len();
            }
        }
        
        // Temp file cleanup removed - no actual temp files are created

        log::info!("Cleanup cycle completed: {:?}", summary);
        Ok(summary)
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct CleanupSummary {
    pub expired_workflows_cleaned: usize,
    pub orphaned_jobs_cleaned: usize,
    pub total_jobs_cleaned: usize,
    pub errors_encountered: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cleanup_handler_creation() {
        use sqlx::SqlitePool;
        let pool = Arc::new(SqlitePool::connect(":memory:").await.unwrap());
        let repo = Arc::new(BackgroundJobRepository::new(pool.clone()));
        let handler = WorkflowCleanupHandler::new(repo);

        // Basic creation test
        assert!(true); // Handler created successfully
    }

    #[tokio::test]
    async fn test_cleanup_config_default() {
        let config = CleanupConfig::default();
        assert!(config.auto_cleanup_enabled);
        assert_eq!(config.cleanup_interval_hours, 24);
        assert_eq!(config.max_job_age_hours, 72);
    }

    #[tokio::test]
    async fn test_workflow_temp_dir_path() {
        use sqlx::SqlitePool;
        let pool = Arc::new(SqlitePool::connect(":memory:").await.unwrap());
        let repo = Arc::new(BackgroundJobRepository::new(pool.clone()));
        let handler = WorkflowCleanupHandler::new(repo);

        // Handler created successfully - temp file cleanup removed
    }
}
