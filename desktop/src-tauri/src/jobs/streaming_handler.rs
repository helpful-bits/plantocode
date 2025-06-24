use std::sync::Arc;
use futures::StreamExt;
use log::{debug, info, error};

use crate::error::{AppError, AppResult};
use crate::models::{OpenRouterUsage, OpenRouterStreamChunk};
use crate::db_utils::BackgroundJobRepository;
use crate::jobs::job_processor_utils;
use crate::api_clients::client_trait::ApiClient;

/// Configuration for streaming handler
#[derive(Debug, Clone)]
pub struct StreamConfig {
    pub prompt_tokens: usize,
    pub system_prompt: String,
    pub user_prompt: String,
}

/// Result of streaming processing
#[derive(Debug)]
pub struct StreamResult {
    pub accumulated_response: String,
    pub final_usage: Option<OpenRouterUsage>,
}

/// Handler for processing streamed LLM responses
/// Consolidates the common streaming logic used across different processors
pub struct StreamedResponseHandler {
    repo: Arc<BackgroundJobRepository>,
    job_id: String,
    initial_db_job_metadata: Option<String>,
    config: StreamConfig,
    app_handle: Option<tauri::AppHandle>,
}

impl StreamedResponseHandler {
    /// Create a new streaming handler
    pub fn new(
        repo: Arc<BackgroundJobRepository>,
        job_id: String,
        initial_db_job_metadata: Option<String>,
        config: StreamConfig,
        app_handle: Option<tauri::AppHandle>,
    ) -> Self {
        Self {
            repo,
            job_id,
            initial_db_job_metadata,
            config,
            app_handle,
        }
    }

    /// Process a stream of OpenRouter chunks and return the accumulated response and usage
    pub async fn process_stream<S>(
        &self,
        mut stream: S,
    ) -> AppResult<StreamResult>
    where
        S: futures::Stream<Item = Result<OpenRouterStreamChunk, crate::error::AppError>> + Unpin,
    {
        debug!("Starting stream processing for job {}", self.job_id);
        
        let mut accumulated_response = String::new();
        let mut tokens_received: u32 = 0;
        let mut final_usage: Option<OpenRouterUsage> = None;
        
        // Process stream chunks
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    // Check if job has been canceled
                    if job_processor_utils::check_job_canceled(&self.repo, &self.job_id).await? {
                        info!("Job {} canceled during streaming", self.job_id);
                        return Err(AppError::JobError("Job was canceled".to_string()));
                    }
                    
                    // Extract content from streaming response
                    let mut chunk_content = String::new();
                    for choice in &chunk.choices {
                        if let Some(content) = &choice.delta.content {
                            if !content.is_empty() {
                                chunk_content.push_str(content);
                            }
                        }
                    }
                    
                    if !chunk_content.is_empty() {
                        accumulated_response.push_str(&chunk_content);
                        
                        // Estimate tokens in this chunk
                        let chunk_tokens = crate::utils::token_estimator::estimate_tokens(&chunk_content);
                        tokens_received += chunk_tokens as u32;
                        
                        // Update job stream progress
                        self.repo.update_job_stream_progress(
                            &self.job_id,
                            &chunk_content,
                            chunk_tokens as i32,
                            accumulated_response.len() as i32,
                            self.initial_db_job_metadata.as_deref(),
                            self.app_handle.as_ref(),
                        ).await?;
                    }
                    
                    // Check for final usage information including server-calculated cost
                    if chunk.usage.is_some() {
                        final_usage = chunk.usage.clone();
                        debug!("Received usage information from server: {:?}", final_usage);
                        
                        // If we have cost information, update the metadata immediately
                        if let Some(ref usage) = final_usage {
                            if let Some(cost) = usage.cost {
                                // Parse existing metadata and add actual cost
                                let updated_metadata = if let Some(metadata_str) = self.initial_db_job_metadata.as_deref() {
                                    if let Ok(mut ui_metadata) = serde_json::from_str::<crate::jobs::types::JobUIMetadata>(metadata_str) {
                                        // Add actualCost to task_data
                                        if let serde_json::Value::Object(ref mut task_map) = ui_metadata.task_data {
                                            task_map.insert("actualCost".to_string(), serde_json::json!(cost));
                                        } else {
                                            ui_metadata.task_data = serde_json::json!({
                                                "actualCost": cost
                                            });
                                        }
                                        
                                        // Serialize back to string
                                        match serde_json::to_string(&ui_metadata) {
                                            Ok(serialized) => Some(serialized),
                                            Err(e) => {
                                                debug!("Failed to serialize metadata with cost: {}", e);
                                                None
                                            }
                                        }
                                    } else {
                                        // Create new metadata with cost
                                        let new_metadata = serde_json::json!({
                                            "task_data": {
                                                "actualCost": cost
                                            }
                                        });
                                        serde_json::to_string(&new_metadata).ok()
                                    }
                                } else {
                                    // No existing metadata, create new with cost
                                    let new_metadata = serde_json::json!({
                                        "task_data": {
                                            "actualCost": cost
                                        }
                                    });
                                    serde_json::to_string(&new_metadata).ok()
                                };
                                
                                // Update job with the cost information (empty chunk, just metadata update)
                                if let Some(metadata_str) = updated_metadata {
                                    let _ = self.repo.update_job_stream_progress(
                                        &self.job_id,
                                        "", // Empty chunk - just updating metadata
                                        0,  // No new tokens
                                        accumulated_response.len() as i32,
                                        Some(&metadata_str),
                                        self.app_handle.as_ref(),
                                    ).await;
                                }
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
                }
                Err(e) => {
                    error!("Streaming error: {}", e);
                    return Err(e);
                }
            }
        }
        
        // Use final usage from stream (with server-calculated cost) or create estimated usage
        let usage_result = if let Some(usage) = final_usage {
            debug!("Using server-provided usage information with cost: {:?}", usage.cost);
            Some(usage)
        } else {
            debug!("No server usage received, creating estimated usage without cost");
            Some(OpenRouterUsage {
                prompt_tokens: self.config.prompt_tokens as i32,
                completion_tokens: tokens_received as i32,
                total_tokens: (self.config.prompt_tokens + tokens_received as usize) as i32,
                cost: None, // No cost available for estimated usage
            })
        };
        
        Ok(StreamResult {
            accumulated_response,
            final_usage: usage_result,
        })
    }

    
    /// Enhanced method to process a stream from an API client using structured messages
    /// This provides better context preservation and LLM provider compliance
    pub async fn process_stream_from_client_with_messages(
        &self,
        llm_client: &Arc<dyn ApiClient>,
        messages: Vec<crate::models::OpenRouterRequestMessage>,
        api_options: crate::api_clients::client_trait::ApiClientOptions,
    ) -> AppResult<StreamResult> {
        debug!("Starting streaming call with structured messages for job {}", self.job_id);
        
        // Execute streaming call with structured messages
        let stream = llm_client.chat_completion_stream(messages, api_options).await?;
        
        // Process the stream
        self.process_stream(stream).await
    }
}

/// Helper function to estimate prompt tokens from system and user prompts
pub fn estimate_prompt_tokens(system_prompt: &str, user_prompt: &str) -> usize {
    let system_tokens = crate::utils::token_estimator::estimate_tokens(system_prompt);
    let user_tokens = crate::utils::token_estimator::estimate_tokens(user_prompt);
    let overhead_tokens = 100u32; // Overhead for formatting, roles, etc.
    
    (system_tokens + user_tokens + overhead_tokens) as usize
}

/// Create a StreamConfig from system and user prompts
pub fn create_stream_config(system_prompt: &str, user_prompt: &str) -> StreamConfig {
    let prompt_tokens = estimate_prompt_tokens(system_prompt, user_prompt);
    
    StreamConfig {
        prompt_tokens,
        system_prompt: system_prompt.to_string(),
        user_prompt: user_prompt.to_string(),
    }
}