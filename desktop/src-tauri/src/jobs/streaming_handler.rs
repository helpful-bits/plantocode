use std::sync::Arc;
use futures::StreamExt;
use log::{debug, info, error, warn};

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

    /// Process a stream of OpenRouter chunks and return the accumulated response and usage
    pub async fn process_stream<S>(
        &self,
        mut stream: S,
    ) -> AppResult<StreamResult>
    where
        S: futures::Stream<Item = Result<OpenRouterStreamChunk, crate::error::AppError>> + Unpin,
    {
        debug!("Starting stream processing for job {}", self.job_id);
        
        let mut current_metadata_str = self.initial_db_job_metadata.clone();
        let mut accumulated_response = String::new();
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
                        
                        // Update job stream progress with server-calculated tokens
                        let new_metadata = self.repo.update_job_stream_progress(
                            &self.job_id,
                            &chunk_content,
                            0, // Server will provide accurate token counts
                            accumulated_response.len() as i32,
                            self.initial_db_job_metadata.as_deref(),
                            self.app_handle.as_ref(),
                            None, // Server will provide cost in final usage
                        ).await?;
                        current_metadata_str = Some(new_metadata);
                    }
                    
                    // Check for final usage information including server-calculated cost
                    if chunk.usage.is_some() {
                        final_usage = chunk.usage.clone();
                        debug!("Received server-authoritative usage information: {:?}", final_usage);
                        
                        // If we have cost information from server, update the metadata immediately
                        if let Some(ref usage) = final_usage {
                            if let Some(cost) = usage.cost {
                                // Emit job status change event with server-calculated cost
                                if let Some(ref app_handle) = self.app_handle {
                                    if let Err(e) = job_processor_utils::emit_job_status_change(
                                        app_handle,
                                        &self.job_id,
                                        "running",
                                        Some("Received server-calculated cost information."),
                                        Some(cost),
                                    ) {
                                        warn!("Failed to emit cost update event: {}", e);
                                    }
                                }
                                
                                // Parse existing metadata and add server-calculated cost
                                let updated_metadata = if let Some(metadata_str) = current_metadata_str.as_deref() {
                                    if let Ok(mut ui_metadata) = serde_json::from_str::<crate::jobs::types::JobUIMetadata>(metadata_str) {
                                        // Add server-calculated cost to task_data
                                        if let serde_json::Value::Object(ref mut task_map) = ui_metadata.task_data {
                                            task_map.insert("actual_cost".to_string(), serde_json::json!(cost));
                                        } else {
                                            ui_metadata.task_data = serde_json::json!({
                                                "actual_cost": cost
                                            });
                                        }
                                        
                                        // Serialize back to string
                                        match serde_json::to_string(&ui_metadata) {
                                            Ok(serialized) => Some(serialized),
                                            Err(e) => {
                                                debug!("Failed to serialize metadata with server cost: {}", e);
                                                None
                                            }
                                        }
                                    } else {
                                        // Create new metadata with server-calculated cost
                                        let new_metadata = serde_json::json!({
                                            "task_data": {
                                                "actual_cost": cost
                                            }
                                        });
                                        serde_json::to_string(&new_metadata).ok()
                                    }
                                } else {
                                    // No existing metadata, create new with server-calculated cost
                                    let new_metadata = serde_json::json!({
                                        "task_data": {
                                            "actual_cost": cost
                                        }
                                    });
                                    serde_json::to_string(&new_metadata).ok()
                                };
                                
                                // Update job with the server-calculated cost information
                                if let Some(metadata_str) = updated_metadata {
                                    let new_metadata = self.repo.update_job_stream_progress(
                                        &self.job_id,
                                        "", // Empty chunk - just updating metadata
                                        0,  // Server provides accurate token counts
                                        accumulated_response.len() as i32,
                                        Some(&metadata_str),
                                        self.app_handle.as_ref(),
                                        Some(cost), // Server-calculated cost
                                    ).await?;
                                    current_metadata_str = Some(new_metadata);
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
                    }
                }
                Err(e) => {
                    error!("Streaming error: {}", e);
                    
                    // Check if job has been canceled to extract any costs incurred
                    if job_processor_utils::check_job_canceled(&self.repo, &self.job_id).await? {
                        info!("Job {} canceled during streaming error", self.job_id);
                        
                        // No need to extract cost from metadata - server will provide authoritative cost
                        
                        return Err(AppError::JobError(format!("Job was canceled with error: {}", e)));
                    }
                    
                    return Err(e);
                }
            }
        }
        
        // Use server-authoritative usage information only
        let usage_result = if let Some(usage) = final_usage {
            debug!("Using server-authoritative usage information with cost: {:?}", usage.cost);
            Some(usage)
        } else {
            debug!("No server usage received - server will provide usage data through other channels");
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
pub fn create_stream_config(system_prompt: &str, user_prompt: &str) -> StreamConfig {
    StreamConfig {
        prompt_tokens: 0, // Server will provide accurate token counts
        system_prompt: system_prompt.to_string(),
        user_prompt: user_prompt.to_string(),
    }
}