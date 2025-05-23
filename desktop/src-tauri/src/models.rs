use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::str::FromStr;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FrontendUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AuthDataResponse {
    pub user: FrontendUser,
    pub token: String, // This will be the application JWT
    pub token_type: String, // Always "Bearer"
    pub expires_in: i64, // Token lifetime in seconds
}

// Session model that matches the TypeScript Session interface
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub name: String,
    pub project_directory: String,
    pub project_hash: String,
    pub task_description: Option<String>,
    pub search_term: Option<String>,
    pub title_regex: Option<String>,
    pub content_regex: Option<String>,
    pub negative_title_regex: Option<String>,
    pub negative_content_regex: Option<String>,
    pub is_regex_active: bool,
    pub codebase_structure: Option<String>,
    pub search_selected_files_only: bool,
    pub model_used: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub included_files: Option<Vec<String>>,
    pub excluded_files: Option<Vec<String>>,
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
    pub title_regex: Option<String>,
    pub content_regex: Option<String>,
    pub negative_title_regex: Option<String>,
    pub negative_content_regex: Option<String>,
    pub is_regex_active: Option<bool>,
    pub codebase_structure: Option<String>,
    pub search_selected_files_only: Option<bool>,
    pub model_used: Option<String>,
    pub created_at: Option<i64>,
    pub included_files: Option<Vec<String>>,
    pub force_excluded_files: Option<Vec<String>>,
}

// Job status enum that matches the SQL schema CHECK constraint
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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
            JobStatus::AcknowledgedByWorker => "acknowledged_by_worker".to_string(),
            JobStatus::Preparing => "preparing".to_string(),
            JobStatus::PreparingInput => "preparing_input".to_string(),
            JobStatus::GeneratingStream => "generating_stream".to_string(),
            JobStatus::ProcessingStream => "processing_stream".to_string(),
            JobStatus::Running => "running".to_string(),
            JobStatus::CompletedByTag => "completed_by_tag".to_string(),
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
        match s.to_lowercase().as_str() {
            "idle" => Ok(JobStatus::Idle),
            "created" => Ok(JobStatus::Created),
            "queued" => Ok(JobStatus::Queued),
            "acknowledged_by_worker" => Ok(JobStatus::AcknowledgedByWorker),
            "preparing" => Ok(JobStatus::Preparing),
            "preparing_input" => Ok(JobStatus::PreparingInput),
            "generating_stream" => Ok(JobStatus::GeneratingStream),
            "processing_stream" => Ok(JobStatus::ProcessingStream),
            "running" => Ok(JobStatus::Running),
            "completed_by_tag" => Ok(JobStatus::CompletedByTag),
            "completed" => Ok(JobStatus::Completed),
            "failed" => Ok(JobStatus::Failed),
            "canceled" | "cancelled" => Ok(JobStatus::Canceled),
            _ => Err(format!("Invalid job status: {}", s)),
        }
    }
}

// API type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    ImplementationPlan,
    PathFinder,
    TextImprovement,
    VoiceTranscription,
    VoiceCorrection,
    PathCorrection,
    RegexGeneration,
    GuidanceGeneration,
    ReadDirectory,
    TaskEnhancement,
    GenerateDirectoryTree,
    TextCorrectionPostTranscription,
    GenericLlmStream,
    Unknown,
}

impl ToString for TaskType {
    fn to_string(&self) -> String {
        match self {
            TaskType::ImplementationPlan => "implementation_plan".to_string(),
            TaskType::PathFinder => "path_finder".to_string(),
            TaskType::TextImprovement => "text_improvement".to_string(),
            TaskType::VoiceTranscription => "voice_transcription".to_string(),
            TaskType::VoiceCorrection => "voice_correction".to_string(),
            TaskType::PathCorrection => "path_correction".to_string(),
            TaskType::RegexGeneration => "regex_generation".to_string(),
            TaskType::GuidanceGeneration => "guidance_generation".to_string(),
            TaskType::ReadDirectory => "read_directory".to_string(),
            TaskType::TaskEnhancement => "task_enhancement".to_string(),
            TaskType::GenerateDirectoryTree => "generate_directory_tree".to_string(),
            TaskType::TextCorrectionPostTranscription => "text_correction_post_transcription".to_string(),
            TaskType::GenericLlmStream => "generic_llm_stream".to_string(),
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
            "text_improvement" => Ok(TaskType::TextImprovement),
            "voice_transcription" => Ok(TaskType::VoiceTranscription),
            "voice_correction" => Ok(TaskType::VoiceCorrection),
            "path_correction" => Ok(TaskType::PathCorrection),
            "regex_generation" => Ok(TaskType::RegexGeneration),
            "guidance_generation" => Ok(TaskType::GuidanceGeneration),
            "read_directory" => Ok(TaskType::ReadDirectory),
            "task_enhancement" => Ok(TaskType::TaskEnhancement),
            "generate_directory_tree" => Ok(TaskType::GenerateDirectoryTree),
            "text_correction_post_transcription" => Ok(TaskType::TextCorrectionPostTranscription),
            "generic_llm_stream" => Ok(TaskType::GenericLlmStream),
            _ => Ok(TaskType::Unknown),
        }
    }
}

// Background job model that matches the TypeScript BackgroundJob interface
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundJob {
    pub id: String,
    pub session_id: String,
    pub api_type: String, // Will be "openrouter" for LLM tasks
    pub task_type: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub last_update: Option<i64>,
    pub prompt: String,
    pub response: Option<String>,
    pub project_directory: Option<String>,
    pub tokens_sent: Option<i32>,
    pub tokens_received: Option<i32>,
    pub total_tokens: Option<i32>,
    pub chars_received: Option<i32>,
    pub status_message: Option<String>,
    pub error_message: Option<String>,
    pub model_used: Option<String>,
    pub max_output_tokens: Option<i32>,
    pub temperature: Option<f32>,
    pub include_syntax: Option<bool>,
    pub cleared: Option<bool>,
    pub visible: Option<bool>,
    pub metadata: Option<String>,
}

// Task settings model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSettings {
    pub session_id: String,
    pub task_type: String,
    pub model: String, // OpenRouter model string
    pub max_tokens: i32,
    pub temperature: Option<f32>,
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
pub struct ImplementationPlanMetadata {
    pub title: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceTranscriptionMetadata {
    pub file_size: Option<i32>,
    pub duration_seconds: Option<f32>,
}

// Models for the fetch polyfill
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchRequestArgs {
    pub method: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<serde_json::Value>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: serde_json::Value,
}

// Models for streaming request handlers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamRequestArgs {
    pub url: String,
    pub method: String,
    pub headers: Option<serde_json::Value>,
    pub body: Option<String>,
}

// DTO for file operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified_at: Option<i64>,
}

// OpenRouter API types
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
    pub model: String,
    pub usage: Option<OpenRouterUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterChoice {
    pub message: OpenRouterResponseMessage,
    pub index: u32,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterResponseMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// OpenRouter streaming response chunks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterStreamChunk {
    pub id: String,
    pub choices: Vec<OpenRouterStreamChoice>,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterStreamChoice {
    pub delta: OpenRouterDelta,
    pub index: u32,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}

// Directory information model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryInfo {
    pub name: String,
    pub path: String,
    pub is_accessible: bool,
}


// File statistic information for list_files_command
// Note: 'path' is expected to be relative to the queried directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStatInfo {
    pub path: String,  // Relative path to the queried directory
    pub size: u64,
    pub modified_ms: i64,
    pub created_ms: Option<i64>,
    pub accessed_ms: Option<i64>,
}

// Response for list_files_command
// Note: All file paths in this struct are expected to be relative to the queried directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListFilesResponse {
    pub files: Vec<String>,  // List of file paths relative to the queried directory
    pub stats: Option<Vec<FileStatInfo>>,
    pub warning: Option<String>,
    pub total_found_before_filtering: Option<usize>,
}

// Request arguments for create_path_finder_job command
#[derive(Debug, Clone, Serialize, Deserialize)]
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

// Response for create_path_finder_job command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathFinderCommandResponse {
    pub job_id: String,
}

// Request arguments for read_implementation_plan command
#[derive(Debug, Deserialize)]
pub struct ReadImplementationPlanArgs {
    pub job_id: String,
}

// Response for read_implementation_plan command
#[derive(Debug, Serialize)]
pub struct ReadImplementationPlanResponse {
    pub content: String,
    pub file_path: String,
    pub job_id: String,
    pub is_partial: bool,
    pub stream_progress: Option<f32>,
}

// Runtime AI configuration structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpecificModelConfig {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: Option<String>,
    #[serde(default)]
    pub context_window: Option<u32>,
    pub price_per_input_token: f64,
    pub price_per_output_token: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeAIConfig {
    pub default_llm_model_id: String,
    pub default_voice_model_id: String,
    pub default_transcription_model_id: String,
    pub tasks: HashMap<String, TaskSpecificModelConfig>,
    pub available_models: Vec<ModelInfo>,
    
    // PathFinder specific configuration with optional fields (uses constants as fallbacks)
    #[serde(default)]
    pub path_finder_settings: PathFinderSettings,
    
    // Limits for token usage
    #[serde(default)]
    pub limits: TokenLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TokenLimits {
    // Maximum tokens per request
    pub max_tokens_per_request: Option<u32>,
    // Maximum tokens per month
    pub max_tokens_per_month: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PathFinderSettings {
    // Max number of files to include content from
    pub max_files_with_content: Option<usize>,
    // Whether to include file contents by default
    pub include_file_contents: Option<bool>,
    // Maximum characters per file, not tokens
    pub max_content_size_per_file: Option<usize>,
    // Maximum number of paths to return in results
    pub max_file_count: Option<usize>,
    // Initial truncation length for file contents
    pub file_content_truncation_chars: Option<usize>,
    // Buffer to leave room in context window
    pub token_limit_buffer: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
pub struct GlobalSettings {
    pub default_project_directory: Option<String>,
    pub theme: Option<String>,
    pub recent_directories: Option<Vec<String>>,
    pub last_updated: Option<i64>,
}