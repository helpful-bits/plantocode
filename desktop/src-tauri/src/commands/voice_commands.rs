use tauri::{command, AppHandle, Manager};
use log::{debug, error, info};
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use uuid::Uuid;
use crate::error::AppResult;
use crate::models::{BackgroundJob, JobStatus, TaskType, JobCommandResponse};
use crate::utils::get_timestamp;
use crate::db_utils::{SessionRepository, BackgroundJobRepository};
use crate::utils::job_creation_utils;
use crate::jobs::types::JobPayload;
use crate::error::AppError;
use crate::api_clients::client_factory;
use crate::api_clients::client_trait::TranscriptionClient;

/// Arguments for audio transcription request
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeAudioArgs {
    pub session_id: String,
    pub audio_data: Vec<u8>,
    pub duration_ms: i64,
    pub filename: Option<String>,
    pub project_directory: Option<String>,
}


/// Transcribes audio data to text using Groq through server proxy
#[command]
pub async fn create_transcription_job_command(
    session_id: String,
    audio_data: Vec<u8>,
    duration_ms: i64,
    filename: Option<String>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = TranscribeAudioArgs {
        session_id,
        audio_data,
        duration_ms,
        filename,
        project_directory,
    };
    info!("Creating audio transcription job");
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.audio_data.is_empty() {
        return Err(AppError::ValidationError("Audio data is required".to_string()));
    }
    
    // Get the session repository to verify session and get project directory
    let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
    
    // Verify session exists
    let session = session_repo.get_session_by_id(&args.session_id).await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get session: {}", e)))?
        .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", args.session_id)))?;
    
    // Get project directory from session if not provided
    let project_dir = match args.project_directory {
        Some(dir) if !dir.is_empty() => dir,
        _ => {
            if session.project_directory.is_empty() {
                return Err(AppError::ValidationError("Project directory is required".to_string()));
            }
            session.project_directory
        }
    };
    
    // Get transcription model from config
    let transcription_model = match crate::config::get_default_transcription_model_id() {
        Ok(model) => model,
        Err(e) => {
            return Err(AppError::ConfigError(format!("Failed to get transcription model: {}", e)));
        }
    };
    
    debug!("Audio duration: {}ms for {} bytes", args.duration_ms, args.audio_data.len());
    
    // Generate filename if not provided
    let filename = args.filename.unwrap_or_else(|| "audio.mp3".to_string());
    
    // Create job metadata
    let metadata = serde_json::json!({
        "filename": filename,
    });
    
    // Create the VoiceTranscriptionPayload directly
    let transcription_payload = crate::jobs::types::VoiceTranscriptionPayload {
        audio_data: args.audio_data,
        filename: filename.clone(),
        model: transcription_model.clone(),
        duration_ms: args.duration_ms,
    };
    
    // Use the job creation utility to create and queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_dir,
        "groq_server_proxy",
        TaskType::VoiceTranscription,
        "VOICE_TRANSCRIPTION",
        &format!("Transcribe audio file: {}", filename),
        Some((transcription_model, 0.0, 0)), // Temperature and max tokens not relevant for transcription
        JobPayload::VoiceTranscription(transcription_payload),
        1, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        Some(metadata), // Extra metadata
        &app_handle,
    ).await?;
    
    info!("Created audio transcription job: {}", job_id);
    
    Ok(JobCommandResponse { job_id })
}


