use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use crate::error::AppResult;
use crate::models::{JobStatus, JobCommandResponse};
use crate::error::AppError;
use crate::jobs::types::JobPayload;




// Request arguments for text correction command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectTextArgs {
    pub session_id: String,
    pub text_to_correct: String,
    pub original_transcription_job_id: Option<String>,
    pub project_directory: Option<String>,
}

// Command to correct text (consolidates voice correction and post-transcription correction)
#[command]
pub async fn correct_text_command(
    session_id: String,
    text_to_correct: String,
    original_transcription_job_id: Option<String>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = CorrectTextArgs {
        session_id,
        text_to_correct,
        original_transcription_job_id,
        project_directory,
    };
    info!("Creating text correction job");
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.text_to_correct.is_empty() {
        return Err(AppError::ValidationError("Text to correct is required".to_string()));
    }
    
    
    // Create the job payload
    let payload = crate::jobs::types::TextCorrectionPayload {
        text_to_correct: args.text_to_correct.clone(),
        original_transcription_job_id: args.original_transcription_job_id.clone(),
    };
    
    // Get the model and settings for this task using centralized resolver
    let project_dir = args.project_directory.clone().unwrap_or_default();
    let model_settings = crate::utils::resolve_model_settings(
        &app_handle,
        crate::models::TaskType::TextCorrection,
        &project_dir,
        None, // no model override for this command
        None, // no temperature override for this command
        None, // no max_tokens override for this command
    ).await?;
    
    // Use the job creation utility to create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory.clone().unwrap_or_default(),
        "openrouter",
        crate::models::TaskType::TextCorrection,
        "TEXT_CORRECTION",
        &args.text_to_correct,
        model_settings,
        JobPayload::TextCorrection(payload),
        1, // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No extra metadata
        &app_handle,
    ).await?;
    
    info!("Created text correction job: {}", job_id);
    
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
    
    // Resolve model, temperature, and max_tokens using task_type_for_settings, explicit args, or defaults
    // Note: For simple text generation, we don't have a project directory, so we use empty string (server defaults only)
    let resolved_model = if let Some(model) = model_override {
        model
    } else {
        match crate::config::get_model_for_task(task_type_enum) {
            Ok(model) => model,
            Err(_) => match crate::config::get_default_llm_model_id() {
                Ok(model) => model,
                Err(e) => return Err(AppError::ConfigError(
                    format!("No suitable model could be configured for the task or as a default: {}", e)
                )),
            },
        }
    };
    
    let resolved_temperature = if let Some(temp) = temperature_override {
        temp
    } else {
        match crate::config::get_default_temperature_for_task(Some(task_type_enum)) {
            Ok(temp) => temp,
            Err(_) => 0.7, // Default temperature
        }
    };
    
    let resolved_max_tokens = if let Some(tokens) = max_tokens_override {
        tokens
    } else {
        match crate::config::get_default_max_tokens_for_task(Some(task_type_enum)) {
            Ok(tokens) => tokens,
            Err(_) => 1000, // Default max tokens
        }
    };
    
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