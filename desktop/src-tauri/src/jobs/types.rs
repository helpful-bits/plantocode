use serde::{Serialize, Deserialize};
use std::sync::Arc;
use std::convert::TryFrom;
use std::collections::HashMap;

use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus, TaskType};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobUIMetadata {
    pub job_payload_for_worker: JobPayload,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow_id: Option<String>,
    pub task_data: serde_json::Value,
}



// Event emitted when a job status changes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatusChangeEvent {
    pub job_id: String,
    pub status: String,
    pub message: Option<String>,
}

// Event emitted when a job response is updated
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobResponseUpdateEvent {
    pub job_id: String,
    pub response_chunk: String,
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRouterLlmPayload {
    pub prompt: String,
    pub model: String,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub stream: bool,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputPathFinderPayload {
    pub session_id: String,
    pub task_description: String,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub options: crate::jobs::processors::path_finder_types::PathFinderOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderPayload {
    pub task_description: String,
    pub system_prompt: String,
    pub directory_tree: Option<String>,
    pub relevant_file_contents: std::collections::HashMap<String, String>,
    pub estimated_input_tokens: Option<u32>,
    pub options: crate::jobs::processors::path_finder_types::PathFinderOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImplementationPlanPayload {
    pub task_description: String,
    pub relevant_files: Vec<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuidanceGenerationPayload {
    pub task_description: String,
    pub paths: Option<Vec<String>>,
    pub file_contents_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathCorrectionPayload {
    pub paths_to_correct: String,
}



#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRefinementPayload {
    pub task_description: String,
    pub relevant_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextImprovementPayload {
    pub text_to_improve: String,
    pub original_transcription_job_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericLlmStreamPayload {
    pub prompt_text: String,
    pub system_prompt: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexPatternGenerationPayload {
    pub task_description: String,
    pub directory_tree: Option<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtendedPathFinderPayload {
    pub task_description: String,
    pub initial_paths: Vec<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexPatternGenerationWorkflowPayload {
    pub task_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelevanceAssessmentPayload {
    pub task_description: String,
    pub locally_filtered_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRelevanceAssessmentProcessingDetails {
    pub approach: String,
    pub total_files: usize,
    pub total_chunks: usize,
    pub processed_files: usize,
    pub successful_chunks: usize,
    pub failed_chunks: usize,
    pub chunk_token_limit: usize,
    pub model_context_window: usize,
    pub context_window_utilization: String,
    pub parallel_processing: bool,
    pub concurrent_chunks: usize,
    pub processing_duration_seconds: f64,
    pub no_limits_applied: bool,
    pub comprehensive_analysis: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRelevanceAssessmentQualityDetails {
    pub all_files_processed: bool,
    pub validated_results: bool,
    pub duplicates_removed: bool,
    pub filesystem_validated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRelevanceAssessmentResponse {
    pub relevant_files: Vec<String>,
    pub count: usize,
    pub summary: String,
    pub token_count: usize,
    pub processing: FileRelevanceAssessmentProcessingDetails,
    pub quality: FileRelevanceAssessmentQualityDetails,
}



#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum JobPayload {
    OpenRouterLlm(OpenRouterLlmPayload),
    PathFinder(PathFinderPayload),
    ImplementationPlan(ImplementationPlanPayload),
    GuidanceGeneration(GuidanceGenerationPayload),
    PathCorrection(PathCorrectionPayload),
    TaskRefinement(TaskRefinementPayload),
    TextImprovement(TextImprovementPayload),
    GenericLlmStream(GenericLlmStreamPayload),
    RegexPatternGeneration(RegexPatternGenerationPayload),
    // Individual workflow stage payloads
    ExtendedPathFinder(ExtendedPathFinderPayload),
    RegexPatternGenerationWorkflow(RegexPatternGenerationWorkflowPayload),
    FileRelevanceAssessment(FileRelevanceAssessmentPayload),
}

// Structured types for Implementation Plan parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredImplementationPlanStepOperation {
    #[serde(rename = "type")]
    pub operation_type: String, // "create", "modify", "delete", etc.
    pub path: String,
    pub changes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredImplementationPlanStep {
    pub number: Option<String>,
    pub title: String,
    pub description: String,
    pub file_operations: Option<Vec<StructuredImplementationPlanStepOperation>>,
    pub bash_commands: Option<String>,
    pub exploration_commands: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredImplementationPlan {
    pub agent_instructions: Option<String>,
    pub steps: Vec<StructuredImplementationPlanStep>,
}

// Result of a job process
#[derive(Debug, Clone)]
pub struct JobProcessResult {
    pub job_id: String,
    pub status: JobStatus,
    pub response: Option<String>,
    pub error: Option<String>,
    pub tokens_sent: Option<i32>,
    pub tokens_received: Option<i32>,
    pub total_tokens: Option<i32>,
    pub chars_received: Option<i32>,
}

impl JobProcessResult {
    // Create a new successful result
    pub fn success(job_id: String, response: String) -> Self {
        Self {
            job_id,
            status: JobStatus::Completed,
            response: Some(response),
            error: None,
            tokens_sent: None,
            tokens_received: None,
            total_tokens: None,
            chars_received: None,
        }
    }
    
    // Create a new failed result
    pub fn failure(job_id: String, error: String) -> Self {
        Self {
            job_id,
            status: JobStatus::Failed,
            response: None,
            error: Some(error),
            tokens_sent: None,
            tokens_received: None,
            total_tokens: None,
            chars_received: None,
        }
    }
    
    // Create a new canceled result
    pub fn canceled(job_id: String, message: String) -> Self {
        Self {
            job_id,
            status: JobStatus::Canceled,
            response: None,
            error: Some(message),
            tokens_sent: None,
            tokens_received: None,
            total_tokens: None,
            chars_received: None,
        }
    }
    
    // Set token usage information
    pub fn with_tokens(
        mut self,
        tokens_sent: Option<i32>,
        tokens_received: Option<i32>,
        total_tokens: Option<i32>,
        chars_received: Option<i32>,
    ) -> Self {
        self.tokens_sent = tokens_sent;
        self.tokens_received = tokens_received;
        self.total_tokens = total_tokens;
        self.chars_received = chars_received;
        self
    }
}

#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub job_type: TaskType,
    pub payload: JobPayload,
    pub session_id: String,
    pub process_after: Option<i64>,
    pub created_at: i64,
}

impl Job {
    pub fn id(&self) -> &str {
        &self.id
    }
    
    pub fn task_type_str(&self) -> String {
        self.job_type.to_string()
    }
    
    pub fn session_id(&self) -> &str {
        &self.session_id
    }
}

// Workflow stage enumeration for error tracking
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum WorkflowStage {
    ExtendedPathFinder,
    PathCorrection,
    RegexPatternGeneration,
    FileRelevanceAssessment,
    // Add more stages as workflows expand
}

impl std::fmt::Display for WorkflowStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowStage::ExtendedPathFinder => write!(f, "ExtendedPathFinder"),
            WorkflowStage::PathCorrection => write!(f, "PathCorrection"),
            WorkflowStage::RegexPatternGeneration => write!(f, "RegexPatternGeneration"),
            WorkflowStage::FileRelevanceAssessment => write!(f, "FileRelevanceAssessment"),
        }
    }
}

// Workflow error types for comprehensive error handling
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowErrorType {
    StageExecutionFailed { stage: WorkflowStage, job_id: String, error: String },
    DataExtractionFailed { from_job_id: String, error: String },
    JobChainBroken { broken_at_stage: WorkflowStage, error: String },
    CancellationFailed { job_id: String, error: String },
    ResourceCleanupFailed { workflow_id: String, error: String },
    TimeoutExceeded { workflow_id: String, timeout_ms: u64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowError {
    pub workflow_id: String,
    pub error_type: WorkflowErrorType,
    pub occurred_at: i64,
    pub recovery_attempted: bool,
    pub recovery_successful: Option<bool>,
}

// Error recovery strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryStrategy {
    RetryStage { max_attempts: u32, delay_ms: u64 },
    SkipToNextStage { with_fallback_data: bool },
    RestartFromPreviousStage,
    AbortWorkflow,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorRecoveryConfig {
    pub strategy_map: HashMap<String, RecoveryStrategy>, // Using String key instead of WorkflowErrorType for easier serialization
    pub max_consecutive_failures: u32,
    pub workflow_timeout_ms: u64,
}

// Response types for error handling operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowErrorResponse {
    pub workflow_id: String,
    pub error_handled: bool,
    pub recovery_attempted: bool,
    pub recovery_successful: Option<bool>,
    pub next_action: String,
}

// Cancellation result types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedCancellation {
    pub job_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancellationResult {
    pub workflow_id: String,
    pub canceled_jobs: Vec<String>,
    pub failed_cancellations: Vec<FailedCancellation>,
    pub cleanup_performed: bool,
}

// Cleanup result types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub workflow_id: Option<String>,
    pub cleaned_jobs: Vec<String>,
    pub failed_cleanups: Vec<String>,
    pub resources_freed: bool,
}

// Monitoring and reporting types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowErrorReport {
    pub workflow_id: String,
    pub total_errors: u32,
    pub errors_by_stage: HashMap<String, u32>,
    pub errors_by_type: HashMap<String, u32>,
    pub recovery_success_rate: f32,
    pub error_timeline: Vec<WorkflowError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowHealthMetrics {
    pub total_workflows: u32,
    pub successful_workflows: u32,
    pub failed_workflows: u32,
    pub workflows_with_errors: u32,
    pub average_error_recovery_time_ms: f32,
    pub most_common_error_types: Vec<(String, u32)>,
    pub most_problematic_stages: Vec<(String, u32)>,
}


