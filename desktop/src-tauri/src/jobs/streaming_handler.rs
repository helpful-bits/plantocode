use std::sync::Arc;
use futures::StreamExt;
use log::{debug, info, error, warn};
use tauri::Emitter;
use serde_json;
use tokio::time::{interval, Duration, Instant};

use crate::error::{AppError, AppResult};
use crate::models::{OpenRouterUsage, OpenRouterStreamChunk, OpenRouterPromptTokensDetails};
use crate::models::stream_event::StreamEvent;
use crate::db_utils::BackgroundJobRepository;
use crate::jobs::job_processor_utils;
use crate::api_clients::client_trait::ApiClient;
use crate::utils::get_timestamp;

/// Configuration for streaming handler
#[derive(Debug, Clone)]
pub struct StreamConfig {
    pub prompt_tokens: usize,
    pub system_prompt: String,
    pub user_prompt: String,
    pub model: String,
    pub max_tokens: usize,
}

/// Result of streaming processing
#[derive(Debug)]
pub struct StreamResult {
    pub accumulated_response: String,
    pub final_usage: Option<OpenRouterUsage>,
    pub request_id: Option<String>, // Server-generated request ID from stream_started event
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

    /// Process a stream of events (content chunks or usage updates) and return the accumulated response and usage
    pub async fn process_stream<S>(
        &self,
        mut stream: S,
    ) -> AppResult<StreamResult>
    where
        S: futures::Stream<Item = Result<StreamEvent, crate::error::AppError>> + Unpin,
    {
        debug!("Starting stream processing for job {}", self.job_id);
        
        let mut current_metadata_str = self.initial_db_job_metadata.clone();
        let mut accumulated_response = String::new();
        let mut current_usage: Option<OpenRouterUsage> = None;
        let mut server_req_id: Option<String> = None;
        
        // Throttling setup
        let mut last_update = Instant::now();
        let update_interval = Duration::from_millis(200);
        
        // Process stream events
        while let Some(event_result) = stream.next().await {
            match event_result {
                Ok(event) => {
                    match event {
                        StreamEvent::StreamStarted { request_id } => {
                            debug!("Stream started with server request_id: {}", request_id);
                            // Store the request_id from the server
                            server_req_id = Some(request_id.clone());
                            
                            // Persist request_id to job metadata
                            if let Err(e) = crate::db_utils::job_metadata_updates::update_job_request_id(
                                &self.repo,
                                &self.job_id,
                                &request_id
                            ).await {
                                warn!("Failed to update job {} with request_id {}: {}", self.job_id, request_id, e);
                            }
                        },
                        StreamEvent::ContentChunk(chunk) => {
                            // Check if job has been canceled before processing chunk
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
                            }
                            
                            // Only use chunk usage if no authoritative usage has been received
                            // UsageUpdate events are authoritative and should take precedence
                            if let Some(chunk_usage) = chunk.usage {
                                if current_usage.is_none() {
                                    // No existing usage, convert the chunk's usage data as fallback
                                    current_usage = Some(OpenRouterUsage {
                                        prompt_tokens: chunk_usage.prompt_tokens,
                                        completion_tokens: chunk_usage.completion_tokens,
                                        total_tokens: chunk_usage.total_tokens,
                                        cost: chunk_usage.cost,
                                        cached_input_tokens: chunk_usage.cached_input_tokens,
                                        cache_write_tokens: chunk_usage.cache_write_tokens,
                                        cache_read_tokens: chunk_usage.cache_read_tokens,
                                        prompt_tokens_details: chunk_usage.prompt_tokens_details.map(|details| {
                                            OpenRouterPromptTokensDetails {
                                                cached_tokens: details.cached_tokens,
                                            }
                                        }),
                                    });
                                }
                                // If we already have usage from a UsageUpdate event, ignore chunk usage
                                // as server UsageUpdate events are authoritative
                            }
                            
                            // Throttled updates - check if it's time to update the repository
                            if last_update.elapsed() >= update_interval {
                                // Calculate stream progress
                                let stream_progress = if self.config.max_tokens > 0 && current_usage.is_some() {
                                    let tokens_output = current_usage.as_ref().unwrap().completion_tokens as f32;
                                    let progress = (tokens_output / self.config.max_tokens as f32) * 100.0;
                                    Some(progress.min(100.0))
                                } else {
                                    None
                                };
                                
                                // Update job state in repository
                                if let Err(e) = self.repo.update_job_stream_state(
                                    &self.job_id,
                                    &accumulated_response,
                                    current_usage.as_ref(),
                                    stream_progress,
                                ).await {
                                    error!("Failed to update job stream state: {}", e);
                                }
                                
                                last_update = Instant::now();
                            }
                            
                            // Check for completion
                            let is_finished = chunk.choices.iter()
                                .any(|choice| choice.finish_reason.is_some());
                            
                            if is_finished {
                            }
                        },
                        StreamEvent::UsageUpdate(usage_update) => {
                            // Process server-authoritative usage update - this ALWAYS overwrites existing usage
                            info!("Processing authoritative usage update for job {}: input={}, output={}, total={}, cost={}", 
                                  self.job_id, 
                                  usage_update.tokens_input, 
                                  usage_update.tokens_output, 
                                  usage_update.tokens_total,
                                  usage_update.estimated_cost);
                            
                            // ALWAYS replace current_usage with server-authoritative data
                            // Server usage data is authoritative - don't merge, replace
                            current_usage = Some(OpenRouterUsage {
                                prompt_tokens: usage_update.tokens_input as i32,
                                completion_tokens: usage_update.tokens_output as i32,
                                total_tokens: usage_update.tokens_total as i32,
                                cost: Some(usage_update.estimated_cost),
                                cached_input_tokens: 0, // Server doesn't provide cached_input_tokens in UsageUpdate
                                cache_write_tokens: usage_update.cache_write_tokens.unwrap_or(0) as i32,
                                cache_read_tokens: usage_update.cache_read_tokens.unwrap_or(0) as i32,
                                prompt_tokens_details: None,
                            });
                            
                            // Update job with server-authoritative usage data
                            if let Err(e) = self.repo.update_job_stream_usage(
                                &self.job_id,
                                &usage_update,
                            ).await {
                                error!("Failed to update job stream usage with authoritative data: {}", e);
                            }
                        },
                        StreamEvent::StreamCancelled { request_id: server_request_id, reason } => {
                            info!("Stream cancelled for job {}: request_id={}, reason={}", 
                                  self.job_id, server_request_id, reason);
                            return Err(AppError::JobError(format!("Stream cancelled: {}", reason)));
                        }
                        StreamEvent::ErrorDetails { request_id: server_request_id, error } => {
                            error!("Detailed error received for job {}: request_id={}, error={:?}", 
                                   self.job_id, server_request_id, error);
                            
                            // Store error details in the job repository
                            if let Err(e) = self.repo.update_job_error_details(&self.job_id, &error).await {
                                error!("Failed to update job error details: {}", e);
                            }
                            
                            // Return error with detailed message
                            return Err(AppError::JobError(format!("{}: {}", error.code, error.message)));
                        },
                        StreamEvent::StreamCompleted { 
                            request_id: server_request_id, 
                            final_cost, 
                            tokens_input, 
                            tokens_output, 
                            cache_read_tokens, 
                            cache_write_tokens 
                        } => {
                            info!("Stream completed successfully for job {} with final cost: ${:.6} (input={}, output={}, cache_read={}, cache_write={})", 
                                  self.job_id, final_cost, tokens_input, tokens_output, cache_read_tokens, cache_write_tokens);
                            
                            // Update current_usage with the final authoritative data
                            current_usage = Some(OpenRouterUsage {
                                prompt_tokens: tokens_input as i32,
                                completion_tokens: tokens_output as i32,
                                total_tokens: (tokens_input + tokens_output) as i32,
                                cost: Some(final_cost),
                                cached_input_tokens: 0,
                                cache_write_tokens: cache_write_tokens as i32,
                                cache_read_tokens: cache_read_tokens as i32,
                                prompt_tokens_details: None,
                            });
                            
                            // Log that we received final data
                            debug!("Received final stream data: cost={}, tokens={:?}/{:?}", 
                                final_cost, tokens_input, tokens_output);
                            
                            // IMPORTANT: Do NOT call repo.update_job_with_final_cost here.
                            // The handler should only process the stream and return data.
                            
                            // Break out of the loop to finalize the stream
                            break;
                        }
                    }
                }
                Err(e) => {
                    error!("Streaming error for job {}: {}", self.job_id, e);
                    
                    // Check if job has been canceled 
                    if job_processor_utils::check_job_canceled(&self.repo, &self.job_id).await? {
                        info!("Job {} canceled during streaming error", self.job_id);
                        return Err(AppError::JobError(format!("Job was canceled with error: {}", e)));
                    }
                    
                    // For streaming errors, we still want to preserve any authoritative usage data we may have received
                    // The server may provide partial usage information even on failure
                    warn!("Streaming error occurred for job {} - authoritative usage will be preserved if available: {:?}", 
                          self.job_id, current_usage);
                    
                    return Err(e);
                }
            }
        }
        
        // Final update after stream completes - CRITICAL for preventing data loss
        // This FINAL call ensures database is updated with fully accumulated response
        info!("Performing final database update for job {} with 100% progress", self.job_id);
        if let Err(e) = self.repo.update_job_stream_state(
            &self.job_id,
            &accumulated_response,
            current_usage.as_ref(),
            Some(100.0), // Set progress to 100.0
        ).await {
            error!("Failed to perform final update of job stream state: {}", e);
            // Even if the update fails, we still need to return the accumulated response
        }
        
        
        // Use server-authoritative usage information only
        let usage_result = if let Some(usage) = current_usage {
            if let Some(cost) = usage.cost {
                info!("Stream processing completed for job {} with authoritative cost: ${:.6} (tokens: input={}, output={}, total={})", 
                      self.job_id, cost, usage.prompt_tokens, usage.completion_tokens, usage.total_tokens);
            } else {
                debug!("Stream processing completed for job {} with usage data but no cost field (tokens: input={}, output={}, total={})", 
                       self.job_id, usage.prompt_tokens, usage.completion_tokens, usage.total_tokens);
            }
            Some(usage)
        } else {
            debug!("Stream processing completed for job {} - no usage data received during stream, server will provide usage data through other channels", self.job_id);
            None // Don't create estimated usage - rely on server data only
        };
        
        Ok(StreamResult {
            accumulated_response,
            final_usage: usage_result,
            request_id: server_req_id, // Return captured request_id from StreamStarted event
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

/// Create a StreamConfig from system and user prompts
/// Server will provide accurate token counts, so we don't estimate client-side
pub fn create_stream_config(system_prompt: &str, user_prompt: &str, model: &str, max_tokens: usize) -> StreamConfig {
    StreamConfig {
        prompt_tokens: 0, // Server will provide accurate token counts
        system_prompt: system_prompt.to_string(),
        user_prompt: user_prompt.to_string(),
        model: model.to_string(),
        max_tokens,
    }
}