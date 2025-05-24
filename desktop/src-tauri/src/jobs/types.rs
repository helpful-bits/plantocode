use serde::{Serialize, Deserialize};
use std::sync::Arc;
use std::convert::TryFrom;
use std::collections::HashMap;

use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus};

/// Job types that can be processed by the system
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JobType {
    OpenRouterLlm,
    OpenRouterTranscription,
    PathFinder,
    ImplementationPlan,
    RegexGeneration,
    GuidanceGeneration,
    PathCorrection,
    TextImprovement,
    TaskEnhancement,
    VoiceCorrection,
    GenerateDirectoryTree,
    TextCorrectionPostTranscription,
    GenericLlmStream,
    RegexSummaryGeneration
}

impl TryFrom<&str> for JobType {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "OPENROUTER_LLM" => Ok(JobType::OpenRouterLlm),
            "OPENROUTER_TRANSCRIPTION" => Ok(JobType::OpenRouterTranscription),
            "PATH_FINDER" => Ok(JobType::PathFinder),
            "IMPLEMENTATION_PLAN" => Ok(JobType::ImplementationPlan),
            "REGEX_GENERATION" => Ok(JobType::RegexGeneration),
            "GUIDANCE_GENERATION" => Ok(JobType::GuidanceGeneration),
            "PATH_CORRECTION" => Ok(JobType::PathCorrection),
            "TEXT_IMPROVEMENT" => Ok(JobType::TextImprovement),
            "TASK_ENHANCEMENT" => Ok(JobType::TaskEnhancement),
            "VOICE_CORRECTION" => Ok(JobType::VoiceCorrection),
            "GENERATE_DIRECTORY_TREE" => Ok(JobType::GenerateDirectoryTree),
            "TEXT_CORRECTION_POST_TRANSCRIPTION" => Ok(JobType::TextCorrectionPostTranscription),
            "GENERIC_LLM_STREAM" => Ok(JobType::GenericLlmStream),
            "REGEX_SUMMARY_GENERATION" => Ok(JobType::RegexSummaryGeneration),
            _ => Err(AppError::JobError(format!("Unknown job type: {}", value))),
        }
    }
}

impl std::fmt::Display for JobType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobType::OpenRouterLlm => write!(f, "OPENROUTER_LLM"),
            JobType::OpenRouterTranscription => write!(f, "OPENROUTER_TRANSCRIPTION"),
            JobType::PathFinder => write!(f, "PATH_FINDER"),
            JobType::ImplementationPlan => write!(f, "IMPLEMENTATION_PLAN"),
            JobType::RegexGeneration => write!(f, "REGEX_GENERATION"),
            JobType::GuidanceGeneration => write!(f, "GUIDANCE_GENERATION"),
            JobType::PathCorrection => write!(f, "PATH_CORRECTION"),
            JobType::TextImprovement => write!(f, "TEXT_IMPROVEMENT"),
            JobType::TaskEnhancement => write!(f, "TASK_ENHANCEMENT"),
            JobType::VoiceCorrection => write!(f, "VOICE_CORRECTION"),
            JobType::GenerateDirectoryTree => write!(f, "GENERATE_DIRECTORY_TREE"),
            JobType::TextCorrectionPostTranscription => write!(f, "TEXT_CORRECTION_POST_TRANSCRIPTION"),
            JobType::GenericLlmStream => write!(f, "GENERIC_LLM_STREAM"),
            JobType::RegexSummaryGeneration => write!(f, "REGEX_SUMMARY_GENERATION"),
        }
    }
}

// Event emitted when a job status changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStatusChangeEvent {
    pub job_id: String,
    pub status: String,
    pub message: Option<String>,
}

// Event emitted when a job response is updated
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResponseUpdateEvent {
    pub job_id: String,
    pub response_chunk: String,
    pub complete: bool,
}

// Payload for OpenRouter LLM job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterLlmPayload {
    pub prompt: String,
    pub model: String,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub stream: bool,
}

// Payload for OpenRouter audio transcription job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterTranscriptionPayload {
    pub audio_data: Vec<u8>,
    pub filename: String,
    pub model: String, // Model identifier to use (e.g., "openai/whisper-large-v3")
}

// Input payload for Path Finder job (used for deserialization from frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputPathFinderPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub options: crate::jobs::processors::path_finder_types::PathFinderOptions,
}

// Payload for Path Finder job with additional fields needed by the processor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathFinderPayload {
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub background_job_id: String,
    pub model_override: Option<String>,
    pub system_prompt: String,
    pub temperature: f32,
    pub max_output_tokens: Option<u32>,
    pub directory_tree: String,
    pub relevant_file_contents: std::collections::HashMap<String, String>,
    pub estimated_input_tokens: Option<u32>,
    pub options: crate::jobs::processors::path_finder_types::PathFinderOptions,
}

// The InputPathFinderPayload defined in commands/path_finding_commands.rs is used for initial input
// and is converted to PathFinderPayload in the job_payload_utils.rs

// Payload for Implementation Plan job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImplementationPlanPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub project_structure: Option<String>, // Renamed from codebase_structure
    pub relevant_files: Vec<String>,     // New field
    pub model: String,                   // Changed from model_override
    pub temperature: f32,
    pub max_tokens: Option<u32>,      // Changed from max_output_tokens
}

// Payload for Regex Generation job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegexGenerationPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub description: String,
    pub examples: Option<Vec<String>>,
    pub target_language: Option<String>,
    pub project_directory: String,
    pub model_override: Option<String>,
    pub temperature: f32,
    pub max_output_tokens: Option<u32>,
    pub target_field: Option<String>,
}

// Payload for Guidance Generation job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuidanceGenerationPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub project_directory: String,
    pub task_description: String,
    pub paths: Option<Vec<String>>,
    pub file_contents_summary: Option<String>,
    pub system_prompt_override: Option<String>,
    pub model_override: Option<String>, 
    pub temperature: Option<f32>,
    pub max_output_tokens: Option<u32>,
}

// Payload for Path Correction job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathCorrectionPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub project_directory: String,
    pub paths_to_correct: String,
    pub context_description: String,
    pub system_prompt_override: Option<String>,
    pub model_override: Option<String>,
    pub temperature: Option<f32>,
    pub max_output_tokens: Option<u32>,
}

// Payload for Text Improvement job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextImprovementPayload {
    pub background_job_id: String, // Comes from Job.db_job.id
    pub session_id: String,        // Comes from Job.db_job.session_id
    pub project_directory: Option<String>, // Comes from Job.db_job.project_directory
    pub text_to_improve: String,
    pub language: Option<String>, // e.g., "en", "es"
    pub improvement_type: String, // e.g., "clarity", "conciseness", "technical", "grammar", "persuasiveness", "general"
    pub target_field: Option<String>, // For UI updates, stored in BackgroundJob.metadata
}

// Payload for Task Enhancement job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEnhancementPayload {
    pub background_job_id: String, // Comes from Job.db_job.id
    pub session_id: String,        // Comes from Job.db_job.session_id
    pub project_directory: Option<String>, // Comes from Job.db_job.project_directory
    pub task_description: String,
    pub project_context: Option<String>, // e.g., codebase structure, relevant files
    pub target_field: Option<String>, // For UI updates, stored in BackgroundJob.metadata
}

// Payload for Voice Correction job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceCorrectionPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub project_directory: Option<String>,
    pub text_to_correct: String,
    pub language: String,
    pub original_job_id: Option<String>, // Optional, for context from original transcription
}


// Payload for Generate Directory Tree job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateDirectoryTreePayload {
    pub background_job_id: String,
    pub session_id: String,
    pub project_directory: String,
    pub options: Option<crate::utils::directory_tree::DirectoryTreeOptions>,
}

// Payload for Text Correction Post Transcription job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextCorrectionPostTranscriptionPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub project_directory: Option<String>,
    pub text_to_correct: String,
    pub language: String,
    pub original_transcription_job_id: Option<String>,
}

// Payload for Generic LLM Stream job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenericLlmStreamPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub project_directory: Option<String>,
    pub prompt_text: String,
    pub system_prompt: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_output_tokens: Option<u32>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum JobPayload {
    OpenRouterLlm(OpenRouterLlmPayload),
    OpenRouterTranscription(OpenRouterTranscriptionPayload),
    PathFinder(PathFinderPayload),
    ImplementationPlan(ImplementationPlanPayload),
    RegexGeneration(RegexGenerationPayload),
    GuidanceGeneration(GuidanceGenerationPayload),
    PathCorrection(PathCorrectionPayload),
    TextImprovement(TextImprovementPayload),
    TaskEnhancement(TaskEnhancementPayload),
    VoiceCorrection(VoiceCorrectionPayload),
    GenerateDirectoryTree(GenerateDirectoryTreePayload),
    TextCorrectionPostTranscription(TextCorrectionPostTranscriptionPayload),
    GenericLlmStream(GenericLlmStreamPayload),
    RegexSummaryGeneration(crate::jobs::processors::RegexSummaryGenerationPayload),
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
    pub job_type: JobType,
    pub payload: JobPayload,
    pub created_at: String, // Timestamp string
    pub session_id: String,
    pub task_type_str: String,
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


