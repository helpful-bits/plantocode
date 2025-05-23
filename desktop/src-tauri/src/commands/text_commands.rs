use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use crate::error::AppResult;
use crate::models::JobStatus;
use crate::error::AppError;

/// Response for the improve text command
#[derive(Debug, Serialize)]
pub struct ImproveTextResponse {
    pub job_id: String,
}

/// Request payload for the improve text command
#[derive(Debug, Deserialize)]
pub struct ImproveTextArgs {
    pub session_id: String,
    pub text: String,
    pub improvement_type: String,
    pub language: Option<String>,
    pub project_directory: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub target_field: Option<String>,
}

/// Improves text based on the specified improvement type
#[command]
pub async fn improve_text_command(
    session_id: String,
    text: String,
    improvement_type: String,
    language: Option<String>,
    project_directory: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    target_field: Option<String>,
    app_handle: AppHandle,
) -> AppResult<ImproveTextResponse> {
    let args = ImproveTextArgs {
        session_id,
        text,
        improvement_type,
        language,
        project_directory,
        model_override,
        temperature_override,
        max_tokens_override,
        target_field,
    };
    crate::services::text_improvement_service::create_text_improvement_job_service(&app_handle, args)
        .await
}

// Command response for text correction post transcription
#[derive(Debug, Serialize)]
pub struct JobCommandResponse {
    pub job_id: String,
}

// Request arguments for text correction post transcription command
#[derive(Debug, Deserialize)]
pub struct CorrectTextPostTranscriptionArgs {
    pub session_id: String,
    pub text_to_correct: String,
    pub language: String, 
    pub original_transcription_job_id: Option<String>,
    pub project_directory: Option<String>,
}

// Command to correct text after transcription
#[command]
pub async fn correct_text_post_transcription_command(
    session_id: String,
    text_to_correct: String,
    language: String,
    original_transcription_job_id: Option<String>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = CorrectTextPostTranscriptionArgs {
        session_id,
        text_to_correct,
        language,
        original_transcription_job_id,
        project_directory,
    };
    info!("Creating text correction post transcription job");
    
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
    
    // Create job ID
    let job_id = format!("job_{}", uuid::Uuid::new_v4());
    
    // Create the job payload
    let payload = crate::jobs::types::TextCorrectionPostTranscriptionPayload {
        background_job_id: job_id.clone(),
        session_id: args.session_id.clone(),
        project_directory: args.project_directory.clone(),
        text_to_correct: args.text_to_correct.clone(),
        language: args.language.clone(),
        original_transcription_job_id: args.original_transcription_job_id.clone(),
    };
    
    // Get the model and settings for this task
    let model = match crate::config::get_model_for_task(crate::models::TaskType::TextCorrectionPostTranscription) {
        Ok(model) => model,
        Err(_) => match crate::config::get_model_for_task(crate::models::TaskType::TextImprovement) {
            Ok(model) => model,
            Err(e) => return Err(AppError::ConfigError(
                format!("Failed to get model for text correction: {}", e)
            )),
        },
    };
    
    let temperature = match crate::config::get_default_temperature_for_task(Some(crate::models::TaskType::TextCorrectionPostTranscription)) {
        Ok(temp) => temp,
        Err(_) => match crate::config::get_default_temperature_for_task(Some(crate::models::TaskType::TextImprovement)) {
            Ok(temp) => temp,
            Err(e) => return Err(AppError::ConfigError(
                format!("Failed to get temperature for text correction: {}", e)
            )),
        },
    };
    
    let max_tokens = match crate::config::get_default_max_tokens_for_task(Some(crate::models::TaskType::TextCorrectionPostTranscription)) {
        Ok(tokens) => tokens,
        Err(_) => match crate::config::get_default_max_tokens_for_task(Some(crate::models::TaskType::TextImprovement)) {
            Ok(tokens) => tokens,
            Err(e) => return Err(AppError::ConfigError(
                format!("Failed to get max tokens for text correction: {}", e)
            )),
        },
    };
    
    // Use the job creation utility to create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory.clone().unwrap_or_default(),
        "openrouter",
        crate::models::TaskType::TextCorrectionPostTranscription,
        "TEXT_CORRECTION_POST_TRANSCRIPTION",
        &format!("Correct transcribed text: {}", args.text_to_correct),
        (model, temperature, max_tokens),
        serde_json::to_value(payload).map_err(|e| 
            AppError::SerdeError(e.to_string()))?,
        1, // Priority
        None, // No extra metadata
        &app_handle,
    ).await?;
    
    info!("Created text correction post transcription job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}