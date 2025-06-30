use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use tracing::{debug, error, info, instrument, warn};
use uuid::{self, Uuid};
use chrono;
use crate::error::AppError;
use crate::middleware::secure_auth::UserId;
use crate::clients::{
    OpenRouterClient, OpenAIClient, AnthropicClient, GoogleClient
};
use crate::utils::transcription_validation::{
    mime_type_to_extension, validate_server_language, validate_server_prompt, 
    validate_server_temperature, validate_server_audio_file, RequestValidationContext
};
use crate::clients::open_router_client::{OpenRouterStreamChunk, OpenRouterStreamChoice, OpenRouterStreamDelta, OpenRouterUsage};
use crate::clients::google_client::GoogleStreamChunk;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::models::model_pricing::ModelPricing;
use crate::services::billing_service::BillingService;
use crate::config::settings::AppSettings;
use bigdecimal::BigDecimal;

use futures_util::{StreamExt, TryStreamExt, TryFutureExt};
use serde::{Deserialize, Serialize};
use base64::Engine;
use actix_multipart::Multipart;

/// Helper function to determine if an error should trigger a fallback to OpenRouter
fn is_fallback_error(error: &AppError) -> bool {
    match error {
        AppError::External(_) => true,
        AppError::TooManyRequests(_) => true, 
        AppError::BadRequest(msg) => msg.contains("rate limit") || msg.contains("quota") || msg.contains("capacity"),
        _ => false,
    }
}

/// Manages token accumulation and single billing operation for streaming requests
struct StreamingBillingManager {
    user_id: uuid::Uuid,
    model_id: String,
    request_id: String,
    billing_service: Arc<BillingService>,
    total_input_tokens: i32,
    total_output_tokens: i32,
    is_billed: bool,
}

impl StreamingBillingManager {
    fn new(user_id: uuid::Uuid, model_id: String, request_id: String, billing_service: Arc<BillingService>) -> Self {
        Self {
            user_id,
            model_id,
            request_id,
            billing_service,
            total_input_tokens: 0,
            total_output_tokens: 0,
            is_billed: false,
        }
    }
    
    fn update_tokens(&mut self, input: i32, output: i32) {
        self.total_input_tokens = self.total_input_tokens.max(input);
        self.total_output_tokens = self.total_output_tokens.max(output);
    }
    
    async fn finalize_billing(&mut self) -> Result<BigDecimal, AppError> {
        if self.is_billed || (self.total_input_tokens == 0 && self.total_output_tokens == 0) {
            return Ok(BigDecimal::from(0));
        }
        
        self.is_billed = true;
        
        let entry = ApiUsageEntryDto {
            user_id: self.user_id,
            service_name: self.model_id.clone(),
            tokens_input: self.total_input_tokens,
            tokens_output: self.total_output_tokens,
            cached_input_tokens: 0,
            cache_write_tokens: 0,
            cache_read_tokens: 0,
            request_id: Some(self.request_id.clone()),
            metadata: None,
            processing_ms: None,
            input_duration_ms: None,
        };
        
        match self.billing_service.charge_for_api_usage(entry).await {
            Ok((api_usage_record, _)) => {
                info!("Finalized streaming billing for request {} with cost: {}", self.request_id, api_usage_record.cost);
                Ok(api_usage_record.cost)
            },
            Err(e) => {
                error!("Failed to finalize streaming billing for request {}: {}", self.request_id, e);
                Err(e)
            }
        }
    }
}

/// Drop guard to ensure billing is finalized even if client disconnects
struct BillingOnDrop {
    manager: Arc<Mutex<StreamingBillingManager>>,
}

impl BillingOnDrop {
    fn new(manager: Arc<Mutex<StreamingBillingManager>>) -> Self {
        Self { manager }
    }
}

impl Drop for BillingOnDrop {
    fn drop(&mut self) {
        if let Ok(mut manager) = self.manager.lock() {
            if !manager.is_billed && (manager.total_input_tokens > 0 || manager.total_output_tokens > 0) {
                warn!("Streaming request {} dropped without billing finalization - tokens may be unbilled", manager.request_id);
            }
        }
    }
}

/// Helper function to create API usage entry for billing with cached token support
fn create_api_usage_entry_with_cache(
    user_id: Uuid, 
    model_id: String, 
    tokens_input: i32, 
    tokens_output: i32, 
    cache_write_tokens: i32, 
    cache_read_tokens: i32, 
    request_id: String, 
    duration_ms: Option<i64>
) -> ApiUsageEntryDto {
    ApiUsageEntryDto {
        user_id,
        service_name: model_id,
        tokens_input,
        tokens_output,
        cached_input_tokens: cache_write_tokens + cache_read_tokens,
        cache_write_tokens,
        cache_read_tokens,
        request_id: Some(request_id),
        metadata: None,
        processing_ms: None,
        input_duration_ms: duration_ms,
    }
}

/// Helper function to create API usage entry for billing (backward compatibility)
fn create_api_usage_entry(user_id: Uuid, model_id: String, tokens_input: i32, tokens_output: i32, request_id: String, duration_ms: Option<i64>) -> ApiUsageEntryDto {
    create_api_usage_entry_with_cache(user_id, model_id, tokens_input, tokens_output, 0, 0, request_id, duration_ms)
}

/// Helper function to extract cached token information from client response tuple
/// When clients are updated to return (uncached_tokens, cache_write_tokens, cache_read_tokens, output_tokens)
/// this function will map the tuple values to the correct DTO fields
fn extract_cached_token_info(client_response: (i32, i32, i32, i32)) -> (i32, i32, i32, i32) {
    let (uncached_tokens, cache_write_tokens, cache_read_tokens, output_tokens) = client_response;
    (uncached_tokens, cache_write_tokens, cache_read_tokens, output_tokens)
}

/// Helper function to create standardized OpenRouter usage response
fn create_openrouter_usage(tokens_input: i32, tokens_output: i32, cost: &BigDecimal) -> Result<OpenRouterUsage, AppError> {
    Ok(OpenRouterUsage {
        prompt_tokens: tokens_input,
        completion_tokens: tokens_output,
        total_tokens: tokens_input + tokens_output,
        cost: Some(cost.to_string().parse::<f64>().unwrap_or(0.0)),
    })
}

/// Helper function to set up streaming billing manager and guard
fn setup_streaming_billing(user_id: Uuid, model_id: String, billing_service: Arc<BillingService>) -> (Arc<Mutex<StreamingBillingManager>>, BillingOnDrop) {
    let request_id = uuid::Uuid::new_v4().to_string();
    let billing_manager = Arc::new(Mutex::new(StreamingBillingManager::new(
        user_id,
        model_id,
        request_id,
        billing_service
    )));
    let billing_guard = BillingOnDrop::new(Arc::clone(&billing_manager));
    (billing_manager, billing_guard)
}

#[derive(Deserialize, Serialize, Clone)]
pub struct LlmCompletionRequest {
    pub model: String,
    pub messages: Vec<Value>,
    pub stream: Option<bool>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub duration_ms: Option<i64>,
    #[serde(flatten)]
    pub other: HashMap<String, Value>,
}

/// AI proxy handler for intelligent model routing
/// Routes requests to appropriate AI providers based on model configuration
#[instrument(skip(payload, app_settings, billing_service, model_repository, user_id))]
pub async fn llm_chat_completion_handler(
    payload: web::Json<LlmCompletionRequest>,
    user_id: UserId,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<BillingService>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    // User ID is already extracted by authentication middleware
    let user_id = user_id.0;
    
    info!("Processing LLM chat completion request for user: {}", user_id);
    
    // Check if user has sufficient credits
    let balance = billing_service.get_credit_service().get_user_balance(&user_id).await?;
    if balance.balance <= BigDecimal::from(0) {
        warn!("Insufficient credits for user: {}", user_id);
        return Err(AppError::CreditInsufficient("Insufficient credits for AI service usage".to_string()));
    }
    
    // Extract model ID from request payload
    let model_id = payload.model.clone();
    debug!("Routing request for model: {}", model_id);
    
    // Look up model with provider information
    let model_with_provider = model_repository
        .find_by_id_with_provider(&model_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found or inactive", model_id)))?;
    
    info!("Routing to provider: {} for model: {}", model_with_provider.provider_code, model_with_provider.name);
    
    // Check if request is streaming
    let is_streaming = payload.stream.unwrap_or(false);
    
    // Extract duration_ms for cost calculation
    let _duration_ms = payload.duration_ms;
    
    // Extract payload for different handler types
    let payload_inner = payload.into_inner();
    let payload_value = serde_json::to_value(&payload_inner)?;
    
    // Route to appropriate provider based on provider_code
    match model_with_provider.provider_code.as_str() {
        "openai" => {
            if is_streaming {
                handle_openai_streaming_request(payload_inner.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            } else {
                handle_openai_request(payload_inner, &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            }
        },
        "anthropic" => {
            if is_streaming {
                handle_anthropic_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            } else {
                handle_anthropic_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            }
        },
        "google" => {
            if is_streaming {
                handle_google_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            } else {
                handle_google_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            }
        },
        "deepseek" => {
            // Route DeepSeek models through OpenRouter
            if is_streaming {
                handle_openrouter_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            } else {
                handle_openrouter_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            }
        },
        "openrouter" => {
            // Route OpenRouter models
            if is_streaming {
                handle_openrouter_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            } else {
                handle_openrouter_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service)).await
            }
        },
        _ => {
            error!("Unsupported provider: {}", model_with_provider.provider_code);
            Err(AppError::BadRequest(format!("Provider '{}' is not supported", model_with_provider.provider_code)))
        }
    }
}

/// Handle OpenAI non-streaming request
async fn handle_openai_request(
    payload: LlmCompletionRequest,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let client = OpenAIClient::new(app_settings)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    // Convert LlmCompletionRequest to Value for client conversion and clone for fallback use
    let payload_value = serde_json::to_value(&payload)?;
    let payload_value_clone = payload_value.clone();
    let mut request = client.convert_to_openai_request(payload_value)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (response, _headers, tokens_input, cache_write_tokens, cache_read_tokens, tokens_output) = match client.chat_completion(request).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] OpenAI request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_request(payload_value_clone, model, user_id, app_settings, billing_service).await;
            }
            return Err(error);
        }
    };
    
    // Create API usage entry and bill atomically with auto top-off integration
    let entry = create_api_usage_entry_with_cache(*user_id, model.id.clone(), tokens_input, tokens_output, cache_write_tokens, cache_read_tokens, request_id, None);
    
    let (api_usage_record, _user_credit) = billing_service
        .charge_for_api_usage(entry)
        .await?;
    let cost = api_usage_record.cost;
    
    // Convert to OpenRouter format for consistent client parsing with standardized usage
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage = create_openrouter_usage(tokens_input, tokens_output, &cost)?;
        obj.insert("usage".to_string(), serde_json::to_value(usage)?);
    }
    
    Ok(HttpResponse::Ok().json(response_value))
}

/// Handle OpenAI streaming request
async fn handle_openai_streaming_request(
    payload: LlmCompletionRequest,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let client = OpenAIClient::new(app_settings)?;
    // Convert LlmCompletionRequest to Value for client conversion and clone for fallback use
    let payload_value = serde_json::to_value(&payload)?;
    let payload_value_clone = payload_value.clone();
    let mut request = client.convert_to_openai_request(payload_value)?;
    
    // Set the original model ID (with :web) for tool detection, but cleaned model for API calls
    request.model = model.id.clone(); // Keep original for tool detection in prepare_request_body
    
    let (headers, stream, _token_counter) = match client.stream_chat_completion(request).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] OpenAI streaming request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_streaming_request(payload_value_clone, model, user_id, app_settings, billing_service).await;
            }
            return Err(error);
        }
    };
    
    let (billing_manager, _billing_guard) = setup_streaming_billing(*user_id, model.id.clone(), Arc::clone(&billing_service));
    let request_id = {
        let manager = billing_manager.lock().unwrap();
        manager.request_id.clone()
    };
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let billing_service_clone = Arc::clone(&billing_service);
    let _duration_ms = payload.duration_ms;
    
    let processed_stream = stream.then(move |chunk_result| {
        let billing_service_inner = billing_service_clone.clone();
        let model_id = model_clone.id.clone();
        let user_id = user_id_clone;
        let billing_manager_clone = Arc::clone(&billing_manager);
        let request_id_clone = request_id.clone();
        
        async move {
            match chunk_result {
                Ok(bytes) => {
                    if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                        // Extract tokens from chunk if available
                        if let Some((current_input, cache_write_tokens, cache_read_tokens, current_output)) = OpenAIClient::extract_tokens_from_chat_stream_chunk(chunk_str) {
                            // Always update tokens when extracted
                            {
                                let mut manager = billing_manager_clone.lock().unwrap();
                                manager.update_tokens(current_input, current_output);
                            }
                            
                            // This chunk contains usage data, so it's the final chunk
                            let mut manager = billing_manager_clone.lock().unwrap();
                            if let Ok(cost) = manager.finalize_billing().await {
                                if let Ok(modified_chunk) = add_cost_to_openai_stream_chunk(chunk_str, &cost) {
                                    return Ok(web::Bytes::from(modified_chunk));
                                }
                            }
                        } else {
                            // Check for finish_reason in chunks without usage data (content completion)
                            let has_finish_reason = chunk_str.contains("\"finish_reason\":");
                            let is_done_marker = chunk_str.contains("[DONE]");
                            
                            if has_finish_reason || is_done_marker {
                                // This could be the final chunk, attempt finalization once
                                let mut manager = billing_manager_clone.lock().unwrap();
                                if let Ok(cost) = manager.finalize_billing().await {
                                    if cost > BigDecimal::from(0) {
                                        // Only modify chunk if we actually billed something
                                        if let Ok(modified_chunk) = add_cost_to_openai_stream_chunk(chunk_str, &cost) {
                                            return Ok(web::Bytes::from(modified_chunk));
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Ok(bytes)
                },
                Err(e) => Err(e)
            }
        }
    });
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(processed_stream))
}

/// Handle Anthropic non-streaming request
async fn handle_anthropic_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = AnthropicClient::new(app_settings)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (response, _headers, tokens_input, _cache_write, _cache_read, tokens_output) = match client.chat_completion(request, &user_id.to_string()).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] Anthropic request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_request(payload_clone, model, user_id, app_settings, billing_service).await;
            } else {
                return Err(error);
            }
        }
    };
    
    // Token counts already extracted from client method
    
    // Create API usage entry and bill atomically with auto top-off integration
    let entry = create_api_usage_entry_with_cache(*user_id, model.id.clone(), tokens_input, tokens_output, 0, 0, request_id, None);
    
    let (api_usage_record, _user_credit) = billing_service
        .charge_for_api_usage(entry)
        .await?;
    let cost = api_usage_record.cost;
    
    // Transform Anthropic response to OpenRouter format for consistent client parsing
    let usage = create_openrouter_usage(tokens_input, tokens_output, &cost)?;
    
    let openrouter_response = json!({
        "id": response.id,
        "object": "chat.completion",
        "created": chrono::Utc::now().timestamp(),
        "model": response.model,
        "choices": [{
            "index": 0,
            "message": {
                "role": response.role,
                "content": response.content.get(0).map(|c| c.text.as_str()).unwrap_or("")
            },
            "finish_reason": response.stop_reason
        }],
        "usage": serde_json::to_value(usage)?
    });
    
    Ok(HttpResponse::Ok().json(openrouter_response))
}

/// Handle Anthropic streaming request
async fn handle_anthropic_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = AnthropicClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (_headers, stream) = match client.stream_chat_completion(request, user_id.to_string()).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] Anthropic streaming request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_streaming_request(payload_clone, model, user_id, app_settings, billing_service).await;
            } else {
                return Err(error);
            }
        }
    };
    
    let request_id = uuid::Uuid::new_v4().to_string();
    let billing_manager = Arc::new(Mutex::new(StreamingBillingManager::new(
        *user_id,
        model.id.clone(),
        request_id.clone(),
        Arc::clone(&billing_service)
    )));
    let _billing_guard = BillingOnDrop::new(Arc::clone(&billing_manager));
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let billing_service_clone = Arc::clone(&billing_service);
    
    let processed_stream = stream.then(move |chunk_result| {
        let billing_manager_clone = Arc::clone(&billing_manager);
        
        async move {
            match chunk_result {
                Ok(bytes) => {
                    if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                        // Always extract and update tokens when available
                        if let Some((current_input, _cache_write, _cache_read, current_output)) = AnthropicClient::extract_tokens_from_stream_chunk(chunk_str) {
                            let mut manager = billing_manager_clone.lock().unwrap();
                            manager.update_tokens(current_input, current_output);
                        }
                        
                        // Check if this is the final chunk (message_stop event)
                        let is_final_chunk = chunk_str.contains("\"type\":\"message_stop\"");
                        if is_final_chunk {
                            let mut manager = billing_manager_clone.lock().unwrap();
                            if let Ok(cost) = manager.finalize_billing().await {
                                if let Ok(modified_chunk) = add_cost_to_anthropic_stream_chunk(chunk_str, &cost) {
                                    return Ok(web::Bytes::from(modified_chunk));
                                }
                            }
                        }
                    }
                    Ok(bytes)
                },
                Err(e) => Err(e)
            }
        }
    });
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(processed_stream))
}

/// Handle Google non-streaming request
async fn handle_google_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = GoogleClient::new(app_settings)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    let request = client.convert_to_chat_request_with_capabilities(payload, Some(&model.capabilities))?;
    
    let (response, _headers, tokens_input, _cache_write, _cache_read, tokens_output) = match client.chat_completion(request, &model.api_model_id, &user_id.to_string()).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] Google request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_request(payload_clone, model, user_id, app_settings, billing_service).await;
            }
            return Err(error);
        }
    };
    
    // Token counts already extracted from client method
    
    // Create API usage entry and bill atomically with auto top-off integration
    let entry = create_api_usage_entry_with_cache(*user_id, model.id.clone(), tokens_input, tokens_output, 0, 0, request_id, None);
    
    let (api_usage_record, _user_credit) = billing_service
        .charge_for_api_usage(entry)
        .await?;
    let cost = api_usage_record.cost;
    
    // Transform Google response to OpenRouter format for consistent client parsing
    let response_value = serde_json::to_value(&response)?;
    let content = response_value["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("");
    
    let usage = create_openrouter_usage(tokens_input, tokens_output, &cost)?;
    
    let openrouter_response = json!({
        "id": format!("chatcmpl-{}", uuid::Uuid::new_v4()),
        "object": "chat.completion",
        "created": chrono::Utc::now().timestamp(),
        "model": model.id,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": content
            },
            "finish_reason": "stop"
        }],
        "usage": serde_json::to_value(usage)?
    });
    
    Ok(HttpResponse::Ok().json(openrouter_response))
}

/// Handle Google streaming request
async fn handle_google_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = GoogleClient::new(app_settings)?;
    let request = client.convert_to_chat_request_with_capabilities(payload, Some(&model.capabilities))?;
    
    let (headers, stream) = match client.stream_chat_completion(request, model.api_model_id.clone(), user_id.to_string()).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] Google streaming request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_streaming_request(payload_clone, model, user_id, app_settings, billing_service).await;
            }
            return Err(error);
        }
    };
    
    let request_id = uuid::Uuid::new_v4().to_string();
    let billing_manager = Arc::new(Mutex::new(StreamingBillingManager::new(
        *user_id,
        model.id.clone(),
        request_id.clone(),
        Arc::clone(&billing_service)
    )));
    let _billing_guard = BillingOnDrop::new(Arc::clone(&billing_manager));
    
    // Create a stream processor to track tokens and calculate cost
    let model_id_for_response = model.id.clone();
    
    let processed_stream = stream.then(move |chunk_result| {
        let model_id_for_chunk = model_id_for_response.clone();
        let billing_manager_clone = Arc::clone(&billing_manager);
        
        async move {
            match chunk_result {
                Ok(bytes) => {
                    if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                        let mut output_chunks = Vec::new();
                        let mut has_done_marker = false;
                        
                        for line in chunk_str.lines() {
                            if line.starts_with("data: ") {
                                let json_str = &line[6..]; // Remove "data: " prefix
                                if json_str.trim() == "[DONE]" {
                                    has_done_marker = true;
                                    break;
                                }
                                
                                match serde_json::from_str::<GoogleStreamChunk>(json_str.trim()) {
                                    Ok(google_chunk) => {
                                        // Convert Google chunk to OpenRouter format
                                        let openrouter_chunk = convert_google_to_openrouter_chunk(google_chunk, &model_id_for_chunk);
                                        
                                        // Accumulate tokens if usage metadata is present
                                        if let Some(ref usage) = openrouter_chunk.usage {
                                            let mut manager = billing_manager_clone.lock().unwrap();
                                            manager.update_tokens(usage.prompt_tokens, usage.completion_tokens);
                                        }
                                        
                                        // Serialize and add to output
                                        match serde_json::to_string(&openrouter_chunk) {
                                            Ok(json_str) => {
                                                output_chunks.push(format!("data: {}\n\n", json_str));
                                            },
                                            Err(e) => {
                                                error!("Failed to serialize OpenRouter chunk: {}", e);
                                            }
                                        }
                                    },
                                    Err(e) => {
                                        error!("Failed to parse Google stream chunk: {}", e);
                                    }
                                }
                            }
                        }
                        
                        // Handle [DONE] marker - finalize billing exactly once
                        if has_done_marker {
                            let manager_guard = billing_manager_clone.lock().unwrap();
                            let input_tokens = manager_guard.total_input_tokens;
                            let output_tokens = manager_guard.total_output_tokens;
                            drop(manager_guard);
                            
                            // Only finalize if we have accumulated tokens
                            if input_tokens > 0 || output_tokens > 0 {
                                let mut manager = billing_manager_clone.lock().unwrap();
                                if let Ok(cost) = manager.finalize_billing().await {
                                    // Create final usage chunk with cost information
                                    let final_usage_chunk = OpenRouterStreamChunk {
                                        id: format!("chatcmpl-{}", uuid::Uuid::new_v4()),
                                        choices: vec![],
                                        created: Some(chrono::Utc::now().timestamp()),
                                        model: model_id_for_chunk.clone(),
                                        object: Some("chat.completion.chunk".to_string()),
                                        usage: Some(OpenRouterUsage {
                                            prompt_tokens: input_tokens,
                                            completion_tokens: output_tokens,
                                            total_tokens: input_tokens + output_tokens,
                                            cost: Some(cost.to_string().parse::<f64>().unwrap_or(0.0)),
                                        }),
                                    };
                                    
                                    match serde_json::to_string(&final_usage_chunk) {
                                        Ok(json_str) => {
                                            output_chunks.push(format!("data: {}\n\n", json_str));
                                        },
                                        Err(e) => {
                                            error!("Failed to serialize final usage chunk: {}", e);
                                        }
                                    }
                                }
                            }
                            
                            // Always add the [DONE] marker at the end
                            output_chunks.push("data: [DONE]\n\n".to_string());
                            return Ok(web::Bytes::from(output_chunks.join("")));
                        }
                        
                        // Return all processed chunks for this batch
                        if !output_chunks.is_empty() {
                            return Ok(web::Bytes::from(output_chunks.join("")));
                        }
                    }
                    // Never forward raw bytes - return empty bytes instead
                    Ok(web::Bytes::new())
                },
                Err(e) => Err(e)
            }
        }
    });
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(processed_stream))
}

/// Handle OpenRouter (DeepSeek) non-streaming request
async fn handle_openrouter_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    let mut request = client.convert_to_chat_request(payload)?;
    
    request.model = model.id.clone();
    
    let (response, _headers, tokens_input, _cache_write, _cache_read, tokens_output) = client.chat_completion(request, &user_id.to_string()).await?;
    
    // Token counts already extracted from client method (ignore OpenRouter's cost calculation)
    
    // Create API usage entry and bill atomically with auto top-off integration
    let entry = create_api_usage_entry_with_cache(*user_id, model.id.clone(), tokens_input, tokens_output, 0, 0, request_id, None);
    
    let (api_usage_record, _user_credit) = billing_service
        .charge_for_api_usage(entry)
        .await?;
    let cost = api_usage_record.cost;
    
    // Replace OpenRouter's cost with server-calculated cost in response using standardized usage
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage = create_openrouter_usage(tokens_input, tokens_output, &cost)?;
        obj.insert("usage".to_string(), serde_json::to_value(usage)?);
    }
    
    Ok(HttpResponse::Ok().json(response_value))
}

/// Handle OpenRouter (DeepSeek) streaming request
async fn handle_openrouter_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    request.model = model.id.clone();
    
    let (_headers, stream) = client.stream_chat_completion(request, user_id.to_string()).await?;
    
    let request_id = uuid::Uuid::new_v4().to_string();
    let billing_manager = Arc::new(Mutex::new(StreamingBillingManager::new(
        *user_id,
        model.id.clone(),
        request_id.clone(),
        Arc::clone(&billing_service)
    )));
    let _billing_guard = BillingOnDrop::new(Arc::clone(&billing_manager));
    
    // Create a stream processor to intercept final chunk with usage data
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let billing_service_clone = Arc::clone(&billing_service);
    
    let processed_stream = stream.then(move |chunk_result| {
        let billing_service_inner = billing_service_clone.clone();
        let model_id = model_clone.id.clone();
        let user_id = user_id_clone;
        let billing_manager_clone = Arc::clone(&billing_manager);
        let request_id_clone = request_id.clone();
        
        async move {
            match chunk_result {
                Ok(bytes) => {
                    if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                        // Check if this chunk contains usage data (final chunk)
                        if let Some((current_input, _cache_write, _cache_read, current_output)) = OpenRouterClient::extract_tokens_from_stream_chunk(chunk_str) {
                            let mut manager = billing_manager_clone.lock().unwrap();
                            manager.update_tokens(current_input, current_output);
                            
                            // This is the final chunk since it contains usage data
                            if let Ok(cost) = manager.finalize_billing().await {
                                if let Ok(modified_chunk) = replace_cost_in_openrouter_stream_chunk(chunk_str, &cost) {
                                    return Ok(web::Bytes::from(modified_chunk));
                                }
                            }
                        }
                    }
                    Ok(bytes)
                },
                Err(e) => Err(e)
            }
        }
    });
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(processed_stream))
}


#[derive(Serialize)]
pub struct TranscriptionResponse {
    text: String,
}

/// Handle audio transcription (multipart form) - mimics OpenAI's /v1/audio/transcriptions
#[instrument(skip(payload, user_id, app_settings, billing_service, model_repository))]
pub async fn transcription_handler(
    mut payload: Multipart,
    user_id: UserId,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<BillingService>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let user_id = user_id.0;
    info!("Processing transcription request for user: {}", user_id);

    // Check if user has sufficient credits
    let balance = billing_service.get_credit_service().get_user_balance(&user_id).await?;
    if balance.balance <= BigDecimal::from(0) {
        warn!("Insufficient credits for user: {}", user_id);
        return Err(AppError::CreditInsufficient("Insufficient credits for transcription service usage".to_string()));
    }

    let mut model = String::new();
    let mut file_data = Vec::new();
    let mut filename = String::new();
    let mut language: Option<String> = None;
    let mut prompt: Option<String> = None;
    let mut temperature: Option<f32> = None;
    let mut mime_type: Option<String> = None;
    let mut duration_ms: Option<i64> = None;

    // Parse multipart form data
    while let Some(mut field) = payload.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to parse multipart data: {}", e)))? {
        let name = field.name().unwrap_or("").to_string();
        
        match name.as_str() {
            "model" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to read field data: {}", e)))? {
                    data.extend_from_slice(&chunk);
                }
                model = String::from_utf8(data).map_err(|e| AppError::BadRequest(format!("Invalid model field: {}", e)))?;
            }
            "file" => {
                // Get filename from content disposition if available
                if let Some(content_disposition) = field.content_disposition() {
                    if let Some(name) = content_disposition.get_filename() {
                        filename = name.to_string();
                    }
                }
                // Extract MIME type from field
                if let Some(content_type) = field.content_type() {
                    mime_type = Some(content_type.to_string());
                }
                if filename.is_empty() {
                    filename = "audio.webm".to_string(); // Default filename
                }
                
                while let Some(chunk) = field.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to read file data: {}", e)))? {
                    file_data.extend_from_slice(&chunk);
                }
            }
            "language" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to read language field: {}", e)))? {
                    data.extend_from_slice(&chunk);
                }
                if !data.is_empty() {
                    language = Some(String::from_utf8(data).map_err(|e| AppError::BadRequest(format!("Invalid language field: {}", e)))?);
                }
            }
            "prompt" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to read prompt field: {}", e)))? {
                    data.extend_from_slice(&chunk);
                }
                if !data.is_empty() {
                    prompt = Some(String::from_utf8(data).map_err(|e| AppError::BadRequest(format!("Invalid prompt field: {}", e)))?);
                }
            }
            "temperature" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to read temperature field: {}", e)))? {
                    data.extend_from_slice(&chunk);
                }
                if !data.is_empty() {
                    let temp_str = String::from_utf8(data).map_err(|e| AppError::BadRequest(format!("Invalid temperature field: {}", e)))?;
                    temperature = Some(temp_str.parse().map_err(|e| AppError::BadRequest(format!("Invalid temperature value: {}", e)))?);
                }
            }
            "duration_ms" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to read duration_ms field: {}", e)))? {
                    data.extend_from_slice(&chunk);
                }
                if !data.is_empty() {
                    let duration_str = String::from_utf8(data).map_err(|e| AppError::BadRequest(format!("Invalid duration_ms field: {}", e)))?;
                    duration_ms = Some(duration_str.parse().map_err(|e| AppError::BadRequest(format!("Invalid duration_ms value: {}", e)))?);
                }
            }
            _ => {
                // Skip unknown fields
                while let Some(_chunk) = field.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to skip field data: {}", e)))? {
                    // Skip chunk
                }
            }
        }
    }

    if model.is_empty() {
        return Err(AppError::BadRequest("Model field is required".to_string()));
    }

    // Look up model with provider information
    let model_with_provider = model_repository
        .find_by_id_with_provider(&model)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found or inactive", model)))?;

    // Use the API model ID for the actual API call
    let api_model_id = &model_with_provider.api_model_id;

    if file_data.is_empty() {
        return Err(AppError::BadRequest("Audio file is required".to_string()));
    }

    // Create validation context
    let validation_context = RequestValidationContext {
        user_id: user_id.to_string(),
        client_ip: "127.0.0.1".to_string(), // TODO: Extract from request headers
        user_agent: None, // TODO: Extract from request headers
        request_timestamp: chrono::Utc::now(),
    };

    // Validate parameters using validation module functions
    let validated_language = validate_server_language(language.as_deref())
        .map_err(|e| AppError::from(e))?;
    
    let validated_prompt = validate_server_prompt(prompt.as_deref())
        .map_err(|e| AppError::from(e))?;
    
    let validated_temperature = validate_server_temperature(temperature)
        .map_err(|e| AppError::from(e))?;

    let mut cleaned_mime_type = mime_type.as_deref().unwrap_or("audio/webm").to_string();
    // Clean MIME type to remove codec info (e.g., "audio/webm; codecs=opus" becomes "audio/webm")
    if let Some(semicolon_pos) = cleaned_mime_type.find(';') {
        cleaned_mime_type = cleaned_mime_type[..semicolon_pos].trim().to_string();
    }
    let file_extension = mime_type_to_extension(&cleaned_mime_type);

    // Update filename if it's the default
    if filename == "audio.webm" {
        filename = format!("audio.{}", file_extension);
    }

    // Validate audio file
    let _validated_audio = validate_server_audio_file(
        &filename,
        &cleaned_mime_type,
        file_data.len(),
    ).map_err(|e| AppError::from(e))?;

    // Use OpenAI client for transcription
    let client = OpenAIClient::new(&app_settings)?;
    
    // Call the transcription API using the API model ID and validated parameters
    let transcription_text = client.transcribe_audio(
        &file_data,
        &filename,
        api_model_id,
        validated_language.as_deref(),
        validated_prompt.as_deref(),
        validated_temperature,
        &cleaned_mime_type,
    ).await?;

    // Handle billing if duration_ms is provided
    if let Some(duration) = duration_ms {
        // Create API usage entry for duration-based billing using the ModelWithProvider
        let entry = create_api_usage_entry(user_id, model_with_provider.id.clone(), 0, 0, uuid::Uuid::new_v4().to_string(), Some(duration));
        
        billing_service
            .charge_for_api_usage(entry)
            .await?;
    }

    let response = TranscriptionResponse {
        text: transcription_text,
    };

    Ok(HttpResponse::Ok().json(response))
}


/// Helper function to add cost to OpenAI stream chunk usage data
fn add_cost_to_openai_stream_chunk(chunk_str: &str, cost: &BigDecimal) -> Result<String, AppError> {
    let cost_float = cost.to_string().parse::<f64>().unwrap_or(0.0);
    let mut modified_lines = Vec::new();
    
    for line in chunk_str.lines() {
        if line.starts_with("data: ") {
            let json_str = &line[6..]; // Remove "data: " prefix
            if json_str.trim() == "[DONE]" {
                modified_lines.push(line.to_string());
                continue;
            }
            
            match serde_json::from_str::<Value>(json_str.trim()) {
                Ok(mut parsed) => {
                    // Check if this chunk has usage data
                    if let Some(usage) = parsed.get_mut("usage") {
                        if let Some(usage_obj) = usage.as_object_mut() {
                            usage_obj.insert("cost".to_string(), json!(cost_float));
                        }
                        let modified_json = serde_json::to_string(&parsed)
                            .map_err(|e| AppError::Internal(format!("Failed to serialize modified chunk: {}", e)))?;
                        modified_lines.push(format!("data: {}", modified_json));
                    } else {
                        modified_lines.push(line.to_string());
                    }
                },
                Err(_) => {
                    modified_lines.push(line.to_string());
                }
            }
        } else {
            modified_lines.push(line.to_string());
        }
    }
    
    Ok(modified_lines.join("\n"))
}

/// Helper function to add cost to Anthropic stream chunk usage data
fn add_cost_to_anthropic_stream_chunk(chunk_str: &str, cost: &BigDecimal) -> Result<String, AppError> {
    let cost_float = cost.to_string().parse::<f64>().unwrap_or(0.0);
    let mut modified_lines = Vec::new();
    
    for line in chunk_str.lines() {
        if line.starts_with("data: ") {
            let json_str = &line[6..]; // Remove "data: " prefix
            if json_str.trim() == "[DONE]" {
                modified_lines.push(line.to_string());
                continue;
            }
            
            match serde_json::from_str::<Value>(json_str.trim()) {
                Ok(mut parsed) => {
                    // Check for message_stop event with usage data
                    if parsed.get("type").and_then(|t| t.as_str()) == Some("message_stop") {
                        if let Some(usage) = parsed.get_mut("usage") {
                            if let Some(usage_obj) = usage.as_object_mut() {
                                usage_obj.insert("cost".to_string(), json!(cost_float));
                            }
                        }
                        let modified_json = serde_json::to_string(&parsed)
                            .map_err(|e| AppError::Internal(format!("Failed to serialize modified chunk: {}", e)))?;
                        modified_lines.push(format!("data: {}", modified_json));
                    } else {
                        modified_lines.push(line.to_string());
                    }
                },
                Err(_) => {
                    modified_lines.push(line.to_string());
                }
            }
        } else {
            modified_lines.push(line.to_string());
        }
    }
    
    Ok(modified_lines.join("\n"))
}

/// Helper function to convert Google stream chunk to OpenRouter format
fn convert_google_to_openrouter_chunk(google_chunk: GoogleStreamChunk, model_id: &str) -> OpenRouterStreamChunk {
    let choices = if let Some(candidates) = google_chunk.candidates {
        candidates.into_iter().map(|candidate| {
            let content = candidate.content
                .and_then(|c| c.parts.into_iter().next())
                .map(|p| p.text)
                .unwrap_or_default();
            
            OpenRouterStreamChoice {
                delta: OpenRouterStreamDelta {
                    role: Some("assistant".to_string()),
                    content: if content.is_empty() { None } else { Some(content) },
                },
                index: candidate.index,
                finish_reason: candidate.finish_reason,
            }
        }).collect()
    } else {
        vec![]
    };

    let usage = google_chunk.usage_metadata.map(|metadata| OpenRouterUsage {
        prompt_tokens: metadata.prompt_token_count,
        completion_tokens: metadata.candidates_token_count,
        total_tokens: metadata.total_token_count,
        cost: None, // Will be filled in by caller
    });

    OpenRouterStreamChunk {
        id: format!("chatcmpl-{}", uuid::Uuid::new_v4()),
        choices,
        created: Some(chrono::Utc::now().timestamp()),
        model: model_id.to_string(),
        object: Some("chat.completion.chunk".to_string()),
        usage,
    }
}

/// Helper function to replace OpenRouter's cost with server-calculated cost in stream chunk
fn replace_cost_in_openrouter_stream_chunk(chunk_str: &str, server_cost: &BigDecimal) -> Result<String, AppError> {
    let server_cost_float = server_cost.to_string().parse::<f64>().unwrap_or(0.0);
    let mut modified_lines = Vec::new();
    
    for line in chunk_str.lines() {
        if line.starts_with("data: ") {
            let json_str = &line[6..]; // Remove "data: " prefix
            if json_str.trim() == "[DONE]" {
                modified_lines.push(line.to_string());
                continue;
            }
            
            match serde_json::from_str::<Value>(json_str.trim()) {
                Ok(mut parsed) => {
                    // Check if this chunk has usage data
                    if let Some(usage) = parsed.get_mut("usage") {
                        if let Some(usage_obj) = usage.as_object_mut() {
                            // Replace OpenRouter's cost with server-calculated cost
                            usage_obj.insert("cost".to_string(), json!(server_cost_float));
                        }
                        let modified_json = serde_json::to_string(&parsed)
                            .map_err(|e| AppError::Internal(format!("Failed to serialize modified chunk: {}", e)))?;
                        modified_lines.push(format!("data: {}", modified_json));
                    } else {
                        modified_lines.push(line.to_string());
                    }
                },
                Err(_) => {
                    modified_lines.push(line.to_string());
                }
            }
        } else {
            modified_lines.push(line.to_string());
        }
    }
    
    Ok(modified_lines.join("\n"))
}

