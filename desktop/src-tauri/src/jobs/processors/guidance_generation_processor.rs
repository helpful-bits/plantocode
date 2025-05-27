use async_trait::async_trait;
use tauri::{AppHandle, Manager};
use log::{debug, info, warn, error};
use serde_json;

use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, GuidanceGenerationPayload};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::models::{OpenRouterRequestMessage, OpenRouterContent, JobStatus};
use crate::prompts::guidance::{generate_guidance_system_prompt, generate_guidance_user_prompt, generate_guidance_for_paths_user_prompt};
use crate::error::{AppError, AppResult};
use crate::jobs::job_helpers;
use crate::api_clients::client_trait::ApiClientOptions;

/// Processor for guidance generation jobs
pub struct GuidanceGenerationProcessor;

impl GuidanceGenerationProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl JobProcessor for GuidanceGenerationProcessor {
    fn name(&self) -> &str {
        "GuidanceGenerationProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::GuidanceGeneration(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Extract payload
        let payload = match &job.payload {
            JobPayload::GuidanceGeneration(p) => p,
            _ => {
                return Err(AppError::JobError(format!(
                    "Cannot process job with payload type {:?} in GuidanceGenerationProcessor",
                    job.task_type_str()
                )));
            }
        };
        
        // Get repository from app state
        let repo = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>().inner().clone();
        
        // Get LLM client using the standardized factory function
        let llm_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        // Ensure job is visible in UI
        job_helpers::ensure_job_visible(&repo, &job.id).await?;
        
        // Update job status to running
        job_helpers::update_job_status_running(&repo, &job.id).await?;
        
        info!("Processing guidance generation job: {}", job.id);
        debug!("Task description: {}", payload.task_description);
        
        // Create system and user messages
        let system_prompt = payload.system_prompt_override.clone()
            .unwrap_or_else(|| generate_guidance_system_prompt());
            
        // Generate user prompt based on whether paths are provided
        let user_prompt = if let Some(paths) = &payload.paths {
            generate_guidance_for_paths_user_prompt(&payload.task_description, paths, payload.file_contents_summary.as_deref())
        } else {
            generate_guidance_user_prompt(&payload.task_description)
        };
        
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
                    text: user_prompt,
                }],
            },
        ];
        
        // Set API options with model from payload or project/server config
        let model_to_use = if let Some(model_override) = payload.model_override.clone() {
            model_override
        } else {
            crate::config::get_model_for_task_with_project(crate::models::TaskType::GuidanceGeneration, &payload.project_directory).await?
        };
        
        // Get max tokens and temperature from payload or project/server config
        let max_tokens = if let Some(tokens) = payload.max_output_tokens {
            tokens
        } else {
            match crate::config::get_max_tokens_for_task_with_project(crate::models::TaskType::GuidanceGeneration, &payload.project_directory).await {
                Ok(tokens) => tokens,
                Err(_) => 2000, // Fallback only if config error occurs
            }
        };
        
        let temperature = if let Some(temp) = payload.temperature {
            temp
        } else {
            match crate::config::get_temperature_for_task_with_project(crate::models::TaskType::GuidanceGeneration, &payload.project_directory).await {
                Ok(temp) => temp,
                Err(_) => 0.7, // Fallback only if config error occurs
            }
        };
        
        let api_options = ApiClientOptions {
            model: model_to_use,
            max_tokens: Some(max_tokens),
            temperature: Some(temperature),
            stream: false,
        };
        
        debug!("Sending guidance generation request with options: {:?}", api_options);
        
        // Call the LLM API
        match llm_client.chat_completion(messages, api_options).await {
            Ok(llm_response) => {
                debug!("Received guidance response");
                
                // Extract text content from response
                if let Some(choice) = llm_response.choices.first() {
                    let content = &choice.message.content;
                    
                    // Update job status to completed
                    repo.update_job_status(&job.id, &JobStatus::Completed.to_string(), None).await?;
                    
                    // Update job response with LLM output
                    repo.update_job_response(
                        &job.id, 
                        content, 
                        Some(JobStatus::Completed),
                        None,
                        llm_response.usage.as_ref().map(|u| u.prompt_tokens as i32),
                        llm_response.usage.as_ref().map(|u| u.completion_tokens as i32),
                        llm_response.usage.as_ref().map(|u| u.total_tokens as i32),
                        Some(content.len() as i32)
                    ).await?;
                    
                    // Update job with model information
                    let model_used = if let Some(model) = payload.model_override.clone() {
                        model
                    } else {
                        llm_response.model.clone()
                    };
                    
                    // Update the job with complete information
                    if let Some(mut job) = repo.get_job_by_id(&job.id).await? {
                        job.model_used = Some(model_used);
                        repo.update_job(&job).await?;
                    }
                    
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
                    repo.update_job_status(&job.id, &JobStatus::Failed.to_string(), Some(&error_msg)).await?;
                    
                    Ok(JobProcessResult::failure(job.id.clone(), error_msg))
                }
            },
            Err(e) => {
                // API error
                let error_msg = format!("LLM API error: {}", e);
                error!("{}", error_msg);
                repo.update_job_status(&job.id, &JobStatus::Failed.to_string(), Some(&error_msg)).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_msg))
            }
        }
    }
}