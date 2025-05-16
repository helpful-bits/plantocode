use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::clients::{OpenRouterClient, open_router_client::OpenRouterUsage};
use actix_web::web::{self, Bytes};
use futures_util::{Stream, StreamExt};
use log::{debug, error, info, warn};
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Helper struct to track usage information during streaming
#[derive(Clone, Debug)]
struct StreamUsageTracker {
    prompt_tokens: i32,
    completion_tokens: i32,
    cost: Option<f64>,
    has_final_update: bool, // Flag to indicate we've received the final usage information
}

impl StreamUsageTracker {
    fn new() -> Self {
        Self {
            prompt_tokens: 0,
            completion_tokens: 0,
            cost: None,
            has_final_update: false,
        }
    }
    
    /// Update the tracker from OpenRouter usage data 
    /// This is typically sent in the final chunk of a stream
    fn update_from_usage(&mut self, usage: &OpenRouterUsage) {
        // OpenRouter sends complete usage information in the last chunk
        // so we can simply replace our tracking with their provided data
        self.prompt_tokens = usage.prompt_tokens;
        self.completion_tokens = usage.completion_tokens;
        self.cost = usage.cost;
        self.has_final_update = true;
        
        debug!("Updated usage tracker with final data: prompt={}, completion={}, cost={:?}", 
            self.prompt_tokens, self.completion_tokens, self.cost);
    }
    
    /// Accumulate output tokens from content in a stream chunk
    /// This is a fallback method in case OpenRouter doesn't send usage information
    fn accumulate_output_from_chunk(&mut self, chunk_str: &str) {
        // Only accumulate if we haven't received the final usage update
        if self.has_final_update {
            return;
        }
        
        // Try to extract content from the stream chunk to estimate token count
        // This is a rough estimate and should be replaced by OpenRouter's final usage data
        if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(chunk_str.trim()) {
            if let Some(choices) = chunk.get("choices").and_then(|c| c.as_array()) {
                for choice in choices {
                    if let Some(delta) = choice.get("delta") {
                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                            // Very rough token estimation - approximately 4 chars per token
                            // This is just a fallback and will be overwritten by the final usage data
                            let estimated_tokens = (content.len() as f32 / 4.0).ceil() as i32;
                            self.completion_tokens += estimated_tokens;
                        }
                    }
                }
            }
        }
    }
}

/// Proxy service that routes requests through OpenRouter
pub struct ProxyService {
    openrouter_client: OpenRouterClient,
    billing_service: Arc<BillingService>,
    api_usage_repository: Arc<ApiUsageRepository>,
}

impl ProxyService {
    pub fn new(
        billing_service: Arc<BillingService>,
        api_usage_repository: Arc<ApiUsageRepository>,
        app_settings: &crate::config::settings::AppSettings,
    ) -> Result<Self, AppError> {
        // Initialize OpenRouter client with app settings
        let openrouter_client = OpenRouterClient::new(app_settings);
        
        Ok(Self {
            openrouter_client,
            billing_service,
            api_usage_repository,
        })
    }
    
    /// Forward a request to OpenRouter for chat completions
    pub async fn forward_chat_completions_request(
        &self,
        user_id: &Uuid,
        payload: Value,
    ) -> Result<Value, AppError> {
        // Extract model ID for billing checks
        let model_id = match payload.get("model") {
            Some(model) => model.as_str().unwrap_or("anthropic/claude-3-sonnet-20240229"),
            None => "anthropic/claude-3-sonnet-20240229", // Default if model not specified
        };
        
        // Check if user has access to this model
        self.billing_service.check_service_access(user_id, model_id).await?;
        
        // Convert payload to OpenRouter chat request
        let request = self.openrouter_client.convert_to_chat_request(payload.clone())?;
        
        // Make the request to OpenRouter
        let response = self.openrouter_client.chat_completion(request).await?;
        
        // Extract usage data from response
        let input_tokens = response.usage.prompt_tokens;
        let output_tokens = response.usage.completion_tokens;
        let provided_cost = response.usage.cost;
        
        // Record API usage in the database
        self.api_usage_repository.record_usage(
            user_id,
            model_id,
            input_tokens,
            output_tokens,
            provided_cost,
        ).await?;
        
        // Return the raw JSON response - actix-web will convert it to JSON
        Ok(serde_json::to_value(response)?)
    }
    
    /// Forward a streaming request to OpenRouter for chat completions
    pub async fn forward_chat_completions_stream_request(
        self: Arc<Self>,
        user_id: Uuid,
        payload: Value,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Bytes, actix_web::Error>> + Send + 'static>>, AppError> {
        // Extract model ID for billing checks
        let model_id = match payload.get("model") {
            Some(model) => model.as_str().unwrap_or("anthropic/claude-3-sonnet-20240229"),
            None => "anthropic/claude-3-sonnet-20240229", // Default if model not specified
        };
        
        // Check if user has access to this model
        self.billing_service.check_service_access(&user_id, model_id).await?;
        
        // Convert payload to OpenRouter chat request
        let request = self.openrouter_client.convert_to_chat_request(payload.clone())?;
        
        // Create independently owned copies of all required components
        let openrouter_client_owned = self.openrouter_client.clone();
        let api_usage_repository_clone = self.api_usage_repository.clone();
        let model_id_string = model_id.to_string();
        
        // Create a new owned boxed stream with static lifetime
        // We'll create the response in a more direct way that ensures 'static lifetime
        let stream = Box::pin(
            // First, perform the request and get a result
            async move {
                // This is now an owned client inside this async block
                let stream_result = openrouter_client_owned.stream_chat_completion(request).await?;
                
                // We'll track usage information as we process the stream
                let usage_tracking = Arc::new(Mutex::new(StreamUsageTracker::new()));
                let usage_tracking_clone = usage_tracking.clone();
                
                // Spawn a task to record usage after the stream is done
                let usage_tracking_for_task = usage_tracking.clone();
                let user_id_for_task = user_id;
                let model_id_for_task = model_id_string.clone();
                
                tokio::spawn(async move {
                    // After stream completes, record the usage
                    let tracker = {
                        let locked_tracker = usage_tracking_for_task.lock().await;
                        locked_tracker.clone()
                    };
                    
                    // If the tracker has accumulated usage information
                    if tracker.has_final_update || tracker.completion_tokens > 0 {
                        info!("Recording stream usage for model {} (prompt tokens: {}, completion tokens: {}, cost: {:?})",
                              model_id_for_task, tracker.prompt_tokens, tracker.completion_tokens, tracker.cost);
                        
                        if let Err(e) = api_usage_repository_clone.record_usage(
                            &user_id_for_task,
                            &model_id_for_task,
                            tracker.prompt_tokens,
                            tracker.completion_tokens,
                            tracker.cost,
                        ).await {
                            error!("Failed to record API usage: {}", e);
                        }
                    } else {
                        // If no usage data was found in the stream at all, use minimal values 
                        // to ensure we have a record of the API call
                        warn!("No usage data found in stream, recording minimal usage values");
                        if let Err(e) = api_usage_repository_clone.record_usage(
                            &user_id_for_task,
                            &model_id_for_task,
                            1, // Minimal value to ensure a record exists
                            1, // Minimal value to ensure a record exists
                            None, // No cost information, will use pricing table
                        ).await {
                            error!("Failed to record API usage: {}", e);
                        }
                    }
                });
                
                // Transform the raw stream to a 'static stream with usage tracking
                // We need to manually type the stream to ensure proper 'static lifetime
                let tracked_stream: Pin<Box<dyn Stream<Item = Result<Bytes, actix_web::Error>> + Send + 'static>> = 
                    Box::pin(stream_result.map(move |result| {
                        match result {
                            Ok(bytes) => {
                                let chunk_str = String::from_utf8_lossy(&bytes);
                                
                                // Extract usage data if available and update our tracking
                                if let Some(usage) = OpenRouterClient::extract_usage_from_stream_chunk(&chunk_str) {
                                    // Since OpenRouter sends the full usage in the last chunk, we want to capture it
                                    match usage_tracking_clone.try_lock() {
                                        Ok(mut guard) => {
                                            // Update with the final usage data which contains accumulated totals
                                            guard.update_from_usage(&usage);
                                            debug!("Updated streaming usage tracking: prompt={}, completion={}, cost={:?}", 
                                                usage.prompt_tokens, usage.completion_tokens, usage.cost);
                                        },
                                        Err(e) => {
                                            // Just log the error but don't block the stream
                                            warn!("Failed to acquire lock for usage tracking: {}. Will try again on next chunk.", e);
                                        }
                                    };
                                } else {
                                    // If no usage data in this chunk, still try to track token counts
                                    // This is a fallback but OpenRouter typically only sends usage at the end
                                    if let Ok(mut guard) = usage_tracking_clone.try_lock() {
                                        guard.accumulate_output_from_chunk(&chunk_str);
                                    }
                                }
                                
                                // Return the original chunk
                                Ok(Bytes::from(chunk_str.to_string()))
                            },
                            Err(e) => {
                                error!("Stream error: {}", e);
                                // Convert AppError to actix_web::Error
                                Err(actix_web::error::ErrorInternalServerError(e.to_string()))
                            }
                        }
                    }));
                
                Ok(tracked_stream)
            }
            .await
            .unwrap_or_else(|e: AppError| {
                // If there's an error during stream creation, return an empty stream with the error
                error!("Error creating stream: {}", e);
                
                // Create a simple error that is Send + 'static
                let error_message = e.to_string();
                
                // Use a specific type that implements Send
                let error_stream: Pin<Box<dyn Stream<Item = Result<Bytes, actix_web::Error>> + Send + 'static>> = {
                    Box::pin(futures_util::stream::once(async move {
                        // Using boxed error type to ensure Send is implemented
                        let err = actix_web::error::InternalError::new(
                            error_message,
                            actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                        );
                        Err(err.into())
                    }))
                };
                
                error_stream
            })
        );
        
        // Return the stream directly
        Ok(stream)
    }
    
    /// Forward a transcription request to OpenRouter
    pub async fn forward_transcription_request(
        &self,
        user_id: &Uuid,
        audio_data: &[u8],
        filename: &str,
        model: &str, // model ID like "openai/whisper-1"
    ) -> Result<Value, AppError> {
        // Check if user has access to this model
        self.billing_service.check_service_access(user_id, model).await?;
        
        // Make the transcription request
        let response = self.openrouter_client.transcribe(audio_data, filename, model).await?;
        
        // Extract usage data if available, or use minimal fallback values
        let (input_tokens, output_tokens) = match &response.usage {
            Some(usage) => (usage.prompt_tokens, usage.completion_tokens),
            None => {
                // For whisper, OpenRouter typically bills by minute rather than tokens
                // but includes token counts in the usage field. If for some reason they're
                // missing, we'll use minimal values until they provide better data.
                warn!("No usage data provided by OpenRouter for transcription. Using minimal values.");
                (0, 1) // Minimal non-zero values to create a record
            }
        };
        
        // Get cost if provided by OpenRouter
        let cost = self.openrouter_client.extract_cost_from_transcription(&response);
        
        // Record API usage
        self.api_usage_repository.record_usage(
            user_id,
            model,
            input_tokens,
            output_tokens,
            cost,
        ).await?;
        
        // Return as JSON
        Ok(serde_json::to_value(response)?)
    }
    
    // OpenRouter provides accurate token usage information, so no estimation is needed
}

impl Clone for ProxyService {
    fn clone(&self) -> Self {
        Self {
            openrouter_client: self.openrouter_client.clone(),
            billing_service: self.billing_service.clone(),
            api_usage_repository: self.api_usage_repository.clone(),
        }
    }
}