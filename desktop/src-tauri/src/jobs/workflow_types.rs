use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::models::JobStatus;
use crate::models::TaskType;

/// Workflow execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum WorkflowStatus {
    Created,
    Running,
    Paused,
    Completed,
    Failed,
    Canceled,
}

impl Default for WorkflowStatus {
    fn default() -> Self {
        WorkflowStatus::Created
    }
}

/// Workflow stage enumeration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Hash, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorkflowStage {
    RegexFileFilter,
    FileRelevanceAssessment,
    ExtendedPathFinder,
    PathCorrection,
}

impl std::fmt::Display for WorkflowStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

impl WorkflowStage {
    /// Get all stages in execution order
    pub fn all_stages() -> Vec<WorkflowStage> {
        vec![
            WorkflowStage::RegexFileFilter,
            WorkflowStage::FileRelevanceAssessment,
            WorkflowStage::ExtendedPathFinder,
            WorkflowStage::PathCorrection,
        ]
    }

    /// Get the next stage in the workflow
    pub fn next_stage(&self) -> Option<WorkflowStage> {
        match self {
            WorkflowStage::RegexFileFilter => Some(WorkflowStage::FileRelevanceAssessment),
            WorkflowStage::FileRelevanceAssessment => Some(WorkflowStage::ExtendedPathFinder),
            WorkflowStage::ExtendedPathFinder => Some(WorkflowStage::PathCorrection),
            WorkflowStage::PathCorrection => None,
        }
    }

    /// Get the previous stage in the workflow
    pub fn previous_stage(&self) -> Option<WorkflowStage> {
        match self {
            WorkflowStage::RegexFileFilter => None,
            WorkflowStage::FileRelevanceAssessment => Some(WorkflowStage::RegexFileFilter),
            WorkflowStage::ExtendedPathFinder => Some(WorkflowStage::FileRelevanceAssessment),
            WorkflowStage::PathCorrection => Some(WorkflowStage::ExtendedPathFinder),
        }
    }

    /// Get stage index for progress calculation (0-based)
    pub fn stage_index(&self) -> usize {
        match self {
            WorkflowStage::RegexFileFilter => 0,
            WorkflowStage::FileRelevanceAssessment => 1,
            WorkflowStage::ExtendedPathFinder => 2,
            WorkflowStage::PathCorrection => 3,
        }
    }

    /// Get stage display name
    pub fn display_name(&self) -> &'static str {
        match self {
            WorkflowStage::RegexFileFilter => "Regex File Filtering",
            WorkflowStage::FileRelevanceAssessment => "AI File Relevance Assessment",
            WorkflowStage::ExtendedPathFinder => "Extended Path Finding",
            WorkflowStage::PathCorrection => "Path Correction",
        }
    }

    /// Convert from stage display name to WorkflowStage enum
    pub fn from_display_name(display_name: &str) -> Option<WorkflowStage> {
        match display_name {
            "Regex File Filtering" => Some(WorkflowStage::RegexFileFilter),
            "RegexFileFilter" => Some(WorkflowStage::RegexFileFilter), // Handle enum variant name
            "AI File Relevance Assessment" => Some(WorkflowStage::FileRelevanceAssessment),
            "FileRelevanceAssessment" => Some(WorkflowStage::FileRelevanceAssessment), // Handle enum variant name
            "Extended Path Finding" => Some(WorkflowStage::ExtendedPathFinder),
            "ExtendedPathFinder" => Some(WorkflowStage::ExtendedPathFinder), // Handle enum variant name
            "Path Correction" => Some(WorkflowStage::PathCorrection),
            "PathCorrection" => Some(WorkflowStage::PathCorrection), // Handle enum variant name
            _ => None,
        }
    }

    /// Convert from TaskType to WorkflowStage enum
    pub fn from_task_type(task_type: &TaskType) -> Option<WorkflowStage> {
        match task_type {
            TaskType::RegexFileFilter => Some(WorkflowStage::RegexFileFilter),
            TaskType::FileRelevanceAssessment => Some(WorkflowStage::FileRelevanceAssessment),
            TaskType::ExtendedPathFinder => Some(WorkflowStage::ExtendedPathFinder),
            TaskType::PathCorrection => Some(WorkflowStage::PathCorrection),
            _ => None,
        }
    }
}

/// Individual stage job within a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStageJob {
    pub stage_name: String,
    pub task_type: TaskType,
    pub job_id: String,
    pub status: JobStatus,
    pub depends_on: Option<String>, // Job ID this stage depends on
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error_message: Option<String>,
    pub sub_status_message: Option<String>, // Detailed stage progress message
}

impl WorkflowStageJob {
    pub fn new(stage_name: String, task_type: TaskType, job_id: String, depends_on: Option<String>) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            stage_name,
            task_type,
            job_id,
            status: JobStatus::Queued,
            depends_on,
            created_at: now,
            started_at: None,
            completed_at: None,
            error_message: None,
            sub_status_message: None,
        }
    }

    /// Check if this stage can be executed (dependencies completed)
    pub fn can_execute(&self, workflow_state: &WorkflowState) -> bool {
        match &self.depends_on {
            None => true, // No dependencies, can execute
            Some(dep_job_id) => {
                // Find the dependency job and check if it's completed
                workflow_state.stage_jobs.iter()
                    .find(|job| &job.job_id == dep_job_id)
                    .map(|job| job.status == JobStatus::Completed)
                    .unwrap_or(false)
            }
        }
    }
}

/// Overall workflow state and metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowState {
    pub workflow_id: String,
    pub workflow_definition_name: String,
    pub session_id: String,
    pub status: WorkflowStatus,
    pub stage_jobs: Vec<WorkflowStageJob>,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
    pub task_description: String,
    pub project_directory: String,
    pub excluded_paths: Vec<String>,
    pub timeout_ms: Option<u64>,
    /// Intermediate data collected during workflow execution
    pub intermediate_data: WorkflowIntermediateData,
    /// Overall error message if workflow failed
    pub error_message: Option<String>,
}

impl WorkflowState {
    pub fn new(
        workflow_id: String,
        workflow_definition_name: String,
        session_id: String,
        task_description: String,
        project_directory: String,
        excluded_paths: Vec<String>,
        timeout_ms: Option<u64>,
    ) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            workflow_id,
            workflow_definition_name,
            session_id,
            status: WorkflowStatus::Created,
            stage_jobs: Vec::new(),
            created_at: now,
            updated_at: now,
            completed_at: None,
            task_description,
            project_directory,
            excluded_paths,
            timeout_ms,
            intermediate_data: WorkflowIntermediateData::default(),
            error_message: None,
        }
    }

    /// Calculate overall workflow progress (0-100%)
    /// NOTE: This method only considers created stage jobs, which may be misleading
    /// Use calculate_progress_with_definition() for accurate progress calculation
    pub fn calculate_progress(&self) -> f32 {
        if self.stage_jobs.is_empty() {
            return 0.0;
        }

        let total_stages = self.stage_jobs.len() as f32;
        let completed_stages = self.stage_jobs.iter()
            .filter(|job| job.status == JobStatus::Completed)
            .count() as f32;

        (completed_stages / total_stages) * 100.0
    }

    /// Calculate overall workflow progress with accurate total stage count from definition
    pub fn calculate_progress_with_definition(&self, workflow_definition: &WorkflowDefinition) -> f32 {
        let total_stages = workflow_definition.stages.len() as f32;
        if total_stages == 0.0 {
            return 100.0; // Empty workflow is considered complete
        }

        let completed_stages = self.stage_jobs.iter()
            .filter(|job| job.status == JobStatus::Completed)
            .count() as f32;

        (completed_stages / total_stages) * 100.0
    }

    /// Get current active stage (running or next to run)
    pub fn current_stage(&self) -> Option<&WorkflowStageJob> {
        // First, look for any running stage
        if let Some(running_stage) = self.stage_jobs.iter().find(|job| job.status == JobStatus::Running) {
            return Some(running_stage);
        }

        // If no running stage, find the next stage that can be executed
        self.stage_jobs.iter()
            .filter(|job| job.status == JobStatus::Queued && job.can_execute(self))
            .next() // Remove stage_index dependency for now, TODO: implement proper ordering
    }

    /// Get all completed stages
    pub fn completed_stages(&self) -> Vec<&WorkflowStageJob> {
        self.stage_jobs.iter()
            .filter(|job| job.status == JobStatus::Completed)
            .collect()
    }

    /// Get all failed stages
    pub fn failed_stages(&self) -> Vec<&WorkflowStageJob> {
        self.stage_jobs.iter()
            .filter(|job| job.status == JobStatus::Failed)
            .collect()
    }

    /// Check if all stages are completed
    pub fn is_completed(&self) -> bool {
        // For now, check if all stage jobs are completed
        // TODO: This should be updated to work with workflow definitions
        !self.stage_jobs.is_empty() && 
        self.stage_jobs.iter().all(|job| job.status == JobStatus::Completed)
    }

    /// Check if any stage has failed
    pub fn has_failed(&self) -> bool {
        self.stage_jobs.iter().any(|job| job.status == JobStatus::Failed)
    }

    /// Check if any stage has been cancelled
    pub fn has_cancelled(&self) -> bool {
        self.stage_jobs.iter().any(|job| job.status == JobStatus::Canceled)
    }

    /// Check if workflow should stop (failed or cancelled)
    pub fn should_stop(&self) -> bool {
        self.has_failed() || self.has_cancelled()
    }

    /// Update stage job status
    pub fn update_stage_job(&mut self, job_id: &str, status: JobStatus, error_message: Option<String>) {
        if let Some(stage_job) = self.stage_jobs.iter_mut().find(|job| job.job_id == job_id) {
            let now = chrono::Utc::now().timestamp_millis();
            
            match status {
                JobStatus::Running => {
                    stage_job.started_at = Some(now);
                }
                JobStatus::Completed | JobStatus::Failed => {
                    stage_job.completed_at = Some(now);
                }
                _ => {}
            }
            
            stage_job.status = status;
            stage_job.error_message = error_message;
            self.updated_at = now;
        }
    }

    /// Update stage job status with sub-status message
    pub fn update_stage_job_with_sub_status(&mut self, job_id: &str, status: JobStatus, error_message: Option<String>, sub_status_message: Option<String>) {
        if let Some(stage_job) = self.stage_jobs.iter_mut().find(|job| job.job_id == job_id) {
            let now = chrono::Utc::now().timestamp_millis();
            
            match status {
                JobStatus::Running => {
                    stage_job.started_at = Some(now);
                }
                JobStatus::Completed | JobStatus::Failed => {
                    stage_job.completed_at = Some(now);
                }
                _ => {}
            }
            
            stage_job.status = status;
            stage_job.error_message = error_message;
            stage_job.sub_status_message = sub_status_message;
            self.updated_at = now;
        }
    }

    /// Add a stage job to the workflow
    pub fn add_stage_job(&mut self, stage_name: String, task_type: TaskType, job_id: String, depends_on: Option<String>) {
        let stage_job = WorkflowStageJob::new(stage_name, task_type, job_id, depends_on);
        self.stage_jobs.push(stage_job);
        self.updated_at = chrono::Utc::now().timestamp_millis();
    }

    /// Get stage job by job ID
    pub fn get_stage_job(&self, job_id: &str) -> Option<&WorkflowStageJob> {
        self.stage_jobs.iter().find(|job| job.job_id == job_id)
    }

    /// Get stage job by stage name
    pub fn get_stage_job_by_name(&self, stage_name: &str) -> Option<&WorkflowStageJob> {
        self.stage_jobs.iter().find(|job| job.stage_name == stage_name)
    }
}

/// Intermediate data collected during workflow execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowIntermediateData {
    pub directory_tree_content: Option<String>,
    pub raw_regex_patterns: Option<serde_json::Value>,
    pub locally_filtered_files: Vec<String>,
    pub ai_filtered_files: Vec<String>,
    pub ai_filtered_files_token_count: Option<u32>,
    pub extended_verified_paths: Vec<String>,
    pub extended_unverified_paths: Vec<String>,
    pub extended_corrected_paths: Vec<String>,
}

impl Default for WorkflowIntermediateData {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkflowIntermediateData {
    pub fn new() -> Self {
        Self {
            directory_tree_content: None,
            raw_regex_patterns: None,
            locally_filtered_files: Vec::new(),
            ai_filtered_files: Vec::new(),
            ai_filtered_files_token_count: None,
            extended_verified_paths: Vec::new(),
            extended_unverified_paths: Vec::new(),
            extended_corrected_paths: Vec::new(),
        }
    }

    /// Get all final selected files from the workflow
    pub fn get_final_selected_files(&self) -> Vec<String> {
        // The method should combine files from the final relevant stages.
        // For the FileFinderWorkflow, this means the extended_verified_paths 
        // (which are the result of FileRelevanceAssessment further processed by ExtendedPathFinder)
        // and then any extended_corrected_paths.
        let mut files = self.extended_verified_paths.clone();
        files.extend(self.extended_corrected_paths.clone());
        
        // Remove duplicates while preserving order and sort
        files.sort_unstable();
        files.dedup();
        
        files
    }
}

/// Event emitted when workflow status changes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStatusEvent {
    pub workflow_id: String,
    pub status: WorkflowStatus,
    pub progress: f32,
    pub current_stage: Option<String>,
    pub message: String,
    pub error_message: Option<String>,
}

/// Event emitted when workflow stage status changes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStageEvent {
    pub workflow_id: String,
    pub stage_name: String,
    pub task_type: TaskType,
    pub job_id: String,
    pub status: JobStatus,
    pub message: String,
    pub error_message: Option<String>,
    pub data: Option<serde_json::Value>,
}

/// Workflow operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowResult {
    pub success: bool,
    pub workflow_id: String,
    pub selected_files: Vec<String>,
    pub intermediate_data: WorkflowIntermediateData,
    pub error_message: Option<String>,
    pub total_stages: usize,
    pub completed_stages: usize,
    pub failed_stages: usize,
    pub total_duration_ms: Option<i64>,
}

/// Result of workflow cancellation operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancellationResult {
    pub workflow_id: String,
    pub canceled_jobs: Vec<String>,
    pub failed_cancellations: Vec<FailedCancellation>,
}

/// Information about a job cancellation failure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedCancellation {
    pub job_id: String,
    pub error: String,
}

impl WorkflowResult {
    pub fn from_workflow_state(workflow_state: &WorkflowState) -> Self {
        let selected_files = workflow_state.intermediate_data.get_final_selected_files();
        let total_stages = workflow_state.stage_jobs.len();
        let completed_stages = workflow_state.completed_stages().len();
        let failed_stages = workflow_state.failed_stages().len();
        
        let total_duration_ms = workflow_state.completed_at
            .map(|completed| completed - workflow_state.created_at);

        Self {
            success: workflow_state.status == WorkflowStatus::Completed,
            workflow_id: workflow_state.workflow_id.clone(),
            selected_files,
            intermediate_data: workflow_state.intermediate_data.clone(),
            error_message: workflow_state.error_message.clone(),
            total_stages,
            completed_stages,
            failed_stages,
            total_duration_ms,
        }
    }
}

/// Error recovery strategy for workflow stages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryStrategy {
    /// Retry the stage with specified max attempts and delay
    RetryStage { 
        max_attempts: u32, 
        delay_ms: u64 
    },
    /// Retry a specific stage within a workflow
    RetrySpecificStage { 
        job_id: String, 
        stage_name: String,
        task_type: TaskType, 
        attempt_count: u32 
    },
    /// Abort the entire workflow
    AbortWorkflow,
    /// Skip this stage and continue with the next
    SkipStage,
}

/// Error recovery configuration for workflow stages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorRecoveryConfig {
    /// Strategy map for different error types or stages
    pub strategy_map: HashMap<String, RecoveryStrategy>,
    /// Maximum consecutive failures before aborting workflow
    pub max_consecutive_failures: u32,
    /// Default strategy if no specific strategy is found
    pub default_strategy: RecoveryStrategy,
}

impl Default for ErrorRecoveryConfig {
    fn default() -> Self {
        let mut strategy_map = HashMap::new();
        
        // Define default strategies for each stage
        strategy_map.insert("RegexFileFilter".to_string(), RecoveryStrategy::RetryStage { max_attempts: 3, delay_ms: 3000 });
        strategy_map.insert("FileRelevanceAssessment".to_string(), RecoveryStrategy::RetryStage { max_attempts: 3, delay_ms: 4000 });
        strategy_map.insert("ExtendedPathFinder".to_string(), RecoveryStrategy::RetryStage { max_attempts: 2, delay_ms: 5000 });
        strategy_map.insert("PathCorrection".to_string(), RecoveryStrategy::RetryStage { max_attempts: 2, delay_ms: 3000 });
        
        Self {
            strategy_map,
            max_consecutive_failures: 3,
            default_strategy: RecoveryStrategy::AbortWorkflow,
        }
    }
}

/// Response from workflow error handler
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowErrorResponse {
    /// Whether the error was handled
    pub error_handled: bool,
    /// Whether recovery was attempted
    pub recovery_attempted: bool,
    /// Description of the next action taken
    pub next_action: String,
    /// Whether the workflow should continue
    pub should_continue: bool,
    /// New job ID if a retry was queued
    pub retry_job_id: Option<String>,
}

// ============================================================================
// Abstract Workflow Definition Types
// ============================================================================

/// Defines the structure and dependencies of a complete workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    /// Unique name for the workflow
    pub name: String,
    /// Ordered list of stages in this workflow
    pub stages: Vec<WorkflowStageDefinition>,
}

/// Defines a single stage within a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStageDefinition {
    /// Unique name for this stage within the workflow
    pub stage_name: String,
    /// The task type that this stage executes
    pub task_type: TaskType,
    /// Optional processor name if it differs from the default mapping
    pub processor_name: Option<String>,
    /// Names of prerequisite stages that must complete before this stage can run
    pub dependencies: Vec<String>,
    /// Whether this stage can run in parallel with other eligible stages
    pub allow_parallel_execution: bool,
}

/// Current state of an abstract workflow execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbstractWorkflowState {
    /// Unique identifier for this workflow execution
    pub workflow_id: String,
    /// Name of the workflow definition being executed
    pub workflow_definition_name: String,
    /// Stages that have been completed
    pub completed_stages: Vec<String>,
    /// Stages currently in progress
    pub in_progress_stages: Vec<String>,
    /// Stages that have failed
    pub failed_stages: Vec<String>,
    /// Whether the entire workflow is complete
    pub is_complete: bool,
    /// Whether the workflow has been cancelled
    pub is_cancelled: bool,
    /// Additional metadata for the workflow
    pub metadata: HashMap<String, String>,
}

impl WorkflowDefinition {
    /// Create a new workflow definition
    pub fn new(name: String, stages: Vec<WorkflowStageDefinition>) -> Self {
        Self { name, stages }
    }

    /// Get a stage definition by name
    pub fn get_stage(&self, stage_name: &str) -> Option<&WorkflowStageDefinition> {
        self.stages.iter().find(|stage| stage.stage_name == stage_name)
    }

    /// Get all stages that depend on the given stage
    pub fn get_dependent_stages(&self, stage_name: &str) -> Vec<&WorkflowStageDefinition> {
        self.stages
            .iter()
            .filter(|stage| stage.dependencies.contains(&stage_name.to_string()))
            .collect()
    }

    /// Get all stages with no dependencies (entry points)
    pub fn get_entry_stages(&self) -> Vec<&WorkflowStageDefinition> {
        self.stages
            .iter()
            .filter(|stage| stage.dependencies.is_empty())
            .collect()
    }

    /// Validate that the workflow definition is well-formed
    pub fn validate(&self) -> Result<(), String> {
        // Check for duplicate stage names
        let mut stage_names = std::collections::HashSet::new();
        for stage in &self.stages {
            if !stage_names.insert(&stage.stage_name) {
                return Err(format!("Duplicate stage name: {}", stage.stage_name));
            }
        }

        // Check that all dependencies exist
        for stage in &self.stages {
            for dependency in &stage.dependencies {
                if !stage_names.contains(dependency) {
                    return Err(format!(
                        "Stage '{}' depends on non-existent stage '{}'",
                        stage.stage_name, dependency
                    ));
                }
            }
        }

        // Check for circular dependencies (basic check)
        for stage in &self.stages {
            if stage.dependencies.contains(&stage.stage_name) {
                return Err(format!("Stage '{}' depends on itself", stage.stage_name));
            }
        }

        // Check that all task types are valid (not Unknown)
        for stage in &self.stages {
            if stage.task_type == TaskType::Unknown {
                return Err(format!(
                    "Stage '{}' has invalid task type 'Unknown'",
                    stage.stage_name
                ));
            }
        }

        Ok(())
    }
}

impl WorkflowStageDefinition {
    /// Create a new stage definition
    pub fn new(
        stage_name: String,
        task_type: TaskType,
        processor_name: Option<String>,
        dependencies: Vec<String>,
    ) -> Self {
        Self {
            stage_name,
            task_type,
            processor_name,
            dependencies,
            allow_parallel_execution: false,
        }
    }

    /// Create a new stage definition with parallel execution option
    pub fn new_with_parallel(
        stage_name: String,
        task_type: TaskType,
        processor_name: Option<String>,
        dependencies: Vec<String>,
        allow_parallel_execution: bool,
    ) -> Self {
        Self {
            stage_name,
            task_type,
            processor_name,
            dependencies,
            allow_parallel_execution,
        }
    }

    /// Create a stage with no dependencies
    pub fn entry_stage(stage_name: String, task_type: TaskType) -> Self {
        Self::new(stage_name, task_type, None, vec![])
    }

    /// Create a stage with no dependencies that allows parallel execution
    pub fn entry_stage_parallel(stage_name: String, task_type: TaskType) -> Self {
        Self::new_with_parallel(stage_name, task_type, None, vec![], true)
    }

    /// Create a stage that depends on another stage
    pub fn dependent_stage(
        stage_name: String,
        task_type: TaskType,
        dependencies: Vec<String>,
    ) -> Self {
        Self::new(stage_name, task_type, None, dependencies)
    }

    /// Create a stage that depends on another stage and allows parallel execution
    pub fn dependent_stage_parallel(
        stage_name: String,
        task_type: TaskType,
        dependencies: Vec<String>,
    ) -> Self {
        Self::new_with_parallel(stage_name, task_type, None, dependencies, true)
    }
}

impl AbstractWorkflowState {
    /// Create a new workflow state
    pub fn new(workflow_id: String, workflow_definition_name: String) -> Self {
        Self {
            workflow_id,
            workflow_definition_name,
            completed_stages: vec![],
            in_progress_stages: vec![],
            failed_stages: vec![],
            is_complete: false,
            is_cancelled: false,
            metadata: HashMap::new(),
        }
    }

    /// Mark a stage as completed
    pub fn mark_stage_completed(&mut self, stage_name: String) {
        self.in_progress_stages.retain(|s| s != &stage_name);
        if !self.completed_stages.contains(&stage_name) {
            self.completed_stages.push(stage_name);
        }
    }

    /// Mark a stage as in progress
    pub fn mark_stage_in_progress(&mut self, stage_name: String) {
        if !self.in_progress_stages.contains(&stage_name) {
            self.in_progress_stages.push(stage_name);
        }
    }

    /// Mark a stage as failed
    pub fn mark_stage_failed(&mut self, stage_name: String) {
        self.in_progress_stages.retain(|s| s != &stage_name);
        if !self.failed_stages.contains(&stage_name) {
            self.failed_stages.push(stage_name);
        }
    }

    /// Check if a stage has been completed
    pub fn is_stage_completed(&self, stage_name: &str) -> bool {
        self.completed_stages.contains(&stage_name.to_string())
    }

    /// Check if a stage is in progress
    pub fn is_stage_in_progress(&self, stage_name: &str) -> bool {
        self.in_progress_stages.contains(&stage_name.to_string())
    }

    /// Check if a stage has failed
    pub fn is_stage_failed(&self, stage_name: &str) -> bool {
        self.failed_stages.contains(&stage_name.to_string())
    }

    /// Check if all dependencies for a stage are met
    pub fn are_dependencies_met(&self, dependencies: &[String]) -> bool {
        dependencies.iter().all(|dep| self.is_stage_completed(dep))
    }

    /// Set metadata value
    pub fn set_metadata(&mut self, key: String, value: String) {
        self.metadata.insert(key, value);
    }

    /// Get metadata value
    pub fn get_metadata(&self, key: &str) -> Option<&String> {
        self.metadata.get(key)
    }
}