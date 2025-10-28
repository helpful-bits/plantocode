use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::convert::TryFrom;
use std::sync::Arc;

use crate::error::{AppError, AppResult};
use crate::jobs::workflow_types::{
    CancellationResult, ErrorRecoveryConfig, FailedCancellation, RecoveryStrategy,
    WorkflowErrorResponse, WorkflowStage,
};
use crate::models::{BackgroundJob, JobStatus, TaskType};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobUIMetadata {
    pub job_payload_for_worker: JobPayload,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow_id: Option<String>,
    pub task_data: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
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
pub struct ImplementationPlanPayload {
    pub task_description: String,
    pub relevant_files: Vec<String>,
    pub selected_root_directories: Option<Vec<String>>,
    pub enable_web_search: bool,
    pub include_project_structure: bool,
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
pub struct RootFolderSelectionPayload {
    pub task_description: String,
    pub candidate_roots: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtendedPathFinderPayload {
    pub task_description: String,
    pub initial_paths: Vec<String>,
    pub selected_root_directories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexFileFilterPayload {
    pub task_description: String,
    pub root_directories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelevanceAssessmentPayload {
    pub task_description: String,
    pub locally_filtered_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchPromptsGenerationPayload {
    pub task_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchExecutionPayload {
    pub prompts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFinderWorkflowPayload {
    pub task_description: String,
    pub session_id: String,
    pub project_directory: String,
    pub excluded_paths: Vec<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchWorkflowPayload {
    pub task_description: String,
    pub session_id: String,
    pub project_directory: String,
    pub excluded_paths: Vec<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoAnalysisPayload {
    pub video_path: String,
    pub prompt: String,
    pub model: String,
    pub temperature: f32,
    pub system_prompt: Option<String>,
    pub duration_ms: i64,
    pub framerate: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct FileRelevanceAssessmentQualityDetails {
    pub all_files_processed: bool,
    pub validated_results: bool,
    pub duplicates_removed: bool,
    pub filesystem_validated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelevanceAssessmentResponse {
    pub files: Vec<String>,
    pub count: usize,
    pub summary: String,
    pub token_count: usize,
    pub processing: FileRelevanceAssessmentProcessingDetails,
    pub quality: FileRelevanceAssessmentQualityDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternGroup {
    pub title: String,
    pub path_pattern: Option<String>,
    pub content_pattern: Option<String>,
    pub negative_path_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupResult {
    pub title: String,
    pub matched_files: Vec<String>,
    pub files_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexFilterResult {
    pub filtered_files: Vec<String>,
    pub group_results: Option<Vec<GroupResult>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImplementationPlanMergePayload {
    pub source_job_ids: Vec<String>,
    pub merge_instructions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum JobPayload {
    OpenRouterLlm(OpenRouterLlmPayload),
    ImplementationPlan(ImplementationPlanPayload),
    ImplementationPlanMerge(ImplementationPlanMergePayload),
    TaskRefinement(TaskRefinementPayload),
    TextImprovement(TextImprovementPayload),
    GenericLlmStream(GenericLlmStreamPayload),
    // Individual workflow stage payloads
    RootFolderSelection(RootFolderSelectionPayload),
    ExtendedPathFinder(ExtendedPathFinderPayload),
    RegexFileFilter(RegexFileFilterPayload),
    FileRelevanceAssessment(FileRelevanceAssessmentPayload),
    WebSearchPromptsGeneration(WebSearchPromptsGenerationPayload),
    WebSearchExecution(WebSearchExecutionPayload),
    // Workflow payloads
    FileFinderWorkflow(FileFinderWorkflowPayload),
    WebSearchWorkflow(WebSearchWorkflowPayload),
    VideoAnalysis(VideoAnalysisPayload),
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

#[derive(Debug, Clone)]
pub enum JobResultData {
    Text(String),
    Json(serde_json::Value),
}

// Result of a job process
#[derive(Debug, Clone)]
pub struct JobProcessResult {
    pub job_id: String,
    pub status: JobStatus,
    pub response: Option<JobResultData>,
    pub error: Option<String>,
    pub tokens_sent: Option<u32>,
    pub tokens_received: Option<u32>,
    pub cache_write_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
    pub metadata: Option<serde_json::Value>,
    pub system_prompt_template: Option<String>,
    pub actual_cost: Option<f64>,
}

impl JobProcessResult {
    // Create a new successful result
    pub fn success(job_id: String, response: JobResultData) -> Self {
        Self {
            job_id,
            status: JobStatus::Completed,
            response: Some(response),
            error: None,
            tokens_sent: None,
            tokens_received: None,
            cache_write_tokens: None,
            cache_read_tokens: None,
            metadata: None,
            system_prompt_template: None,
            actual_cost: None,
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
            cache_write_tokens: None,
            cache_read_tokens: None,
            metadata: None,
            system_prompt_template: None,
            actual_cost: None,
        }
    }

    // Create a new successful result with metadata
    pub fn success_with_metadata(
        job_id: String,
        response: JobResultData,
        metadata: serde_json::Value,
    ) -> Self {
        Self {
            job_id,
            status: JobStatus::Completed,
            response: Some(response),
            error: None,
            tokens_sent: None,
            tokens_received: None,
            cache_write_tokens: None,
            cache_read_tokens: None,
            metadata: Some(metadata),
            system_prompt_template: None,
            actual_cost: None,
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
            cache_write_tokens: None,
            cache_read_tokens: None,
            metadata: None,
            system_prompt_template: None,
            actual_cost: None,
        }
    }

    // Set token usage information
    /// Set token usage for this job result
    ///
    /// TOKEN MAPPING CONVENTION:
    /// - `tokens_sent` = input/prompt tokens (what was sent TO the model)
    /// - `tokens_received` = output/completion tokens (what was received FROM the model)
    ///
    /// This maps from ProviderUsage fields:
    /// - `prompt_tokens` → `tokens_sent`
    /// - `completion_tokens` → `tokens_received`
    pub fn with_tokens(mut self, tokens_sent: Option<u32>, tokens_received: Option<u32>) -> Self {
        self.tokens_sent = tokens_sent;
        self.tokens_received = tokens_received;
        self
    }

    pub fn with_system_prompt_template(mut self, template: String) -> Self {
        self.system_prompt_template = Some(template);
        self
    }

    pub fn with_actual_cost(mut self, cost: f64) -> Self {
        self.actual_cost = Some(cost);
        self
    }

    /// Set cache token usage for this job result
    pub fn with_cache_tokens(
        mut self,
        cache_write_tokens: Option<i64>,
        cache_read_tokens: Option<i64>,
    ) -> Self {
        self.cache_write_tokens = cache_write_tokens;
        self.cache_read_tokens = cache_read_tokens;
        self
    }

    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub task_type: TaskType,
    pub payload: JobPayload,
    pub session_id: String,
    pub process_after: Option<i64>,
    pub created_at: i64,
    pub result_json: Option<String>,
}

impl Job {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn task_type_str(&self) -> String {
        self.task_type.to_string()
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }
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
pub struct SerializableWorkflowError {
    pub error_type: String,
    pub message: String,
    pub timestamp: i64,
    pub stage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowErrorReport {
    pub workflow_id: String,
    pub total_errors: u32,
    pub errors_by_stage: HashMap<String, u32>,
    pub errors_by_type: HashMap<String, u32>,
    pub recovery_success_rate: f32,
    pub error_timeline: Vec<SerializableWorkflowError>,
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
