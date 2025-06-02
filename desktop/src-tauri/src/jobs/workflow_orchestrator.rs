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
    workflows: Mutex<HashMap<String, WorkflowState>>,
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
            workflows: Mutex::new(HashMap::new()),
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
        // Load workflow definitions from configuration files
        let workflow_definitions = self.load_workflow_definitions_from_files()?;
        
        // Store the loaded definitions
        match self.get_workflow_definitions().await {
            Ok(mut guard) => *guard = workflow_definitions,
            Err(e) => return Err(AppError::JobError(format!("Failed to store workflow definitions: {}", e)))
        }

        info!("Loaded workflow definitions from configuration files");
        Ok(())
    }

    /// Load workflow definitions from JSON files in the workflow_definitions directory
    fn load_workflow_definitions_from_files(&self) -> AppResult<HashMap<String, Arc<WorkflowDefinition>>> {
        let mut workflow_definitions = HashMap::new();
        
        // Get the path to the workflow_definitions directory
        let workflow_definitions_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/jobs/workflow_definitions");
        
        if !workflow_definitions_dir.exists() {
            return Err(AppError::JobError(format!(
                "Workflow definitions directory not found: {:?}", 
                workflow_definitions_dir
            )));
        }

        // Read all JSON files in the directory
        let entries = std::fs::read_dir(&workflow_definitions_dir)
            .map_err(|e| AppError::JobError(format!("Failed to read workflow definitions directory: {}", e)))?;

        for entry in entries {
            let entry = entry.map_err(|e| AppError::JobError(format!("Failed to read directory entry: {}", e)))?;
            let path = entry.path();
            
            // Only process .json files
            if path.extension().map(|ext| ext == "json").unwrap_or(false) {
                info!("Loading workflow definition from: {:?}", path);
                
                // Read and parse the JSON file
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| AppError::JobError(format!("Failed to read workflow file {:?}: {}", path, e)))?;
                
                let workflow_definition: WorkflowDefinition = serde_json::from_str(&content)
                    .map_err(|e| AppError::JobError(format!("Failed to parse workflow file {:?}: {}", path, e)))?;
                
                // Validate the workflow definition
                workflow_definition.validate().map_err(|e| {
                    AppError::JobError(format!("Invalid workflow definition in {:?}: {}", path, e))
                })?;
                
                let workflow_name = workflow_definition.name.clone();
                workflow_definitions.insert(workflow_name.clone(), Arc::new(workflow_definition));
                
                info!("Successfully loaded workflow definition: {}", workflow_name);
            }
        }

        if workflow_definitions.is_empty() {
            return Err(AppError::JobError("No valid workflow definitions found".to_string()));
        }

        Ok(workflow_definitions)
    }

    /// Legacy method for hardcoded workflow definitions (kept for fallback)
    async fn load_hardcoded_workflow_definitions(&self) -> AppResult<()> {
        // Define the File Finder Workflow
        let file_finder_stages = vec![
            WorkflowStageDefinition::entry_stage(
                "GeneratingDirTree".to_string(),
                TaskType::DirectoryTreeGeneration,
            ),
            WorkflowStageDefinition::dependent_stage(
                "GeneratingRegex".to_string(),
                TaskType::RegexPatternGeneration,
                vec!["GeneratingDirTree".to_string()],
            ),
            WorkflowStageDefinition::dependent_stage(
                "LocalFiltering".to_string(),
                TaskType::LocalFileFiltering,
                vec!["GeneratingRegex".to_string()],
            ),
            WorkflowStageDefinition::dependent_stage(
                "InitialPathFinder".to_string(),
                TaskType::PathFinder,
                vec!["LocalFiltering".to_string()],
            ),
            WorkflowStageDefinition::dependent_stage(
                "InitialPathCorrection".to_string(),
                TaskType::PathCorrection,
                vec!["InitialPathFinder".to_string()],
            ),
            WorkflowStageDefinition::dependent_stage(
                "ExtendedPathFinder".to_string(),
                TaskType::ExtendedPathFinder,
                vec!["InitialPathCorrection".to_string()],
            ),
            WorkflowStageDefinition::dependent_stage(
                "ExtendedPathCorrection".to_string(),
                TaskType::ExtendedPathCorrection,
                vec!["ExtendedPathFinder".to_string()],
            ),
        ];

        let file_finder_workflow = WorkflowDefinition::new(
            "FileFinderWorkflow".to_string(),
            file_finder_stages,
        );

        // Validate the workflow definition
        file_finder_workflow.validate().map_err(|e| {
            AppError::JobError(format!("Invalid FileFinderWorkflow definition: {}", e))
        })?;

        // Store in workflow definitions (this is synchronous because we're in constructor)
        // We'll use a blocking approach here since this is initialization
        let workflow_definitions = std::sync::Mutex::new(HashMap::new());
        {
            let mut definitions = workflow_definitions.lock()
                .map_err(|e| AppError::JobError(format!("Failed to lock workflow definitions: {:?}", e)))?;
            definitions.insert(
                "FileFinderWorkflow".to_string(),
                Arc::new(file_finder_workflow),
            );
        }
        
        // Copy to the async mutex (this is a bit awkward but necessary for initialization)
        let definitions_clone = workflow_definitions.into_inner().map_err(|e| {
            AppError::JobError(format!("Failed to extract workflow definitions: {:?}", e))
        })?;
        match self.get_workflow_definitions().await {
            Ok(mut guard) => *guard = definitions_clone,
            Err(e) => return Err(AppError::JobError(format!("Failed to store hardcoded workflow definitions: {}", e)))
        }

        info!("Loaded default workflow definitions");
        Ok(())
    }


    /// Start a new workflow (renamed from start_workflow_by_definition)
    pub async fn start_workflow(
        &self,
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
            let definitions = self.get_workflow_definitions().await
                .map_err(|e| AppError::JobError(format!("Failed to get workflow definitions: {}", e)))?;
            definitions.get(&workflow_definition_name)
                .cloned()
                .ok_or_else(|| AppError::JobError(format!("Workflow definition not found: {}", workflow_definition_name)))?
        };

        // Create initial workflow state
        let mut workflow_state = WorkflowState::new(
            workflow_id.clone(),
            session_id.clone(),
            task_description.clone(),
            project_directory.clone(),
            excluded_paths.clone(),
            timeout_ms,
        );

        workflow_state.status = WorkflowStatus::Running;

        // Emit workflow started event
        self.emit_workflow_status_event(&workflow_state, "Workflow started").await;

        // Find and start the first stage(s) - those with no dependencies
        let entry_stages = workflow_definition.get_entry_stages();
        
        if entry_stages.is_empty() {
            return Err(AppError::JobError(format!("No entry stages found in workflow definition: {}", workflow_definition_name)));
        }

        // Store the workflow state and create entry stage jobs in the same lock scope
        {
            let mut workflows = self.workflows.lock().await;
            workflows.insert(workflow_id.clone(), workflow_state.clone());
            
            // Create all entry stage jobs while holding the lock
            for entry_stage in entry_stages {
                self.create_abstract_stage_job_with_lock(&mut workflows, &workflow_state, entry_stage, &workflow_definition).await?;
            }
        }

        info!("Started workflow '{}' with ID: {}", workflow_definition_name, workflow_id);
        Ok(workflow_id)
    }


    /// Cancel a workflow and all its pending/running jobs
    pub async fn cancel_workflow(&self, workflow_id: &str) -> AppResult<()> {
        info!("Canceling workflow: {}", workflow_id);

        // Use the WorkflowCancellationHandler to cancel all associated jobs
        let cancellation_result = self.workflow_cancellation_handler
            .cancel_workflow(workflow_id, "User requested cancellation", &self.app_handle)
            .await?;

        info!("Canceled {} jobs for workflow {}, {} failures", 
              cancellation_result.canceled_jobs.len(), 
              workflow_id,
              cancellation_result.failed_cancellations.len());

        // Update the workflow state to canceled
        let mut workflows = self.workflows.lock().await;
        if let Some(workflow_state) = workflows.get_mut(workflow_id) {
            workflow_state.status = WorkflowStatus::Canceled;
            workflow_state.updated_at = chrono::Utc::now().timestamp_millis();
            workflow_state.completed_at = Some(workflow_state.updated_at);

            // Emit workflow canceled event
            self.emit_workflow_status_event(workflow_state, "Workflow canceled").await;
            
            info!("Workflow {} marked as canceled", workflow_id);
            Ok(())
        } else {
            Err(AppError::JobError(format!("Workflow not found: {}", workflow_id)))
        }
    }

    /// Pause a workflow - prevents new stages from starting
    pub async fn pause_workflow(&self, workflow_id: &str) -> AppResult<()> {
        info!("Pausing workflow: {}", workflow_id);

        let mut workflows = self.workflows.lock().await;
        if let Some(workflow_state) = workflows.get_mut(workflow_id) {
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
            self.emit_workflow_status_event(workflow_state, "Workflow paused").await;
            
            info!("Workflow {} marked as paused", workflow_id);
            Ok(())
        } else {
            Err(AppError::JobError(format!("Workflow not found: {}", workflow_id)))
        }
    }

    /// Resume a paused workflow - allows new stages to start
    pub async fn resume_workflow(&self, workflow_id: &str) -> AppResult<()> {
        info!("Resuming workflow: {}", workflow_id);

        let workflow_id_clone = workflow_id.to_string();

        {
            let mut workflows = self.workflows.lock().await;
            if let Some(workflow_state) = workflows.get_mut(workflow_id) {
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
                self.emit_workflow_status_event(workflow_state, "Workflow resumed").await;
                
                info!("Workflow {} marked as running", workflow_id);
            } else {
                return Err(AppError::JobError(format!("Workflow not found: {}", workflow_id)));
            }
        }

        // Try to start next stages now that workflow is resumed
        if let Err(e) = self.start_next_stages(&workflow_id_clone).await {
            warn!("Failed to start next stages after resuming workflow {}: {}", workflow_id, e);
        }

        Ok(())
    }

    /// Get workflow status and progress
    pub async fn get_workflow_status(&self, workflow_id: &str) -> AppResult<WorkflowState> {
        let workflows = self.workflows.lock().await;
        workflows.get(workflow_id)
            .cloned()
            .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))
    }

    /// Get workflow results (final selected files and intermediate data)
    pub async fn get_workflow_results(&self, workflow_id: &str) -> AppResult<WorkflowResult> {
        let workflow_state = self.get_workflow_status(workflow_id).await?;
        Ok(WorkflowResult::from_workflow_state(&workflow_state))
    }

    /// Update job status for a workflow stage
    pub async fn update_job_status(
        &self,
        job_id: &str,
        status: JobStatus,
        error_message: Option<String>,
    ) -> AppResult<()> {
        debug!("Updating job status: {} -> {:?}", job_id, status);

        let workflow_id = self.find_workflow_by_job_id(job_id).await?;
        
        {
            let mut workflows = self.workflows.lock().await;
            if let Some(workflow_state) = workflows.get_mut(&workflow_id) {
                // Update the stage job status
                workflow_state.update_stage_job(job_id, status.clone(), error_message.clone());

                // Emit stage event
                if let Some(stage_job) = workflow_state.get_stage_job(job_id) {
                    self.emit_workflow_stage_event(&workflow_id, stage_job, &status, error_message.clone()).await;
                }

                // Check if workflow should progress to next stage or complete
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
                    _ => {}
                }
            }
        }

        Ok(())
    }

    /// Store intermediate data from a completed stage
    pub async fn store_stage_data(
        &self,
        job_id: &str,
        stage_data: serde_json::Value,
    ) -> AppResult<()> {
        let workflow_id = self.find_workflow_by_job_id(job_id).await?;
        
        let mut workflows = self.workflows.lock().await;
        if let Some(workflow_state) = workflows.get_mut(&workflow_id) {
            if let Some(stage_job) = workflow_state.get_stage_job(job_id) {
                let stage_clone = stage_job.stage.clone();
                self.update_intermediate_data(workflow_state, &stage_clone, stage_data).await?;
            }
        }

        Ok(())
    }

    /// Get all active workflows
    pub async fn get_active_workflows(&self) -> Vec<WorkflowState> {
        let workflows = self.workflows.lock().await;
        workflows.values()
            .filter(|w| matches!(w.status, WorkflowStatus::Running | WorkflowStatus::Created))
            .cloned()
            .collect()
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

    /// Start the next available stage(s) in the workflow (supports parallel execution)
    async fn start_next_stages(&self, workflow_id: &str) -> AppResult<()> {
        let workflow_state = {
            let workflows = self.workflows.lock().await;
            workflows.get(workflow_id).cloned()
                .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))?
        };

        // Check if workflow is paused - don't start new stages
        if workflow_state.status == WorkflowStatus::Paused {
            debug!("Workflow {} is paused, not starting new stages", workflow_id);
            return Ok(());
        }

        // Find all stages that can be executed in parallel
        let next_stages = self.find_next_stages_to_execute(&workflow_state).await;

        if next_stages.is_empty() {
            // Check if all stages are completed
            if workflow_state.is_completed() {
                self.mark_workflow_completed(workflow_id).await?;
            } else if workflow_state.has_failed() {
                self.mark_workflow_failed(workflow_id, "One or more stages failed").await?;
            } else {
                debug!("No stages ready to execute for workflow: {}", workflow_id);
            }
        } else {
            // Check concurrency limits before starting all stages
            let max_concurrent = self.get_max_concurrent_stages().await;
            let currently_running = self.count_running_jobs_in_workflow(workflow_id).await;
            let available_slots = max_concurrent.saturating_sub(currently_running);
            
            if available_slots == 0 {
                debug!("Cannot start more stages for workflow {} - concurrency limit reached ({} running)", workflow_id, currently_running);
                return Ok(());
            }

            // Start eligible stages up to the concurrency limit
            let stages_to_start = next_stages.into_iter().take(available_slots);
            for stage in stages_to_start {
                info!("Starting stage: {:?} for workflow: {}", stage, workflow_id);
                let stage_clone = stage.clone();
                if let Err(e) = self.create_stage_job(&workflow_state, stage).await {
                    error!("Failed to create stage job for {:?}: {}", stage_clone, e);
                    // Continue with other stages even if one fails to create
                }
            }
        }

        Ok(())
    }

    /// Start the next available stage in the workflow (legacy method, kept for compatibility)
    async fn start_next_stage(&self, workflow_id: &str) -> AppResult<()> {
        self.start_next_stages(workflow_id).await
    }

    /// Find all stages that can be executed in parallel
    async fn find_next_stages_to_execute(&self, workflow_state: &WorkflowState) -> Vec<WorkflowStage> {
        let all_stages = WorkflowStage::all_stages();
        let mut eligible_stages = Vec::new();
        
        for stage in all_stages {
            // Check if this stage already has a job
            if workflow_state.get_stage_job_by_stage(&stage).is_some() {
                continue;
            }

            // Check if dependencies are met
            if self.stage_dependencies_met(&stage, workflow_state) {
                eligible_stages.push(stage);
            }
        }

        eligible_stages
    }

    /// Find the next stage that can be executed (legacy method for compatibility)
    async fn find_next_stage_to_execute(&self, workflow_state: &WorkflowState) -> Option<WorkflowStage> {
        self.find_next_stages_to_execute(workflow_state).await.into_iter().next()
    }

    /// Check if dependencies for a stage are met
    fn stage_dependencies_met(&self, stage: &WorkflowStage, workflow_state: &WorkflowState) -> bool {
        if let Some(prev_stage) = stage.previous_stage() {
            // Check if previous stage is completed
            workflow_state.get_stage_job_by_stage(&prev_stage)
                .map(|job| job.status == JobStatus::Completed)
                .unwrap_or(false)
        } else {
            // First stage, no dependencies
            true
        }
    }

    /// Find all stages that can be executed in parallel using abstract workflow definitions
    async fn find_next_abstract_stages_to_execute<'a>(
        &self, 
        workflow_state: &WorkflowState,
        workflow_definition: &'a WorkflowDefinition
    ) -> Vec<&'a WorkflowStageDefinition> {
        let mut eligible_stages = Vec::new();
        
        for stage_def in &workflow_definition.stages {
            // Check if this stage already has a job by matching stage name or task type
            let stage_exists = workflow_state.stage_jobs.iter().any(|job| {
                // Match by converting task type back to stage or by metadata
                match &job.stage {
                    WorkflowStage::GeneratingDirTree => stage_def.task_type == TaskType::DirectoryTreeGeneration,
                    WorkflowStage::GeneratingRegex => stage_def.task_type == TaskType::RegexPatternGeneration,
                    WorkflowStage::LocalFiltering => stage_def.task_type == TaskType::LocalFileFiltering,
                    WorkflowStage::InitialPathFinder => stage_def.task_type == TaskType::PathFinder,
                    WorkflowStage::InitialPathCorrection => stage_def.task_type == TaskType::PathCorrection,
                    WorkflowStage::ExtendedPathFinder => stage_def.task_type == TaskType::ExtendedPathFinder,
                    WorkflowStage::ExtendedPathCorrection => stage_def.task_type == TaskType::ExtendedPathCorrection,
                }
            });

            if stage_exists {
                continue;
            }

            // Check if dependencies are met
            if self.abstract_stage_dependencies_met(stage_def, workflow_state, workflow_definition) {
                eligible_stages.push(stage_def);
            }
        }

        eligible_stages
    }

    /// Check if dependencies for an abstract stage are met
    fn abstract_stage_dependencies_met(
        &self, 
        stage_def: &WorkflowStageDefinition, 
        workflow_state: &WorkflowState,
        workflow_definition: &WorkflowDefinition
    ) -> bool {
        if stage_def.dependencies.is_empty() {
            return true; // No dependencies, can execute
        }

        // Check that all dependency stages are completed
        for dep_stage_name in &stage_def.dependencies {
            if let Some(dep_stage_def) = workflow_definition.get_stage(dep_stage_name) {
                // Find if this dependency stage has been completed
                let dep_completed = workflow_state.stage_jobs.iter().any(|job| {
                    // Match by task type and check if completed
                    let task_type_matches = match &job.stage {
                        WorkflowStage::GeneratingDirTree => dep_stage_def.task_type == TaskType::DirectoryTreeGeneration,
                        WorkflowStage::GeneratingRegex => dep_stage_def.task_type == TaskType::RegexPatternGeneration,
                        WorkflowStage::LocalFiltering => dep_stage_def.task_type == TaskType::LocalFileFiltering,
                        WorkflowStage::InitialPathFinder => dep_stage_def.task_type == TaskType::PathFinder,
                        WorkflowStage::InitialPathCorrection => dep_stage_def.task_type == TaskType::PathCorrection,
                        WorkflowStage::ExtendedPathFinder => dep_stage_def.task_type == TaskType::ExtendedPathFinder,
                        WorkflowStage::ExtendedPathCorrection => dep_stage_def.task_type == TaskType::ExtendedPathCorrection,
                    };
                    task_type_matches && job.status == crate::models::JobStatus::Completed
                });

                if !dep_completed {
                    return false; // Dependency not completed
                }
            } else {
                return false; // Dependency stage not found
            }
        }

        true // All dependencies are met
    }

    /// Get the maximum number of concurrent stages that can run in a workflow
    async fn get_max_concurrent_stages(&self) -> usize {
        // This could be configurable, but for now we'll use a reasonable default
        // The JobQueue's semaphore will ultimately control system-wide concurrency
        3 // Allow up to 3 stages to run concurrently per workflow
    }

    /// Count the number of currently running jobs in a specific workflow
    async fn count_running_jobs_in_workflow(&self, workflow_id: &str) -> usize {
        let workflows = self.workflows.lock().await;
        if let Some(workflow_state) = workflows.get(workflow_id) {
            workflow_state.stage_jobs.iter()
                .filter(|job| job.status == crate::models::JobStatus::Running)
                .count()
        } else {
            0
        }
    }

    /// Create and queue a job for a specific workflow stage
    async fn create_stage_job(&self, workflow_state: &WorkflowState, stage: WorkflowStage) -> AppResult<String> {
        let task_type = self.stage_to_task_type(&stage);
        let job_payload = self.create_stage_payload(workflow_state, &stage).await?;
        
        // Get model configuration for the stage
        let model_settings = self.get_stage_model_config(&stage, &workflow_state.project_directory).await?;

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
            &stage.display_name().to_uppercase().replace(" ", "_"),
            &workflow_state.task_description,
            model_settings,
            job_payload,
            10, // High priority for workflow jobs
            Some(workflow_state.workflow_id.clone()), // workflow_id
            Some(stage.display_name().to_string()), // workflow_stage
            Some(serde_json::json!({
                "workflowId": workflow_state.workflow_id,
                "workflowStage": self.stage_to_task_type(&stage).to_string(),
                "stageName": stage.display_name()
            })),
            &self.app_handle,
        ).await?;

        // Add the stage job to workflow state
        {
            let mut workflows = self.workflows.lock().await;
            if let Some(workflow) = workflows.get_mut(&workflow_state.workflow_id) {
                let depends_on = stage.previous_stage()
                    .and_then(|prev_stage| workflow.get_stage_job_by_stage(&prev_stage))
                    .map(|job| job.job_id.clone());
                
                workflow.add_stage_job(stage.clone(), job_id.clone(), depends_on);
            }
        }

        info!("Created stage job {} for stage {:?}", job_id, &stage);
        Ok(job_id)
    }

    /// Create and queue a job for a specific workflow stage using abstract workflow definitions
    /// Create a stage job while holding the workflows lock (avoids deadlock)
    async fn create_abstract_stage_job_with_lock(
        &self,
        workflows: &mut std::collections::HashMap<String, WorkflowState>,
        workflow_state: &WorkflowState,
        stage_definition: &WorkflowStageDefinition,
        workflow_definition: &WorkflowDefinition
    ) -> AppResult<String> {
        let task_type = stage_definition.task_type;
        
        // Create stage payload based on task type and dependency data
        let job_payload = self.create_abstract_stage_payload(workflow_state, stage_definition, workflow_definition).await?;
        
        // Convert to WorkflowStage for model configuration
        let stage = match task_type {
            TaskType::DirectoryTreeGeneration => WorkflowStage::GeneratingDirTree,
            TaskType::RegexPatternGeneration => WorkflowStage::GeneratingRegex,
            TaskType::LocalFileFiltering => WorkflowStage::LocalFiltering,
            TaskType::PathFinder => WorkflowStage::InitialPathFinder,
            TaskType::PathCorrection => WorkflowStage::InitialPathCorrection,
            TaskType::ExtendedPathFinder => WorkflowStage::ExtendedPathFinder,
            TaskType::ExtendedPathCorrection => WorkflowStage::ExtendedPathCorrection,
            _ => return Err(AppError::JobError(format!("Unsupported task type for workflow stage: {:?}", task_type))),
        };
        
        // Get model configuration for the stage
        let model_settings = self.get_stage_model_config(&stage, &workflow_state.project_directory).await?;

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
            &self.app_handle,
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
                            .find(|job| {
                                let job_task_type = match &job.stage {
                                    WorkflowStage::GeneratingDirTree => TaskType::DirectoryTreeGeneration,
                                    WorkflowStage::GeneratingRegex => TaskType::RegexPatternGeneration,
                                    WorkflowStage::LocalFiltering => TaskType::LocalFileFiltering,
                                    WorkflowStage::InitialPathFinder => TaskType::PathFinder,
                                    WorkflowStage::InitialPathCorrection => TaskType::PathCorrection,
                                    WorkflowStage::ExtendedPathFinder => TaskType::ExtendedPathFinder,
                                    WorkflowStage::ExtendedPathCorrection => TaskType::ExtendedPathCorrection,
                                };
                                job_task_type == dep_stage_def.task_type
                            })
                    })
                    .map(|job| job.job_id.clone())
            };
            
            workflow.add_stage_job(stage.clone(), job_id.clone(), depends_on);
        }

        info!("Created abstract stage job {} for stage '{}'", job_id, stage_definition.stage_name);
        Ok(job_id)
    }

    async fn create_abstract_stage_job(
        &self, 
        workflow_state: &WorkflowState, 
        stage_definition: &WorkflowStageDefinition,
        workflow_definition: &WorkflowDefinition
    ) -> AppResult<String> {
        let task_type = stage_definition.task_type;
        
        // Create stage payload based on task type and dependency data
        let job_payload = self.create_abstract_stage_payload(workflow_state, stage_definition, workflow_definition).await?;
        
        // Convert to WorkflowStage for model configuration
        let stage = match task_type {
            TaskType::DirectoryTreeGeneration => WorkflowStage::GeneratingDirTree,
            TaskType::RegexPatternGeneration => WorkflowStage::GeneratingRegex,
            TaskType::LocalFileFiltering => WorkflowStage::LocalFiltering,
            TaskType::PathFinder => WorkflowStage::InitialPathFinder,
            TaskType::PathCorrection => WorkflowStage::InitialPathCorrection,
            TaskType::ExtendedPathFinder => WorkflowStage::ExtendedPathFinder,
            TaskType::ExtendedPathCorrection => WorkflowStage::ExtendedPathCorrection,
            _ => return Err(AppError::JobError(format!("Unsupported task type for workflow stage: {:?}", task_type))),
        };
        
        // Get model configuration for the stage
        let model_settings = self.get_stage_model_config(&stage, &workflow_state.project_directory).await?;

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
            &self.app_handle,
        ).await?;

        // Add the stage job to workflow state
        {
            let mut workflows = self.workflows.lock().await;
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
                                .find(|job| {
                                    let job_task_type = match &job.stage {
                                        WorkflowStage::GeneratingDirTree => TaskType::DirectoryTreeGeneration,
                                        WorkflowStage::GeneratingRegex => TaskType::RegexPatternGeneration,
                                        WorkflowStage::LocalFiltering => TaskType::LocalFileFiltering,
                                        WorkflowStage::InitialPathFinder => TaskType::PathFinder,
                                        WorkflowStage::InitialPathCorrection => TaskType::PathCorrection,
                                        WorkflowStage::ExtendedPathFinder => TaskType::ExtendedPathFinder,
                                        WorkflowStage::ExtendedPathCorrection => TaskType::ExtendedPathCorrection,
                                    };
                                    job_task_type == dep_stage_def.task_type
                                })
                        })
                        .map(|job| job.job_id.clone())
                };
                
                workflow.add_stage_job(stage.clone(), job_id.clone(), depends_on);
            }
        }

        info!("Created abstract stage job {} for stage '{}'", job_id, stage_definition.stage_name);
        Ok(job_id)
    }

    /// Create payload for abstract stage with proper data injection from dependencies
    async fn create_abstract_stage_payload(
        &self,
        workflow_state: &WorkflowState,
        stage_definition: &WorkflowStageDefinition,
        workflow_definition: &WorkflowDefinition
    ) -> AppResult<super::types::JobPayload> {
        let task_type = stage_definition.task_type;
        let repo = self.app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>().inner().clone();
        let settings_repo = self.app_handle.state::<std::sync::Arc<crate::db_utils::SettingsRepository>>().inner().clone();
        
        match task_type {
            TaskType::DirectoryTreeGeneration => {
                // Entry stage - create basic payload
                let payload = super::stage_data_injectors::StageDataInjector::create_directory_tree_payload(
                    workflow_state.session_id.clone(),
                    workflow_state.task_description.clone(),
                    workflow_state.project_directory.clone(),
                    workflow_state.excluded_paths.clone(),
                    Some(workflow_state.workflow_id.clone())
                );
                Ok(super::types::JobPayload::DirectoryTreeGeneration(payload))
            }
            TaskType::RegexPatternGeneration => {
                // Find the directory tree generation job - critical dependency
                let dir_tree_job = self.find_dependency_job(workflow_state, TaskType::DirectoryTreeGeneration)?;
                
                // Extract directory tree with graceful handling of missing data
                let directory_tree = match super::stage_data_extractors::StageDataExtractor::extract_directory_tree(&dir_tree_job.job_id, &repo).await {
                    Ok(tree) if !tree.trim().is_empty() => tree,
                    Ok(_) => {
                        warn!("Directory tree is empty for job {}, using minimal fallback", dir_tree_job.job_id);
                        "No directory structure available".to_string()
                    },
                    Err(e) => {
                        error!("Failed to extract directory tree for RegexPatternGeneration: {}", e);
                        return Err(AppError::JobError(format!("Critical dependency data missing: directory tree from job {}", dir_tree_job.job_id)));
                    }
                };
                
                // Create a temporary base payload to match StageDataInjector signature
                let base_payload = super::types::DirectoryTreeGenerationPayload {
                    background_job_id: uuid::Uuid::new_v4().to_string(),
                    session_id: workflow_state.session_id.clone(),
                    task_description: workflow_state.task_description.clone(),
                    project_directory: workflow_state.project_directory.clone(),
                    excluded_paths: workflow_state.excluded_paths.clone(),
                    workflow_id: workflow_state.workflow_id.clone(),
                    next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()),
                };
                
                let payload = super::stage_data_injectors::StageDataInjector::create_regex_generation_payload(
                    &base_payload,
                    directory_tree,
                    uuid::Uuid::new_v4().to_string()
                );
                Ok(super::types::JobPayload::RegexPatternGenerationWorkflow(payload))
            }
            TaskType::LocalFileFiltering => {
                // LocalFileFiltering requires: directory_tree (from DirectoryTreeGeneration) and regex_patterns (from RegexPatternGeneration)
                debug!("LocalFileFiltering: Verifying dependency requirements");
                
                // First, ensure we have the critical dependency: directory tree
                let dir_tree_job = self.find_dependency_job(workflow_state, TaskType::DirectoryTreeGeneration)?;
                let directory_tree = super::stage_data_extractors::StageDataExtractor::extract_directory_tree(&dir_tree_job.job_id, &repo).await
                    .map_err(|e| AppError::JobError(format!("Failed to extract directory tree for LocalFileFiltering: {}", e)))?;
                
                // Try to get regex patterns from completed job, or from latest job with output (even if failed/skipped)
                let (regex_patterns, regex_context) = if let Ok(regex_job) = self.find_dependency_job(workflow_state, TaskType::RegexPatternGeneration) {
                    // Standard path: completed regex job
                    debug!("Using completed RegexPatternGeneration job: {}", regex_job.job_id);
                    let patterns = super::stage_data_extractors::StageDataExtractor::extract_regex_patterns(&regex_job.job_id, &repo).await
                        .map_err(|e| AppError::JobError(format!("Failed to extract regex patterns from completed job: {}", e)))?;
                    
                    let regex_job_data = repo.get_job_by_id(&regex_job.job_id).await?
                        .ok_or_else(|| AppError::JobError(format!("Regex job {} not found", regex_job.job_id)))?;
                    let regex_payload: super::types::RegexPatternGenerationWorkflowPayload = 
                        serde_json::from_str(&regex_job_data.prompt)
                            .map_err(|e| AppError::SerializationError(format!("Failed to parse regex payload: {}", e)))?;
                    
                    (patterns, Some(regex_payload))
                } else if let Some(regex_job) = self.get_latest_dependency_job_output(workflow_state, TaskType::RegexPatternGeneration) {
                    // Fallback: use partial data from failed-but-skipped regex job
                    warn!("Using partial data from failed/skipped RegexPatternGeneration job: {} (status: {:?})", 
                          regex_job.job_id, regex_job.status);
                    
                    match super::stage_data_extractors::StageDataExtractor::extract_regex_patterns(&regex_job.job_id, &repo).await {
                        Ok(patterns) => {
                            debug!("Successfully extracted {} patterns from failed/skipped job", patterns.len());
                            
                            let regex_job_data = repo.get_job_by_id(&regex_job.job_id).await?
                                .ok_or_else(|| AppError::JobError(format!("Regex job {} not found", regex_job.job_id)))?;
                            match serde_json::from_str::<super::types::RegexPatternGenerationWorkflowPayload>(&regex_job_data.prompt) {
                                Ok(regex_payload) => (patterns, Some(regex_payload)),
                                Err(e) => {
                                    warn!("Failed to parse regex payload from failed job, using empty patterns: {}", e);
                                    (vec![], None)
                                }
                            }
                        },
                        Err(e) => {
                            warn!("Failed to extract patterns from failed/skipped job, using empty patterns: {}", e);
                            (vec![], None)
                        }
                    }
                } else {
                    // No regex job found at all - proceed with empty patterns
                    warn!("No RegexPatternGeneration job found, proceeding with empty patterns");
                    (vec![], None)
                };
                
                // Create the filtering payload based on available data
                let payload = if let Some(regex_payload) = regex_context {
                    // Use existing regex context
                    super::stage_data_injectors::StageDataInjector::create_local_filtering_payload(
                        &settings_repo,
                        &regex_payload,
                        regex_patterns,
                        uuid::Uuid::new_v4().to_string()
                    ).await
                } else {
                    // Create minimal context from directory tree
                    let temp_regex_payload = super::types::RegexPatternGenerationWorkflowPayload {
                        background_job_id: uuid::Uuid::new_v4().to_string(),
                        session_id: workflow_state.session_id.clone(),
                        task_description: workflow_state.task_description.clone(),
                        project_directory: workflow_state.project_directory.clone(),
                        directory_tree,
                        workflow_id: workflow_state.workflow_id.clone(),
                        previous_stage_job_id: Some(dir_tree_job.job_id.clone()),
                        next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()),
                    };
                    
                    super::stage_data_injectors::StageDataInjector::create_local_filtering_payload(
                        &settings_repo,
                        &temp_regex_payload,
                        regex_patterns, // Empty if no regex data available
                        uuid::Uuid::new_v4().to_string()
                    ).await
                };
                
                // Validate payload before returning
                super::stage_data_injectors::StageDataInjector::validate_filtering_payload(&payload)
                    .map_err(|e| AppError::JobError(format!("LocalFiltering payload validation failed: {}", e)))?;
                
                Ok(super::types::JobPayload::LocalFileFiltering(payload))
            }
            TaskType::PathFinder => {
                let filtering_job = self.find_dependency_job(workflow_state, TaskType::LocalFileFiltering)?;
                
                // Extract filtered paths with graceful handling of missing data
                let filtered_paths = match super::stage_data_extractors::StageDataExtractor::extract_filtered_paths(&filtering_job.job_id, &repo).await {
                    Ok(paths) => paths,
                    Err(e) => {
                        warn!("Failed to extract filtered paths from job {}, using empty list: {}", filtering_job.job_id, e);
                        vec![]
                    }
                };
                
                // Get the original filtering payload with error handling
                let filtering_job_data = repo.get_job_by_id(&filtering_job.job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("Filtering job {} not found", filtering_job.job_id)))?;
                let filtering_payload: super::types::LocalFileFilteringPayload = 
                    serde_json::from_str(&filtering_job_data.prompt)
                        .map_err(|e| AppError::SerializationError(format!("Failed to parse filtering payload: {}", e)))?;
                
                let payload = super::stage_data_injectors::StageDataInjector::create_initial_path_finder_payload(
                    &settings_repo,
                    &filtering_payload,
                    filtered_paths,
                    uuid::Uuid::new_v4().to_string()
                ).await;
                
                Ok(super::types::JobPayload::PathFinder(payload))
            }
            TaskType::PathCorrection => {
                let finder_job = self.find_dependency_job(workflow_state, TaskType::PathFinder)?;
                let initial_paths = super::stage_data_extractors::StageDataExtractor::extract_initial_paths(&finder_job.job_id, &repo).await?;
                
                // Get the original finder payload
                let finder_job_data = repo.get_job_by_id(&finder_job.job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("PathFinder job {} not found", finder_job.job_id)))?;
                let finder_payload: super::types::PathFinderPayload = 
                    serde_json::from_str(&finder_job_data.prompt)
                        .map_err(|e| AppError::SerializationError(format!("Failed to parse PathFinder payload: {}", e)))?;
                
                let payload = super::stage_data_injectors::StageDataInjector::create_initial_path_correction_payload(
                    &settings_repo,
                    &finder_payload,
                    initial_paths
                ).await;
                
                Ok(super::types::JobPayload::PathCorrection(payload))
            }
            TaskType::ExtendedPathFinder => {
                let filtering_job = self.find_dependency_job(workflow_state, TaskType::LocalFileFiltering)?;
                let filtered_paths = super::stage_data_extractors::StageDataExtractor::extract_filtered_paths(&filtering_job.job_id, &repo).await?;
                
                // Get the original filtering payload
                let filtering_job_data = repo.get_job_by_id(&filtering_job.job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("Filtering job {} not found", filtering_job.job_id)))?;
                let filtering_payload: super::types::LocalFileFilteringPayload = 
                    serde_json::from_str(&filtering_job_data.prompt)
                        .map_err(|e| AppError::SerializationError(format!("Failed to parse filtering payload: {}", e)))?;
                
                let payload = super::stage_data_injectors::StageDataInjector::create_extended_finder_payload(
                    &settings_repo,
                    &filtering_payload,
                    filtered_paths,
                    uuid::Uuid::new_v4().to_string()
                ).await;
                
                Ok(super::types::JobPayload::ExtendedPathFinder(payload))
            }
            TaskType::ExtendedPathCorrection => {
                let extended_finder_job = self.find_dependency_job(workflow_state, TaskType::ExtendedPathFinder)?;
                let extended_paths = super::stage_data_extractors::StageDataExtractor::extract_extended_paths(&extended_finder_job.job_id, &repo).await?;
                
                // Get the original extended finder payload
                let finder_job_data = repo.get_job_by_id(&extended_finder_job.job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("ExtendedPathFinder job {} not found", extended_finder_job.job_id)))?;
                let finder_payload: super::types::ExtendedPathFinderPayload = 
                    serde_json::from_str(&finder_job_data.prompt)
                        .map_err(|e| AppError::SerializationError(format!("Failed to parse ExtendedPathFinder payload: {}", e)))?;
                
                let payload = super::stage_data_injectors::StageDataInjector::create_path_correction_payload(
                    &finder_payload,
                    extended_paths
                );
                
                Ok(super::types::JobPayload::ExtendedPathCorrection(payload))
            }
            _ => Err(AppError::JobError(format!("Unsupported task type for abstract workflow: {:?}", task_type)))
        }
    }

    /// Find a dependency job by task type in the workflow state
    fn find_dependency_job<'a>(&self, workflow_state: &'a WorkflowState, dependency_task_type: TaskType) -> AppResult<&'a super::workflow_types::WorkflowStageJob> {
        workflow_state.stage_jobs.iter()
            .find(|job| {
                let job_task_type = match &job.stage {
                    WorkflowStage::GeneratingDirTree => TaskType::DirectoryTreeGeneration,
                    WorkflowStage::GeneratingRegex => TaskType::RegexPatternGeneration,
                    WorkflowStage::LocalFiltering => TaskType::LocalFileFiltering,
                    WorkflowStage::InitialPathFinder => TaskType::PathFinder,
                    WorkflowStage::InitialPathCorrection => TaskType::PathCorrection,
                    WorkflowStage::ExtendedPathFinder => TaskType::ExtendedPathFinder,
                    WorkflowStage::ExtendedPathCorrection => TaskType::ExtendedPathCorrection,
                };
                job_task_type == dependency_task_type && job.status == crate::models::JobStatus::Completed
            })
            .ok_or_else(|| AppError::JobError(format!("No completed dependency job found for task type: {:?}", dependency_task_type)))
    }

    /// Find the latest dependency job (even if failed) that has output data
    /// This is useful for workflows that can continue with partial data from failed-but-skipped stages
    fn get_latest_dependency_job_output<'a>(&self, workflow_state: &'a WorkflowState, dependency_task_type: TaskType) -> Option<&'a super::workflow_types::WorkflowStageJob> {
        workflow_state.stage_jobs.iter()
            .filter(|job| {
                let job_task_type = match &job.stage {
                    WorkflowStage::GeneratingDirTree => TaskType::DirectoryTreeGeneration,
                    WorkflowStage::GeneratingRegex => TaskType::RegexPatternGeneration,
                    WorkflowStage::LocalFiltering => TaskType::LocalFileFiltering,
                    WorkflowStage::InitialPathFinder => TaskType::PathFinder,
                    WorkflowStage::InitialPathCorrection => TaskType::PathCorrection,
                    WorkflowStage::ExtendedPathFinder => TaskType::ExtendedPathFinder,
                    WorkflowStage::ExtendedPathCorrection => TaskType::ExtendedPathCorrection,
                };
                job_task_type == dependency_task_type && 
                (job.status == crate::models::JobStatus::Completed || 
                 job.status == crate::models::JobStatus::Failed ||
                 job.status == crate::models::JobStatus::Canceled)
            })
            .max_by_key(|job| job.created_at)
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

    /// Create payload for a specific stage
    async fn create_stage_payload(&self, workflow_state: &WorkflowState, stage: &WorkflowStage) -> AppResult<super::types::JobPayload> {
        match stage {
            WorkflowStage::GeneratingDirTree => {
                let payload = super::types::DirectoryTreeGenerationPayload {
                    background_job_id: uuid::Uuid::new_v4().to_string(),
                    session_id: workflow_state.session_id.clone(),
                    task_description: workflow_state.task_description.clone(),
                    project_directory: workflow_state.project_directory.clone(),
                    excluded_paths: workflow_state.excluded_paths.clone(),
                    workflow_id: workflow_state.workflow_id.clone(),
                    next_stage_job_id: None,
                };
                Ok(super::types::JobPayload::DirectoryTreeGeneration(payload))
            }
            WorkflowStage::GeneratingRegex => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for regex generation".to_string()))?;
                
                let payload = super::types::RegexPatternGenerationWorkflowPayload {
                    background_job_id: uuid::Uuid::new_v4().to_string(),
                    session_id: workflow_state.session_id.clone(),
                    task_description: workflow_state.task_description.clone(),
                    project_directory: workflow_state.project_directory.clone(),
                    directory_tree: directory_tree.clone(),
                    workflow_id: workflow_state.workflow_id.clone(),
                    previous_stage_job_id: None,
                    next_stage_job_id: None,
                };
                Ok(super::types::JobPayload::RegexPatternGenerationWorkflow(payload))
            }
            WorkflowStage::LocalFiltering => {
                // For LocalFiltering, I'll need to create a proper LocalFileFilteringPayload
                // This needs directory tree and regex patterns
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for local filtering".to_string()))?;
                
                let payload = super::types::LocalFileFilteringPayload {
                    background_job_id: uuid::Uuid::new_v4().to_string(),
                    session_id: workflow_state.session_id.clone(),
                    task_description: workflow_state.task_description.clone(),
                    project_directory: workflow_state.project_directory.clone(),
                    directory_tree: directory_tree.clone(),
                    excluded_paths: workflow_state.excluded_paths.clone(),
                    workflow_id: workflow_state.workflow_id.clone(),
                    previous_stage_job_id: uuid::Uuid::new_v4().to_string(), // This should be the dir tree job id
                    next_stage_job_id: None,
                };
                Ok(super::types::JobPayload::LocalFileFiltering(payload))
            }
            WorkflowStage::InitialPathFinder => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for path finding".to_string()))?;
                
                // Create a PathFinderPayload for the initial path finder
                let payload = super::types::PathFinderPayload {
                    session_id: workflow_state.session_id.clone(),
                    task_description: workflow_state.task_description.clone(),
                    background_job_id: uuid::Uuid::new_v4().to_string(),
                    project_directory: workflow_state.project_directory.clone(),
                    system_prompt: "Path finding system prompt".to_string(), // This should be loaded from settings
                    directory_tree: Some(directory_tree.clone()),
                    relevant_file_contents: std::collections::HashMap::new(),
                    estimated_input_tokens: None,
                    options: crate::jobs::processors::path_finder_types::PathFinderOptions::default(),
                };
                Ok(super::types::JobPayload::PathFinder(payload))
            }
            WorkflowStage::InitialPathCorrection => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for path correction".to_string()))?;
                
                let paths_to_correct = workflow_state.intermediate_data.initial_unverified_paths
                    .iter()
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("\n");
                
                let payload = super::types::PathCorrectionPayload {
                    background_job_id: uuid::Uuid::new_v4().to_string(),
                    session_id: workflow_state.session_id.clone(),
                    paths_to_correct,
                    context_description: workflow_state.task_description.clone(),
                    directory_tree: Some(directory_tree.clone()),
                    system_prompt_override: None,
                };
                Ok(super::types::JobPayload::PathCorrection(payload))
            }
            WorkflowStage::ExtendedPathFinder => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for extended path finding".to_string()))?;
                
                let mut current_verified = workflow_state.intermediate_data.initial_verified_paths.clone();
                current_verified.extend(workflow_state.intermediate_data.initial_corrected_paths.clone());
                
                let payload = super::types::ExtendedPathFinderPayload {
                    background_job_id: uuid::Uuid::new_v4().to_string(),
                    session_id: workflow_state.session_id.clone(),
                    task_description: workflow_state.task_description.clone(),
                    project_directory: workflow_state.project_directory.clone(),
                    directory_tree: directory_tree.clone(),
                    initial_paths: current_verified,
                    workflow_id: workflow_state.workflow_id.clone(),
                    previous_stage_job_id: uuid::Uuid::new_v4().to_string(), // Should be local filtering job id
                    next_stage_job_id: None,
                };
                Ok(super::types::JobPayload::ExtendedPathFinder(payload))
            }
            WorkflowStage::ExtendedPathCorrection => {
                let directory_tree = workflow_state.intermediate_data.directory_tree_content
                    .as_ref()
                    .ok_or_else(|| AppError::JobError("Directory tree not available for extended path correction".to_string()))?;
                
                let payload = super::types::ExtendedPathCorrectionPayload {
                    background_job_id: uuid::Uuid::new_v4().to_string(),
                    session_id: workflow_state.session_id.clone(),
                    task_description: workflow_state.task_description.clone(),
                    project_directory: workflow_state.project_directory.clone(),
                    directory_tree: directory_tree.clone(),
                    extended_paths: workflow_state.intermediate_data.extended_unverified_paths.clone(),
                    workflow_id: workflow_state.workflow_id.clone(),
                    previous_stage_job_id: uuid::Uuid::new_v4().to_string(), // Should be extended path finder job id
                };
                Ok(super::types::JobPayload::ExtendedPathCorrection(payload))
            }
        }
    }

    /// Get model configuration for a specific stage
    /// Returns None for local tasks that don't require LLM models
    async fn get_stage_model_config(&self, stage: &WorkflowStage, project_directory: &str) -> AppResult<Option<(String, f32, u32)>> {
        let task_type = self.stage_to_task_type(stage);
        
        // Local tasks don't need LLM model configuration
        match task_type {
            TaskType::DirectoryTreeGeneration | TaskType::LocalFileFiltering => {
                Ok(None)
            }
            _ => {
                // First try to get workflow-specific model override
                let workflow_model = if let Some(settings_repo) = crate::SETTINGS_REPO.get() {
                    let stage_name = match stage {
                        WorkflowStage::GeneratingRegex => "GeneratingRegex_model",
                        WorkflowStage::InitialPathFinder => "InitialPathFinder_model", 
                        WorkflowStage::InitialPathCorrection => "InitialPathCorrection_model",
                        WorkflowStage::ExtendedPathFinder => "ExtendedPathFinder_model",
                        WorkflowStage::ExtendedPathCorrection => "ExtendedPathCorrection_model",
                        _ => "",
                    };
                    
                    if !stage_name.is_empty() {
                        settings_repo.get_workflow_setting("FileFinderWorkflow", stage_name).await
                            .unwrap_or(None)
                    } else {
                        None
                    }
                } else {
                    None
                };

                // Use workflow model override or fall back to project/system defaults
                let model = if let Some(workflow_model) = workflow_model {
                    workflow_model
                } else {
                    crate::config::get_model_for_task_with_project(task_type, project_directory, &self.app_handle)
                        .await
                        .unwrap_or_else(|_| "file-finder-hybrid".to_string())
                };
                
                let temperature = crate::config::get_temperature_for_task_with_project(task_type, project_directory, &self.app_handle)
                    .await
                    .unwrap_or(0.5);
                let max_tokens = crate::config::get_max_tokens_for_task_with_project(task_type, project_directory, &self.app_handle)
                    .await
                    .unwrap_or(4000);

                Ok(Some((model, temperature, max_tokens)))
            }
        }
    }

    /// Handle successful completion of a stage
    async fn handle_stage_completion(&self, workflow_id: &str, job_id: &str) -> AppResult<()> {
        info!("Handling stage completion for job: {}", job_id);
        
        // Get the workflow definition and current state
        let (workflow_definition, workflow_state) = {
            let workflows = self.workflows.lock().await;
            let workflow_state = workflows.get(workflow_id)
                .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))?;
                
            // Find the workflow definition being used
            let workflow_definitions = self.get_workflow_definitions().await
                .map_err(|e| AppError::JobError(format!("Failed to get workflow definitions: {}", e)))?;
            let workflow_definition = workflow_definitions.values()
                .find(|def| {
                    // Match by checking if any stage job in the workflow corresponds to stages in this definition
                    workflow_state.stage_jobs.iter().any(|stage_job| {
                        def.stages.iter().any(|stage_def| {
                            let stage_task_type = match &stage_job.stage {
                                super::workflow_types::WorkflowStage::GeneratingDirTree => crate::models::TaskType::DirectoryTreeGeneration,
                                super::workflow_types::WorkflowStage::GeneratingRegex => crate::models::TaskType::RegexPatternGeneration,
                                super::workflow_types::WorkflowStage::LocalFiltering => crate::models::TaskType::LocalFileFiltering,
                                super::workflow_types::WorkflowStage::InitialPathFinder => crate::models::TaskType::PathFinder,
                                super::workflow_types::WorkflowStage::InitialPathCorrection => crate::models::TaskType::PathCorrection,
                                super::workflow_types::WorkflowStage::ExtendedPathFinder => crate::models::TaskType::ExtendedPathFinder,
                                super::workflow_types::WorkflowStage::ExtendedPathCorrection => crate::models::TaskType::ExtendedPathCorrection,
                            };
                            stage_def.task_type == stage_task_type
                        })
                    })
                })
                .cloned()
                .ok_or_else(|| AppError::JobError(format!("No workflow definition found for workflow {}", workflow_id)))?;
            
            (workflow_definition, workflow_state.clone())
        };

        // Extract and store stage data from the completed job
        if let Err(e) = self.extract_and_store_stage_data(job_id, &workflow_state).await {
            warn!("Failed to extract stage data from completed job {}: {}", job_id, e);
        }

        // Find next stages that can be executed based on the workflow definition
        let next_stages = self.find_next_abstract_stages_to_execute(&workflow_state, &workflow_definition).await;
        
        if next_stages.is_empty() {
            // Check if all stages are completed
            if self.is_workflow_complete(&workflow_state, &workflow_definition).await {
                self.mark_workflow_completed(workflow_id).await?;
                info!("Workflow {} completed successfully", workflow_id);
            } else {
                debug!("No stages ready to execute for workflow: {}", workflow_id);
            }
        } else {
            // Check concurrency limits before starting new stages
            let max_concurrent = self.get_max_concurrent_stages().await;
            let currently_running = self.count_running_jobs_in_workflow(workflow_id).await;
            let available_slots = max_concurrent.saturating_sub(currently_running);
            
            if available_slots == 0 {
                debug!("Cannot start more stages for workflow {} - concurrency limit reached ({} running)", workflow_id, currently_running);
                return Ok(());
            }

            // Start eligible stages up to the concurrency limit
            let stages_to_start = next_stages.into_iter().take(available_slots);
            for stage_def in stages_to_start {
                info!("Starting next stage: {} for workflow: {}", stage_def.stage_name, workflow_id);
                if let Err(e) = self.create_abstract_stage_job(&workflow_state, stage_def, &workflow_definition).await {
                    error!("Failed to create next stage job for {}: {}", stage_def.stage_name, e);
                }
            }
        }
        
        Ok(())
    }

    /// Handle failure of a stage
    async fn handle_stage_failure(&self, workflow_id: &str, job_id: &str, error_message: Option<String>) -> AppResult<()> {
        warn!("Handling stage failure for job: {} - {:?}", job_id, error_message);
        
        // Find the stage that failed
        let workflow_state = self.get_workflow_status(workflow_id).await?;
        let stage_job = workflow_state.get_stage_job(job_id)
            .ok_or_else(|| AppError::JobError(format!("Stage job {} not found in workflow {}", job_id, workflow_id)))?;
        
        let error_msg = error_message.unwrap_or_else(|| "Stage failed without error message".to_string());
        
        // Delegate error handling to the WorkflowErrorHandler
        match self.workflow_error_handler.handle_stage_failure(
            workflow_id,
            job_id,
            stage_job.stage.clone(),
            &error_msg,
        ).await {
            Ok(response) => {
                info!("Error handler response: {}", response.next_action);
                
                // Properly propagate WorkflowErrorResponse to WorkflowState
                let mut workflows = self.workflows.lock().await;
                if let Some(workflow) = workflows.get_mut(workflow_id) {
                    // Update workflow based on error response
                    match response.should_continue {
                        true => {
                            // Workflow should continue - update with recovery information
                            if response.recovery_attempted {
                                // Add recovery information to workflow metadata or logs
                                info!("Recovery attempted for workflow {}: {}", workflow_id, response.next_action);
                                
                                // If a retry job was created, update the stage job mapping
                                if let Some(retry_job_id) = &response.retry_job_id {
                                    debug!("New retry job {} created for failed job {} in workflow {}", 
                                           retry_job_id, job_id, workflow_id);
                                    
                                    // The WorkflowErrorHandler has already created the retry job,
                                    // and it will be added to the workflow state when it starts
                                }
                            }
                            
                            // For skip strategy, we might need to advance to next stage
                            if response.next_action.contains("Skip") {
                                // Mark the current stage as completed with a note
                                workflow.update_stage_job(
                                    job_id, 
                                    crate::models::JobStatus::Canceled, 
                                    Some(format!("Skipped due to error recovery: {}", response.next_action))
                                );
                                
                                // Try to start next stage immediately
                                drop(workflows); // Release lock before async call
                                if let Err(e) = self.start_next_stages(workflow_id).await {
                                    error!("Failed to start next stages after skip recovery: {}", e);
                                }
                                return Ok(());
                            }
                        }
                        false => {
                            // Workflow should not continue - mark as failed if not already
                            if workflow.status != super::workflow_types::WorkflowStatus::Failed {
                                let failure_reason = format!("Error handling decision: {}", response.next_action);
                                workflow.status = super::workflow_types::WorkflowStatus::Failed;
                                workflow.error_message = Some(failure_reason.clone());
                                workflow.completed_at = Some(chrono::Utc::now().timestamp_millis());
                                workflow.updated_at = workflow.completed_at.unwrap();
                                
                                error!("Workflow {} marked as failed due to error handling: {}", workflow_id, failure_reason);
                                
                                // Emit workflow failure event
                                drop(workflows); // Release lock before async call
                                self.emit_workflow_status_event(&workflow_state, &format!("Workflow failed: {}", failure_reason)).await;
                                return Ok(());
                            }
                        }
                    }
                    
                    // Update workflow state with error handling metadata
                    workflow.updated_at = chrono::Utc::now().timestamp_millis();
                } else {
                    warn!("Workflow {} not found when trying to update error response", workflow_id);
                }
            }
            Err(e) => {
                // If error handling itself fails, fall back to marking workflow as failed
                error!("Error handler failed for workflow {}: {}", workflow_id, e);
                
                // Update workflow state to reflect error handler failure
                let mut workflows = self.workflows.lock().await;
                if let Some(workflow) = workflows.get_mut(workflow_id) {
                    let failure_reason = format!("Error handler failed: {}", e);
                    workflow.status = super::workflow_types::WorkflowStatus::Failed;
                    workflow.error_message = Some(failure_reason.clone());
                    workflow.completed_at = Some(chrono::Utc::now().timestamp_millis());
                    workflow.updated_at = workflow.completed_at.unwrap();
                    
                    // Emit workflow failure event
                    let workflow_clone = workflow.clone();
                    drop(workflows); // Release lock before async call
                    self.emit_workflow_status_event(&workflow_clone, &format!("Workflow failed: {}", failure_reason)).await;
                } else {
                    // Fallback to the original mark_workflow_failed method
                    self.mark_workflow_failed(workflow_id, &format!("Error handler failed: {}", e)).await?;
                }
            }
        }
        
        Ok(())
    }

    /// Mark workflow as completed
    pub async fn mark_workflow_completed(&self, workflow_id: &str) -> AppResult<()> {
        let mut workflows = self.workflows.lock().await;
        if let Some(workflow_state) = workflows.get_mut(workflow_id) {
            workflow_state.status = WorkflowStatus::Completed;
            workflow_state.completed_at = Some(chrono::Utc::now().timestamp_millis());
            workflow_state.updated_at = workflow_state.completed_at
                .ok_or_else(|| AppError::JobError("Workflow completed_at should be set".to_string()))?;

            info!("Workflow {} completed successfully", workflow_id);
            self.emit_workflow_status_event(workflow_state, "Workflow completed successfully").await;
            
            // Perform cleanup for completed workflow
            match self.workflow_cleanup_handler.cleanup_workflow(workflow_id, &self.app_handle).await {
                Ok(cleanup_result) => {
                    info!("Cleanup completed for workflow: {} - cleaned {} jobs", workflow_id, cleanup_result.cleaned_jobs.len());
                }
                Err(e) => {
                    warn!("Failed to cleanup resources for completed workflow {}: {}", workflow_id, e);
                }
            }
        }
        Ok(())
    }

    /// Mark workflow as failed
    pub async fn mark_workflow_failed(&self, workflow_id: &str, error_message: &str) -> AppResult<()> {
        let mut workflows = self.workflows.lock().await;
        if let Some(workflow_state) = workflows.get_mut(workflow_id) {
            workflow_state.status = WorkflowStatus::Failed;
            workflow_state.completed_at = Some(chrono::Utc::now().timestamp_millis());
            workflow_state.updated_at = workflow_state.completed_at
                .ok_or_else(|| AppError::JobError("Workflow completed_at should be set".to_string()))?;
            workflow_state.error_message = Some(error_message.to_string());

            error!("Workflow {} failed: {}", workflow_id, error_message);
            self.emit_workflow_status_event(workflow_state, &format!("Workflow failed: {}", error_message)).await;
            
            // Perform cleanup for failed workflow
            match self.workflow_cleanup_handler.cleanup_workflow(workflow_id, &self.app_handle).await {
                Ok(cleanup_result) => {
                    info!("Cleanup completed for failed workflow: {} - cleaned {} jobs", workflow_id, cleanup_result.cleaned_jobs.len());
                }
                Err(e) => {
                    warn!("Failed to cleanup resources for failed workflow {}: {}", workflow_id, e);
                }
            }
        }
        Ok(())
    }

    /// Find workflow ID by job ID
    async fn find_workflow_by_job_id(&self, job_id: &str) -> AppResult<String> {
        let workflows = self.workflows.lock().await;
        for (workflow_id, workflow_state) in workflows.iter() {
            if workflow_state.get_stage_job(job_id).is_some() {
                return Ok(workflow_id.clone());
            }
        }
        Err(AppError::JobError(format!("No workflow found for job ID: {}", job_id)))
    }

    /// Update intermediate data based on stage completion
    async fn update_intermediate_data(
        &self,
        workflow_state: &mut WorkflowState,
        stage: &WorkflowStage,
        stage_data: serde_json::Value,
    ) -> AppResult<()> {
        match stage {
            WorkflowStage::GeneratingDirTree => {
                if let Some(content) = stage_data.get("directoryTree").and_then(|v| v.as_str()) {
                    workflow_state.intermediate_data.directory_tree_content = Some(content.to_string());
                }
            }
            WorkflowStage::GeneratingRegex => {
                workflow_state.intermediate_data.raw_regex_patterns = Some(stage_data);
            }
            WorkflowStage::LocalFiltering => {
                if let Some(files) = stage_data.get("filteredFiles").and_then(|v| v.as_array()) {
                    workflow_state.intermediate_data.locally_filtered_files = files.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
            }
            WorkflowStage::InitialPathFinder => {
                if let Some(verified) = stage_data.get("verifiedPaths").and_then(|v| v.as_array()) {
                    workflow_state.intermediate_data.initial_verified_paths = verified.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
                if let Some(unverified) = stage_data.get("unverifiedPaths").and_then(|v| v.as_array()) {
                    workflow_state.intermediate_data.initial_unverified_paths = unverified.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
            }
            WorkflowStage::InitialPathCorrection => {
                if let Some(corrected) = stage_data.get("correctedPaths").and_then(|v| v.as_array()) {
                    workflow_state.intermediate_data.initial_corrected_paths = corrected.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
            }
            WorkflowStage::ExtendedPathFinder => {
                if let Some(verified) = stage_data.get("verifiedPaths").and_then(|v| v.as_array()) {
                    workflow_state.intermediate_data.extended_verified_paths = verified.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
                if let Some(unverified) = stage_data.get("unverifiedPaths").and_then(|v| v.as_array()) {
                    workflow_state.intermediate_data.extended_unverified_paths = unverified.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
            }
            WorkflowStage::ExtendedPathCorrection => {
                if let Some(corrected) = stage_data.get("correctedPaths").and_then(|v| v.as_array()) {
                    workflow_state.intermediate_data.extended_corrected_paths = corrected.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
            }
        }
        Ok(())
    }

    /// Emit workflow status event to frontend
    async fn emit_workflow_status_event(&self, workflow_state: &WorkflowState, message: &str) {
        let current_stage = workflow_state.current_stage()
            .map(|stage_job| stage_job.stage.display_name().to_string());

        let event = WorkflowStatusEvent {
            workflow_id: workflow_state.workflow_id.clone(),
            status: workflow_state.status.clone(),
            progress: workflow_state.calculate_progress(),
            current_stage,
            message: message.to_string(),
            error_message: workflow_state.error_message.clone(),
        };

        if let Err(e) = self.app_handle.emit("file-finder-workflow-status", &event) {
            warn!("Failed to emit workflow status event: {}", e);
        }
    }

    /// Emit workflow stage event to frontend
    async fn emit_workflow_stage_event(
        &self,
        workflow_id: &str,
        stage_job: &WorkflowStageJob,
        status: &JobStatus,
        error_message: Option<String>,
    ) {
        let event = WorkflowStageEvent {
            workflow_id: workflow_id.to_string(),
            stage: stage_job.stage.clone(),
            job_id: stage_job.job_id.clone(),
            status: status.clone(),
            message: format!("{} - {}", stage_job.stage.display_name(), status.to_string()),
            error_message,
            data: None,
        };

        if let Err(e) = self.app_handle.emit("file-finder-workflow-stage", &event) {
            warn!("Failed to emit workflow stage event: {}", e);
        }
    }

    /// Retry a specific workflow stage
    pub async fn retry_workflow_stage(
        &self,
        workflow_id: &str,
        stage_to_retry: WorkflowStage,
        original_failed_job_id: &str,
    ) -> AppResult<String> {
        info!("Retrying workflow stage {:?} for workflow {}, original job {}", 
              stage_to_retry, workflow_id, original_failed_job_id);

        let workflow_state = {
            let workflows = self.workflows.lock().await;
            workflows.get(workflow_id)
                .cloned()
                .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))?
        };

        // Reset subsequent stages if necessary
        self.reset_subsequent_stages(&workflow_state, &stage_to_retry).await?;

        // Get data from the stage before the failed one for payload creation
        let stage_payload = self.create_stage_payload_for_retry(&workflow_state, &stage_to_retry).await?;
        
        // Get model configuration for the stage
        let model_settings = self.get_stage_model_config(&stage_to_retry, &workflow_state.project_directory).await?;

        // Determine API type based on whether the task requires LLM
        let api_type_str = if model_settings.is_some() {
            "openrouter"
        } else {
            "filesystem"
        };

        // Create a new background job for this stage
        let task_type = self.stage_to_task_type(&stage_to_retry);
        let new_job_id = job_creation_utils::create_and_queue_background_job(
            &workflow_state.session_id,
            &workflow_state.project_directory,
            api_type_str,
            task_type,
            &format!("{}_RETRY", stage_to_retry.display_name().to_uppercase().replace(" ", "_")),
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
                "originalJobId": original_failed_job_id
            })),
            &self.app_handle,
        ).await?;

        // Update the workflow state to replace the failed job with the new one
        {
            let mut workflows = self.workflows.lock().await;
            if let Some(workflow) = workflows.get_mut(workflow_id) {
                // Mark the original job as superseded/retried
                workflow.update_stage_job(original_failed_job_id, crate::models::JobStatus::Canceled, Some("Superseded by retry".to_string()));
                
                // Add the new retry job
                let depends_on = stage_to_retry.previous_stage()
                    .and_then(|prev_stage| workflow.get_stage_job_by_stage(&prev_stage))
                    .map(|job| job.job_id.clone());
                
                workflow.add_stage_job(stage_to_retry.clone(), new_job_id.clone(), depends_on);
                
                info!("Added retry job {} for stage {:?} in workflow {}", new_job_id, stage_to_retry, workflow_id);
            }
        }

        Ok(new_job_id)
    }

    /// Reset subsequent stages that might need to be re-executed after a retry
    async fn reset_subsequent_stages(&self, workflow_state: &WorkflowState, retry_stage: &WorkflowStage) -> AppResult<()> {
        // For simplicity, we'll just mark subsequent stage jobs as cancelled
        // In a more sophisticated implementation, we might keep intermediate data
        let all_stages = WorkflowStage::all_stages();
        let retry_stage_index = retry_stage.stage_index();
        
        let mut workflows = self.workflows.lock().await;
        if let Some(workflow) = workflows.get_mut(&workflow_state.workflow_id) {
            for stage in all_stages.iter().skip(retry_stage_index + 1) {
                if let Some(stage_job) = workflow.stage_jobs.iter_mut().find(|job| &job.stage == stage) {
                    if matches!(stage_job.status, JobStatus::Queued | JobStatus::Running) {
                        stage_job.status = JobStatus::Canceled;
                        stage_job.error_message = Some("Cancelled due to retry of earlier stage".to_string());
                        info!("Cancelled stage job {} for stage {:?} due to retry", stage_job.job_id, stage);
                    }
                }
            }
        }
        
        Ok(())
    }

    /// Create stage payload for retry (similar to create_stage_payload but using existing intermediate data)
    async fn create_stage_payload_for_retry(&self, workflow_state: &WorkflowState, stage: &WorkflowStage) -> AppResult<super::types::JobPayload> {
        // Use the same payload creation logic as normal stages, since we want to retry with the same data
        self.create_stage_payload(workflow_state, stage).await
    }

    /// Extract and store stage data from a completed job
    async fn extract_and_store_stage_data(&self, job_id: &str, workflow_state: &WorkflowState) -> AppResult<()> {
        debug!("Extracting and storing stage data for job: {}", job_id);
        
        // Get the database repository
        let repo = self.app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>().inner().clone();
        
        // Get the job to verify status and extract raw response
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Verify job is completed before attempting extraction
        let job_status = job.status.parse::<crate::models::JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status for {}: {}", job_id, e)))?;
        
        if job_status != crate::models::JobStatus::Completed {
            return Err(AppError::JobError(format!(
                "Cannot extract data from job {} - job status is {:?}, expected Completed", 
                job_id, job_status
            )));
        }
        
        // Find the stage this job belongs to
        if let Some(stage_job) = workflow_state.stage_jobs.iter().find(|sj| sj.job_id == job_id) {
            debug!("Extracting data for stage: {:?}", stage_job.stage);
            
            // Extract stage-specific data using StageDataExtractor and map to WorkflowIntermediateData
            let stage_data = match &stage_job.stage {
                super::workflow_types::WorkflowStage::GeneratingDirTree => {
                    let directory_tree = super::stage_data_extractors::StageDataExtractor::extract_directory_tree(job_id, &repo).await
                        .map_err(|e| AppError::JobError(format!("Failed to extract directory tree from job {}: {}", job_id, e)))?;
                    
                    // Verify extracted data is not empty
                    if directory_tree.trim().is_empty() {
                        warn!("Directory tree extraction from job {} resulted in empty content", job_id);
                    }
                    
                    // Return data for WorkflowIntermediateData.directory_tree_content
                    serde_json::json!({ "directoryTree": directory_tree })
                }
                super::workflow_types::WorkflowStage::GeneratingRegex => {
                    let patterns = super::stage_data_extractors::StageDataExtractor::extract_regex_patterns(job_id, &repo).await
                        .map_err(|e| AppError::JobError(format!("Failed to extract regex patterns from job {}: {}", job_id, e)))?;
                    
                    debug!("Extracted {} regex patterns from job {}", patterns.len(), job_id);
                    
                    // Return data for WorkflowIntermediateData.raw_regex_patterns (as JSON Value)
                    serde_json::json!({ "regexPatterns": patterns })
                }
                super::workflow_types::WorkflowStage::LocalFiltering => {
                    let filtered_paths = super::stage_data_extractors::StageDataExtractor::extract_filtered_paths(job_id, &repo).await
                        .map_err(|e| AppError::JobError(format!("Failed to extract filtered paths from job {}: {}", job_id, e)))?;
                    
                    debug!("Extracted {} filtered paths from job {}", filtered_paths.len(), job_id);
                    
                    // Return data for WorkflowIntermediateData.locally_filtered_files
                    serde_json::json!({ "filteredFiles": filtered_paths })
                }
                super::workflow_types::WorkflowStage::InitialPathFinder => {
                    let initial_paths = super::stage_data_extractors::StageDataExtractor::extract_initial_paths(job_id, &repo).await
                        .map_err(|e| AppError::JobError(format!("Failed to extract initial paths from job {}: {}", job_id, e)))?;
                    
                    debug!("Extracted {} initial paths from job {}", initial_paths.len(), job_id);
                    
                    // For PathFinder, we need to separate verified and unverified paths
                    // The StageDataExtractor returns all paths, but we should parse the response to get the breakdown
                    let job_response = job.response.unwrap_or_default();
                    let (verified_paths, unverified_paths) = self.parse_path_finder_response(&job_response, initial_paths)?;
                    
                    // Return data for WorkflowIntermediateData.initial_verified_paths and initial_unverified_paths
                    serde_json::json!({ 
                        "verifiedPaths": verified_paths,
                        "unverifiedPaths": unverified_paths 
                    })
                }
                super::workflow_types::WorkflowStage::InitialPathCorrection => {
                    let corrected_paths = super::stage_data_extractors::StageDataExtractor::extract_final_paths(job_id, &repo).await
                        .map_err(|e| AppError::JobError(format!("Failed to extract corrected paths from job {}: {}", job_id, e)))?;
                    
                    debug!("Extracted {} corrected paths from job {}", corrected_paths.len(), job_id);
                    
                    // Return data for WorkflowIntermediateData.initial_corrected_paths
                    serde_json::json!({ "correctedPaths": corrected_paths })
                }
                super::workflow_types::WorkflowStage::ExtendedPathFinder => {
                    let extended_paths = super::stage_data_extractors::StageDataExtractor::extract_extended_paths(job_id, &repo).await
                        .map_err(|e| AppError::JobError(format!("Failed to extract extended paths from job {}: {}", job_id, e)))?;
                    
                    debug!("Extracted {} extended paths from job {}", extended_paths.len(), job_id);
                    
                    // For ExtendedPathFinder, we also need to separate verified and unverified paths
                    let job_response = job.response.unwrap_or_default();
                    let (verified_paths, unverified_paths) = self.parse_path_finder_response(&job_response, extended_paths)?;
                    
                    // Return data for WorkflowIntermediateData.extended_verified_paths and extended_unverified_paths
                    serde_json::json!({ 
                        "verifiedPaths": verified_paths,
                        "unverifiedPaths": unverified_paths 
                    })
                }
                super::workflow_types::WorkflowStage::ExtendedPathCorrection => {
                    let final_paths = super::stage_data_extractors::StageDataExtractor::extract_final_paths(job_id, &repo).await
                        .map_err(|e| AppError::JobError(format!("Failed to extract final paths from job {}: {}", job_id, e)))?;
                    
                    debug!("Extracted {} final corrected paths from job {}", final_paths.len(), job_id);
                    
                    // Return data for WorkflowIntermediateData.extended_corrected_paths
                    serde_json::json!({ "correctedPaths": final_paths })
                }
            };
            
            // Store the extracted data in workflow intermediate state 
            // This correctly updates WorkflowIntermediateData in the workflow state
            self.store_stage_data(job_id, stage_data).await
                .map_err(|e| AppError::JobError(format!("Failed to store stage data for job {}: {}", job_id, e)))?;
            
            info!("Successfully extracted and stored data for stage {:?} from job {}", stage_job.stage, job_id);
        } else {
            warn!("Job {} not found in workflow {} stage jobs", job_id, workflow_state.workflow_id);
        }
        
        Ok(())
    }
    
    /// Parse PathFinder response to separate verified and unverified paths
    fn parse_path_finder_response(&self, response: &str, fallback_paths: Vec<String>) -> AppResult<(Vec<String>, Vec<String>)> {
        // Try to parse response as PathFinderResult JSON
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(response) {
            // Check if it's a structured PathFinderResult
            if let (Some(verified), Some(unverified)) = (
                json_value.get("verified_paths").and_then(|v| v.as_array()),
                json_value.get("unverified_paths").and_then(|v| v.as_array())
            ) {
                let verified_paths: Vec<String> = verified.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
                let unverified_paths: Vec<String> = unverified.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
                
                return Ok((verified_paths, unverified_paths));
            }
            
            // Check for "paths" field (verified) and "unverified_paths" field
            if let Some(paths_array) = json_value.get("paths").and_then(|v| v.as_array()) {
                let verified_paths: Vec<String> = paths_array.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
                let unverified_paths: Vec<String> = json_value.get("unverified_paths")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default();
                
                return Ok((verified_paths, unverified_paths));
            }
        }
        
        // Fallback: treat all paths as verified if we can't parse the structure
        debug!("Could not parse PathFinder response structure, treating all paths as verified");
        Ok((fallback_paths, vec![]))
    }

    /// Check if a workflow is complete based on its definition
    async fn is_workflow_complete(&self, workflow_state: &WorkflowState, workflow_definition: &super::workflow_types::WorkflowDefinition) -> bool {
        // Check if all stages in the definition have completed successfully
        for stage_def in &workflow_definition.stages {
            let stage_completed = workflow_state.stage_jobs.iter().any(|stage_job| {
                // Match stage by task type
                let job_task_type = match &stage_job.stage {
                    super::workflow_types::WorkflowStage::GeneratingDirTree => crate::models::TaskType::DirectoryTreeGeneration,
                    super::workflow_types::WorkflowStage::GeneratingRegex => crate::models::TaskType::RegexPatternGeneration,
                    super::workflow_types::WorkflowStage::LocalFiltering => crate::models::TaskType::LocalFileFiltering,
                    super::workflow_types::WorkflowStage::InitialPathFinder => crate::models::TaskType::PathFinder,
                    super::workflow_types::WorkflowStage::InitialPathCorrection => crate::models::TaskType::PathCorrection,
                    super::workflow_types::WorkflowStage::ExtendedPathFinder => crate::models::TaskType::ExtendedPathFinder,
                    super::workflow_types::WorkflowStage::ExtendedPathCorrection => crate::models::TaskType::ExtendedPathCorrection,
                };
                
                stage_def.task_type == job_task_type && stage_job.status == crate::models::JobStatus::Completed
            });
            
            if !stage_completed {
                return false;
            }
        }
        
        true
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
    
    // Load workflow definitions after creating the orchestrator
    match orchestrator.load_default_workflow_definitions().await {
        Ok(()) => {
            info!("Successfully loaded workflow definitions from JSON files");
        }
        Err(e) => {
            warn!("Failed to load workflow definitions from files ({}), falling back to hardcoded definitions", e);
            
            // Fall back to hardcoded definitions as a safety measure
            if let Err(fallback_err) = orchestrator.load_hardcoded_workflow_definitions().await {
                return Err(AppError::JobError(format!(
                    "Failed to load both file-based and hardcoded workflow definitions. File error: {}, Fallback error: {}", 
                    e, fallback_err
                )));
            } else {
                info!("Successfully loaded hardcoded workflow definitions as fallback");
            }
        }
    }
    
    if let Err(_) = WORKFLOW_ORCHESTRATOR.set(orchestrator.clone()) {
        return Err(AppError::JobError("Failed to initialize workflow orchestrator".to_string()));
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