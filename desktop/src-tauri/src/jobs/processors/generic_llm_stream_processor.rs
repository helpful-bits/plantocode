use futures::StreamExt;
use log::{info, error, debug, trace};
use tauri::AppHandle;
use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::models::TaskType;
use crate::jobs::job_processor_utils;

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
        let (repo, _settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&job.id, "generic LLM stream");
        
        // Create messages (use empty system prompt if none provided)
        let system_prompt = payload.system_prompt.as_deref().unwrap_or("");
        let messages = job_processor_utils::create_openrouter_messages(system_prompt, &payload.prompt_text);
        
        // Create API options with streaming enabled
        let mut api_options = job_processor_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            true, // Enable streaming for this processor
        )?;
        
        // Calculate approx tokens in prompt for tracking
        let prompt_text_tokens = crate::utils::token_estimator::estimate_tokens(&payload.prompt_text);
        let system_prompt_tokens = payload.system_prompt.as_ref()
            .map(|s| crate::utils::token_estimator::estimate_tokens(s))
            .unwrap_or(0);
        let overhead_tokens = 100; // Approximate tokens for formatting, roles, etc.
        let estimated_prompt_tokens = prompt_text_tokens + system_prompt_tokens + overhead_tokens;
        
        // Stream the response from the LLM
        debug!("Starting LLM stream with model: {}", api_options.model);
        
        // Clone model name before moving api_options
        let model_name = api_options.model.clone();
        
        // Get the API client for streaming
        let llm_client = job_processor_utils::get_api_client(&app_handle)?;
        
        // Combine system and user prompts for stream_complete
        let combined_prompt = format!(
            "{}{}",
            payload.system_prompt.as_deref().unwrap_or(""),
            payload.prompt_text
        );
        
        let mut stream = match llm_client.stream_complete(&combined_prompt, api_options).await {
            Ok(response_stream) => response_stream,
            Err(e) => {
                let error_message = e.to_string();
                error!("{}", error_message);
                
                // Finalize job failure
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_message).await?;
                
                // Return failure result
                return Ok(JobProcessResult::failure(job.id.to_string(), error_message));
            }
        };
        
        // Variables to track streaming progress
        let mut collected_response = String::new();
        let mut total_tokens = estimated_prompt_tokens;
        let mut tokens_received = 0;
        let mut chars_received = 0;
        
        // Process stream chunks
        debug!("Processing stream chunks for job {}", job.id);
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    trace!("Received chunk: {:?}", chunk);
                    
                    // Process each choice individually
                    let mut chunk_content = String::new();
                    for choice in &chunk.choices {
                        if let Some(content) = &choice.delta.content {
                            if !content.is_empty() {
                                chunk_content.push_str(content);
                            }
                        }
                    }
                    
                    if !chunk_content.is_empty() {
                        // Track progress
                        collected_response.push_str(&chunk_content);
                        chars_received += chunk_content.len() as i32;
                        
                        // Estimate tokens in this chunk
                        let chunk_tokens = crate::utils::token_estimator::estimate_tokens(&chunk_content);
                        tokens_received += chunk_tokens;
                        total_tokens = estimated_prompt_tokens + tokens_received;
                        
                        // Update the job with the new chunk
                        debug!("Appending chunk to job response, char count: {}", chunk_content.len());
                        match repo.append_to_job_response(&job.id, &chunk_content, chunk_tokens as i32, chars_received).await {
                            Ok(_) => {},
                            Err(e) => {
                                error!("Failed to append chunk to job response: {}", e);
                                // Continue processing even if this update fails
                            }
                        }
                    }
                    
                    // Check for completion
                    let is_finished = chunk.choices.iter()
                        .any(|choice| choice.finish_reason.is_some());
                    
                    if is_finished {
                        debug!("Stream finished with reason: {:?}", 
                            chunk.choices.iter().filter_map(|c| c.finish_reason.clone()).collect::<Vec<String>>());
                        break;
                    }
                },
                Err(e) => {
                    let error_message = format!("Error during stream processing: {}", e);
                    error!("{}", error_message);
                    
                    // Don't fail the job for a single chunk error, just log it and continue
                    // This is more resilient as we might still have received some useful content
                }
            }
        }
        
        // Update job status to completed
        let result = if !collected_response.is_empty() {
            debug!("Stream completed successfully, updating job status");
            
            // Create usage info for finalization
            let usage = crate::models::OpenRouterUsage {
                prompt_tokens: estimated_prompt_tokens as u32,
                completion_tokens: tokens_received as u32,
                total_tokens: total_tokens as u32,
            };
            
            // Finalize job success
            job_processor_utils::finalize_job_success(
                &job.id,
                &repo,
                &collected_response,
                Some(usage),
                &model_name,
                "generic_stream", // No specific system prompt ID for generic streams
                None,
            ).await?;
            
            JobProcessResult::success(job.id.to_string(), collected_response)
                .with_tokens(
                    Some(estimated_prompt_tokens as i32),
                    Some(tokens_received as i32),
                    Some(total_tokens as i32),
                    Some(chars_received)
                )
        } else {
            let error_message = "Stream completed but no content was received".to_string();
            error!("{}", error_message);
            
            // Finalize job failure
            job_processor_utils::finalize_job_failure(&job.id, &repo, &error_message).await?;
            
            // Return failure result
            JobProcessResult::failure(job.id.to_string(), error_message)
        };
        
        info!("Completed generic LLM stream job {}", job.id);
        Ok(result)
    }
}