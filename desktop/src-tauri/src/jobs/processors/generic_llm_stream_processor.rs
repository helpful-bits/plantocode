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
        
        // Combine system and user prompts for stream_complete
        let system_prompt = payload.system_prompt.as_deref().unwrap_or("");
        let user_prompt = &payload.prompt_text;
        let combined_prompt = format!("{}{}", system_prompt, user_prompt);
        
        // Create streaming handler configuration
        let stream_config = crate::jobs::streaming_handler::create_stream_config(system_prompt, user_prompt);
        
        // Create streaming handler
        let streaming_handler = crate::jobs::streaming_handler::StreamedResponseHandler::new(
            repo.clone(),
            job.id.clone(),
            db_job.metadata.clone(),
            stream_config,
            Some(app_handle.clone()),
        );
        
        // Process the stream using the handler
        let stream_result = match streaming_handler
            .process_stream_from_client(&llm_client, &combined_prompt, api_options)
            .await 
        {
            Ok(result) => result,
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
        let usage = stream_result.final_usage;
        let response_len = collected_response.len() as i32;
        
        // Update job status to completed
        let result = if !collected_response.is_empty() {
            debug!("Stream completed successfully, updating job status");
            
            // Finalize job success
            job_processor_utils::finalize_job_success(
                &job.id,
                &repo,
                &collected_response,
                Some(usage.clone()),
                &model_name,
                "generic_stream", // No specific system prompt ID for generic streams
                None,
            ).await?;
            
            JobProcessResult::success(job.id.to_string(), collected_response)
                .with_tokens(
                    Some(usage.prompt_tokens as i32),
                    Some(usage.completion_tokens as i32),
                    Some(usage.total_tokens as i32),
                    Some(response_len)  // Use response length as char count
                )
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