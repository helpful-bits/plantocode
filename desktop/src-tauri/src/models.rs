use serde::{Serialize, Deserialize};
use serde_with::skip_serializing_none;
use std::collections::HashMap;
use std::str::FromStr;

// Common response for job-creating commands
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobCommandResponse {
    pub job_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrontendUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthDataResponse {
    pub user: FrontendUser,
    pub token: String, // This will be the application JWT
    pub token_type: String, // Always "Bearer"
    pub expires_in: i64, // Token lifetime in seconds
}

// Session model - stores user context and preferences, NOT workflow artifacts
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub name: String,
    pub project_directory: String,
    pub project_hash: String,
    pub task_description: Option<String>,
    pub search_term: Option<String>,
    pub search_selected_files_only: bool,
    pub model_used: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub included_files: Vec<String>,
    pub force_excluded_files: Vec<String>,
}

// Request struct for creating a session - only requires essential fields
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub id: Option<String>,
    pub name: Option<String>,
    pub project_directory: String,
    pub project_hash: Option<String>,
    pub task_description: Option<String>,
    pub search_term: Option<String>,
    pub search_selected_files_only: Option<bool>,
    pub model_used: Option<String>,
    pub created_at: Option<i64>,
    pub included_files: Vec<String>,
    pub force_excluded_files: Vec<String>,
}

// Job status enum that matches the SQL schema CHECK constraint
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Idle,
    Created,
    Queued,
    AcknowledgedByWorker,
    Preparing,
    PreparingInput,
    GeneratingStream,
    ProcessingStream,
    Running,
    CompletedByTag,
    Completed,
    Failed,
    Canceled,
}

impl ToString for JobStatus {
    fn to_string(&self) -> String {
        match self {
            JobStatus::Idle => "idle".to_string(),
            JobStatus::Created => "created".to_string(),
            JobStatus::Queued => "queued".to_string(),
            JobStatus::AcknowledgedByWorker => "acknowledgedByWorker".to_string(),
            JobStatus::Preparing => "preparing".to_string(),
            JobStatus::PreparingInput => "preparingInput".to_string(),
            JobStatus::GeneratingStream => "generatingStream".to_string(),
            JobStatus::ProcessingStream => "processingStream".to_string(),
            JobStatus::Running => "running".to_string(),
            JobStatus::CompletedByTag => "completedByTag".to_string(),
            JobStatus::Completed => "completed".to_string(),
            JobStatus::Failed => "failed".to_string(),
            JobStatus::Canceled => "canceled".to_string(),
        }
    }
}

impl JobStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(self, JobStatus::Completed | JobStatus::Failed | JobStatus::Canceled | JobStatus::CompletedByTag)
    }

    pub fn is_active(&self) -> bool {
        matches!(
            self,
            JobStatus::Idle
                | JobStatus::Created
                | JobStatus::Queued
                | JobStatus::AcknowledgedByWorker
                | JobStatus::Preparing
                | JobStatus::PreparingInput
                | JobStatus::GeneratingStream
                | JobStatus::ProcessingStream
                | JobStatus::Running
        )
    }
}

impl FromStr for JobStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "idle" => Ok(JobStatus::Idle),
            "created" => Ok(JobStatus::Created),
            "queued" => Ok(JobStatus::Queued),
            "acknowledgedByWorker" | "acknowledged_by_worker" => Ok(JobStatus::AcknowledgedByWorker),
            "preparing" => Ok(JobStatus::Preparing),
            "preparingInput" | "preparing_input" => Ok(JobStatus::PreparingInput),
            "generatingStream" | "generating_stream" => Ok(JobStatus::GeneratingStream),
            "processingStream" | "processing_stream" => Ok(JobStatus::ProcessingStream),
            "running" => Ok(JobStatus::Running),
            "completedByTag" | "completed_by_tag" => Ok(JobStatus::CompletedByTag),
            "completed" => Ok(JobStatus::Completed),
            "failed" => Ok(JobStatus::Failed),
            "canceled" | "cancelled" => Ok(JobStatus::Canceled),
            _ => Err(format!("Invalid job status: {}", s)),
        }
    }
}

// API type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApiType {
    OpenRouter,
    FileSystem,
}

impl ToString for ApiType {
    fn to_string(&self) -> String {
        match self {
            ApiType::OpenRouter => "openrouter".to_string(),
            ApiType::FileSystem => "filesystem".to_string(),
        }
    }
}

// Task type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    ImplementationPlan,
    PathFinder,
    VoiceTranscription,
    TextImprovement,
    PathCorrection,
    GuidanceGeneration,
    TaskRefinement,
    GenericLlmStream,
    RegexPatternGeneration,
    FileFinderWorkflow,
    // New individual workflow stage types
    LocalFileFiltering,
    FileRelevanceAssessment,
    ExtendedPathFinder,
    Streaming,
    Unknown,
}

impl ToString for TaskType {
    fn to_string(&self) -> String {
        match self {
            TaskType::ImplementationPlan => "implementation_plan".to_string(),
            TaskType::PathFinder => "path_finder".to_string(),
            TaskType::VoiceTranscription => "voice_transcription".to_string(),
            TaskType::TextImprovement => "text_improvement".to_string(),
            TaskType::PathCorrection => "path_correction".to_string(),
            TaskType::GuidanceGeneration => "guidance_generation".to_string(),
            TaskType::TaskRefinement => "task_refinement".to_string(),
            TaskType::GenericLlmStream => "generic_llm_stream".to_string(),
            TaskType::RegexPatternGeneration => "regex_pattern_generation".to_string(),
            TaskType::FileFinderWorkflow => "file_finder_workflow".to_string(),
            TaskType::LocalFileFiltering => "local_file_filtering".to_string(),
            TaskType::FileRelevanceAssessment => "file_relevance_assessment".to_string(),
            TaskType::ExtendedPathFinder => "extended_path_finder".to_string(),
            TaskType::Streaming => "streaming".to_string(),
            TaskType::Unknown => "unknown".to_string(),
        }
    }
}

impl std::str::FromStr for TaskType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "implementation_plan" => Ok(TaskType::ImplementationPlan),
            "path_finder" => Ok(TaskType::PathFinder),
            "voice_transcription" => Ok(TaskType::VoiceTranscription),
            "text_improvement" => Ok(TaskType::TextImprovement),
            "path_correction" => Ok(TaskType::PathCorrection),
            "guidance_generation" => Ok(TaskType::GuidanceGeneration),
            "task_refinement" => Ok(TaskType::TaskRefinement),
            "generic_llm_stream" => Ok(TaskType::GenericLlmStream),
            "regex_pattern_generation" => Ok(TaskType::RegexPatternGeneration),
            "file_finder_workflow" => Ok(TaskType::FileFinderWorkflow),
            "local_file_filtering" => Ok(TaskType::LocalFileFiltering),
            "file_relevance_assessment" => Ok(TaskType::FileRelevanceAssessment),
            "extended_path_finder" => Ok(TaskType::ExtendedPathFinder),
            "streaming" => Ok(TaskType::Streaming),
            _ => Ok(TaskType::Unknown),
        }
    }
}

impl TaskType {
    /// Returns true if this task type requires LLM configuration (model, tokens, temperature)
    pub fn requires_llm(&self) -> bool {
        match self {
            // Local/filesystem tasks that don't use LLMs
            TaskType::LocalFileFiltering 
            | TaskType::FileFinderWorkflow
            | TaskType::VoiceTranscription
 => false,
            // LLM tasks that require configuration
            TaskType::FileRelevanceAssessment
            | TaskType::ExtendedPathFinder
            | TaskType::ImplementationPlan
            | TaskType::PathFinder
            | TaskType::TextImprovement
            | TaskType::PathCorrection
            | TaskType::GuidanceGeneration
            | TaskType::TaskRefinement
            | TaskType::GenericLlmStream
            | TaskType::RegexPatternGeneration => true,
            // Streaming and Unknown default to true for safety
            TaskType::Streaming
            | TaskType::Unknown => true,
        }
    }

    /// Returns the appropriate API type for this task
    pub fn api_type(&self) -> ApiType {
        match self {
            // Local/filesystem tasks use filesystem API
            TaskType::LocalFileFiltering 
            | TaskType::FileFinderWorkflow
            | TaskType::VoiceTranscription
 => ApiType::FileSystem,
            // Extended workflow stages use OpenRouter API
            TaskType::FileRelevanceAssessment
            | TaskType::ExtendedPathFinder
            => ApiType::OpenRouter,
            // All other LLM tasks use OpenRouter API
            _ => ApiType::OpenRouter,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundJob {
    pub id: String,
    pub session_id: String,
    pub task_type: String,
    pub status: String,
    pub prompt: String,
    pub response: Option<String>,
    pub error_message: Option<String>,
    pub tokens_sent: Option<i32>,
    pub tokens_received: Option<i32>,
    pub model_used: Option<String>,
    pub metadata: Option<String>,
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub cost: Option<String>,
}

// Task settings model (DB struct - no camelCase conversion)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSettings {
    pub session_id: String,
    pub task_type: String,
    pub model: String, // OpenRouter model string
    pub max_tokens: i32,
    pub temperature: Option<f32>,
}

// System prompt for a specific task type and session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPrompt {
    pub id: String,
    pub session_id: String,
    pub task_type: String,
    pub system_prompt: String,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

// Default system prompt template
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultSystemPrompt {
    pub id: String,
    pub task_type: String,
    pub system_prompt: String,
    pub description: Option<String>,
    pub version: String,
    pub created_at: i64,
    pub updated_at: i64,
}

// Generic action state type for async operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionState<T> {
    Initial,
    Loading,
    Success(T),
    Error(String),
}

// Job metadata types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImplementationPlanMetadata {
    pub title: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionMetadata {
    pub file_size: Option<i32>,
    pub duration_seconds: Option<f32>,
}


// DTO for file operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified_at: Option<i64>,
}

// OpenRouter API types
#[skip_serializing_none]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterRequestMessage {
    pub role: String,
    pub content: Vec<OpenRouterContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OpenRouterContent {
    Text { 
        #[serde(rename = "type")]
        content_type: String, 
        text: String 
    },
    Image { 
        #[serde(rename = "type")]
        content_type: String, 
        image_url: ImageUrl 
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageUrl {
    pub url: String,
}

#[skip_serializing_none]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterRequest {
    pub model: String,
    pub messages: Vec<OpenRouterRequestMessage>,
    pub stream: bool,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterResponse {
    pub id: String,
    pub choices: Vec<OpenRouterChoice>,
    pub created: Option<i64>,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<OpenRouterUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterChoice {
    pub message: OpenRouterResponseMessage,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterResponseMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub cost: Option<f64>,
}

// OpenRouter streaming response chunks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterStreamChunk {
    pub id: String,
    pub choices: Vec<OpenRouterStreamChoice>,
    pub created: Option<i64>,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<OpenRouterUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterStreamChoice {
    pub delta: OpenRouterDelta,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}

// Directory information model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryInfo {
    pub name: String,
    pub path: String,
    pub is_accessible: bool,
}


// Native file information that matches TypeScript NativeFileInfo
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFileInfoRs {
    pub path: String,        // Relative path to the queried directory
    pub name: String,        // Base name of the file/directory
    pub is_dir: bool,        // Whether this is a directory
    pub is_file: bool,       // Whether this is a regular file
    pub is_symlink: bool,    // Whether this is a symbolic link
    pub size: Option<u64>,   // File size in bytes (None for directories)
    pub created_at: Option<i64>,   // Creation timestamp in milliseconds
    pub modified_at: Option<i64>,  // Modification timestamp in milliseconds
    pub accessed_at: Option<i64>,  // Access timestamp in milliseconds
    pub is_hidden: Option<bool>,   // Whether the file is hidden
    pub is_readable: Option<bool>, // Whether the file is readable
    pub is_writable: Option<bool>, // Whether the file is writable
}


// Response for list_files_command
// Note: All file paths in this struct are expected to be relative to the queried directory
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFilesResponse {
    pub files: Vec<NativeFileInfoRs>,  // List of file information objects
    pub warning: Option<String>,
    pub total_found_before_filtering: Option<usize>,
}

// Request arguments for create_path_finder_job command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderRequestArgs {
    pub session_id: String,
    pub task_description: String,
    pub project_directory: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub include_file_contents: Option<bool>,
    pub included_files: Option<Vec<String>>,
    pub excluded_files: Option<Vec<String>>,
}


// Request arguments for read_implementation_plan command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadImplementationPlanArgs {
    pub job_id: String,
}

// Response for read_implementation_plan command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadImplementationPlanResponse {
    pub content: String,
    pub file_path: String,
    pub job_id: String,
    pub is_partial: bool,
    pub stream_progress: Option<f32>,
}

// Runtime AI configuration structures
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSpecificModelConfig {
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub system_prompt: Option<String>,
    pub copy_buttons: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub provider_name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub context_window: Option<u32>,
    pub price_input_per_million: String,
    pub price_output_per_million: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderWithModels {
    pub provider: ProviderInfo,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAIConfig {
    pub default_llm_model_id: String,
    pub default_voice_model_id: String,
    pub default_transcription_model_id: String,
    pub tasks: HashMap<String, TaskSpecificModelConfig>,
    pub providers: Vec<ProviderWithModels>,
    
    // PathFinder specific configuration with optional fields (uses constants as fallbacks)
    #[serde(default)]
    pub path_finder_settings: PathFinderSettings,
    
    // Limits for token usage
    #[serde(default)]
    pub limits: TokenLimits,
    
    // Job concurrency configuration
    pub max_concurrent_jobs: Option<u32>,
    
    // Job system configuration
    #[serde(default)]
    pub job_settings: Option<JobSettings>,
    
    // General defaults for when task-specific configs are missing
    // These provide server-level control over fallbacks instead of hardcoded values
    pub default_temperature: Option<f32>,
    pub default_max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenLimits {
    // Maximum tokens per request
    pub max_tokens_per_request: Option<u32>,
    // Maximum tokens per month
    pub max_tokens_per_month: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderSettings {
    // Max number of files to include content from
    pub max_files_with_content: Option<usize>,
    // Whether to include file contents by default
    pub include_file_contents: Option<bool>,
    // Maximum number of paths to return in results
    pub max_file_count: Option<usize>,
    // Buffer to leave room in context window
    pub token_limit_buffer: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JobSettings {
    // Timeout for stale acknowledged jobs in seconds
    pub stale_job_timeout_seconds: Option<u64>,
    // Maximum number of retry attempts for failed jobs
    pub max_retry_attempts: Option<u32>,
    // Base delay for exponential backoff in seconds
    pub retry_base_delay_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub file_path: Option<String>,
    pub tables: Vec<TableInfo>,
    pub total_rows: i64,
    pub integrity_check: String,
    pub wal_enabled: bool,
    pub journal_mode: String,
    pub size_bytes: Option<u64>, // Size of the main DB file
    pub wal_size_bytes: Option<u64>, // Size of the WAL file, if present
}

/// Main Settings struct to store and retrieve application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    // App options
    pub theme: Option<String>,
    pub default_project_directory: Option<String>,
    pub recent_directories: Option<Vec<String>>,
    
    // AI models configuration
    pub api_options: Option<RuntimeAIConfig>,
    
    // UI preferences
    pub sidebar_width: Option<i32>,
    pub editor_font_size: Option<i32>,
    pub code_view_theme: Option<String>,
    pub hide_file_extensions: Option<bool>,
    pub show_hidden_files: Option<bool>,
    
    // Performance settings
    pub max_concurrent_jobs: Option<i32>,
    pub clear_job_history_after_days: Option<i32>,
    
    // Added timestamp for tracking changes
    pub last_updated: Option<i64>,
}

/// Type aliases for session data types
pub type SessionData = Session;
pub type SessionUpdateData = Session;

/// Global settings for the application
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSettings {
    pub default_project_directory: Option<String>,
    pub theme: Option<String>,
    pub recent_directories: Option<Vec<String>>,
    pub last_updated: Option<i64>,
}

/// Database health data for diagnostic purposes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealthData {
    pub status: String, // "ok" | "error" | "warning" | "checking"
    pub file_exists: bool,
    pub file_size: Option<u64>,
    pub file_permissions: Option<String>, // e.g., "0o644"
    pub setup_success: bool, // From app initialization
    pub integrity_status: Option<String>, // Result of PRAGMA integrity_check
    pub integrity_details: Option<serde_json::Value>,
    pub recovery_mode: bool,
    pub needs_repair: bool,
    pub error: Option<String>,
    pub error_category: Option<String>, // Corresponds to DatabaseErrorCategory
    pub error_severity: Option<String>, // Corresponds to DatabaseErrorSeverity
    pub details: Option<serde_json::Value>, // Other diagnostic details
    pub last_modified: Option<String>, // ISO 8601 string
}

/// Subscription plan model that matches server response and frontend expectations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: String,
    pub weekly_price: f64,
    pub monthly_price: f64,
    pub yearly_price: f64,
    pub currency: String,
    pub trial_days: i32,
    pub features: Vec<String>,
    pub recommended: bool,
    pub active: bool,
    pub stripe_weekly_price_id: Option<String>,
    pub stripe_monthly_price_id: Option<String>,
    pub stripe_yearly_price_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Invoice model for billing operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: String,
    pub created: i64,
    pub due_date: Option<i64>,
    pub amount_due: i64,
    pub amount_paid: i64,
    pub currency: String,
    pub status: String,
    pub invoice_pdf_url: Option<String>,
}

/// Response structure for listing invoices
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListInvoicesResponse {
    pub invoices: Vec<Invoice>,
    pub total_invoices: i32,
    pub has_more: bool,
}