// Helper modules for workflow orchestration
pub mod definition_loader;
pub mod stage_scheduler;
pub mod stage_job_manager;
pub mod state_updater;
pub mod query_service;
pub mod event_emitter;
pub mod data_extraction;
pub mod payload_builder;
pub mod completion_handler;
pub mod failure_handler;
pub mod retry_handler;
pub mod workflow_lifecycle_manager;
pub mod workflow_utils;

use std::sync::Arc;
use std::collections::HashMap;
use std::time::Duration;
use std::str::FromStr;
use log::{info, warn, error, debug};
use tokio::sync::{Mutex, OnceCell, MutexGuard};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;
use thiserror::Error;

use crate::error::{AppError, AppResult};
use crate::models::{JobStatus, TaskType};

/// Workflow-specific error type
#[derive(Error, Debug)]
pub enum WorkflowError {
    #[error("Lock acquisition failed: {0}")]
    LockError(String),
    #[error("Lock timeout: {0}")]
    LockTimeout(String),
    #[error("Job status parsing failed: {0}")]
    JobStatusParseError(String),
    #[error("Task type parsing failed: {0}")]
    TaskTypeParseError(String),
    #[error("Duration calculation failed: {0}")]
    DurationError(String),
    #[error("Workflow error: {0}")]
    General(String),
}
use crate::jobs::types::JobPayload;
use crate::utils::job_creation_utils;
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use super::workflow_types::{
    WorkflowState, WorkflowStatus, WorkflowStage, WorkflowStageJob,
    WorkflowStatusEvent, WorkflowStageEvent, WorkflowResult, WorkflowIntermediateData,
    WorkflowDefinition, WorkflowStageDefinition, AbstractWorkflowState
};
use super::workflow_cleanup::WorkflowCleanupHandler;
use super::workflow_cancellation::WorkflowCancellationHandler;
use super::workflow_error_handler::WorkflowErrorHandler;

/// Centralized workflow orchestrator service
pub struct WorkflowOrchestrator {
    /// Active workflows indexed by workflow_id
    workflows: Arc<Mutex<HashMap<String, WorkflowState>>>,
    /// Abstract workflow definitions indexed by name
    workflow_definitions: Mutex<HashMap<String, Arc<WorkflowDefinition>>>,
    /// App handle for creating jobs and emitting events
    app_handle: AppHandle,
    /// Workflow cleanup handler for resource cleanup
    workflow_cleanup_handler: Arc<WorkflowCleanupHandler>,
    /// Workflow cancellation handler for job cancellation
    workflow_cancellation_handler: Arc<WorkflowCancellationHandler>,
    /// Workflow error handler for managing errors
    workflow_error_handler: Arc<WorkflowErrorHandler>,
}

impl WorkflowOrchestrator {
    /// Safe wrapper to get workflow definitions with timeout
    async fn get_workflow_definitions(&self) -> Result<MutexGuard<HashMap<String, Arc<WorkflowDefinition>>>, WorkflowError> {
        const LOCK_TIMEOUT_MS: u64 = 5000; // 5 seconds timeout
        
        match tokio::time::timeout(
            Duration::from_millis(LOCK_TIMEOUT_MS),
            self.workflow_definitions.lock()
        ).await {
            Ok(guard) => Ok(guard),
            Err(_) => Err(WorkflowError::LockTimeout(
                format!("Failed to acquire workflow definitions lock within {}ms", LOCK_TIMEOUT_MS)
            ))
        }
    }

    /// Safe job status parsing with validation
    fn safe_job_status_from_str(s: &str) -> Result<JobStatus, WorkflowError> {
        JobStatus::from_str(s).map_err(|e| {
            WorkflowError::JobStatusParseError(
                format!("Invalid job status '{}': {}", s, e)
            )
        })
    }

    /// Safe task type parsing with validation
    fn safe_task_type_from_str(s: &str) -> Result<TaskType, WorkflowError> {
        TaskType::from_str(s).map_err(|e| {
            WorkflowError::TaskTypeParseError(
                format!("Invalid task type '{}': {}", s, e)
            )
        })
    }

    /// Safe duration calculation with overflow protection
    fn safe_duration_as_millis(duration: Duration) -> Result<u64, WorkflowError> {
        duration.as_millis().try_into().map_err(|_| {
            WorkflowError::DurationError(
                format!("Duration overflow: {} ms exceeds u64 maximum", duration.as_millis())
            )
        })
    }

    /// Create a new workflow orchestrator
    pub fn new(
        app_handle: AppHandle, 
        workflow_cleanup_handler: Arc<WorkflowCleanupHandler>, 
        workflow_cancellation_handler: Arc<WorkflowCancellationHandler>,
        workflow_error_handler: Arc<WorkflowErrorHandler>,
    ) -> Self {
        let orchestrator = Self {
            workflows: Arc::new(Mutex::new(HashMap::new())),
            workflow_definitions: Mutex::new(HashMap::new()),
            app_handle,
            workflow_cleanup_handler,
            workflow_cancellation_handler,
            workflow_error_handler,
        };
        
        // Load default workflow definitions (note: will be loaded async after construction)
        
        orchestrator
    }

    /// Load workflow definitions from configuration files
    async fn load_default_workflow_definitions(&self) -> AppResult<()> {
        // Load workflow definitions from JSON files - NO FALLBACK
        let workflow_definitions = definition_loader::load_workflow_definitions_from_files()
            .map_err(|e| AppError::JobError(format!("Failed to load workflow definitions from JSON files: {}", e)))?;
        
        // Store the loaded definitions
        match self.get_workflow_definitions().await {
            Ok(mut guard) => *guard = workflow_definitions,
            Err(e) => return Err(AppError::JobError(format!("Failed to store workflow definitions: {}", e)))
        }

        info!("Loaded workflow definitions from JSON files");
        Ok(())
    }





    /// Cancel a workflow and all its pending/running jobs
    pub async fn cancel_workflow(&self, workflow_id: &str) -> AppResult<()> {
        workflow_lifecycle_manager::cancel_workflow_internal(
            &self.workflows,
            &self.app_handle,
            &self.workflow_cancellation_handler,
            workflow_id,
        ).await
    }

    /// Cancel a workflow and all its pending/running jobs with a specific reason
    pub async fn cancel_workflow_with_reason(&self, workflow_id: &str, reason: &str) -> AppResult<()> {
        workflow_lifecycle_manager::cancel_workflow_with_reason_internal(
            &self.workflows,
            &self.app_handle,
            &self.workflow_cancellation_handler,
            workflow_id,
            reason,
        ).await
    }

    /// Pause a workflow - prevents new stages from starting
    pub async fn pause_workflow(&self, workflow_id: &str) -> AppResult<()> {
        workflow_lifecycle_manager::pause_workflow_internal(
            &self.workflows,
            &self.app_handle,
            workflow_id,
        ).await
    }

    /// Resume a paused workflow - allows new stages to start
    pub async fn resume_workflow(&self, workflow_id: &str) -> AppResult<()> {
        workflow_lifecycle_manager::resume_workflow_internal(
            &self.workflows,
            &self.app_handle,
            &self.workflow_definitions,
            workflow_id,
        ).await
    }

    /// Get workflow status and progress
    pub async fn get_workflow_status(&self, workflow_id: &str) -> AppResult<WorkflowState> {
        // First, check if this workflow needs recovery (lazy recovery)
        if let Err(e) = self.recover_workflow_if_needed(workflow_id).await {
            error!("Failed to recover workflow {} if needed: {}", workflow_id, e);
        }
        
        query_service::get_workflow_status_internal(&self.workflows, workflow_id).await
    }

    /// Get workflow results (final selected files and intermediate data)
    pub async fn get_workflow_results(&self, workflow_id: &str) -> AppResult<WorkflowResult> {
        query_service::get_workflow_results_internal(&self.workflows, workflow_id).await
    }

    /// Update job status for a workflow stage
    pub async fn update_job_status(
        &self,
        job_id: &str,
        status: JobStatus,
        error_message: Option<String>,
    ) -> AppResult<()> {
        debug!("Updating job status: {} -> {:?}", job_id, status);

        // Find workflow and update job status
        let workflow_id = query_service::find_workflow_id_by_job_id_internal(&self.workflows, job_id).await?;
        state_updater::update_job_status_internal(&self.workflows, job_id, status.clone(), error_message.clone()).await?;

        // Get the stage job for event emission
        if let Some(stage_job) = query_service::get_stage_job_by_id_internal(&self.workflows, job_id).await? {
            event_emitter::emit_workflow_stage_event_internal(&self.app_handle, &workflow_id, &stage_job, &status, error_message.clone()).await;
        }

        // Handle stage completion/failure
        match status {
            JobStatus::Completed => {
                if let Err(e) = self.handle_stage_completion(&workflow_id, job_id).await {
                    error!("Failed to handle stage completion: {}", e);
                }
            }
            JobStatus::Failed => {
                if let Err(e) = self.handle_stage_failure(&workflow_id, job_id, error_message).await {
                    error!("Failed to handle stage failure: {}", e);
                }
            }
            JobStatus::Canceled => {
                if let Err(e) = self.handle_stage_cancellation(&workflow_id, job_id).await {
                    error!("Failed to handle stage cancellation: {}", e);
                }
            }
            _ => {}
        }

        Ok(())
    }

    /// Store intermediate data from a completed stage
    pub async fn store_stage_data(
        &self,
        job_id: &str,
        stage_data: serde_json::Value,
    ) -> AppResult<()> {
        state_updater::store_stage_data_internal(&self.workflows, job_id, stage_data).await
    }

    /// Add a stage job to an existing workflow (for orphaned jobs)
    pub async fn add_stage_job_to_workflow(
        &self,
        workflow_id: &str,
        stage_name: String,
        task_type: crate::models::TaskType,
        job_id: String,
        depends_on: Option<String>,
    ) -> AppResult<()> {
        let mut workflows_guard = self.workflows.lock().await;
        
        if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
            workflow_state.add_stage_job(stage_name, task_type, job_id, depends_on);
            info!("Added stage job to workflow {}", workflow_id);
            Ok(())
        } else {
            Err(crate::error::AppError::JobError(format!("Workflow {} not found", workflow_id)))
        }
    }

    /// Get all active workflows
    pub async fn get_active_workflows(&self) -> Vec<WorkflowState> {
        query_service::get_active_workflows_internal(&self.workflows).await
    }

    /// Recover orphaned workflow jobs from the database
    /// This should be called during orchestrator initialization
    pub async fn recover_orphaned_jobs(&self) -> AppResult<()> {
        use crate::db_utils::BackgroundJobRepository;
        use std::sync::Arc;
        
        let background_job_repo = self.app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        // Get all jobs that have workflow metadata but are not in completed/failed/canceled status
        let active_jobs = background_job_repo.get_jobs_by_status(&[
            crate::models::JobStatus::Running,
            crate::models::JobStatus::Queued,
            crate::models::JobStatus::Completed,
        ]).await?;
        
        let mut recovered_count = 0;
        
        for job in active_jobs {
            // Check if job has workflow metadata
            if let Some(metadata_str) = &job.metadata {
                if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(metadata_str) {
                    if let Some(workflow_id) = metadata.get("workflowId").and_then(|v| v.as_str()) {
                        // Check if this job is already registered in the workflow
                        let mut workflows_guard = self.workflows.lock().await;
                        if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
                            // Check if job is already registered
                            if !workflow_state.stage_jobs.iter().any(|stage_job| stage_job.job_id == job.id) {
                                // This is an orphaned job - add it to the workflow
                                if let Ok(task_type) = crate::models::TaskType::from_str(&job.task_type) {
                                    let stage_name = match task_type {
                                        crate::models::TaskType::RegexFileFilter => "RegexFileFilter",
                                        crate::models::TaskType::FileRelevanceAssessment => "FileRelevanceAssessment",
                                        crate::models::TaskType::ExtendedPathFinder => "ExtendedPathFinder",
                                        crate::models::TaskType::PathCorrection => "PathCorrection",
                                        _ => continue,
                                    };
                                    
                                    workflow_state.add_stage_job(stage_name.to_string(), task_type, job.id.clone(), None);
                                    recovered_count += 1;
                                    info!("Recovered orphaned job {} for workflow {}", job.id, workflow_id);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        if recovered_count > 0 {
            info!("Recovered {} orphaned workflow jobs", recovered_count);
            
            // After recovery, check if any workflows can progress
            let workflows_to_check: Vec<(String, Vec<String>)> = {
                let workflows_guard = self.workflows.lock().await;
                workflows_guard.iter()
                    .filter(|(_, workflow_state)| workflow_state.status == crate::jobs::workflow_types::WorkflowStatus::Running)
                    .map(|(workflow_id, workflow_state)| {
                        let completed_jobs: Vec<String> = workflow_state.stage_jobs.iter()
                            .filter(|stage_job| stage_job.status == crate::models::JobStatus::Completed)
                            .map(|stage_job| stage_job.job_id.clone())
                            .collect();
                        (workflow_id.clone(), completed_jobs)
                    })
                    .collect()
            };
            
            // Now trigger completion handlers without holding the lock
            for (workflow_id, completed_job_ids) in workflows_to_check {
                for job_id in completed_job_ids {
                    if let Err(e) = self.handle_stage_completion(&workflow_id, &job_id).await {
                        error!("Failed to handle stage completion during recovery for job {}: {}", job_id, e);
                    }
                }
            }
        }
        
        Ok(())
    }

    /// Recover a specific workflow if it has orphaned jobs
    async fn recover_workflow_if_needed(&self, workflow_id: &str) -> AppResult<()> {
        use crate::db_utils::BackgroundJobRepository;
        use std::sync::Arc;
        
        let background_job_repo = self.app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        // Get all jobs that have this specific workflow ID in their metadata
        let workflow_jobs = background_job_repo.get_jobs_by_metadata_field("workflowId", workflow_id).await?;
        
        let mut recovered_count = 0;
        let mut workflows_guard = self.workflows.lock().await;
        
        if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
            for job in workflow_jobs {
                // Check if job is already registered in the workflow
                if !workflow_state.stage_jobs.iter().any(|stage_job| stage_job.job_id == job.id) {
                    // This is an orphaned job - add it to the workflow
                    if let Ok(task_type) = crate::models::TaskType::from_str(&job.task_type) {
                        let stage_name = match task_type {
                            crate::models::TaskType::RegexFileFilter => "RegexFileFilter",
                            crate::models::TaskType::FileRelevanceAssessment => "FileRelevanceAssessment",
                            crate::models::TaskType::ExtendedPathFinder => "ExtendedPathFinder",
                            crate::models::TaskType::PathCorrection => "PathCorrection",
                            _ => continue,
                        };
                        
                        // Parse job status from database
                        let job_status = match job.status.as_str() {
                            "completed" => crate::models::JobStatus::Completed,
                            "running" => crate::models::JobStatus::Running,
                            "failed" => crate::models::JobStatus::Failed,
                            "queued" => crate::models::JobStatus::Queued,
                            _ => continue,
                        };
                        
                        // Create a proper WorkflowStageJob with correct status
                        let mut stage_job = crate::jobs::workflow_types::WorkflowStageJob::new(
                            stage_name.to_string(), 
                            task_type, 
                            job.id.clone(), 
                            None
                        );
                        stage_job.status = job_status;
                        stage_job.created_at = job.created_at;
                        stage_job.started_at = job.start_time;
                        stage_job.completed_at = job.end_time;
                        
                        workflow_state.stage_jobs.push(stage_job);
                        recovered_count += 1;
                        info!("Lazy recovery: added job {} to workflow {}", job.id, workflow_id);
                    }
                }
            }
        }
        
        drop(workflows_guard);
        
        if recovered_count > 0 {
            info!("Lazy recovered {} jobs for workflow {}", recovered_count, workflow_id);
            
            // Trigger progression check for any completed jobs
            let workflows_guard = self.workflows.lock().await;
            if let Some(workflow_state) = workflows_guard.get(workflow_id) {
                let completed_jobs: Vec<String> = workflow_state.stage_jobs.iter()
                    .filter(|stage_job| stage_job.status == crate::models::JobStatus::Completed)
                    .map(|stage_job| stage_job.job_id.clone())
                    .collect();
                
                drop(workflows_guard);
                
                for job_id in completed_jobs {
                    if let Err(e) = self.handle_stage_completion(workflow_id, &job_id).await {
                        error!("Failed to handle stage completion during lazy recovery for job {}: {}", job_id, e);
                    }
                }
            }
        }
        
        Ok(())
    }

    /// Get all workflow states (active and recent)
    pub async fn get_all_workflow_states(&self) -> AppResult<Vec<WorkflowState>> {
        let workflows = self.workflows.lock().await;
        Ok(workflows.values().cloned().collect())
    }

    /// Get workflow state by ID
    pub async fn get_workflow_state_by_id(&self, workflow_id: &str) -> AppResult<Option<WorkflowState>> {
        let workflows = self.workflows.lock().await;
        Ok(workflows.get(workflow_id).cloned())
    }

    /// Clean up completed workflows (remove from memory after some time)
    pub async fn cleanup_completed_workflows(&self, max_age_hours: i64) -> AppResult<usize> {
        let cutoff_time = chrono::Utc::now().timestamp_millis() - (max_age_hours * 60 * 60 * 1000);
        
        let mut workflows = self.workflows.lock().await;
        let initial_count = workflows.len();
        
        workflows.retain(|_, workflow| {
            match workflow.status {
                WorkflowStatus::Completed | WorkflowStatus::Failed | WorkflowStatus::Canceled => {
                    workflow.completed_at.map_or(true, |completed| completed > cutoff_time)
                }
                _ => true, // Keep active workflows
            }
        });

        let cleaned_count = initial_count - workflows.len();
        if cleaned_count > 0 {
            info!("Cleaned up {} completed workflows", cleaned_count);
        }
        
        Ok(cleaned_count)
    }

    // Private helper methods
    
    /// Start a new workflow using abstract workflow definitions
    pub async fn start_workflow(
        &self,
        workflow_definition_name: String,
        session_id: String,
        task_description: String,
        project_directory: String,
        excluded_paths: Vec<String>,
        timeout_ms: Option<u64>,
    ) -> AppResult<String> {
        workflow_lifecycle_manager::start_workflow_internal(
            &self.workflows,
            &self.app_handle,
            &self.workflow_definitions,
            workflow_definition_name,
            session_id,
            task_description,
            project_directory,
            excluded_paths,
            timeout_ms,
        ).await
    }

    /// Handle successful completion of a stage
    async fn handle_stage_completion(&self, workflow_id: &str, job_id: &str) -> AppResult<()> {
        // Create a closure that captures the necessary data
        let workflows = self.workflows.clone();
        let store_fn = move |job_id: &str, stage_data: serde_json::Value| {
            let workflows = workflows.clone();
            let job_id = job_id.to_string();
            Box::pin(async move {
                state_updater::store_stage_data_internal(&workflows, &job_id, stage_data).await
            }) as std::pin::Pin<Box<dyn std::future::Future<Output = AppResult<()>> + Send>>
        };
        
        completion_handler::handle_stage_completion_internal(
            &*self.workflows,
            self,
            workflow_id,
            job_id,
            store_fn
        ).await
    }

    /// Handle stage failure
    async fn handle_stage_failure(&self, workflow_id: &str, job_id: &str, error_message: Option<String>) -> AppResult<()> {
        failure_handler::handle_stage_failure_internal(
            &self.workflows,
            &self.workflow_error_handler,
            &self.app_handle,
            workflow_id,
            job_id,
            error_message
        ).await
    }

    /// Handle stage cancellation
    async fn handle_stage_cancellation(&self, workflow_id: &str, job_id: &str) -> AppResult<()> {
        debug!("Handling stage cancellation for job: {}", job_id);

        // Mark the workflow as canceled if it's not already in a terminal state
        let workflow_state = {
            let mut workflows = self.workflows.lock().await;
            if let Some(workflow) = workflows.get_mut(workflow_id) {
                if !matches!(workflow.status, crate::jobs::workflow_types::WorkflowStatus::Completed | 
                            crate::jobs::workflow_types::WorkflowStatus::Failed | 
                            crate::jobs::workflow_types::WorkflowStatus::Canceled) {
                    workflow.status = crate::jobs::workflow_types::WorkflowStatus::Canceled;
                    workflow.error_message = Some("Workflow canceled by user".to_string());
                    workflow.completed_at = Some(chrono::Utc::now().timestamp_millis());
                    workflow.updated_at = workflow.completed_at.unwrap();
                    debug!("Marked workflow {} as canceled", workflow_id);
                }
                workflow.clone()
            } else {
                return Err(AppError::JobError(format!("Workflow {} not found for cancellation", workflow_id)));
            }
        };

        // Emit workflow cancellation event to frontend
        event_emitter::emit_workflow_status_event_internal(
            &self.app_handle, 
            &workflow_state, 
            "Workflow canceled by user"
        ).await;

        info!("Workflow {} was canceled", workflow_id);
        Ok(())
    }

    /// Create and queue a job for a specific workflow stage using abstract workflow definitions
    /// This is the canonical method for creating stage jobs with workflow lock held
    pub async fn create_abstract_stage_job_with_lock(
        &self,
        workflows: &mut HashMap<String, super::workflow_types::WorkflowState>,
        workflow_state: &super::workflow_types::WorkflowState,
        stage_definition: &super::workflow_types::WorkflowStageDefinition,
        workflow_definition: &super::workflow_types::WorkflowDefinition,
    ) -> AppResult<String> {
        // Get settings repository from app state
        let settings_repo = self.app_handle.state::<Arc<crate::db_utils::settings_repository::SettingsRepository>>().inner().clone();
        
        stage_job_manager::create_abstract_stage_job_with_lock_internal(
            workflows,
            workflow_state,
            stage_definition,
            workflow_definition,
            &self.app_handle,
            &settings_repo,
        ).await
    }

    /// Create and queue a job for a specific workflow stage using abstract workflow definitions
    /// This is the canonical method for creating stage jobs without holding workflow lock
    pub async fn create_abstract_stage_job(
        &self,
        workflow_state: &super::workflow_types::WorkflowState,
        stage_definition: &super::workflow_types::WorkflowStageDefinition,
        workflow_definition: &super::workflow_types::WorkflowDefinition,
    ) -> AppResult<String> {
        let mut workflows = self.workflows.lock().await;
        self.create_abstract_stage_job_with_lock(&mut workflows, workflow_state, stage_definition, workflow_definition).await
    }

    /// Get model configuration for a stage definition
    async fn get_stage_model_config_for_definition(
        &self,
        stage_definition: &super::workflow_types::WorkflowStageDefinition,
        project_directory: &str,
    ) -> AppResult<Option<(String, f32, u32)>> {
        // Get settings repository from app state
        let settings_repo = self.app_handle.state::<Arc<crate::db_utils::settings_repository::SettingsRepository>>().inner().clone();
        
        stage_job_manager::get_stage_model_config_for_definition_internal(
            stage_definition,
            project_directory,
            &self.app_handle,
            &settings_repo,
        ).await
    }
    
    /// Start the next available abstract stages using workflow definitions
    async fn start_next_abstract_stages(&self, workflow_id: &str) -> AppResult<()> {
        let workflow_state = {
            let workflows = self.workflows.lock().await;
            workflows.get(workflow_id).cloned()
                .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))?
        };

        // Check if workflow is paused - don't start new stages
        if workflow_state.status == crate::jobs::workflow_types::WorkflowStatus::Paused {
            debug!("Workflow {} is paused, not starting new stages", workflow_id);
            return Ok(());
        }

        // Get the workflow definition
        let workflow_definitions_guard = self.get_workflow_definitions().await
            .map_err(|e| AppError::JobError(format!("Failed to get workflow definitions: {}", e)))?;

        let workflow_definition = workflow_definitions_guard.get(&workflow_state.workflow_definition_name)
            .cloned() // Clone the Arc<WorkflowDefinition>
            .ok_or_else(|| AppError::JobError(format!("Workflow definition '{}' not found for workflow {}", workflow_state.workflow_definition_name, workflow_id)))?;

        // Find all stages that can be executed in parallel using abstract definitions
        let next_stages = stage_scheduler::find_next_abstract_stages_to_execute_internal(&workflow_state, &workflow_definition).await;

        if next_stages.is_empty() {
            // Check if all stages are completed
            if workflow_utils::is_workflow_complete(&workflow_state, &workflow_definition) {
                self.mark_workflow_completed(workflow_id).await?;
            } else if workflow_state.has_failed() {
                self.mark_workflow_failed(workflow_id, "One or more stages failed").await?;
            } else {
                debug!("No stages ready to execute for workflow: {}", workflow_id);
            }
        } else {
            // Check concurrency limits before starting all stages
            let max_concurrent = stage_scheduler::get_max_concurrent_stages_internal().await;
            let currently_running = stage_scheduler::count_running_jobs_in_workflow_internal(
                &self.workflows,
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
                if let Err(e) = self.create_abstract_stage_job(
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




    // Concurrency methods moved to stage_scheduler.rs




    /// Find a dependency job by task type in the workflow state (only completed jobs) - delegated to query_service
    fn get_dependency_job_for_data_extraction<'a>(&self, workflow_state: &'a WorkflowState, dependency_task_type: TaskType) -> AppResult<&'a super::workflow_types::WorkflowStageJob> {
        query_service::get_dependency_job_for_data_extraction(workflow_state, dependency_task_type)
    }

    /// Find the most recent job attempt for a given task type, regardless of status - delegated to query_service
    fn get_latest_job_for_stage<'a>(&self, workflow_state: &'a WorkflowState, dependency_task_type: TaskType) -> Option<&'a super::workflow_types::WorkflowStageJob> {
        query_service::get_latest_job_for_stage(workflow_state, dependency_task_type)
    }



    /// Mark workflow as completed
    pub async fn mark_workflow_completed(&self, workflow_id: &str) -> AppResult<()> {
        let workflow_state = state_updater::mark_workflow_completed_internal(&self.workflows, workflow_id).await?;
        
        // Emit event to frontend
        event_emitter::emit_workflow_status_event_internal(&self.app_handle, &workflow_state, "Workflow completed successfully").await;
        
        // Add delay before cleanup to allow frontend to fetch final status
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        
        // Perform cleanup for completed workflow
        match self.workflow_cleanup_handler.cleanup_workflow(workflow_id, &self.app_handle).await {
            Ok(cleanup_result) => {
                info!("Cleanup completed for workflow: {} - cleaned {} jobs", workflow_id, cleanup_result.cleaned_jobs.len());
            }
            Err(e) => {
                warn!("Failed to cleanup resources for completed workflow {}: {}", workflow_id, e);
            }
        }
        
        Ok(())
    }

    /// Mark workflow as failed
    pub async fn mark_workflow_failed(&self, workflow_id: &str, error_message: &str) -> AppResult<()> {
        let workflow_state = state_updater::mark_workflow_failed_internal(&self.workflows, workflow_id, error_message).await?;
        
        // Emit event to frontend
        event_emitter::emit_workflow_status_event_internal(&self.app_handle, &workflow_state, &format!("Workflow failed: {}", error_message)).await;
        
        // Add delay before cleanup to allow frontend to fetch final status
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        
        // Perform cleanup for failed workflow
        match self.workflow_cleanup_handler.cleanup_workflow(workflow_id, &self.app_handle).await {
            Ok(cleanup_result) => {
                info!("Cleanup completed for failed workflow: {} - cleaned {} jobs", workflow_id, cleanup_result.cleaned_jobs.len());
            }
            Err(e) => {
                warn!("Failed to cleanup resources for failed workflow {}: {}", workflow_id, e);
            }
        }
        
        Ok(())
    }

    /// Find workflow ID by job ID - delegated to query_service
    async fn find_workflow_by_job_id(&self, job_id: &str) -> AppResult<String> {
        query_service::find_workflow_id_by_job_id_internal(&self.workflows, job_id).await
    }


    /// Emit workflow status event to frontend - delegated to event_emitter
    async fn emit_workflow_status_event(&self, workflow_state: &WorkflowState, message: &str) {
        event_emitter::emit_workflow_status_event_internal(&self.app_handle, workflow_state, message).await;
    }

    /// Emit workflow stage event to frontend - delegated to event_emitter
    async fn emit_workflow_stage_event(
        &self,
        workflow_id: &str,
        stage_job: &WorkflowStageJob,
        status: &JobStatus,
        error_message: Option<String>,
    ) {
        event_emitter::emit_workflow_stage_event_internal(&self.app_handle, workflow_id, stage_job, status, error_message).await;
    }


    /// Create stage payload for retry using abstract workflow definitions
    async fn create_stage_payload_for_retry(&self, workflow_state: &WorkflowState, stage: &WorkflowStage) -> AppResult<super::types::JobPayload> {
        // Convert stage to task type and find corresponding stage definition
        let task_type = stage_scheduler::stage_to_task_type_internal(stage);
        
        // Get workflow definition from loaded definitions
        let workflow_definitions = self.get_workflow_definitions().await
            .map_err(|e| AppError::JobError(format!("Failed to get workflow definitions: {}", e)))?;
        
        // Find the FileFinderWorkflow definition (assuming this is the main workflow)
        let workflow_definition = workflow_definitions.get("FileFinderWorkflow")
            .ok_or_else(|| AppError::JobError("FileFinderWorkflow definition not found".to_string()))?;
            
        // Find the stage definition for this task type
        let stage_definition = workflow_definition.stages.iter()
            .find(|stage_def| stage_def.task_type == task_type)
            .ok_or_else(|| AppError::JobError(format!("Stage definition not found for task type: {:?}", task_type)))?;
            
        // Use abstract payload creation
        payload_builder::create_abstract_stage_payload(&self.app_handle, workflow_state, stage_definition, workflow_definition).await
    }

    /// Retry a specific workflow stage
    pub async fn retry_workflow_stage(
        &self,
        workflow_id: &str,
        stage_to_retry: WorkflowStage,
        original_failed_job_id: &str,
    ) -> AppResult<String> {
        retry_handler::retry_workflow_stage_internal(
            &self.workflows,
            &self.workflow_definitions,
            &self.app_handle,
            workflow_id,
            stage_to_retry,
            original_failed_job_id,
        ).await
    }

    /// Retry a specific workflow stage with configurable delay and retry count
    pub async fn retry_workflow_stage_with_config(
        &self,
        workflow_id: &str,
        stage_to_retry: WorkflowStage,
        original_failed_job_id: &str,
        delay_ms: Option<u64>,
        retry_attempt: Option<u32>,
    ) -> AppResult<String> {
        retry_handler::retry_workflow_stage_with_config_internal(
            &self.workflows,
            &self.workflow_definitions,
            &self.app_handle,
            workflow_id,
            stage_to_retry,
            original_failed_job_id,
            delay_ms,
            retry_attempt,
        ).await
    }

    /// Reset subsequent stages that might need to be re-executed after a retry
    pub async fn reset_subsequent_stages(&self, workflow_state: &WorkflowState, retry_stage: &WorkflowStage) -> AppResult<()> {
        // Get workflow definition for dependency traversal
        let workflow_definition = {
            let definitions = self.workflow_definitions.lock().await;
            definitions.get("FileFinderWorkflow")
                .ok_or_else(|| AppError::JobError("FileFinderWorkflow definition not found".to_string()))?
                .clone()
        };

        retry_handler::reset_subsequent_stages_internal(&self.workflows, workflow_state, retry_stage, &workflow_definition).await
    }

}

// Global static instance
static WORKFLOW_ORCHESTRATOR: OnceCell<Arc<WorkflowOrchestrator>> = OnceCell::const_new();

/// Initialize the workflow orchestrator
pub async fn init_workflow_orchestrator(app_handle: AppHandle) -> AppResult<Arc<WorkflowOrchestrator>> {
    // Get the database pool from app state (managed by Tauri)
    let db_pool: sqlx::SqlitePool = app_handle.state::<sqlx::SqlitePool>().inner().clone();
    let pool_arc = Arc::new(db_pool);
    
    // Initialize the background job repository with the proper database pool
    let repo = Arc::new(BackgroundJobRepository::new(pool_arc));
    
    // Create the workflow cleanup handler
    let cleanup_handler = Arc::new(WorkflowCleanupHandler::new(repo.clone()));
    
    // Create the workflow cancellation handler
    let cancellation_handler = Arc::new(WorkflowCancellationHandler::new(repo.clone()));
    
    // Create the workflow error handler
    let error_handler = Arc::new(WorkflowErrorHandler::new(repo, app_handle.clone()));
    
    // Create the orchestrator with all handlers
    let orchestrator = Arc::new(WorkflowOrchestrator::new(
        app_handle, 
        cleanup_handler, 
        cancellation_handler,
        error_handler
    ));
    
    // Load workflow definitions after creating the orchestrator - FAIL FAST, NO FALLBACKS
    orchestrator.load_default_workflow_definitions().await
        .map_err(|e| AppError::JobError(format!("Failed to initialize workflow orchestrator - workflow definitions must be loaded from JSON files: {}", e)))?;
    
    if let Err(_) = WORKFLOW_ORCHESTRATOR.set(orchestrator.clone()) {
        return Err(AppError::JobError("Failed to initialize workflow orchestrator".to_string()));
    }
    
    // Recover any orphaned jobs from previous sessions
    if let Err(e) = orchestrator.recover_orphaned_jobs().await {
        error!("Failed to recover orphaned workflow jobs: {}", e);
    }
    
    info!("Workflow orchestrator initialized with cleanup, cancellation, and error handlers");
    Ok(orchestrator)
}

/// Get the global workflow orchestrator instance
pub async fn get_workflow_orchestrator() -> AppResult<Arc<WorkflowOrchestrator>> {
    match WORKFLOW_ORCHESTRATOR.get() {
        Some(orchestrator) => Ok(orchestrator.clone()),
        None => Err(AppError::JobError("Workflow orchestrator not initialized".to_string())),
    }
}