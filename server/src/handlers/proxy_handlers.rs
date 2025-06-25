use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, error, info, instrument, warn};
use uuid::{self, Uuid};
use chrono;
use crate::error::AppError;
use crate::middleware::secure_auth::UserId;
use crate::clients::{
    OpenRouterClient, OpenAIClient, AnthropicClient, GoogleClient
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
    // Convert LlmCompletionRequest to Value for client conversion
    let payload_value = serde_json::to_value(&payload)?;
    let mut request = client.convert_to_chat_request(payload_value)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (response, _headers, tokens_input, tokens_output) = client.chat_completion(request).await?;
    
    // Calculate cost and consume credits
    let cost = billing_service.get_credit_service().calculate_cost(
        &model.id,
        tokens_input,
        tokens_output,
    ).await?;
    billing_service.get_credit_service().consume_credits(user_id, &cost).await?;
    
    // Convert to OpenRouter format for consistent client parsing with standardized usage
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage = OpenRouterUsage {
            prompt_tokens: tokens_input,
            completion_tokens: tokens_output,
            total_tokens: tokens_input + tokens_output,
            cost: Some(cost.to_string().parse::<f64>().unwrap_or(0.0)),
        };
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
    // Convert LlmCompletionRequest to Value for client conversion
    let payload_value = serde_json::to_value(&payload)?;
    let mut request = client.convert_to_chat_request(payload_value)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (headers, stream, _token_counter) = client.stream_chat_completion(request).await?;
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let billing_service_clone = Arc::clone(&billing_service);
    let _duration_ms = payload.duration_ms;
    
    let processed_stream = stream.then(move |chunk_result| {
        let billing_service_inner = billing_service_clone.clone();
        let model_id = model_clone.id.clone();
        let user_id = user_id_clone;
        
        async move {
            match chunk_result {
                Ok(bytes) => {
                    // Process chunk for token tracking
                    if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                        // Extract tokens if this is the final chunk with usage
                        if let Some((tokens_input, tokens_output)) = OpenAIClient::extract_tokens_from_chat_stream_chunk(chunk_str) {
                            // Calculate cost and consume credits
                                                    if let Ok(cost) = billing_service_inner.get_credit_service().calculate_cost(
                                &model_id,
                                tokens_input,
                                tokens_output,
                            ).await {
                                if billing_service_inner.get_credit_service().consume_credits(&user_id, &cost).await.is_ok() {
                                    // Modify the chunk to include authoritative cost in usage
                                    if let Ok(modified_chunk) = add_cost_to_openai_stream_chunk(chunk_str, &cost) {
                                        return Ok(web::Bytes::from(modified_chunk));
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
    let client = AnthropicClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (response, _headers) = client.chat_completion(request, &user_id.to_string()).await?;
    
    // Extract token counts from response
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost and consume credits
    let cost = billing_service.get_credit_service().calculate_cost(
        &model.id,
        tokens_input,
        tokens_output,
    ).await?;
    billing_service.get_credit_service().consume_credits(user_id, &cost).await?;
    
    // Transform Anthropic response to OpenRouter format for consistent client parsing
    let usage = OpenRouterUsage {
        prompt_tokens: tokens_input,
        completion_tokens: tokens_output,
        total_tokens: tokens_input + tokens_output,
        cost: Some(cost.to_string().parse::<f64>().unwrap_or(0.0)),
    };
    
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
    let client = AnthropicClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (_headers, stream) = client.stream_chat_completion(request, user_id.to_string()).await?;
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let billing_service_clone = Arc::clone(&billing_service);
    
    let processed_stream = stream.then(move |chunk_result| {
        let billing_service_inner = billing_service_clone.clone();
        let model_id = model_clone.id.clone();
        let user_id = user_id_clone;
        
        async move {
            match chunk_result {
                Ok(bytes) => {
                    if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                        if let Some((tokens_input, tokens_output)) = AnthropicClient::extract_tokens_from_stream_chunk(chunk_str) {
                            // Calculate cost and consume credits
                                                    if let Ok(cost) = billing_service_inner.get_credit_service().calculate_cost(
                                &model_id,
                                tokens_input,
                                tokens_output,
                            ).await {
                                if billing_service_inner.get_credit_service().consume_credits(&user_id, &cost).await.is_ok() {
                                    // Modify the chunk to include authoritative cost in usage
                                    if let Ok(modified_chunk) = add_cost_to_anthropic_stream_chunk(chunk_str, &cost) {
                                        return Ok(web::Bytes::from(modified_chunk));
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

/// Handle Google non-streaming request
async fn handle_google_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let client = GoogleClient::new(app_settings)?;
    let request = client.convert_to_chat_request_with_capabilities(payload, Some(&model.capabilities))?;
    
    let (response, _headers) = client.chat_completion(request, &model.api_model_id, &user_id.to_string()).await?;
    
    // Extract token counts from response
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost and consume credits
    let cost = billing_service.get_credit_service().calculate_cost(
        &model.id,
        tokens_input,
        tokens_output,
    ).await?;
    billing_service.get_credit_service().consume_credits(user_id, &cost).await?;
    
    // Transform Google response to OpenRouter format for consistent client parsing
    let response_value = serde_json::to_value(&response)?;
    let content = response_value["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("");
    
    let usage = OpenRouterUsage {
        prompt_tokens: tokens_input,
        completion_tokens: tokens_output,
        total_tokens: tokens_input + tokens_output,
        cost: Some(cost.to_string().parse::<f64>().unwrap_or(0.0)),
    };
    
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
    let client = GoogleClient::new(app_settings)?;
    let request = client.convert_to_chat_request_with_capabilities(payload, Some(&model.capabilities))?;
    
    let (headers, stream) = client.stream_chat_completion(request, model.api_model_id.clone(), user_id.to_string()).await?;
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let billing_service_clone = Arc::clone(&billing_service);
    let model_id_for_response = model.id.clone();
    
    let processed_stream = stream.then(move |chunk_result| {
        let billing_service_inner = billing_service_clone.clone();
        let model_id = model_clone.id.clone();
        let user_id = user_id_clone;
        let model_id_for_chunk = model_id_for_response.clone();
        
        async move {
            match chunk_result {
                Ok(bytes) => {
                    if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                        for line in chunk_str.lines() {
                            if line.starts_with("data: ") {
                                let json_str = &line[6..]; // Remove "data: " prefix
                                if json_str.trim() == "[DONE]" {
                                    return Ok(web::Bytes::from("data: [DONE]\n\n"));
                                }
                                
                                match serde_json::from_str::<GoogleStreamChunk>(json_str.trim()) {
                                    Ok(google_chunk) => {
                                        let mut openrouter_chunk = convert_google_to_openrouter_chunk(google_chunk, &model_id_for_chunk);
                                        
                                        // Check if this chunk has usage data and get authoritative cost
                                        if let Some(ref mut usage) = openrouter_chunk.usage {
                                            let tokens_input = usage.prompt_tokens;
                                            let tokens_output = usage.completion_tokens;
                                            
                                            // Calculate cost and consume credits
                                                                                    if let Ok(cost) = billing_service_inner.get_credit_service().calculate_cost(
                                                &model_id,
                                                tokens_input,
                                                tokens_output,
                                            ).await {
                                                if billing_service_inner.get_credit_service().consume_credits(&user_id, &cost).await.is_ok() {
                                                    // Set authoritative cost in usage
                                                    usage.cost = Some(cost.to_string().parse::<f64>().unwrap_or(0.0));
                                                }
                                            }
                                        }
                                        
                                        // Serialize the OpenRouter chunk
                                        match serde_json::to_string(&openrouter_chunk) {
                                            Ok(json_str) => {
                                                let formatted_chunk = format!("data: {}\n\n", json_str);
                                                return Ok(web::Bytes::from(formatted_chunk));
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

/// Handle OpenRouter (DeepSeek) non-streaming request
async fn handle_openrouter_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    request.model = model.api_model_id.clone();
    
    let (response, _headers) = client.chat_completion(request, &user_id.to_string()).await?;
    
    // Extract token counts from response (ignore OpenRouter's cost calculation)
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost and consume credits
    let server_calculated_cost = billing_service.get_credit_service().calculate_cost(
        &model.id,
        tokens_input,
        tokens_output,
    ).await?;
    billing_service.get_credit_service().consume_credits(user_id, &server_calculated_cost).await?;
    
    // Replace OpenRouter's cost with server-calculated cost in response using standardized usage
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage = OpenRouterUsage {
            prompt_tokens: tokens_input,
            completion_tokens: tokens_output,
            total_tokens: tokens_input + tokens_output,
            cost: Some(server_calculated_cost.to_string().parse::<f64>().unwrap_or(0.0)),
        };
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
    
    request.model = model.api_model_id.clone();
    
    let (_headers, stream) = client.stream_chat_completion(request, user_id.to_string()).await?;
    
    // Create a stream processor to intercept final chunk with usage data
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let billing_service_clone = Arc::clone(&billing_service);
    
    let processed_stream = stream.then(move |chunk_result| {
        let billing_service_inner = billing_service_clone.clone();
        let model_id = model_clone.id.clone();
        let user_id = user_id_clone;
        
        async move {
            match chunk_result {
                Ok(bytes) => {
                    if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                        // Check if this chunk contains usage data (final chunk)
                        if let Some((tokens_input, tokens_output)) = OpenRouterClient::extract_tokens_from_stream_chunk(chunk_str) {
                            // Calculate cost and consume credits
                                                    if let Ok(server_calculated_cost) = billing_service_inner.get_credit_service().calculate_cost(
                                &model_id,
                                tokens_input,
                                tokens_output,
                            ).await {
                                if billing_service_inner.get_credit_service().consume_credits(&user_id, &server_calculated_cost).await.is_ok() {
                                    // Replace OpenRouter's cost with server-calculated cost in the final chunk
                                    if let Ok(modified_chunk) = replace_cost_in_openrouter_stream_chunk(chunk_str, &server_calculated_cost) {
                                        return Ok(web::Bytes::from(modified_chunk));
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


/// Extract model ID from request payload
fn extract_model_id(payload: &Value) -> Result<String, AppError> {
    payload
        .get("model")
        .and_then(|m| m.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::BadRequest("Model field is required".to_string()))
}

/// Extract streaming flag from request payload
fn extract_streaming_flag(payload: &Value) -> bool {
    payload
        .get("stream")
        .and_then(|s| s.as_bool())
        .unwrap_or(false)
}


#[derive(Deserialize)]
pub struct BatchTranscriptionRequest {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "audioBase64")]
    audio_base64: String,
    #[serde(rename = "chunkIndex")]
    chunk_index: u32,
    #[serde(rename = "durationMs")]
    duration_ms: i64,
    language: Option<String>,
    prompt: Option<String>,
    temperature: Option<f32>,
    model: Option<String>,
}

#[derive(Serialize)]
pub struct BatchTranscriptionResponse {
    #[serde(rename = "chunkIndex")]
    chunk_index: u32,
    text: String,
    #[serde(rename = "processingTimeMs")]
    processing_time_ms: Option<i64>,
}

#[derive(Serialize)]
pub struct TranscriptionResponse {
    text: String,
}

/// Handle audio transcription (multipart form) - mimics OpenAI's /v1/audio/transcriptions
#[instrument(skip(payload, user_id, app_settings, billing_service))]
pub async fn transcription_handler(
    mut payload: Multipart,
    user_id: UserId,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<BillingService>,
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
            _ => {
                // Skip unknown fields
                while let Some(_chunk) = field.try_next().await.map_err(|e| AppError::BadRequest(format!("Failed to skip field data: {}", e)))? {
                    // Skip chunk
                }
            }
        }
    }

    if model.is_empty() {
        model = "gpt-4o-mini-transcribe".to_string(); // Default model
    }

    if file_data.is_empty() {
        return Err(AppError::BadRequest("Audio file is required".to_string()));
    }

    // Use OpenAI client for transcription
    let client = OpenAIClient::new(&app_settings)?;
    
    // Call the transcription API
    let transcription_text = client.transcribe_audio(
        &file_data,
        &filename,
        &model,
        language.as_deref(),
        prompt.as_deref(),
        temperature,
    ).await?;

    let response = TranscriptionResponse {
        text: transcription_text,
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Handle batch transcription (JSON payload with base64 audio)
#[instrument(skip(payload, user_id, app_settings, billing_service))]
pub async fn batch_transcription_handler(
    payload: web::Json<BatchTranscriptionRequest>,
    user_id: UserId,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    let user_id = user_id.0;
    let start_time = std::time::Instant::now();
    
    info!("Processing batch transcription request for user: {} chunk: {}", user_id, payload.chunk_index);

    // Check if user has sufficient credits
    let balance = billing_service.get_credit_service().get_user_balance(&user_id).await?;
    if balance.balance <= BigDecimal::from(0) {
        warn!("Insufficient credits for user: {}", user_id);
        return Err(AppError::CreditInsufficient("Insufficient credits for transcription service usage".to_string()));
    }

    let model = payload.model.as_deref()
        .ok_or_else(|| AppError::BadRequest("Model is required".to_string()))?;
    
    // Generate a filename for the audio chunk
    let filename = format!("chunk_{}.webm", payload.chunk_index);
    
    // Decode base64 audio data directly
    let audio_data = base64::engine::general_purpose::STANDARD.decode(&payload.audio_base64)
        .map_err(|e| AppError::BadRequest(format!("Invalid base64 audio data: {}", e)))?;
    
    // Use OpenAI client directly with raw bytes
    let client = OpenAIClient::new(&app_settings)?;
    
    // Call the transcription API directly
    let transcription_text = client.transcribe_audio(
        &audio_data,
        &filename,
        model,
        payload.language.as_deref(),
        payload.prompt.as_deref(),
        payload.temperature,
    ).await?;

    let processing_time_ms = start_time.elapsed().as_millis() as i64;

    let response = BatchTranscriptionResponse {
        chunk_index: payload.chunk_index,
        text: transcription_text,
        processing_time_ms: Some(processing_time_ms),
    };

    info!("Batch transcription completed for chunk {} in {}ms", payload.chunk_index, processing_time_ms);
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

/// Helper function to add cost to OpenRouter stream chunk usage data (legacy function)
fn add_cost_to_openrouter_stream_chunk(chunk_str: &str, cost: &BigDecimal) -> Result<String, AppError> {
    // Delegate to the new replace function for consistency
    replace_cost_in_openrouter_stream_chunk(chunk_str, cost)
}