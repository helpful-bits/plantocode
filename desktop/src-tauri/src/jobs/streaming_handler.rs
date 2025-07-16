use std::sync::Arc;
use futures::StreamExt;
use log::{debug, info, error, warn};
use tauri::Emitter;
use serde_json;

use crate::error::{AppError, AppResult};
use crate::models::{OpenRouterUsage, OpenRouterStreamChunk};
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
}

/// Result of streaming processing
#[derive(Debug)]
pub struct StreamResult {
    pub accumulated_response: String,
    pub final_usage: Option<OpenRouterUsage>,
    pub cost: Option<f64>, // Server-calculated cost
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
        
        // Process stream events
        while let Some(event_result) = stream.next().await {
            match event_result {
                Ok(event) => {
                    match event {
                        StreamEvent::StreamStarted { request_id } => {
                            debug!("Stream started with server request_id: {}", request_id);
                            // Could store this request_id if needed for later polling
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
                                
                                // Optionally use token estimator for visual updates only
                                // This is not used for billing - server provides authoritative counts
                                if let Some(ref app_handle) = self.app_handle {
                                    let estimated_tokens = (chunk_content.len() / 4) as u32; // Simple fallback for visual updates
                                    
                                    let event_payload = serde_json::json!({
                                        "job_id": self.job_id,
                                        "response_chunk": chunk_content,
                                        "chars_received": accumulated_response.len(),
                                        "estimated_tokens": estimated_tokens,
                                        "visual_update": true
                                    });
                                    
                                    if let Err(e) = app_handle.emit("job_response_update", &event_payload) {
                                        warn!("Failed to emit response update event for job {}: {}", self.job_id, e);
                                    }
                                }
                            }
                            
                            // Update usage if present in chunk
                            if let Some(usage) = chunk.usage {
                                if let Some(current) = current_usage.as_mut() {
                                    // Merge token counts from the chunk while preserving existing cost
                                    current.prompt_tokens = usage.prompt_tokens;
                                    current.completion_tokens = usage.completion_tokens;
                                    current.total_tokens = usage.total_tokens;
                                    current.cached_input_tokens = usage.cached_input_tokens;
                                    current.cache_write_tokens = usage.cache_write_tokens;
                                    current.cache_read_tokens = usage.cache_read_tokens;
                                    // Preserve existing cost field, only update if chunk has cost and current doesn't
                                    if current.cost.is_none() && usage.cost.is_some() {
                                        current.cost = usage.cost;
                                    }
                                } else {
                                    // No existing usage, use the chunk's usage data directly
                                    current_usage = Some(usage);
                                }
                            }
                            
                            // Check for completion
                            let is_finished = chunk.choices.iter()
                                .any(|choice| choice.finish_reason.is_some());
                            
                            if is_finished {
                                debug!("Stream finished with reason: {:?}", 
                                    chunk.choices.iter().filter_map(|c| c.finish_reason.clone()).collect::<Vec<String>>());
                            }
                        },
                        StreamEvent::UsageUpdate(usage_update) => {
                            // Process server-authoritative usage update
                            info!("Processing usage update for job {}: input={}, output={}, total={}, cost={}", 
                                  self.job_id, 
                                  usage_update.tokens_input, 
                                  usage_update.tokens_output, 
                                  usage_update.tokens_total,
                                  usage_update.estimated_cost);
                            
                            // Update current_usage with the usage data
                            current_usage = Some(OpenRouterUsage {
                                prompt_tokens: usage_update.tokens_input as i32,
                                completion_tokens: usage_update.tokens_output as i32,
                                total_tokens: usage_update.tokens_total as i32,
                                cost: Some(usage_update.estimated_cost),
                                cached_input_tokens: 0,
                                cache_write_tokens: usage_update.cache_write_tokens.unwrap_or(0) as i32,
                                cache_read_tokens: usage_update.cache_read_tokens.unwrap_or(0) as i32,
                            });
                            
                            // Call the repository update method which handles database update and event emission
                            if let Err(e) = self.repo.update_job_stream_progress(&self.job_id, &usage_update).await {
                                error!("Failed to update job stream progress: {}", e);
                            }
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
                    
                    // For streaming errors, we still want to preserve any cost data we may have received
                    // The server may provide partial usage information even on failure
                    warn!("Streaming error occurred for job {} - final usage will be preserved if available: {:?}", 
                          self.job_id, current_usage);
                    
                    return Err(e);
                }
            }
        }
        
        // Use server-authoritative usage information only
        let usage_result = if let Some(usage) = current_usage {
            if let Some(cost) = usage.cost {
                info!("Stream processing completed for job {} with server-calculated cost: ${:.6} (tokens: {})", 
                      self.job_id, cost, usage.total_tokens);
            } else {
                debug!("Stream processing completed for job {} with server usage data but no cost field (tokens: {})", 
                       self.job_id, usage.total_tokens);
            }
            Some(usage)
        } else {
            debug!("Stream processing completed for job {} - no server usage received, server will provide usage data through other channels", self.job_id);
            None // Don't create estimated usage - rely on server data only
        };
        
        Ok(StreamResult {
            accumulated_response,
            final_usage: usage_result.clone(),
            cost: usage_result.and_then(|usage| usage.cost),
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
pub fn create_stream_config(system_prompt: &str, user_prompt: &str, model: &str) -> StreamConfig {
    StreamConfig {
        prompt_tokens: 0, // Server will provide accurate token counts
        system_prompt: system_prompt.to_string(),
        user_prompt: user_prompt.to_string(),
        model: model.to_string(),
    }
}