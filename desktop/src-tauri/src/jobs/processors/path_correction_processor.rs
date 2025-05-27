use async_trait::async_trait;
use tauri::{AppHandle, Manager};
use log::{debug, info, warn, error};
use serde_json;

use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, PathCorrectionPayload};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::models::{OpenRouterRequestMessage, OpenRouterContent, JobStatus};
use crate::prompts::path_correction::generate_path_correction_prompt;
use crate::error::{AppError, AppResult};
use crate::jobs::job_helpers::ensure_job_visible;
use crate::api_clients::client_trait::ApiClientOptions;

/// Processor for path correction jobs
pub struct PathCorrectionProcessor;

impl PathCorrectionProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl JobProcessor for PathCorrectionProcessor {
    fn name(&self) -> &str {
        "PathCorrectionProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::PathCorrection(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Extract payload
        let payload = match &job.payload {
            JobPayload::PathCorrection(p) => p,
            _ => {
                return Err(AppError::JobError(format!(
                    "Cannot process job with payload type {:?} in PathCorrectionProcessor",
                    job.task_type_str()
                )));
            }
        };
        
        // Get repository and LLM client
        let repo = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>().inner().clone();
        let llm_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        // Ensure job is visible in UI
        ensure_job_visible(&repo, &job.id).await?;
        
        // Get the full job details
        let db_job = repo.get_job_by_id(&job.id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job.id)))?;
            
        // Update job status to running
        repo.update_job_status(&job.id, &JobStatus::Running.to_string(), None).await?;
        
        info!("Processing path correction job: {}", job.id);
        debug!("Paths to correct: {}", payload.paths_to_correct);
        
        // Parse paths from string to array
        let paths: Vec<&str> = payload.paths_to_correct
            .split('\n')
            .map(|line| line.trim())
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .collect();
            
        let project_directory = job.project_directory.as_ref()
            .ok_or_else(|| AppError::JobError("Project directory not found in job".to_string()))?;
            
        // Generate path correction prompt
        let prompt = generate_path_correction_prompt(&paths, project_directory, None);
        
        // Set system prompt
        let system_prompt = payload.system_prompt_override.clone()
            .unwrap_or_else(|| String::from("You are a file path expert in a software development environment. Your task is to correct, validate, or complete the provided file paths within the context of the project."));
        
        // Build messages array
        let messages = vec![
            OpenRouterRequestMessage {
                role: "system".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: system_prompt,
                }],
            },
            OpenRouterRequestMessage {
                role: "user".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: prompt,
                }],
            },
        ];
        
        // Set API options with model from config
        let model_to_use = if let Some(model_override) = payload.model_override.clone() {
            model_override
        } else {
            crate::config::get_model_for_task(crate::models::TaskType::PathCorrection)?
        };
        
        // Get max tokens and temperature from payload or config
        let max_tokens = payload.max_output_tokens.unwrap_or_else(|| {
            match crate::config::get_default_max_tokens_for_task(Some(crate::models::TaskType::PathCorrection)) {
                Ok(tokens) => tokens,
                Err(_) => 2000, // Fallback only if config error occurs
            }
        });
        
        let temperature = payload.temperature.unwrap_or_else(|| {
            match crate::config::get_default_temperature_for_task(Some(crate::models::TaskType::PathCorrection)) {
                Ok(temp) => temp,
                Err(_) => 0.7, // Fallback only if config error occurs
            }
        });
        
        let api_options = ApiClientOptions {
            model: model_to_use,
            max_tokens: Some(max_tokens),
            temperature: Some(temperature),
            stream: false,
        };
        
        debug!("Sending path correction request with options: {:?}", api_options);
        
        // Call the LLM API
        match llm_client.chat_completion(messages, api_options).await {
            Ok(llm_response) => {
                debug!("Received path correction response");
                
                // Extract text content from response
                if let Some(choice) = llm_response.choices.first() {
                    let content = &choice.message.content;
                    
                    // Update job status to completed
                    repo.update_job_status(&job.id, &JobStatus::Completed.to_string(), None).await?;
                    
                    // Get updated job
                    let mut updated_job = db_job.clone();
                    updated_job.status = JobStatus::Completed.to_string();
                    updated_job.response = Some(content.clone());
                    updated_job.tokens_sent = llm_response.usage.as_ref().map(|u| u.prompt_tokens as i32);
                    updated_job.tokens_received = llm_response.usage.as_ref().map(|u| u.completion_tokens as i32);
                    updated_job.total_tokens = llm_response.usage.as_ref().map(|u| u.total_tokens as i32);
                    updated_job.chars_received = Some(content.len() as i32);
                    
                    // Update model used
                    if let Some(model) = payload.model_override.clone() {
                        updated_job.model_used = Some(model);
                    } else {
                        updated_job.model_used = Some(llm_response.model.clone());
                    }
                    
                    // Save updated job
                    repo.update_job(&updated_job).await?;
                    
                    // Return success result
                    Ok(JobProcessResult::success(job.id.clone(), content.clone())
                        .with_tokens(
                            llm_response.usage.as_ref().map(|u| u.prompt_tokens as i32),
                            llm_response.usage.as_ref().map(|u| u.completion_tokens as i32),
                            llm_response.usage.as_ref().map(|u| u.total_tokens as i32),
                            Some(content.len() as i32)
                        ))
                } else {
                    // No choices in response
                    let error_msg = "No content in LLM response".to_string();
                    error!("{}", error_msg);
                    
                    // Update job as failed
                    let mut updated_job = db_job.clone();
                    updated_job.status = JobStatus::Failed.to_string();
                    updated_job.error_message = Some(error_msg.clone());
                    repo.update_job(&updated_job).await?;
                    
                    Ok(JobProcessResult::failure(job.id.clone(), error_msg))
                }
            },
            Err(e) => {
                // API error
                let error_msg = format!("LLM API error: {}", e);
                error!("{}", error_msg);
                
                // Update job as failed
                let mut updated_job = db_job.clone();
                updated_job.status = JobStatus::Failed.to_string();
                updated_job.error_message = Some(error_msg.clone());
                repo.update_job(&updated_job).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_msg))
            }
        }
    }
}