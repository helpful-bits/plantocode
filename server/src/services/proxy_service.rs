use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, ApiUsageEntryDto};
use crate::db::repositories::model_repository::ModelRepository;
use crate::clients::{OpenRouterClient, GroqClient, open_router_client::OpenRouterUsage};
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

/// Proxy service that routes requests through OpenRouter and Groq
pub struct ProxyService {
    openrouter_client: OpenRouterClient,
    groq_client: GroqClient,
    billing_service: Arc<BillingService>,
    api_usage_repository: Arc<ApiUsageRepository>,
    model_repository: Arc<ModelRepository>,
    app_settings: crate::config::settings::AppSettings,
}

impl ProxyService {
    pub fn new(
        billing_service: Arc<BillingService>,
        api_usage_repository: Arc<ApiUsageRepository>,
        model_repository: Arc<ModelRepository>,
        app_settings: &crate::config::settings::AppSettings,
    ) -> Result<Self, AppError> {
        // Initialize OpenRouter client with app settings
        let openrouter_client = OpenRouterClient::new(app_settings);
        
        // Initialize Groq client with app settings
        let groq_client = GroqClient::new(app_settings)?;
        
        Ok(Self {
            openrouter_client,
            groq_client,
            billing_service,
            api_usage_repository,
            model_repository,
            app_settings: app_settings.clone(),
        })
    }
    
    /// Forward a request to OpenRouter for chat completions
    pub async fn forward_chat_completions_request(
        &self,
        user_id: &Uuid,
        payload: Value,
        model_id_override: Option<String>,
    ) -> Result<Value, AppError> {
        // Determine model ID: override > payload > app_settings default
        let model_id = model_id_override
            .or_else(|| payload.get("model").and_then(|v| v.as_str()).map(String::from))
            .unwrap_or_else(|| self.app_settings.ai_models.default_llm_model_id.clone());
        
        // Check if user has access to this model
        self.billing_service.check_service_access(user_id, &model_id).await?;
        
        // Ensure payload has the determined model ID
        let mut request_payload = payload.clone();
        request_payload["model"] = serde_json::Value::String(model_id.clone());
        
        // Convert payload to OpenRouter chat request
        let request = self.openrouter_client.convert_to_chat_request(request_payload)?;
        
        // Make the request to OpenRouter
        let (response, headers) = self.openrouter_client.chat_completion(request, &user_id.to_string()).await?;
        
        // Extract processing_ms and request_id from headers
        let processing_ms = headers.get("openai-processing-ms")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i32>().ok());
        let request_id = headers.get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .map(String::from)
            .or_else(|| Some(response.id.clone()));
        
        // Extract usage data from response
        let input_tokens = response.usage.prompt_tokens;
        let output_tokens = response.usage.completion_tokens;
        
        // Calculate the final cost
        let final_cost_bd = if let Some(cost_f64) = response.usage.cost {
            // If OpenRouter provides a cost, use it
            bigdecimal::BigDecimal::try_from(cost_f64)
                .map_err(|_| AppError::Internal("Invalid cost from OpenRouter".to_string()))?
        } else {
            // Fallback: find model in AppSettings and calculate
            let model_info = self.app_settings.ai_models.available_models.iter()
                .find(|m| m.id == model_id);
                
            if let Some(info) = model_info {
                if let (Some(in_price), Some(out_price)) = (&info.price_input_per_1k_tokens, &info.price_output_per_1k_tokens) {
                    ApiUsageRepository::calculate_cost(input_tokens, output_tokens, in_price, out_price)?
                } else {
                    log::warn!("Pricing not configured for model {} in AppSettings. Cost will be zero.", model_id);
                    bigdecimal::BigDecimal::from(0)
                }
            } else {
                log::warn!("Model {} not found in AppSettings for pricing. Cost will be zero.", model_id);
                bigdecimal::BigDecimal::from(0)
            }
        };
        
        // Record API usage in the database
        let entry = ApiUsageEntryDto {
            user_id: *user_id,
            service_name: model_id,
            tokens_input: input_tokens,
            tokens_output: output_tokens,
            cost: final_cost_bd,
            request_id,
            metadata: None,
            processing_ms,
            input_duration_ms: None,
        };
        self.api_usage_repository.record_usage(entry).await?;
        
        // Return the raw JSON response - actix-web will convert it to JSON
        Ok(serde_json::to_value(response)?)
    }
    
    /// Forward a streaming request to OpenRouter for chat completions
    pub async fn forward_chat_completions_stream_request(
        self: Arc<Self>,
        user_id: Uuid,
        payload: Value,
        model_id_override: Option<String>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Bytes, actix_web::Error>> + Send + 'static>>, AppError> {
        // Determine model ID: override > payload > app_settings default
        let model_id = model_id_override
            .or_else(|| payload.get("model").and_then(|v| v.as_str()).map(String::from))
            .unwrap_or_else(|| self.app_settings.ai_models.default_llm_model_id.clone());
        
        // Check if user has access to this model
        self.billing_service.check_service_access(&user_id, &model_id).await?;
        
        // Ensure payload has the determined model ID
        let mut request_payload = payload.clone();
        request_payload["model"] = serde_json::Value::String(model_id.clone());
        
        // Convert payload to OpenRouter chat request
        let request = self.openrouter_client.convert_to_chat_request(request_payload)?;
        
        // Create independently owned copies of all required components
        let openrouter_client_owned = self.openrouter_client.clone();
        let api_usage_repository_clone = self.api_usage_repository.clone();
        let app_settings_clone = self.app_settings.clone();
        let model_id_string = model_id.to_string();
        let user_id_string = user_id.to_string();
        
        // Create a new owned boxed stream with static lifetime
        // We'll create the response in a more direct way that ensures 'static lifetime
        let stream = Box::pin(
            // First, perform the request and get a result
            async move {
                // This is now an owned client inside this async block
                let (headers, stream_result) = openrouter_client_owned.stream_chat_completion(request, user_id_string).await?;
                
                // Extract processing_ms and request_id from headers
                let processing_ms = headers.get("openai-processing-ms")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<i32>().ok());
                let request_id = headers.get("x-request-id")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from);
                
                // We'll track usage information as we process the stream
                let usage_tracking = Arc::new(Mutex::new(StreamUsageTracker::new()));
                let usage_tracking_clone = usage_tracking.clone();
                
                // Spawn a task to record usage after the stream is done
                let usage_tracking_for_task = usage_tracking.clone();
                let user_id_for_task = user_id;
                let model_id_for_task = model_id_string.clone();
                let app_settings_for_task = app_settings_clone.clone();
                
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
                        
                        let final_cost_bd = if let Some(cost_f64) = tracker.cost {
                            // If OpenRouter provides a cost, use it
                            match bigdecimal::BigDecimal::try_from(cost_f64) {
                                Ok(bd) => bd,
                                Err(e) => {
                                    error!("Failed to convert OpenRouter cost to BigDecimal: {}", e);
                                    bigdecimal::BigDecimal::from(0)
                                }
                            }
                        } else {
                            // Fallback: find model in AppSettings and calculate using recorded token usage
                            let model_info = app_settings_for_task.ai_models.available_models.iter()
                                .find(|m| m.id == model_id_for_task);
                                
                            if let Some(info) = model_info {
                                if let (Some(in_price), Some(out_price)) = (&info.price_input_per_1k_tokens, &info.price_output_per_1k_tokens) {
                                    match ApiUsageRepository::calculate_cost(tracker.prompt_tokens, tracker.completion_tokens, in_price, out_price) {
                                        Ok(cost) => cost,
                                        Err(e) => {
                                            error!("Failed to calculate cost for streaming model {}: {}", model_id_for_task, e);
                                            bigdecimal::BigDecimal::from(0)
                                        }
                                    }
                                } else {
                                    warn!("Pricing not configured for model {} in AppSettings. Cost will be zero.", model_id_for_task);
                                    bigdecimal::BigDecimal::from(0)
                                }
                            } else {
                                warn!("Model {} not found in AppSettings for pricing. Cost will be zero.", model_id_for_task);
                                bigdecimal::BigDecimal::from(0)
                            }
                        };
                        
                        let entry = ApiUsageEntryDto {
                            user_id: user_id_for_task,
                            service_name: model_id_for_task.clone(),
                            tokens_input: tracker.prompt_tokens,
                            tokens_output: tracker.completion_tokens,
                            cost: final_cost_bd,
                            request_id: request_id.clone(),
                            metadata: None,
                            processing_ms,
                            input_duration_ms: None,
                        };
                        if let Err(e) = api_usage_repository_clone.record_usage(entry).await {
                            error!("Failed to record API usage: {}", e);
                        }
                    } else {
                        // If no usage data was found in the stream at all, use minimal values 
                        // to ensure we have a record of the API call
                        warn!("No usage data found in stream, recording minimal usage values");
                        
                        let model_info_for_min_cost = app_settings_for_task.ai_models.available_models.iter()
                            .find(|m| m.id == model_id_for_task);
                        let minimal_cost = if let Some(info) = model_info_for_min_cost {
                            if let (Some(in_price), Some(out_price)) = (&info.price_input_per_1k_tokens, &info.price_output_per_1k_tokens) {
                                ApiUsageRepository::calculate_cost(1, 1, in_price, out_price)
                                    .unwrap_or_else(|e| {
                                        error!("Failed to calculate minimal cost for {}: {}", model_id_for_task, e);
                                        bigdecimal::BigDecimal::from(0)
                                    })
                            } else {
                                warn!("Pricing not configured for model {} in AppSettings. Minimal cost will be zero.", model_id_for_task);
                                bigdecimal::BigDecimal::from(0)
                            }
                        } else {
                            warn!("Model {} not found in AppSettings for minimal pricing. Minimal cost will be zero.", model_id_for_task);
                            bigdecimal::BigDecimal::from(0)
                        };
                        
                        let entry = ApiUsageEntryDto {
                            user_id: user_id_for_task,
                            service_name: model_id_for_task.clone(),
                            tokens_input: 1,
                            tokens_output: 1,
                            cost: minimal_cost,
                            request_id: request_id.clone(),
                            metadata: None,
                            processing_ms,
                            input_duration_ms: None,
                        };
                        if let Err(e) = api_usage_repository_clone.record_usage(entry).await {
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
    
    /// Forward a transcription request to Groq
    pub async fn forward_transcription_request(
        &self,
        user_id: &Uuid,
        audio_data: &[u8],
        filename: &str,
        model_override: Option<String>,
        duration_ms: i64,
    ) -> Result<Value, AppError> {
        // Determine model ID: override or app_settings default
        let model_id = model_override
            .unwrap_or_else(|| self.app_settings.ai_models.default_transcription_model_id.clone());
        
        // Check if user has access to this model
        self.billing_service.check_service_access(user_id, &model_id).await?;
        
        // Make the transcription request to Groq
        let (transcribed_text, headers) = self.groq_client.transcribe(audio_data, filename, &model_id, &user_id.to_string(), duration_ms).await?;
        
        // Extract processing_ms and request_id from headers
        let processing_ms = headers.get("openai-processing-ms")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i32>().ok());
        let request_id = headers.get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .map(String::from)
            .or_else(|| Some(Uuid::new_v4().to_string()));
        
        // Calculate tokens for usage tracking
        // For audio, input_tokens represents seconds of audio, as a conventional unit.
        // Actual billing for Groq/Whisper is typically per minute of audio.
        let input_tokens = duration_ms / 1000;
        let output_tokens = (transcribed_text.len() / 4) as i32; // Approximate chars per token for output text
        
        // Calculate cost using model-specific pricing from database
        let model = self.model_repository.find_by_id(&model_id).await?
            .ok_or_else(|| AppError::Internal(format!("Model {} not found", model_id)))?;
        
        let final_cost_bd = if model.is_duration_based() {
            // Use duration-based pricing with automatic minimum billing enforcement
            model.calculate_duration_cost(duration_ms)?
        } else {
            // Fallback for token-based models (shouldn't happen for transcription)
            warn!("Transcription model {} is not configured for duration-based pricing, using fallback", model_id);
            bigdecimal::BigDecimal::from(0)
        };
        
        // Record API usage
        let entry = ApiUsageEntryDto {
            user_id: *user_id,
            service_name: model_id.to_string(),
            tokens_input: input_tokens as i32,
            tokens_output: output_tokens,
            cost: final_cost_bd,
            request_id,
            metadata: None,
            processing_ms,
            input_duration_ms: Some(duration_ms),
        };
        self.api_usage_repository.record_usage(entry).await?;
        
        // Return as JSON wrapped in a structure similar to what OpenRouter might return
        Ok(json!({ "text": transcribed_text }))
    }
    
    // OpenRouter provides accurate token usage information, so no estimation is needed
}

impl Clone for ProxyService {
    fn clone(&self) -> Self {
        Self {
            openrouter_client: self.openrouter_client.clone(),
            groq_client: GroqClient::new(&self.app_settings).expect("Failed to clone GroqClient"),
            billing_service: self.billing_service.clone(),
            api_usage_repository: self.api_usage_repository.clone(),
            model_repository: self.model_repository.clone(),
            app_settings: self.app_settings.clone(),
        }
    }
}