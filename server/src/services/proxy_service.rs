use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, ApiUsageEntryDto};
use crate::db::repositories::model_repository::ModelRepository;
use crate::db::repositories::{SettingsRepository, DatabaseAIModelSettings, DatabaseTaskConfig};
use crate::clients::{OpenRouterClient, ReplicateClient, open_router_client::OpenRouterUsage};
use actix_web::web::{self, Bytes};
use futures_util::{Stream, StreamExt};
use log::{debug, error, info, warn};
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

/// Helper struct to track usage information during streaming
#[derive(Clone, Debug)]
struct StreamUsageTracker {
    prompt_tokens: i32,
    completion_tokens: i32,
    cost: Option<f64>,
    has_final_update: bool, // Flag to indicate we've received the final usage information
}

/// Transcription configuration settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionSettings {
    pub default_prompt: Option<String>,
    pub default_temperature: f32,
    pub default_language: Option<String>,
    pub model_config: DatabaseTaskConfig,
    pub user_preferences: Option<UserTranscriptionPreferences>,
}

/// User-specific transcription preferences
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserTranscriptionPreferences {
    pub preferred_language: Option<String>,
    pub custom_prompt: Option<String>,
    pub temperature_override: Option<f32>,
    pub model_override: Option<String>,
}

impl TranscriptionSettings {
    /// Create default transcription settings
    pub fn default() -> Self {
        Self {
            default_prompt: None,
            default_temperature: 0.0,
            default_language: None,
            model_config: DatabaseTaskConfig {
                model: "groq/whisper-large-v3-turbo".to_string(),
                max_tokens: 4096,
                temperature: 0.0,
            },
            user_preferences: None,
        }
    }

    /// Get effective prompt for transcription
    pub fn get_effective_prompt(&self) -> Option<String> {
        self.user_preferences
            .as_ref()
            .and_then(|prefs| prefs.custom_prompt.clone())
            .or_else(|| self.default_prompt.clone())
    }

    /// Get effective temperature for transcription
    pub fn get_effective_temperature(&self) -> f32 {
        self.user_preferences
            .as_ref()
            .and_then(|prefs| prefs.temperature_override)
            .unwrap_or(self.default_temperature)
    }

    /// Get effective language for transcription
    pub fn get_effective_language(&self) -> Option<String> {
        self.user_preferences
            .as_ref()
            .and_then(|prefs| prefs.preferred_language.clone())
            .or_else(|| self.default_language.clone())
    }

    /// Get effective model for transcription
    pub fn get_effective_model(&self) -> String {
        self.user_preferences
            .as_ref()
            .and_then(|prefs| prefs.model_override.clone())
            .unwrap_or_else(|| self.model_config.model.clone())
    }
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

/// Proxy service that routes requests through OpenRouter and Replicate
pub struct ProxyService {
    openrouter_client: OpenRouterClient,
    replicate_client: ReplicateClient,
    billing_service: Arc<BillingService>,
    api_usage_repository: Arc<ApiUsageRepository>,
    model_repository: Arc<ModelRepository>,
    settings_repository: Arc<SettingsRepository>,
    app_settings: crate::config::settings::AppSettings,
    // Cache for transcription settings to avoid repeated database queries
    transcription_settings_cache: Arc<Mutex<Option<TranscriptionSettings>>>,
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
        
        // Initialize Replicate client with app settings
        let replicate_client = ReplicateClient::new(app_settings)?;
        
        Ok(Self {
            openrouter_client,
            replicate_client,
            billing_service,
            api_usage_repository,
            model_repository,
            settings_repository,
            app_settings: app_settings.clone(),
            transcription_settings_cache: Arc::new(Mutex::new(None)),
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

    /// Get transcription settings from database configuration with caching
    async fn get_transcription_settings(&self) -> Result<TranscriptionSettings, AppError> {
        // Check cache first
        {
            let cache_guard = self.transcription_settings_cache.lock().await;
            if let Some(cached_settings) = cache_guard.as_ref() {
                return Ok(cached_settings.clone());
            }
        }

        // Load from database
        let settings = self.load_transcription_settings_from_db().await?;
        
        // Cache the settings
        {
            let mut cache_guard = self.transcription_settings_cache.lock().await;
            *cache_guard = Some(settings.clone());
        }

        Ok(settings)
    }

    /// Load transcription settings from database configuration
    async fn load_transcription_settings_from_db(&self) -> Result<TranscriptionSettings, AppError> {
        let ai_settings = self.settings_repository.get_ai_model_settings().await?;
        
        // Get voice_transcription task config
        let model_config = ai_settings.task_specific_configs
            .get("voice_transcription")
            .cloned()
            .unwrap_or_else(|| DatabaseTaskConfig {
                model: ai_settings.default_transcription_model_id.clone(),
                max_tokens: 4096,
                temperature: 0.0,
            });

        // Try to get transcription-specific configuration from database
        let transcription_config = self.get_transcription_config_from_db().await.unwrap_or_default();
        
        Ok(TranscriptionSettings {
            default_prompt: transcription_config.get("default_prompt")
                .and_then(|v| v.as_str())
                .map(String::from),
            default_temperature: transcription_config.get("default_temperature")
                .and_then(|v| v.as_f64())
                .map(|f| f as f32)
                .unwrap_or(model_config.temperature),
            default_language: transcription_config.get("default_language")
                .and_then(|v| v.as_str())
                .map(String::from),
            model_config,
            user_preferences: None, // Will be loaded per-user in get_user_transcription_preferences
        })
    }

    /// Get transcription configuration from database
    async fn get_transcription_config_from_db(&self) -> Result<serde_json::Map<String, serde_json::Value>, AppError> {
        let config_value = self.settings_repository
            .get_config_value("transcription_settings")
            .await?
            .unwrap_or_else(|| json!({}));
        
        match config_value {
            serde_json::Value::Object(map) => Ok(map),
            _ => Ok(serde_json::Map::new()),
        }
    }

    /// Get user-specific transcription preferences
    async fn get_user_transcription_preferences(&self, user_id: &Uuid) -> Result<Option<UserTranscriptionPreferences>, AppError> {
        // Try to get user preferences from database
        let config_key = format!("user_transcription_preferences_{}", user_id);
        let prefs_value = self.settings_repository
            .get_config_value(&config_key)
            .await?
            .unwrap_or_else(|| json!({}));
        
        match serde_json::from_value(prefs_value) {
            Ok(prefs) => Ok(Some(prefs)),
            Err(_) => Ok(None), // No user preferences or invalid format
        }
    }

    /// Get transcription settings with user preferences applied
    async fn get_user_transcription_settings(&self, user_id: &Uuid) -> Result<TranscriptionSettings, AppError> {
        let mut settings = self.get_transcription_settings().await?;
        settings.user_preferences = self.get_user_transcription_preferences(user_id).await?;
        Ok(settings)
    }

    /// Clear transcription settings cache
    pub async fn clear_transcription_settings_cache(&self) {
        let mut cache_guard = self.transcription_settings_cache.lock().await;
        *cache_guard = None;
        info!("Transcription settings cache cleared");
    }

    /// Validate transcription parameters
    fn validate_transcription_parameters(
        prompt: &Option<String>, 
        temperature: f32, 
        language: &Option<String>
    ) -> Result<(), AppError> {
        // Validate temperature range
        if temperature < 0.0 || temperature > 2.0 {
            return Err(AppError::Validation(
                "Temperature must be between 0.0 and 2.0 for transcription".to_string()
            ));
        }

        // Validate prompt length
        if let Some(p) = prompt {
            if p.len() > 1000 {
                return Err(AppError::Validation(
                    "Transcription prompt must be less than 1000 characters".to_string()
                ));
            }
        }

        // Validate language code (basic validation)
        if let Some(lang) = language {
            if lang.len() < 2 || lang.len() > 10 {
                return Err(AppError::Validation(
                    "Language code must be between 2 and 10 characters".to_string()
                ));
            }
        }

        Ok(())
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
    
    /// Forward a transcription request to Replicate (OpenAI GPT-4o with streaming support)
    pub async fn forward_transcription_request(
        &self,
        user_id: &Uuid,
        audio_data: &[u8],
        filename: &str,
        model_override: Option<String>,
        duration_ms: i64,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
    ) -> Result<Value, AppError> {
        // Determine model ID: override or database default (NO FALLBACKS!)
        let model_id = match model_override {
            Some(id) => id,
            None => self.get_default_transcription_model_id().await?,
        };
        
        // Check if user has access to this model
        self.billing_service.check_service_access(user_id, &model_id).await?;
        
        // Get user transcription settings for configuration
        let transcription_settings = self.get_user_transcription_settings(user_id).await?;
        
        // Determine effective parameters using user preferences and provided overrides
        let effective_language = language
            .map(String::from)
            .or_else(|| transcription_settings.get_effective_language());
        
        let effective_prompt = prompt
            .map(String::from)
            .or_else(|| transcription_settings.get_effective_prompt());
        
        let effective_temperature = temperature
            .unwrap_or_else(|| transcription_settings.get_effective_temperature());
        
        // Validate transcription parameters
        Self::validate_transcription_parameters(
            &effective_prompt, 
            effective_temperature, 
            &effective_language
        )?;
        
        debug!(
            "Transcribing with settings: model={}, language={:?}, prompt={}, temperature={}",
            model_id,
            effective_language,
            effective_prompt.as_ref().map(|p| format!("{}...", &p[..p.len().min(50)])).unwrap_or_else(|| "None".to_string()),
            effective_temperature
        );
        
        // Make the transcription request to Replicate with enhanced parameters
        let (transcribed_text, headers) = self.replicate_client.transcribe(
            audio_data, 
            filename, 
            effective_language.as_deref(),
            effective_prompt.as_deref(),
            Some(effective_temperature)
        ).await?;
        
        // Extract processing_ms and request_id from headers (Replicate may not provide these)
        let processing_ms = headers.get("x-processing-ms")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i32>().ok());
        let request_id = headers.get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .map(String::from)
            .or_else(|| Some(Uuid::new_v4().to_string()));
        
        // Calculate tokens for usage tracking
        // For Replicate OpenAI GPT-4o transcription, we use duration-based pricing
        let input_tokens = duration_ms / 1000; // Seconds as input unit for logging
        let output_tokens = (transcribed_text.len() / 4) as i32; // Approximate chars per token for output text
        
        // Calculate cost using model-specific pricing from database
        let model = self.model_repository.find_by_id(&model_id).await
            .map_err(|e| AppError::Internal(format!("Failed to lookup transcription model {} in repository: {}", model_id, e)))?
            .ok_or_else(|| {
                error!("CRITICAL: Transcription model '{}' used in request but not found or inactive in database. Check model configuration.", model_id);
                AppError::Internal(format!("Transcription model '{}' used in request but not found or inactive in database. Check model configuration.", model_id))
            })?;
        
        // Replicate pricing can be either duration-based or token-based depending on the model configuration
        let final_cost_bd = if model.is_duration_based() {
            // Use duration-based pricing for Replicate models
            model.calculate_duration_cost(duration_ms)
                .map_err(|e| AppError::Internal(format!("Failed to calculate duration cost for model {}: {}", model_id, e)))?
        } else {
            // Use token-based pricing if configured that way
            model.calculate_token_cost(input_tokens as i32, output_tokens)
                .map_err(|e| AppError::Internal(format!("Failed to calculate token cost for model {}: {}", model_id, e)))?
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
    
    /// Forward a streaming transcription request to Replicate (Server-Sent Events)
    pub async fn forward_streaming_transcription_request(
        &self,
        user_id: &Uuid,
        audio_data: &[u8],
        filename: &str,
        model_override: Option<String>,
        duration_ms: i64,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>, AppError> {
        // Determine model ID: override or database default
        let model_id = match model_override {
            Some(id) => id,
            None => self.get_default_transcription_model_id().await?,
        };
        
        // Check if user has access to this model
        self.billing_service.check_service_access(user_id, &model_id).await?;
        
        // Get user transcription settings for configuration
        let transcription_settings = self.get_user_transcription_settings(user_id).await?;
        
        // Determine effective parameters using user preferences and provided overrides
        let effective_language = language
            .map(String::from)
            .or_else(|| transcription_settings.get_effective_language());
        
        let effective_prompt = prompt
            .map(String::from)
            .or_else(|| transcription_settings.get_effective_prompt());
        
        let effective_temperature = temperature
            .unwrap_or_else(|| transcription_settings.get_effective_temperature());
        
        // Validate transcription parameters
        Self::validate_transcription_parameters(
            &effective_prompt, 
            effective_temperature, 
            &effective_language
        )?;
        
        debug!(
            "Streaming transcription with settings: model={}, language={:?}, prompt={}, temperature={}",
            model_id,
            effective_language,
            effective_prompt.as_ref().map(|p| format!("{}...", &p[..p.len().min(50)])).unwrap_or_else(|| "None".to_string()),
            effective_temperature
        );
        
        // Upload audio file to Replicate
        let audio_url = self.replicate_client.upload_audio_file(audio_data, filename).await?;
        
        // Create streaming prediction with enhanced parameters
        let prediction = self.replicate_client.create_transcription_prediction(
            audio_url, 
            effective_language.as_deref(),
            effective_prompt.as_deref(),
            Some(effective_temperature),
            true
        ).await?;
        
        // Get the stream URL
        let stream_url = prediction.urls
            .and_then(|urls| urls.stream)
            .ok_or_else(|| AppError::External("No streaming URL provided by Replicate".to_string()))?;
        
        // Start streaming transcription
        let stream = self.replicate_client.stream_transcription(&stream_url).await?;
        
        // Record basic usage for the transcription request (streaming usage will be recorded separately)
        let input_tokens = duration_ms / 1000;
        let model = self.model_repository.find_by_id(&model_id).await
            .map_err(|e| AppError::Internal(format!("Failed to lookup transcription model {}: {}", model_id, e)))?
            .ok_or_else(|| AppError::Internal(format!("Transcription model '{}' not found", model_id)))?;
        
        // Record initial usage entry (final cost will be updated when stream completes)
        let entry = ApiUsageEntryDto {
            user_id: *user_id,
            service_name: model_id.to_string(),
            tokens_input: input_tokens as i32,
            tokens_output: 0, // Will be updated when stream completes
            cost: bigdecimal::BigDecimal::from(0), // Will be updated when stream completes
            request_id: Some(prediction.id),
            metadata: None,
            processing_ms: None,
            input_duration_ms: Some(duration_ms),
        };
        self.api_usage_repository.record_usage(entry).await?;
        
        Ok(stream)
    }
    
    // OpenRouter provides accurate token usage information, so no estimation is needed
}

impl Clone for ProxyService {
    fn clone(&self) -> Self {
        Self {
            openrouter_client: self.openrouter_client.clone(),
            replicate_client: self.replicate_client.clone(),
            billing_service: self.billing_service.clone(),
            api_usage_repository: self.api_usage_repository.clone(),
            model_repository: self.model_repository.clone(),
            settings_repository: self.settings_repository.clone(),
            app_settings: self.app_settings.clone(),
            transcription_settings_cache: Arc::new(Mutex::new(None)), // Fresh cache for cloned instance
        }
    }
}