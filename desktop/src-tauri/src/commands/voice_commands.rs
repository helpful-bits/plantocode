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
pub struct TranscribeAudioArgs {
    pub session_id: String,
    pub audio_data: String, // Base64 encoded audio data
    pub filename: Option<String>,
    pub project_directory: Option<String>,
}


/// Transcribes audio data to text using OpenRouter's transcription API
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
    
    // Generate a job ID
    let job_id = format!("job_{}", Uuid::new_v4());
    
    // Generate filename if not provided
    let filename = args.filename.unwrap_or_else(|| "audio.mp3".to_string());
    
    // Create job metadata
    let metadata = serde_json::json!({
        "jobTypeForWorker": "OPENROUTER_TRANSCRIPTION",
        "jobPriorityForWorker": 1, // Higher priority for voice tasks
        "filename": filename,
    });
    
    // Create the OpenRouterTranscriptionPayload directly
    let transcription_payload = crate::jobs::types::OpenRouterTranscriptionPayload {
        audio_data,
        filename: filename.clone(),
        model: transcription_model.clone(),
    };
    
    // Serialize the payload for the job creation utility
    let payload = serde_json::to_value(transcription_payload)
        .map_err(|e| AppError::SerdeError(format!("Failed to serialize transcription payload: {}", e)))?;
    
    // Use the job creation utility to create and queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_dir,
        "openrouter",
        TaskType::VoiceTranscription,
        "VOICE_TRANSCRIPTION",
        &format!("Transcribe audio file: {}", filename),
        (transcription_model, 0.0, 0), // Temperature and max tokens not relevant for transcription
        payload,
        1, // Priority
        Some(metadata), // Extra metadata
        &app_handle,
    ).await?;
    
    info!("Created audio transcription job: {}", job_id);
    
    Ok(JobCommandResponse { job_id })
}

/// Request for voice correction after transcription
#[derive(Debug, Deserialize)]
pub struct CorrectTranscriptionArgs {
    pub session_id: String,
    pub text_to_correct: String,
    pub language: String,
    pub original_job_id: Option<String>,
    pub project_directory: Option<String>,
}


/// Corrects a transcription, typically after voice-to-text conversion
#[command]
pub async fn correct_transcription_command(
    session_id: String,
    text_to_correct: String,
    language: String,
    original_job_id: Option<String>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = CorrectTranscriptionArgs {
        session_id,
        text_to_correct,
        language,
        original_job_id,
        project_directory,
    };
    info!("Creating transcription correction job");
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.text_to_correct.is_empty() {
        return Err(AppError::ValidationError("Text to correct is required".to_string()));
    }
    
    if args.language.is_empty() {
        return Err(AppError::ValidationError("Language is required".to_string()));
    }
    
    // Get the session repository to verify session and get project directory if needed
    let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
    
    // Get project directory from args or session
    let project_dir = match args.project_directory {
        Some(dir) if !dir.is_empty() => dir,
        _ => {
            // Get from session
            let session = session_repo.get_session_by_id(&args.session_id).await
                .map_err(|e| AppError::DatabaseError(format!("Failed to get session: {}", e)))?
                .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", args.session_id)))?;
                
            if session.project_directory.is_empty() {
                return Err(AppError::ValidationError("Project directory is required".to_string()));
            }
            
            session.project_directory
        }
    };
    
    // Get model for this task
    let model = match crate::config::get_model_for_task(TaskType::VoiceCorrection) {
        Ok(model) => model,
        Err(e) => {
            return Err(AppError::ConfigError(format!("Failed to get model for voice correction: {}", e)));
        }
    };
    
    // Get temperature for this task
    let temperature = match crate::config::get_default_temperature_for_task(Some(TaskType::VoiceCorrection)) {
        Ok(temp) => temp,
        Err(e) => {
            return Err(AppError::ConfigError(format!("Failed to get temperature for voice correction: {}", e)));
        }
    };
    
    // Get max tokens for this task
    let max_tokens = match crate::config::get_default_max_tokens_for_task(Some(TaskType::VoiceCorrection)) {
        Ok(tokens) => tokens,
        Err(e) => {
            return Err(AppError::ConfigError(format!("Failed to get max tokens for voice correction: {}", e)));
        }
    };
    
    // Create the payload for the VoiceCorrectionProcessor
    let payload = crate::jobs::types::VoiceCorrectionPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        project_directory: Some(project_dir.clone()),
        text_to_correct: args.text_to_correct.clone(),
        language: args.language.clone(),
        original_job_id: args.original_job_id.clone(),
    };
    
    // Use the job creation utility to create and queue the job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &project_dir,
        "openrouter",
        TaskType::VoiceCorrection,
        "VOICE_CORRECTION",
        &format!("Correct transcription: {}", &args.text_to_correct[..std::cmp::min(50, args.text_to_correct.len())]),
        (model, temperature, max_tokens),
        serde_json::to_value(payload).map_err(|e| 
            AppError::SerdeError(e.to_string()))?,
        1, // Priority
        None, // No extra metadata
        &app_handle,
    ).await?;
    
    info!("Created voice correction job: {}", job_id);
    
    Ok(JobCommandResponse { job_id })
}

/// Request for direct audio transcription
#[derive(Debug, Deserialize)]
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
/// This is designed to be used by the TypeScript OpenRouterClientAdapter
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
    
    // Call the transcribe method
    let transcribed_text = transcription_client
        .transcribe(&args.audio_data, &args.filename, &transcription_model)
        .await
        .map_err(|e| {
            error!("Transcription failed via server proxy: {}", e);
            AppError::ServerProxyError(format!("Transcription failed via server proxy: {}", e))
        })?;
    
    info!("Direct transcription successful via server proxy");
    
    Ok(DirectTranscribeAudioResponse { text: transcribed_text })
}