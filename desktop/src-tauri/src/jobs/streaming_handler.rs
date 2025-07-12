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
        let mut final_usage: Option<OpenRouterUsage> = None;
        
        // Process stream events
        while let Some(event_result) = stream.next().await {
            match event_result {
                Ok(event) => {
                    match event {
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
                                    let estimated_tokens = crate::utils::token_estimator::estimate_tokens(&chunk_content);
                                    
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
                            
                            // Check for final usage information including server-calculated cost
                            if let Some(ref usage) = chunk.usage {
                                final_usage = Some((*usage).clone());
                                info!("Received server-authoritative usage information for job {}: tokens={}, cost={:?}", 
                                      self.job_id, usage.total_tokens, usage.cost);
                                
                                // Process server-calculated cost if available
                                if let Some(cost) = usage.cost {
                                    info!("Processing server-calculated cost ${:.6} for job {}", cost, self.job_id);
                                    
                                    // Emit job status change event with server-calculated cost
                                    if let Some(ref app_handle) = self.app_handle {
                                        if let Err(e) = job_processor_utils::emit_job_update(
                                            app_handle,
                                            "job_updated",
                                            serde_json::json!({
                                                "id": self.job_id,
                                                "status": "Running",
                                                "errorMessage": "Received server-calculated cost information.",
                                                "actual_cost": cost
                                            })
                                        ) {
                                            error!("Failed to emit cost update event for job {}: {}", self.job_id, e);
                                        }
                                    }
                                    
                                    // Update metadata with server-calculated cost and cache tokens
                                    match self.update_metadata_with_cost_and_cache_tokens(
                                        current_metadata_str.as_deref(), 
                                        cost, 
                                        usage.cache_write_tokens as i64, 
                                        usage.cache_read_tokens as i64
                                    ).await {
                                        Ok(updated_metadata_str) => {
                                            current_metadata_str = Some(updated_metadata_str);
                                            debug!("Successfully updated job {} metadata with server cost ${:.6} and cache tokens", self.job_id, cost);
                                        }
                                        Err(e) => {
                                            error!("Failed to update metadata with server cost and cache tokens for job {}: {}", self.job_id, e);
                                            // Continue processing - cost and cache tokens will still be captured in final_usage
                                        }
                                    }
                                } else {
                                    debug!("Server usage information received for job {} but no cost field present", self.job_id);
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
                          self.job_id, final_usage);
                    
                    return Err(e);
                }
            }
        }
        
        // Use server-authoritative usage information only
        let usage_result = if let Some(usage) = final_usage {
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

    /// Helper method to update job metadata with server-calculated cost and cache tokens
    /// Returns the updated metadata string on success
    async fn update_metadata_with_cost_and_cache_tokens(
        &self,
        current_metadata: Option<&str>,
        server_cost: f64,
        cache_write_tokens: i64,
        cache_read_tokens: i64,
    ) -> AppResult<String> {
        debug!("Updating metadata with server-calculated cost ${:.6} and cache tokens (write: {}, read: {}) for job {}", 
              server_cost, cache_write_tokens, cache_read_tokens, self.job_id);
        
        let updated_metadata = match current_metadata {
            Some(metadata_str) => {
                // Parse existing metadata
                match serde_json::from_str::<crate::jobs::types::JobUIMetadata>(metadata_str) {
                    Ok(mut ui_metadata) => {
                        // Add server-calculated cost to task_data
                        match ui_metadata.task_data {
                            serde_json::Value::Object(ref mut task_map) => {
                                task_map.insert("actual_cost".to_string(), serde_json::json!(server_cost));
                                debug!("Added server cost to existing task_data for job {}", self.job_id);
                            }
                            _ => {
                                // Replace non-object task_data with object containing cost
                                ui_metadata.task_data = serde_json::json!({
                                    "actual_cost": server_cost
                                });
                                debug!("Replaced task_data with cost object for job {}", self.job_id);
                            }
                        }
                        
                        // Serialize back to string
                        serde_json::to_string(&ui_metadata)
                            .map_err(|e| AppError::SerializationError(format!("Failed to serialize updated metadata: {}", e)))?
                    }
                    Err(e) => {
                        // If parsing fails, create new metadata structure
                        warn!("Failed to parse existing metadata for job {}, creating new structure: {}", self.job_id, e);
                        serde_json::to_string(&serde_json::json!({
                            "task_data": {
                                "actual_cost": server_cost
                            }
                        })).map_err(|e| AppError::SerializationError(format!("Failed to create new metadata: {}", e)))?
                    }
                }
            }
            None => {
                // Create new metadata with server-calculated cost
                debug!("Creating new metadata with server cost for job {}", self.job_id);
                serde_json::to_string(&serde_json::json!({
                    "task_data": {
                        "actual_cost": server_cost
                    }
                })).map_err(|e| AppError::SerializationError(format!("Failed to create metadata: {}", e)))?
            }
        };
        
        // Update job with the server-calculated cost information and cache tokens using legacy method
        let new_metadata = self.repo.update_job_stream_progress_legacy(
            &self.job_id,
            "", // Empty chunk - just updating metadata
            0,  // Server provides accurate token counts
            0,  // No new content being added
            Some(&updated_metadata),
            self.app_handle.as_ref(),
            Some(server_cost), // Server-calculated cost
            Some(cache_write_tokens),
            Some(cache_read_tokens),
        ).await.map_err(|e| AppError::DatabaseError(format!("Failed to update job metadata with cost and cache tokens: {}", e)))?;
        
        Ok(new_metadata)
    }

    /// Helper method to update job metadata with server-calculated cost
    /// Returns the updated metadata string on success
    async fn update_metadata_with_cost(
        &self,
        current_metadata: Option<&str>,
        server_cost: f64,
    ) -> AppResult<String> {
        self.update_metadata_with_cost_and_cache_tokens(
            current_metadata,
            server_cost,
            0, // default cache_write_tokens
            0, // default cache_read_tokens
        ).await
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
pub fn create_stream_config(system_prompt: &str, user_prompt: &str) -> StreamConfig {
    StreamConfig {
        prompt_tokens: 0, // Server will provide accurate token counts
        system_prompt: system_prompt.to_string(),
        user_prompt: user_prompt.to_string(),
    }
}