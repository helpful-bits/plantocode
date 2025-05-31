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
use crate::error::AppError;
use crate::api_clients::client_factory;
use crate::api_clients::client_trait::TranscriptionClient;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

/// Arguments for audio transcription request
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeAudioArgs {
    pub session_id: String,
    pub audio_data: String, // Base64 encoded audio data
    pub filename: Option<String>,
    pub project_directory: Option<String>,
}


/// Transcribes audio data to text using Groq through server proxy
#[command]
pub async fn create_transcription_job_command(
    session_id: String,
    audio_data: String,
    filename: Option<String>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = TranscribeAudioArgs {
        session_id,
        audio_data,
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
    
    // Decode the base64 audio data
    
    let audio_data = BASE64.decode(&args.audio_data)
        .map_err(|e| AppError::ValidationError(format!("Invalid base64 audio data: {}", e)))?;
    
    // Estimate duration from audio data size (rough approximation)
    // For uncompressed audio at 44.1kHz, 16-bit, mono: 44100 * 2 bytes per second = 88200 bytes/sec
    // For typical compressed audio: estimate ~8000-12000 bytes per second
    let estimated_duration_ms = (audio_data.len() as f64 / 10000.0 * 1000.0) as i64;
    let duration_ms = std::cmp::max(estimated_duration_ms, 1000); // Minimum 1 second
    
    debug!("Estimated audio duration: {}ms for {} bytes", duration_ms, audio_data.len());
    
    // Generate filename if not provided
    let filename = args.filename.unwrap_or_else(|| "audio.mp3".to_string());
    
    // Create job metadata
    let metadata = serde_json::json!({
        "filename": filename,
    });
    
    // Create the VoiceTranscriptionPayload directly
    let transcription_payload = crate::jobs::types::VoiceTranscriptionPayload {
        audio_data,
        filename: filename.clone(),
        model: transcription_model.clone(),
        duration_ms,
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
        serde_json::to_value(transcription_payload)
            .map_err(|e| AppError::SerializationError(format!("Failed to serialize transcription payload: {}", e)))?,
        1, // Priority
        Some(metadata), // Extra metadata
        &app_handle,
    ).await?;
    
    info!("Created audio transcription job: {}", job_id);
    
    Ok(JobCommandResponse { job_id })
}


/// Request for direct audio transcription
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectTranscribeAudioArgs {
    pub audio_data: Vec<u8>,  // Uint8Array from JS will be sent as Vec<u8>
    pub filename: String,
    pub model: String,
}

/// Response with transcribed text
#[derive(Debug, Serialize)]
pub struct DirectTranscribeAudioResponse {
    pub text: String,
}

/// Directly transcribes audio to text without creating a background job
/// This uses Groq transcription through the server proxy
#[command]
pub async fn transcribe_audio_direct_command(
    audio_data: Vec<u8>,
    filename: String,
    model: String,
    app_handle: AppHandle,
) -> AppResult<DirectTranscribeAudioResponse> {
    let args = DirectTranscribeAudioArgs {
        audio_data,
        filename,
        model,
    };
    info!("Directly transcribing audio without background job using server proxy");
    
    // Validate required fields
    if args.audio_data.is_empty() {
        return Err(AppError::ValidationError("Audio data is required".to_string()));
    }
    
    if args.filename.is_empty() {
        return Err(AppError::ValidationError("Filename is required".to_string()));
    }
    
    // Get transcription model from param or use default
    let transcription_model = if args.model.is_empty() {
        match crate::config::get_default_transcription_model_id() {
            Ok(model) => model,
            Err(e) => {
                return Err(AppError::ConfigError(format!("Failed to get transcription model: {}", e)));
            }
        }
    } else {
        args.model
    };
    
    // Get the transcription client from app state
    // This is a ServerProxyClient under the TranscriptionClient trait
    let transcription_client = client_factory::get_transcription_client(&app_handle)?;
    debug!("Using transcription client to send request to server proxy");
    
    // Estimate duration from audio data size (rough approximation)
    // For uncompressed audio at 44.1kHz, 16-bit, mono: 44100 * 2 bytes per second = 88200 bytes/sec
    // For typical compressed audio: estimate ~8000-12000 bytes per second
    let estimated_duration_ms = (args.audio_data.len() as f64 / 10000.0 * 1000.0) as i64;
    let duration_ms = std::cmp::max(estimated_duration_ms, 1000); // Minimum 1 second
    
    debug!("Estimated audio duration: {}ms for {} bytes", duration_ms, args.audio_data.len());
    
    // Call the transcribe method
    let transcribed_text = transcription_client
        .transcribe(&args.audio_data, &args.filename, &transcription_model, duration_ms)
        .await
        .map_err(|e| {
            error!("Transcription failed via server proxy: {}", e);
            AppError::ServerProxyError(format!("Transcription failed via server proxy: {}", e))
        })?;
    
    info!("Direct transcription successful via server proxy");
    
    Ok(DirectTranscribeAudioResponse { text: transcribed_text })
}