use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::db::repositories::api_usage_repository::{ApiUsageRepository, ApiUsageEntryDto};
use crate::db::repositories::model_repository::ModelRepository;
use crate::db::repositories::{SettingsRepository, DatabaseAIModelSettings, DatabaseTaskConfig};
use crate::clients::{OpenRouterClient, OpenAIClient, open_router_client::OpenRouterUsage};
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


/// Proxy service that routes requests through OpenRouter and OpenAI
pub struct ProxyService {
    openrouter_client: OpenRouterClient,
    openai_client: OpenAIClient,
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
        
        // Initialize OpenAI client with app settings
        let openai_client = OpenAIClient::new(app_settings)?;
        
        Ok(Self {
            openrouter_client,
            openai_client,
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
        self.billing_service.record_ai_service_usage(
            &entry.user_id,
            &entry.service_name,
            entry.tokens_input,
            entry.tokens_output,
            &entry.cost,
            entry.request_id,
            entry.metadata,
            entry.processing_ms,
            entry.input_duration_ms,
        ).await?;
        
        // Return the raw JSON response - actix-web will convert it to JSON
        Ok(serde_json::to_value(response)?)
    }
    
    /// Forward a streaming request to OpenRouter for chat completions
    pub async fn forward_chat_completions_stream_request(
        self: Arc<Self>,
        user_id: Uuid,
        payload: Value,
        model_id_override: Option<String>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static>>, AppError> {
        // Determine model ID: override > payload > database default
        let model_id = match model_id_override
            .or_else(|| payload.get("model").and_then(|v| v.as_str()).map(String::from))
        {
            Some(id) => id,
            None => self.get_default_llm_model_id().await?,
        };
        
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
        
        // Ensure payload has the determined model ID
        let mut request_payload = payload.clone();
        request_payload["model"] = serde_json::Value::String(model_id.clone());
        
        // Convert payload to OpenRouter chat request
        let request = self.openrouter_client.convert_to_chat_request(request_payload)?;
        
        // Clone required services and data for spawned task
        let billing_service = self.billing_service.clone();
        let model_repository = self.model_repository.clone();
        let openrouter_client = self.openrouter_client.clone();
        let user_id_clone = user_id;
        let model_id_clone = model_id.clone();
        
        // Create MPSC channel to decouple OpenRouter stream from client stream
        let (tx, rx) = tokio::sync::mpsc::channel::<Result<Bytes, std::io::Error>>(32);
        
        // Spawn task to process OpenRouter stream and track usage
        tokio::spawn(async move {
            let mut final_usage: Option<OpenRouterUsage> = None;
            
            // Get stream from OpenRouter
            match openrouter_client.stream_chat_completion(request, user_id_clone.to_string()).await {
                Ok((_, stream)) => {
                    let mut stream = stream;
                    
                    // Process each chunk from OpenRouter stream
                    while let Some(chunk_result) = stream.next().await {
                        match chunk_result {
                            Ok(bytes) => {
                                // Send raw bytes to client via MPSC sender
                                if tx.send(Ok(bytes.clone())).await.is_err() {
                                    break; // Client disconnected
                                }
                                
                                // Parse bytes as string and look for data: lines
                                let chunk_str = String::from_utf8_lossy(&bytes);
                                for line in chunk_str.lines() {
                                    if let Some(data_part) = line.strip_prefix("data: ") {
                                        if data_part.trim() != "[DONE]" {
                                            // Attempt to deserialize into OpenRouterStreamChunk
                                            if let Ok(chunk) = serde_json::from_str::<crate::clients::open_router_client::OpenRouterStreamChunk>(data_part) {
                                                // If chunk has usage object, update final_usage
                                                if let Some(usage) = chunk.usage {
                                                    final_usage = Some(usage);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                // Send error to client and break  
                                let _ = tx.send(Err(std::io::Error::new(std::io::ErrorKind::Other, format!("{}", e)))).await;
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    // Send error to client
                    let _ = tx.send(Err(std::io::Error::new(std::io::ErrorKind::Other, format!("{}", e)))).await;
                }
            }
            
            // After stream ends, record API usage if we have final_usage
            if let Some(usage) = final_usage {
                // Calculate cost using BigDecimal
                let final_cost_bd = if let Some(cost_f64) = usage.cost {
                    match bigdecimal::BigDecimal::try_from(cost_f64) {
                        Ok(bd) => bd,
                        Err(e) => {
                            error!("Failed to convert OpenRouter streaming cost {} to BigDecimal: {}", cost_f64, e);
                            bigdecimal::BigDecimal::from(0)
                        }
                    }
                } else {
                    bigdecimal::BigDecimal::from(0)
                };
                
                if let Err(e) = billing_service.record_ai_service_usage(
                    &user_id_clone,
                    &model_id_clone,
                    usage.prompt_tokens,
                    usage.completion_tokens,
                    &final_cost_bd,
                    None, // request_id
                    None, // metadata
                    None, // processing_ms
                    None, // input_duration_ms
                ).await {
                    error!("Failed to record AI service usage: {}", e);
                }
            } else {
                warn!("No usage data received from OpenRouter for model {} and user {}", model_id_clone, user_id_clone);
            }
        });
        
        // Return new stream from MPSC receiver for Actix-Web response
        let stream = Box::pin(futures_util::stream::unfold(rx, |mut rx| async move {
            match rx.recv().await {
                Some(item) => Some((item, rx)),
                None => None,
            }
        }));
        Ok(stream)
    }
    
    /// Forward a transcription request directly to OpenAI GPT-4o-transcribe
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
        // Determine model ID: override or database default
        let model_id = match model_override {
            Some(id) => id,
            None => self.get_default_transcription_model_id().await?,
        };
        
        // Map database model ID to OpenAI model name
        let openai_model = self.map_to_openai_model(&model_id)?;
        
        // Use provided parameters directly
        let effective_language = language.map(String::from);
        let effective_prompt = prompt.map(String::from);
        let effective_temperature = temperature.unwrap_or(0.0);
        
        debug!(
            "Transcribing with OpenAI: model={} (OpenAI: {}), language={:?}, prompt={}, temperature={}",
            model_id,
            openai_model,
            effective_language,
            effective_prompt.as_ref().map(|p| format!("{}...", &p[..p.len().min(50)])).unwrap_or_else(|| "None".to_string()),
            effective_temperature
        );
        
        // Make the transcription request directly to OpenAI
        let transcribed_text = self.openai_client.transcribe_audio(
            audio_data,
            filename,
            &openai_model,
            effective_language.as_deref(),
            effective_prompt.as_deref(),
            Some(effective_temperature),
        ).await?;
        
        // Generate request ID for tracking
        let request_id = Some(Uuid::new_v4().to_string());
        
        // Calculate tokens for usage tracking
        // For OpenAI transcription, we use duration-based pricing
        let input_tokens = duration_ms / 1000; // Seconds as input unit for logging
        let output_tokens = (transcribed_text.len() / 4) as i32; // Approximate chars per token for output text
        
        // Calculate cost using model-specific pricing from database
        let model = self.model_repository.find_by_id(&model_id).await
            .map_err(|e| AppError::Internal(format!("Failed to lookup transcription model {} in repository: {}", model_id, e)))?
            .ok_or_else(|| {
                error!("CRITICAL: Transcription model '{}' used in request but not found or inactive in database. Check model configuration.", model_id);
                AppError::Internal(format!("Transcription model '{}' used in request but not found or inactive in database. Check model configuration.", model_id))
            })?;
        
        // OpenAI pricing is typically duration-based for transcription
        let final_cost_bd = if model.is_duration_based() {
            // Use duration-based pricing for OpenAI models
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
            processing_ms: None, // OpenAI doesn't provide processing time in headers
            input_duration_ms: Some(duration_ms),
        };
        self.billing_service.record_ai_service_usage(
            &entry.user_id,
            &entry.service_name,
            entry.tokens_input,
            entry.tokens_output,
            &entry.cost,
            entry.request_id,
            entry.metadata,
            entry.processing_ms,
            entry.input_duration_ms,
        ).await?;
        
        // Return as JSON in the same format
        Ok(json!({ "text": transcribed_text }))
    }

    /// Map database model ID to OpenAI model name
    fn map_to_openai_model(&self, model_id: &str) -> Result<String, AppError> {
        // Map common model IDs to OpenAI model names
        let openai_model = match model_id {
            "openai/gpt-4o-transcribe" => "gpt-4o-transcribe",
            "openai/gpt-4o-mini-transcribe" => "gpt-4o-mini-transcribe",
            "gpt-4o-transcribe" => "gpt-4o-transcribe",
            "gpt-4o-mini-transcribe" => "gpt-4o-mini-transcribe",
            _ => {
                // For unknown models, default to gpt-4o-mini-transcribe (cheaper option)
                info!("Unknown model '{}', defaulting to gpt-4o-mini-transcribe", model_id);
                "gpt-4o-mini-transcribe"
            }
        };
        
        Ok(openai_model.to_string())
    }
    
    
    /// Forward a batch transcription request directly to OpenAI (non-streaming version)
    pub async fn forward_batch_transcription_request(
        &self,
        user_id: &Uuid,
        audio_data: Vec<u8>,
        filename: &str,
        duration_ms: u32,
        chunk_index: u32,
        model_override: Option<String>,
        language: Option<String>,
        prompt: Option<String>,
        temperature: Option<f32>,
    ) -> Result<serde_json::Value, AppError> {
        // Determine model ID: override or database default
        let model_id = match model_override {
            Some(id) => id,
            None => self.get_default_transcription_model_id().await?,
        };
        
        // Map database model ID to OpenAI model name
        let openai_model = self.map_to_openai_model(&model_id)?;
        
        // Use provided parameters directly
        let effective_language = language;
        let effective_prompt = prompt;
        let effective_temperature = temperature.unwrap_or(0.0);
        
        debug!(
            "Batch transcribing chunk {} with OpenAI: model={} (OpenAI: {}), language={:?}, prompt={}, temperature={}",
            chunk_index,
            model_id,
            openai_model,
            effective_language,
            effective_prompt.as_ref().map(|p| format!("{}...", &p[..p.len().min(50)])).unwrap_or_else(|| "None".to_string()),
            effective_temperature
        );
        
        // Make the transcription request directly to OpenAI
        let transcribed_text = self.openai_client.transcribe_audio(
            &audio_data,
            filename,
            &openai_model,
            effective_language.as_deref(),
            effective_prompt.as_deref(),
            Some(effective_temperature),
        ).await?;
        
        // Generate request ID for tracking
        let request_id = Some(Uuid::new_v4().to_string());
        
        // Calculate tokens for usage tracking
        let duration_ms_i64 = duration_ms as i64;
        let input_tokens = duration_ms_i64 / 1000; // Seconds as input unit for logging
        let output_tokens = (transcribed_text.len() / 4) as i32; // Approximate chars per token for output text
        
        // Calculate cost using model-specific pricing from database
        let model = self.model_repository.find_by_id(&model_id).await
            .map_err(|e| AppError::Internal(format!("Failed to lookup transcription model {} in repository: {}", model_id, e)))?
            .ok_or_else(|| {
                error!("CRITICAL: Transcription model '{}' used in request but not found or inactive in database. Check model configuration.", model_id);
                AppError::Internal(format!("Transcription model '{}' used in request but not found or inactive in database. Check model configuration.", model_id))
            })?;
        
        // OpenAI pricing is typically duration-based for transcription
        let final_cost_bd = if model.is_duration_based() {
            // Use duration-based pricing for OpenAI models
            model.calculate_duration_cost(duration_ms_i64)
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
            processing_ms: None, // OpenAI doesn't provide processing time in headers
            input_duration_ms: Some(duration_ms_i64),
        };
        self.billing_service.record_ai_service_usage(
            &entry.user_id,
            &entry.service_name,
            entry.tokens_input,
            entry.tokens_output,
            &entry.cost,
            entry.request_id,
            entry.metadata,
            entry.processing_ms,
            entry.input_duration_ms,
        ).await?;
        
        // Return as JSON with the specific format expected by batch processing
        Ok(json!({ 
            "text": transcribed_text,
            "chunkIndex": chunk_index
        }))
    }
    
    // OpenRouter provides accurate token usage information, so no estimation is needed
}

impl Clone for ProxyService {
    fn clone(&self) -> Self {
        Self {
            openrouter_client: self.openrouter_client.clone(),
            openai_client: self.openai_client.clone(),
            billing_service: self.billing_service.clone(),
            api_usage_repository: self.api_usage_repository.clone(),
            model_repository: self.model_repository.clone(),
            settings_repository: self.settings_repository.clone(),
            app_settings: self.app_settings.clone(),
        }
    }
}