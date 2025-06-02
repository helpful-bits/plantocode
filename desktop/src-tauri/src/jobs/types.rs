use serde::{Serialize, Deserialize};
use std::sync::Arc;
use std::convert::TryFrom;
use std::collections::HashMap;

use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus, TaskType};

// Structured metadata for jobs processed by workers (dispatcher/scheduler)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobWorkerMetadata {
    pub job_type_for_worker: String,
    pub job_payload_for_worker: JobPayload,
    pub job_priority_for_worker: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow_stage: Option<String>,
    // Additional metadata fields that don't fit the structured format
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_params: Option<serde_json::Value>,
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

// Payload for OpenRouter LLM job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRouterLlmPayload {
    pub prompt: String,
    pub model: String,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub stream: bool,
}

// Payload for voice audio transcription job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionPayload {
    pub audio_data: Vec<u8>,
    pub filename: String,
    pub model: String, // Model identifier to use (e.g., "openai/whisper-large-v3")
    pub duration_ms: i64, // Duration of audio in milliseconds
}

// Input payload for Path Finder job (used for deserialization from frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputPathFinderPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub options: crate::jobs::processors::path_finder_types::PathFinderOptions,
    pub directory_tree: Option<String>,
}

// Payload for Path Finder job with additional fields needed by the processor
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderPayload {
    pub session_id: String,
    pub task_description: String,
    pub background_job_id: String,
    pub project_directory: String,
    pub system_prompt: String,
    pub directory_tree: Option<String>,
    pub relevant_file_contents: std::collections::HashMap<String, String>,
    pub estimated_input_tokens: Option<u32>,
    pub options: crate::jobs::processors::path_finder_types::PathFinderOptions,
}

// The InputPathFinderPayload defined in commands/path_finding_commands.rs is used for initial input
// and is converted to PathFinderPayload in the job_payload_utils.rs

// Payload for Implementation Plan job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImplementationPlanPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_structure: Option<String>, // Renamed from codebase_structure
    pub relevant_files: Vec<String>,     // New field
    pub project_directory: String,
}


// Payload for Guidance Generation job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuidanceGenerationPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub paths: Option<Vec<String>>,
    pub file_contents_summary: Option<String>,
    pub system_prompt_override: Option<String>,
    pub project_directory: String,
}

// Payload for Path Correction job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathCorrectionPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub paths_to_correct: String,
    pub context_description: String,
    pub directory_tree: Option<String>,
    pub system_prompt_override: Option<String>,
}

// Payload for Text Improvement job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextImprovementPayload {
    pub background_job_id: String, // Comes from Job.db_job.id
    pub session_id: String,        // Comes from Job.db_job.session_id
    pub text_to_improve: String,
    pub target_field: Option<String>, // For UI updates, stored in BackgroundJob.metadata
    pub project_directory: Option<String>,
}

// Payload for Task Enhancement job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEnhancementPayload {
    pub background_job_id: String, // Comes from Job.db_job.id
    pub session_id: String,        // Comes from Job.db_job.session_id
    pub task_description: String,
    pub project_context: Option<String>, // e.g., codebase structure, relevant files
    pub target_field: Option<String>, // For UI updates, stored in BackgroundJob.metadata
    pub project_directory: String,
}

// Payload for Text Correction job (consolidates voice correction and post-transcription correction)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextCorrectionPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub text_to_correct: String,
    pub language: String,
    pub original_transcription_job_id: Option<String>,
    pub project_directory: Option<String>,
}

// Payload for Generic LLM Stream job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericLlmStreamPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub prompt_text: String,
    pub system_prompt: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub project_directory: Option<String>,
}

// Payload for Regex Pattern Generation job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexPatternGenerationPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String, // For model/temp config
    pub directory_tree: Option<String>, // For context
}

// FileFinderWorkflowPayload removed - workflows now use WorkflowOrchestrator with individual stage payloads

// Individual workflow stage payloads for separate background jobs

// Payload for Directory Tree Generation stage
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryTreeGenerationPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub excluded_paths: Vec<String>,
    pub workflow_id: String, // Links multiple stage jobs together
    pub next_stage_job_id: Option<String>, // For job chaining
}

// Payload for Local File Filtering stage
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileFilteringPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub directory_tree: String, // Result from DirectoryTreeGeneration stage
    pub excluded_paths: Vec<String>,
    pub workflow_id: String,
    pub previous_stage_job_id: String, // Links to DirectoryTreeGeneration job
    pub next_stage_job_id: Option<String>, // For job chaining
}

// Payload for Extended Path Finder stage
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtendedPathFinderPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub directory_tree: String, // From DirectoryTreeGeneration
    pub initial_paths: Vec<String>, // From LocalFileFiltering stage
    pub workflow_id: String,
    pub previous_stage_job_id: String, // Links to LocalFileFiltering job
    pub next_stage_job_id: Option<String>, // For job chaining
}

// Payload for Extended Path Correction stage  
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtendedPathCorrectionPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub directory_tree: String, // From DirectoryTreeGeneration
    pub extended_paths: Vec<String>, // From ExtendedPathFinder stage
    pub workflow_id: String,
    pub previous_stage_job_id: String, // Links to ExtendedPathFinder job
}

// Payload for Regex Pattern Generation workflow stage
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexPatternGenerationWorkflowPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub directory_tree: String, // From DirectoryTreeGeneration stage
    pub workflow_id: String,
    pub previous_stage_job_id: Option<String>, // May be used in different workflow positions
    pub next_stage_job_id: Option<String>, // For job chaining
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum JobPayload {
    OpenRouterLlm(OpenRouterLlmPayload),
    VoiceTranscription(VoiceTranscriptionPayload),
    PathFinder(PathFinderPayload),
    ImplementationPlan(ImplementationPlanPayload),
    GuidanceGeneration(GuidanceGenerationPayload),
    PathCorrection(PathCorrectionPayload),
    TextImprovement(TextImprovementPayload),
    TaskEnhancement(TaskEnhancementPayload),
    TextCorrection(TextCorrectionPayload),
    GenericLlmStream(GenericLlmStreamPayload),
    RegexSummaryGeneration(crate::jobs::processors::regex_summary_generation_processor::RegexSummaryGenerationPayload),
    RegexPatternGeneration(RegexPatternGenerationPayload),
    // Individual workflow stage payloads
    DirectoryTreeGeneration(DirectoryTreeGenerationPayload),
    LocalFileFiltering(LocalFileFilteringPayload),
    ExtendedPathFinder(ExtendedPathFinderPayload),
    ExtendedPathCorrection(ExtendedPathCorrectionPayload),
    RegexPatternGenerationWorkflow(RegexPatternGenerationWorkflowPayload),
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

// A job to be processed
#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub job_type: TaskType,
    pub payload: JobPayload,
    pub created_at: String, // Timestamp string
    pub session_id: String,
    pub task_type_str: String,
    pub project_directory: Option<String>,
    pub process_after: Option<i64>, // Unix timestamp in milliseconds when job should become eligible for processing
}

impl Job {
    // Get the job ID
    pub fn id(&self) -> &str {
        &self.id
    }
    
    // Get the job type as string
    pub fn task_type_str(&self) -> String {
        self.job_type.to_string()
    }
    
    // Get the session ID 
    pub fn session_id(&self) -> &str {
        &self.session_id
    }
}

// Workflow stage enumeration for error tracking
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum WorkflowStage {
    DirectoryTreeGeneration,
    LocalFileFiltering,
    ExtendedPathFinder,
    ExtendedPathCorrection,
    RegexPatternGeneration,
    // Add more stages as workflows expand
}

impl std::fmt::Display for WorkflowStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowStage::DirectoryTreeGeneration => write!(f, "DirectoryTreeGeneration"),
            WorkflowStage::LocalFileFiltering => write!(f, "LocalFileFiltering"),
            WorkflowStage::ExtendedPathFinder => write!(f, "ExtendedPathFinder"),
            WorkflowStage::ExtendedPathCorrection => write!(f, "ExtendedPathCorrection"),
            WorkflowStage::RegexPatternGeneration => write!(f, "RegexPatternGeneration"),
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


