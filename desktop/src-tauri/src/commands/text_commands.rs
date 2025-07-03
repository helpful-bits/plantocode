use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use crate::error::AppResult;
use crate::models::{JobStatus, JobCommandResponse};
use crate::error::AppError;
use crate::jobs::types::JobPayload;
use crate::db_utils::{SessionRepository, BackgroundJobRepository};




// Request arguments for text improvement command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImproveTextArgs {
    pub session_id: String,
    pub text_to_improve: String,
    pub original_transcription_job_id: Option<String>,
    pub project_directory: Option<String>,
}

// Command to improve text (consolidates voice improvement and post-transcription improvement)
#[command]
pub async fn improve_text_command(
    session_id: String,
    text_to_improve: String,
    original_transcription_job_id: Option<String>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = ImproveTextArgs {
        session_id,
        text_to_improve,
        original_transcription_job_id,
        project_directory,
    };
    info!("Creating text improvement job");
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.text_to_improve.is_empty() {
        return Err(AppError::ValidationError("Text to improve is required".to_string()));
    }
    
    
    // Create the job payload
    let payload = crate::jobs::types::TextImprovementPayload {
        text_to_improve: args.text_to_improve.clone(),
        original_transcription_job_id: args.original_transcription_job_id.clone(),
    };
    
    // Get session to access project directory
    let background_job_repo = app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
    let session_repo = SessionRepository::new(background_job_repo.get_pool());
    let session = session_repo.get_session_by_id(&args.session_id).await?
        .ok_or_else(|| AppError::JobError(format!("Session {} not found", args.session_id)))?;
    
    // Get the model and settings for this task using centralized resolver
    let model_settings = crate::utils::config_resolver::resolve_model_settings(
        &app_handle,
        crate::models::TaskType::TextImprovement,
        &session.project_directory,
        None, // no model override for this command
        None, // no temperature override for this command
        None, // no max_tokens override for this command
    ).await?;
    
    // Use the job creation utility to create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory.clone().unwrap_or_default(),
        "openrouter",
        crate::models::TaskType::TextImprovement,
        "TEXT_IMPROVEMENT",
        &args.text_to_improve,
        model_settings,
        JobPayload::TextImprovement(payload),
        1, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No extra metadata
        &app_handle,
    ).await?;
    
    info!("Created text improvement job: {}", job_id);
    
    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

/// Request payload for the generate simple text command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSimpleTextArgs {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub task_type: Option<String>, // e.g., "title_generation"
}

/// Generate simple text using a non-streaming AI model
/// This is optimized for quick text generation tasks where streaming is not needed
#[command]
pub async fn generate_simple_text_command(
    prompt: String,
    system_prompt: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    task_type: Option<String>,
    app_handle: AppHandle,
) -> AppResult<String> {
    info!("Generating simple text with prompt: {}", prompt);
    
    // Validate required fields
    if prompt.trim().is_empty() {
        return Err(AppError::ValidationError("Prompt is required and cannot be empty".to_string()));
    }
    
    // Parse task type or use default
    let task_type_enum = task_type
        .as_deref()
        .and_then(|t| t.parse::<crate::models::TaskType>().ok())
        .unwrap_or(crate::models::TaskType::Unknown);
    
    let resolved_settings = crate::utils::config_resolver::resolve_model_settings(
        &app_handle,
        task_type_enum,
        "", // No project directory for simple text generation
        model_override,
        temperature_override,
        max_tokens_override,
    ).await?;
    
    let (resolved_model, resolved_temperature, resolved_max_tokens) = resolved_settings
        .ok_or_else(|| AppError::ConfigError("Model settings could not be resolved".to_string()))?;
    
    // Construct messages for LLM
    let mut messages = Vec::new();
    
    // Add system prompt if provided
    if let Some(sys_prompt) = system_prompt {
        messages.push(crate::models::OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![crate::models::OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: sys_prompt,
            }],
        });
    }
    
    // Add user prompt
    messages.push(crate::models::OpenRouterRequestMessage {
        role: "user".to_string(),
        content: vec![crate::models::OpenRouterContent::Text {
            content_type: "text".to_string(),
            text: prompt,
        }],
    });
    
    // Get API client
    let api_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
    
    // Prepare request options
    let options = crate::api_clients::client_trait::ApiClientOptions {
        model: resolved_model,
        max_tokens: resolved_max_tokens,
        temperature: resolved_temperature,
        stream: false, // Non-streaming
        request_id: None, // No request tracking needed for non-streaming
    };
    
    // Call chat completion (non-streaming)
    let response = api_client.chat_completion(messages, options).await
        .map_err(|e| AppError::JobError(format!("API call failed: {}", e)))?;
    
    // Extract and return the text content from the response
    if let Some(choice) = response.choices.first() {
        Ok(choice.message.content.clone())
    } else {
        Err(AppError::JobError("No response from LLM".to_string()))
    }
}