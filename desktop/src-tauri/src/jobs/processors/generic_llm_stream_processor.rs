use std::sync::Arc;
use futures::StreamExt;
use log::{info, error, debug, trace};
use tauri::{AppHandle, Manager};
use async_trait::async_trait;

use crate::api_clients::client_trait::{ApiClient, ApiClientOptions};
use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_helpers;
use crate::models::{OpenRouterRequestMessage, OpenRouterContent};
use crate::db_utils::background_job_repository::BackgroundJobRepository;

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
        
        // Get the API client from the factory
        let llm_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        // Update job status to running
        let repo = app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        job_helpers::update_job_status_running(&repo, &job.id).await?;
        
        // Create messages for the LLM
        let mut messages = Vec::new();
        
        // Add system message if provided
        if let Some(system_prompt) = &payload.system_prompt {
            let system_message = OpenRouterRequestMessage {
                role: "system".to_string(),
                content: vec![
                    OpenRouterContent::Text {
                        content_type: "text".to_string(),
                        text: system_prompt.clone(),
                    },
                ],
            };
            messages.push(system_message);
        }
        
        // Add user message with the prompt
        let user_message = OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![
                OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: payload.prompt_text.clone(),
                },
            ],
        };
        messages.push(user_message);
        
        // Get the model and settings from payload or project/server defaults
        let project_directory = payload.project_directory.as_deref().unwrap_or("");
        
        let model = match &payload.model {
            Some(m) => m.clone(),
            None => match crate::config::get_model_for_task_with_project(crate::models::TaskType::GenericLlmStream, project_directory, &app_handle).await {
                Ok(m) => m,
                Err(_) => {
                    // Try TextImprovement as fallback
                    crate::config::get_model_for_task_with_project(crate::models::TaskType::TextImprovement, project_directory, &app_handle).await?
                },
            },
        };
        
        let temperature = match payload.temperature {
            Some(t) => t,
            None => match crate::config::get_temperature_for_task_with_project(crate::models::TaskType::GenericLlmStream, project_directory, &app_handle).await {
                Ok(t) => t,
                Err(_) => {
                    // Try TextImprovement as fallback
                    crate::config::get_temperature_for_task_with_project(crate::models::TaskType::TextImprovement, project_directory, &app_handle).await?
                },
            },
        };
        
        let max_tokens = match payload.max_output_tokens {
            Some(t) => t,
            None => match crate::config::get_max_tokens_for_task_with_project(crate::models::TaskType::GenericLlmStream, project_directory, &app_handle).await {
                Ok(t) => t,
                Err(_) => {
                    // Try TextImprovement as fallback
                    crate::config::get_max_tokens_for_task_with_project(crate::models::TaskType::TextImprovement, project_directory, &app_handle).await?
                },
            },
        };
        
        // Create options for the API client - ensure streaming is enabled
        let api_options = ApiClientOptions {
            model: model.clone(),
            max_tokens: Some(max_tokens),
            temperature: Some(temperature),
            stream: true,
        };
        
        // Calculate approx tokens in prompt for tracking
        let prompt_text_tokens = crate::utils::token_estimator::estimate_tokens(&payload.prompt_text);
        let system_prompt_tokens = payload.system_prompt.as_ref()
            .map(|s| crate::utils::token_estimator::estimate_tokens(s))
            .unwrap_or(0);
        let overhead_tokens = 100; // Approximate tokens for formatting, roles, etc.
        let estimated_prompt_tokens = prompt_text_tokens + system_prompt_tokens + overhead_tokens;
        
        // Stream the response from the LLM
        debug!("Starting LLM stream with model: {}", model);
        
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
                
                // Update job status to failed
                job_helpers::update_job_status_failed(&repo, &job.id, &error_message).await?;
                
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
            job_helpers::update_job_status_completed(
                &repo, 
                &job.id, 
                &collected_response, 
                Some(estimated_prompt_tokens as i32), 
                Some(tokens_received as i32), 
                Some(total_tokens as i32), 
                Some(chars_received)
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
            
            // Update job status to failed
            job_helpers::update_job_status_failed(&repo, &job.id, &error_message).await?;
            
            // Return failure result
            JobProcessResult::failure(job.id.to_string(), error_message)
        };
        
        info!("Completed generic LLM stream job {}", job.id);
        Ok(result)
    }
}