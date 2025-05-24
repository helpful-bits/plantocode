use tauri::{command, AppHandle, Manager};
use log::info;
use serde::{Serialize, Deserialize};
use uuid::Uuid;
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus, ApiType, TaskType};
use crate::utils::get_timestamp;
use std::sync::Arc;
use crate::jobs::types::{Job, JobPayload, JobType, RegexGenerationPayload};

/// Arguments for regex generation command
#[derive(Debug, Deserialize)]
pub struct GenerateRegexArgs {
    pub session_id: String,
    pub project_directory: String,
    pub description: String,
    pub examples: Option<Vec<String>>,
    pub target_language: Option<String>,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
    pub target_field: Option<String>,
}

/// Command to generate regex based on description and examples
#[command]
pub async fn generate_regex_command(
    session_id: String,
    project_directory: String,
    description: String,
    examples: Option<Vec<String>>,
    target_language: Option<String>,
    model_override: Option<String>,
    temperature_override: Option<f32>,
    max_tokens_override: Option<u32>,
    target_field: Option<String>,
    app_handle: AppHandle
) -> AppResult<String> {
    info!("Creating regex generation job for description: {}", description);
    
    // Recreate args struct for internal use
    let args = GenerateRegexArgs {
        session_id,
        project_directory,
        description,
        examples,
        target_language,
        model_override,
        temperature_override,
        max_tokens_override,
        target_field,
    };
    
    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError("Session ID is required".to_string()));
    }
    
    if args.description.is_empty() {
        return Err(AppError::ValidationError("Description is required".to_string()));
    }
    
    if args.project_directory.is_empty() {
        return Err(AppError::ValidationError("Project directory is required".to_string()));
    }
    
    // Get repository from app state
    let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .inner()
        .clone();
    
    // Get model configuration for this task
    let model = if let Some(model) = args.model_override.clone() {
        model
    } else {
        match crate::config::get_model_for_task(TaskType::RegexGeneration) {
            Ok(model) => model,
            Err(e) => return Err(AppError::ConfigError(format!("Failed to get model for regex generation: {}", e))),
        }
    };
    
    // Get temperature configuration
    let temperature = if let Some(temp) = args.temperature_override {
        temp
    } else {
        match crate::config::get_default_temperature_for_task(Some(TaskType::RegexGeneration)) {
            Ok(temp) => temp,
            Err(e) => return Err(AppError::ConfigError(format!("Failed to get temperature for regex generation: {}", e))),
        }
    };
    
    // Get max tokens configuration
    let max_output_tokens = if let Some(tokens) = args.max_tokens_override {
        tokens
    } else {
        match crate::config::get_default_max_tokens_for_task(Some(TaskType::RegexGeneration)) {
            Ok(tokens) => tokens,
            Err(e) => return Err(AppError::ConfigError(format!("Failed to get max tokens for regex generation: {}", e))),
        }
    };
    
    // Create the payload for the RegexGenerationProcessor
    let processor_payload = RegexGenerationPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        project_directory: args.project_directory.clone(),
        description: args.description.clone(),
        examples: args.examples.clone(),
        target_language: args.target_language.clone(),
        model_override: None, // Will be passed directly to create_and_queue_background_job
        temperature: temperature,
        max_output_tokens: None, // Will be passed directly to create_and_queue_background_job
        target_field: args.target_field.clone(),
    };
    
    // Create additional metadata for the job
    let mut extra_metadata = serde_json::json!({
        "description": args.description,
    });
    
    // Add optional fields to metadata
    if let Some(examples) = &args.examples {
        extra_metadata["examples"] = serde_json::to_value(examples)
            .map_err(|e| AppError::SerdeError(e.to_string()))?;
    }
    
    if let Some(target_language) = &args.target_language {
        extra_metadata["target_language"] = serde_json::to_value(target_language)
            .map_err(|e| AppError::SerdeError(e.to_string()))?;
    }
    
    if let Some(target_field) = &args.target_field {
        extra_metadata["target_field"] = serde_json::to_value(target_field)
            .map_err(|e| AppError::SerdeError(e.to_string()))?;
    }
    
    // Use the job creation utility to create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "openrouter",
        TaskType::RegexGeneration,
        "REGEX_GENERATION",
        &args.description,
        (model, temperature, max_output_tokens),
        serde_json::to_value(processor_payload).map_err(|e| 
            AppError::SerdeError(e.to_string()))?,
        2, // Priority
        Some(extra_metadata),
        &app_handle,
    ).await?;
    
    info!("Created regex generation job: {}", job_id);
    Ok(job_id)
}