use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, ApiUsageEntryDto};
use crate::db::repositories::model_repository::ModelRepository;
use crate::db::repositories::{SettingsRepository, DatabaseAIModelSettings};
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
    settings_repository: Arc<SettingsRepository>,
    app_settings: crate::config::settings::AppSettings,
}

impl ProxyService {
    pub fn new(
        billing_service: Arc<BillingService>,
        api_usage_repository: Arc<ApiUsageRepository>,
        model_repository: Arc<ModelRepository>,
        settings_repository: Arc<SettingsRepository>,
        app_settings: &crate::config::settings::AppSettings,
    ) -> Result<Self, AppError> {
        // Initialize OpenRouter client with app settings
        let openrouter_client = OpenRouterClient::new(app_settings)?;
        
        // Initialize Groq client with app settings
        let groq_client = GroqClient::new(app_settings)?;
        
        Ok(Self {
            openrouter_client,
            groq_client,
            billing_service,
            api_usage_repository,
            model_repository,
            settings_repository,
            app_settings: app_settings.clone(),
        })
    }

    /// Get default model ID from database-driven configuration
    async fn get_default_llm_model_id(&self) -> Result<String, AppError> {
        let ai_settings = self.settings_repository.get_ai_model_settings().await?;
        Ok(ai_settings.default_llm_model_id)
    }

    /// Get default transcription model ID from database-driven configuration
    async fn get_default_transcription_model_id(&self) -> Result<String, AppError> {
        let ai_settings = self.settings_repository.get_ai_model_settings().await?;
        Ok(ai_settings.default_transcription_model_id)
    }
    
    /// Forward a request to OpenRouter for chat completions
    pub async fn forward_chat_completions_request(
        &self,
        user_id: &Uuid,
        payload: Value,
        model_id_override: Option<String>,
    ) -> Result<Value, AppError> {
        // Determine model ID: override > payload > database default
        let model_id = match model_id_override
            .or_else(|| payload.get("model").and_then(|v| v.as_str()).map(String::from))
        {
            Some(id) => id,
            None => self.get_default_llm_model_id().await?,
        };
        
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
        
        // Calculate the final cost - prioritize provider cost, fallback to DB pricing
        let final_cost_bd = if let Some(cost_f64) = response.usage.cost {
            // If OpenRouter provides a cost, use it (preferred for accuracy)
            bigdecimal::BigDecimal::try_from(cost_f64)
                .map_err(|e| AppError::Internal(format!("Invalid cost value {} from OpenRouter: {}", cost_f64, e)))?
        } else {
            // Fallback to model repository pricing - HARD ERROR if model not configured properly
            let model = self.model_repository.find_by_id(&model_id).await
                .map_err(|e| AppError::Internal(format!("Failed to lookup model {} in repository: {}", model_id, e)))?
                .ok_or_else(|| {
                    error!("CRITICAL: Model '{}' used in request but not found or inactive in database. This indicates a data integrity or configuration issue.", model_id);
                    AppError::Internal(format!("Model '{}' used in request but not found or inactive in database. This indicates a data integrity or configuration issue.", model_id))
                })?;
            
            // Validate this is a token-based model for chat completions
            if model.is_duration_based() {
                error!("CRITICAL: Model '{}' is misconfigured as duration-based for a token-based chat completion task. Review model configuration in database.", model_id);
                return Err(AppError::Configuration(format!(
                    "Model {} is configured for duration-based pricing but used for chat completions. Check model configuration.", 
                    model_id
                )));
            }
            
            model.calculate_token_cost(input_tokens, output_tokens)?
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
        // Determine model ID: override > payload > database default
        let model_id = match model_id_override
            .or_else(|| payload.get("model").and_then(|v| v.as_str()).map(String::from))
        {
            Some(id) => id,
            None => self.get_default_llm_model_id().await?,
        };
        
        // Check if user has access to this model
        self.billing_service.check_service_access(&user_id, &model_id).await?;
        
        // Pre-load model pricing information for use in streaming closure
        let model = self.model_repository.find_by_id(&model_id).await
            .map_err(|e| AppError::Internal(format!("Failed to lookup model {} in repository: {}", model_id, e)))?
            .ok_or_else(|| {
                error!("CRITICAL: Model '{}' used in request but not found or inactive in database. This indicates a data integrity or configuration issue.", model_id);
                AppError::Internal(format!("Model '{}' used in request but not found or inactive in database. This indicates a data integrity or configuration issue.", model_id))
            })?;
        
        // Validate this is a token-based model for chat completions
        if model.is_duration_based() {
            error!("CRITICAL: Model '{}' is misconfigured as duration-based for a token-based chat completion task. Review model configuration in database.", model_id);
            return Err(AppError::Configuration(format!(
                "Model {} is configured for duration-based pricing but used for chat completions. Check model configuration.", 
                model_id
            )));
        }
        
        let model_for_task = model.clone();
        
        // Ensure payload has the determined model ID
        let mut request_payload = payload.clone();
        request_payload["model"] = serde_json::Value::String(model_id.clone());
        
        // Convert payload to OpenRouter chat request
        let request = self.openrouter_client.convert_to_chat_request(request_payload)?;
        
        // Create independently owned copies of all required components
        let openrouter_client_owned = self.openrouter_client.clone();
        let api_usage_repository_clone = self.api_usage_repository.clone();
        let model_id_string = model_id.to_string();
        let user_id_string = user_id.to_string();
        let model_for_async_task = model_for_task;
        
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
                let model_for_usage = model_for_async_task;
                
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
                            // If OpenRouter provides a cost, use it (preferred for accuracy)
                            match bigdecimal::BigDecimal::try_from(cost_f64) {
                                Ok(bd) => bd,
                                Err(e) => {
                                    error!("Failed to convert OpenRouter streaming cost {} to BigDecimal: {}. Using fallback calculation.", cost_f64, e);
                                    // Fallback to manual calculation if provider cost is invalid
                                    match model_for_usage.calculate_token_cost(tracker.prompt_tokens, tracker.completion_tokens) {
                                        Ok(cost) => cost,
                                        Err(calc_err) => {
                                            error!("CRITICAL: Both provider cost conversion and fallback calculation failed for model {}: provider_error={}, calc_error={}. Recording zero cost.", 
                                                   model_id_for_task, e, calc_err);
                                            bigdecimal::BigDecimal::from(0)
                                        }
                                    }
                                }
                            }
                        } else {
                            // Use pre-loaded model pricing and calculate using recorded token usage
                            match model_for_usage.calculate_token_cost(tracker.prompt_tokens, tracker.completion_tokens) {
                                Ok(cost) => cost,
                                Err(e) => {
                                    error!("CRITICAL: Failed to calculate cost for streaming model {}: {}. This indicates a system error with validated model data. Tokens: input={}, output={}", 
                                           model_id_for_task, e, tracker.prompt_tokens, tracker.completion_tokens);
                                    // This should never happen with valid model data from database
                                    // Log as critical error for monitoring systems
                                    bigdecimal::BigDecimal::from(0)
                                }
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
                        // CRITICAL: No usage data from OpenRouter and no content chunks processed
                        error!("CRITICAL: No usage data from OpenRouter and no content chunks processed for model {}. Recording zero cost. Request ID: {:?}, User ID: {}", model_id_for_task, request_id, user_id_for_task);
                        
                        let entry = ApiUsageEntryDto {
                            user_id: user_id_for_task,
                            service_name: model_id_for_task.clone(),
                            tokens_input: 0,
                            tokens_output: 0,
                            cost: bigdecimal::BigDecimal::from(0),
                            request_id: request_id.clone(),
                            metadata: Some(json!({"warning": "No usage data from provider and no content chunks processed. Zero cost recorded."})),
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
        language: Option<&str>,
    ) -> Result<Value, AppError> {
        // Determine model ID: override or database default (NO FALLBACKS!)
        let model_id = match model_override {
            Some(id) => id,
            None => self.get_default_transcription_model_id().await?,
        };
        
        // Check if user has access to this model
        self.billing_service.check_service_access(user_id, &model_id).await?;
        
        // Make the transcription request to Groq
        let (transcribed_text, headers) = self.groq_client.transcribe(audio_data, filename, &model_id, &user_id.to_string(), duration_ms, language).await?;
        
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
        
        // Calculate cost using model-specific pricing from database - transcription models must be duration-based
        let model = self.model_repository.find_by_id(&model_id).await
            .map_err(|e| AppError::Internal(format!("Failed to lookup transcription model {} in repository: {}", model_id, e)))?
            .ok_or_else(|| {
                error!("CRITICAL: Transcription model '{}' used in request but not found or inactive in database. Check model configuration.", model_id);
                AppError::Internal(format!("Transcription model '{}' used in request but not found or inactive in database. Check model configuration.", model_id))
            })?;
        
        // Validate transcription model is properly configured for duration-based pricing
        if !model.is_duration_based() {
            error!("CRITICAL: Transcription model '{}' is misconfigured as token-based. It must be duration-based. Review model configuration in database.", model_id);
            return Err(AppError::Configuration(format!(
                "Transcription model {} is not configured for duration-based pricing. All transcription models must use duration-based pricing with price_per_hour set.", 
                model_id
            )));
        }
        
        // Calculate duration-based cost with automatic minimum billing enforcement
        let final_cost_bd = model.calculate_duration_cost(duration_ms)
            .map_err(|e| AppError::Internal(format!("Failed to calculate duration cost for model {}: {}", model_id, e)))?;
        
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
            groq_client: self.groq_client.clone(),
            billing_service: self.billing_service.clone(),
            api_usage_repository: self.api_usage_repository.clone(),
            model_repository: self.model_repository.clone(),
            settings_repository: self.settings_repository.clone(),
            app_settings: self.app_settings.clone(),
        }
    }
}