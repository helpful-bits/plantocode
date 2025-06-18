use log::{info, error, debug};
use tauri::AppHandle;
use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{llm_api_utils};

/// Processor for generic LLM streaming tasks
pub struct GenericLlmStreamProcessor;

impl GenericLlmStreamProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl JobProcessor for GenericLlmStreamProcessor {
    fn name(&self) -> &'static str {
        "GenericLlmStreamProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::GenericLlmStream(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing generic LLM stream job {}", job.id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::GenericLlmStream(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job.id, "generic LLM stream");
        
        // Create API options with streaming enabled
        let api_options = llm_api_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            true, // Enable streaming for this processor
        )?;
        
        
        // Stream the response from the LLM
        debug!("Starting LLM stream with model: {}", api_options.model);
        
        // Clone model name before moving api_options
        let model_name = api_options.model.clone();
        
        // Get the API client for streaming
        let llm_client = llm_api_utils::get_api_client(&app_handle)?;
        
        // Construct messages vector for chat completion
        let mut messages: Vec<crate::models::OpenRouterRequestMessage> = Vec::new();
        
        // Add system message if system prompt exists
        if let Some(system_prompt) = &payload.system_prompt {
            if !system_prompt.trim().is_empty() {
                messages.push(crate::models::OpenRouterRequestMessage {
                    role: "system".to_string(),
                    content: vec![crate::models::OpenRouterContent::Text {
                        content_type: "text".to_string(),
                        text: system_prompt.clone(),
                    }],
                });
            }
        }
        
        // Add user message for main prompt
        messages.push(crate::models::OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![crate::models::OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: payload.prompt_text.clone(),
            }],
        });
        
        // Create StreamConfig manually with estimated tokens
        let system_prompt_text = payload.system_prompt.as_deref().unwrap_or("");
        let estimated_system_tokens = system_prompt_text.len() / 4;
        let estimated_user_tokens = payload.prompt_text.len() / 4;
        let estimated_total_tokens = estimated_system_tokens + estimated_user_tokens;
        
        let stream_config = crate::jobs::streaming_handler::StreamConfig {
            prompt_tokens: estimated_total_tokens,
            system_prompt: system_prompt_text.to_string(),
            user_prompt: payload.prompt_text.clone(),
        };
        
        // Create streaming handler
        let streaming_handler = crate::jobs::streaming_handler::StreamedResponseHandler::new(
            repo.clone(),
            job.id.clone(),
            db_job.metadata.clone(),
            stream_config,
            Some(app_handle.clone()),
        );
        
        // Call chat completion stream and process with handler
        let stream_result = match llm_client.chat_completion_stream(messages, api_options).await {
            Ok(stream) => {
                match streaming_handler.process_stream(stream).await {
                    Ok(result) => result,
                    Err(e) => {
                        let error_message = e.to_string();
                        error!("{}", error_message);
                        
                        // Finalize job failure
                        job_processor_utils::finalize_job_failure(&job.id, &repo, &error_message, None).await?;
                        
                        // Return failure result
                        return Ok(JobProcessResult::failure(job.id.to_string(), error_message));
                    }
                }
            }
            Err(e) => {
                let error_message = e.to_string();
                error!("{}", error_message);
                
                // Finalize job failure
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_message, None).await?;
                
                // Return failure result
                return Ok(JobProcessResult::failure(job.id.to_string(), error_message));
            }
        };
        
        let collected_response = stream_result.accumulated_response;
        let usage_opt = stream_result.final_usage;
        let response_len = collected_response.len() as i32;
        
        // Update job status to completed
        let result = if !collected_response.is_empty() {
            debug!("Stream completed successfully, updating job status");
            
            // Finalize job success
            job_processor_utils::finalize_job_success(
                &job.id,
                &repo,
                &collected_response,
                usage_opt.clone(),
                &model_name,
                "generic_stream", // No specific system prompt ID for generic streams
                None,
            ).await?;
            
            let mut result = JobProcessResult::success(job.id.to_string(), collected_response);
            
            // Add token information if usage is available
            if let Some(usage) = &usage_opt {
                result = result.with_tokens(
                    Some(usage.prompt_tokens as i32),
                    Some(usage.completion_tokens as i32),
                    Some(usage.total_tokens as i32),
                    Some(response_len)  // Use response length as char count
                );
            }
            
            result
        } else {
            let error_message = "Stream completed but no content was received".to_string();
            error!("{}", error_message);
            
            // Finalize job failure
            job_processor_utils::finalize_job_failure(&job.id, &repo, &error_message, None).await?;
            
            // Return failure result
            JobProcessResult::failure(job.id.to_string(), error_message)
        };
        
        info!("Completed generic LLM stream job {}", job.id);
        Ok(result)
    }
}