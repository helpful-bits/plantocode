use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use tracing::{debug, error, info, instrument, warn};
use uuid::{self, Uuid};
use chrono;
use crate::error::AppError;
use crate::middleware::secure_auth::UserId;
use crate::clients::{
    OpenRouterClient, OpenAIClient, AnthropicClient, GoogleClient,
    OpenRouterChatRequest, OpenAIChatRequest, AnthropicChatRequest, GoogleChatRequest
};
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::models::model_pricing::ModelPricing;
use crate::services::cost_based_billing_service::CostBasedBillingService;
use crate::config::settings::AppSettings;
use crate::db::connection::DatabasePools;
use std::sync::Arc;
use bigdecimal::BigDecimal;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use base64::Engine;
use actix_multipart::Multipart;
use futures_util::TryStreamExt;
use std::str::FromStr;

/// AI proxy handler for intelligent model routing
/// Routes requests to appropriate AI providers based on model configuration
#[instrument(skip(payload, app_settings, db_pools, cost_billing_service, model_repository, user_id))]
pub async fn llm_chat_completion_handler(
    payload: web::Json<Value>,
    user_id: UserId,
    app_settings: web::Data<AppSettings>,
    db_pools: web::Data<DatabasePools>,
    cost_billing_service: web::Data<CostBasedBillingService>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    // User ID is already extracted by authentication middleware
    let user_id = user_id.0;
    
    info!("Processing LLM chat completion request for user: {}", user_id);
    
    // Check if services are available for this user
    if !cost_billing_service.check_service_access(&user_id).await? {
        warn!("Service access blocked for user: {}", user_id);
        return Err(AppError::Payment("AI services blocked due to spending limit".to_string()));
    }
    
    // Extract model ID from request payload
    let model_id = extract_model_id(&payload)?;
    debug!("Routing request for model: {}", model_id);
    
    // Look up model with provider information
    let model_with_provider = model_repository
        .find_by_id_with_provider(&model_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found or inactive", model_id)))?;
    
    info!("Routing to provider: {} for model: {}", model_with_provider.provider_code, model_with_provider.name);
    
    // Check if request is streaming
    let is_streaming = extract_streaming_flag(&payload);
    
    // Route to appropriate provider based on provider_code
    match model_with_provider.provider_code.as_str() {
        "openai" => {
            if is_streaming {
                handle_openai_streaming_request(payload.into_inner(), &model_with_provider, &user_id, &app_settings, &cost_billing_service).await
            } else {
                handle_openai_request(payload.into_inner(), &model_with_provider, &user_id, &app_settings, &cost_billing_service).await
            }
        },
        "anthropic" => {
            if is_streaming {
                handle_anthropic_streaming_request(payload.into_inner(), &model_with_provider, &user_id, &app_settings, &cost_billing_service).await
            } else {
                handle_anthropic_request(payload.into_inner(), &model_with_provider, &user_id, &app_settings, &cost_billing_service).await
            }
        },
        "google" => {
            if is_streaming {
                handle_google_streaming_request(payload.into_inner(), &model_with_provider, &user_id, &app_settings, &cost_billing_service).await
            } else {
                handle_google_request(payload.into_inner(), &model_with_provider, &user_id, &app_settings, &cost_billing_service).await
            }
        },
        "deepseek" => {
            // Route DeepSeek models through OpenRouter
            if is_streaming {
                handle_openrouter_streaming_request(payload.into_inner(), &model_with_provider, &user_id, &app_settings, &cost_billing_service).await
            } else {
                handle_openrouter_request(payload.into_inner(), &model_with_provider, &user_id, &app_settings, &cost_billing_service).await
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
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    cost_billing_service: &CostBasedBillingService,
) -> Result<HttpResponse, AppError> {
    let client = OpenAIClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (response, _headers, tokens_input, tokens_output) = client.chat_completion(request).await?;
    
    // Token counts already extracted from the response tuple
    
    // Calculate cost using database pricing
    let cost = model.calculate_token_cost(tokens_input as i64, tokens_output as i64);
    
    // Record usage and cost
    cost_billing_service.record_usage_and_update_spending(
        user_id,
        "chat_completion",
        tokens_input,
        tokens_output,
        &cost,
        None,
        None,
        None,
        None,
    ).await?;
    
    // Convert to OpenRouter format for consistent client parsing
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        obj.insert("usage".to_string(), json!({
            "prompt_tokens": tokens_input,
            "completion_tokens": tokens_output,
            "total_tokens": tokens_input + tokens_output,
            "cost": cost.to_string().parse::<f64>().unwrap_or(0.0)
        }));
    }
    
    Ok(HttpResponse::Ok().json(response_value))
}

/// Handle OpenAI streaming request
async fn handle_openai_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    cost_billing_service: &CostBasedBillingService,
) -> Result<HttpResponse, AppError> {
    let client = OpenAIClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (headers, stream, _token_counter) = client.stream_chat_completion(request).await?;
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let cost_billing_service_clone = cost_billing_service.clone();
    
    let processed_stream = stream.map(move |chunk_result| {
        match chunk_result {
            Ok(bytes) => {
                // Process chunk for token tracking
                if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                    // Extract tokens if this is the final chunk with usage
                    if let Some((tokens_input, tokens_output)) = OpenAIClient::extract_tokens_from_chat_stream_chunk(chunk_str) {
                        // Calculate cost and record usage
                        tokio::spawn({
                            let user_id = user_id_clone;
                            let model = model_clone.clone();
                            let cost_billing_service = cost_billing_service_clone.clone();
                            async move {
                                let cost = model.calculate_token_cost(tokens_input as i64, tokens_output as i64);
                                let _ = cost_billing_service.record_usage_and_update_spending(
                                    &user_id,
                                    "chat_completion_stream",
                                    tokens_input,
                                    tokens_output,
                                    &cost,
                                    None,
                                    None,
                                    None,
                                    None,
                                ).await;
                            }
                        });
                    }
                }
                Ok(bytes)
            },
            Err(e) => Err(e)
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
    cost_billing_service: &CostBasedBillingService,
) -> Result<HttpResponse, AppError> {
    let client = AnthropicClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (response, _headers) = client.chat_completion(request, &user_id.to_string()).await?;
    
    // Extract token counts from response
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost using database pricing
    let cost = model.calculate_token_cost(tokens_input as i64, tokens_output as i64);
    
    // Record usage and cost
    cost_billing_service.record_usage_and_update_spending(
        user_id,
        "chat_completion",
        tokens_input,
        tokens_output,
        &cost,
        None,
        None,
        None,
        None,
    ).await?;
    
    // Transform Anthropic response to OpenRouter format for consistent client parsing
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
        "usage": {
            "prompt_tokens": tokens_input,
            "completion_tokens": tokens_output,
            "total_tokens": tokens_input + tokens_output,
            "cost": cost.to_string().parse::<f64>().unwrap_or(0.0)
        }
    });
    
    Ok(HttpResponse::Ok().json(openrouter_response))
}

/// Handle Anthropic streaming request
async fn handle_anthropic_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    cost_billing_service: &CostBasedBillingService,
) -> Result<HttpResponse, AppError> {
    let client = AnthropicClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (headers, stream) = client.stream_chat_completion(request, user_id.to_string()).await?;
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let cost_billing_service_clone = cost_billing_service.clone();
    
    let processed_stream = stream.map(move |chunk_result| {
        match chunk_result {
            Ok(bytes) => {
                if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                    if let Some((tokens_input, tokens_output)) = AnthropicClient::extract_tokens_from_stream_chunk(chunk_str) {
                        tokio::spawn({
                            let user_id = user_id_clone;
                            let model = model_clone.clone();
                            let cost_billing_service = cost_billing_service_clone.clone();
                            async move {
                                let cost = model.calculate_token_cost(tokens_input as i64, tokens_output as i64);
                                let _ = cost_billing_service.record_usage_and_update_spending(
                                    &user_id,
                                    "chat_completion_stream",
                                    tokens_input,
                                    tokens_output,
                                    &cost,
                                    None,
                                    None,
                                    None,
                                    None,
                                ).await;
                            }
                        });
                    }
                }
                Ok(bytes)
            },
            Err(e) => Err(e)
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
    cost_billing_service: &CostBasedBillingService,
) -> Result<HttpResponse, AppError> {
    let client = GoogleClient::new(app_settings)?;
    let request = client.convert_to_chat_request(payload)?;
    
    let (response, _headers) = client.chat_completion(request, &model.api_model_id, &user_id.to_string()).await?;
    
    // Extract token counts from response
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost using database pricing
    let cost = model.calculate_token_cost(tokens_input as i64, tokens_output as i64);
    
    // Record usage and cost
    cost_billing_service.record_usage_and_update_spending(
        user_id,
        "chat_completion",
        tokens_input,
        tokens_output,
        &cost,
        None,
        None,
        None,
        None,
    ).await?;
    
    // Transform Google response to OpenRouter format for consistent client parsing
    let response_value = serde_json::to_value(&response)?;
    let content = response_value["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("");
    
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
        "usage": {
            "prompt_tokens": tokens_input,
            "completion_tokens": tokens_output,
            "total_tokens": tokens_input + tokens_output,
            "cost": cost.to_string().parse::<f64>().unwrap_or(0.0)
        }
    });
    
    Ok(HttpResponse::Ok().json(openrouter_response))
}

/// Handle Google streaming request
async fn handle_google_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    cost_billing_service: &CostBasedBillingService,
) -> Result<HttpResponse, AppError> {
    let client = GoogleClient::new(app_settings)?;
    let request = client.convert_to_chat_request(payload)?;
    
    let (headers, stream) = client.stream_chat_completion(request, model.api_model_id.clone(), user_id.to_string()).await?;
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let cost_billing_service_clone = cost_billing_service.clone();
    
    let processed_stream = stream.map(move |chunk_result| {
        match chunk_result {
            Ok(bytes) => {
                if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                    if let Some((tokens_input, tokens_output)) = GoogleClient::extract_tokens_from_stream_chunk(chunk_str) {
                        tokio::spawn({
                            let user_id = user_id_clone;
                            let model = model_clone.clone();
                            let cost_billing_service = cost_billing_service_clone.clone();
                            async move {
                                let cost = model.calculate_token_cost(tokens_input as i64, tokens_output as i64);
                                let _ = cost_billing_service.record_usage_and_update_spending(
                                    &user_id,
                                    "chat_completion_stream",
                                    tokens_input,
                                    tokens_output,
                                    &cost,
                                    None,
                                    None,
                                    None,
                                    None,
                                ).await;
                            }
                        });
                    }
                }
                Ok(bytes)
            },
            Err(e) => Err(e)
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
    cost_billing_service: &CostBasedBillingService,
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    request.model = model.api_model_id.clone();
    
    let (response, _headers) = client.chat_completion(request, &user_id.to_string()).await?;
    
    // Extract token counts from response (ignore OpenRouter's cost calculation)
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost using database pricing
    let cost = model.calculate_token_cost(tokens_input as i64, tokens_output as i64);
    
    // Record usage and cost
    cost_billing_service.record_usage_and_update_spending(
        user_id,
        "chat_completion",
        tokens_input,
        tokens_output,
        &cost,
        None,
        None,
        None,
        None,
    ).await?;
    
    // Ensure usage format matches OpenRouter standard for consistent client parsing
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        obj.insert("usage".to_string(), json!({
            "prompt_tokens": tokens_input,
            "completion_tokens": tokens_output,
            "total_tokens": tokens_input + tokens_output,
            "cost": cost.to_string().parse::<f64>().unwrap_or(0.0)
        }));
    }
    
    Ok(HttpResponse::Ok().json(response_value))
}

/// Handle OpenRouter (DeepSeek) streaming request
async fn handle_openrouter_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    cost_billing_service: &CostBasedBillingService,
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    request.model = model.api_model_id.clone();
    
    let (headers, stream) = client.stream_chat_completion(request, user_id.to_string()).await?;
    
    // Create a stream processor to track tokens and calculate cost
    let user_id_clone = *user_id;
    let model_clone = model.clone();
    let cost_billing_service_clone = cost_billing_service.clone();
    
    let processed_stream = stream.map(move |chunk_result| {
        match chunk_result {
            Ok(bytes) => {
                if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                    if let Some((tokens_input, tokens_output)) = OpenRouterClient::extract_tokens_from_stream_chunk(chunk_str) {
                        tokio::spawn({
                            let user_id = user_id_clone;
                            let model = model_clone.clone();
                            let cost_billing_service = cost_billing_service_clone.clone();
                            async move {
                                let cost = model.calculate_token_cost(tokens_input as i64, tokens_output as i64);
                                let _ = cost_billing_service.record_usage_and_update_spending(
                                    &user_id,
                                    "chat_completion_stream",
                                    tokens_input,
                                    tokens_output,
                                    &cost,
                                    None,
                                    None,
                                    None,
                                    None,
                                ).await;
                            }
                        });
                    }
                }
                Ok(bytes)
            },
            Err(e) => Err(e)
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
#[instrument(skip(payload, user_id, app_settings, cost_billing_service))]
pub async fn transcription_handler(
    mut payload: Multipart,
    user_id: UserId,
    app_settings: web::Data<AppSettings>,
    cost_billing_service: web::Data<CostBasedBillingService>,
) -> Result<HttpResponse, AppError> {
    let user_id = user_id.0;
    info!("Processing transcription request for user: {}", user_id);

    // Check if services are available for this user
    if !cost_billing_service.check_service_access(&user_id).await? {
        warn!("Service access blocked for user: {}", user_id);
        return Err(AppError::Payment("Transcription services blocked due to spending limit".to_string()));
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
#[instrument(skip(payload, user_id, app_settings, cost_billing_service))]
pub async fn batch_transcription_handler(
    payload: web::Json<BatchTranscriptionRequest>,
    user_id: UserId,
    app_settings: web::Data<AppSettings>,
    cost_billing_service: web::Data<CostBasedBillingService>,
) -> Result<HttpResponse, AppError> {
    let user_id = user_id.0;
    let start_time = std::time::Instant::now();
    
    info!("Processing batch transcription request for user: {} chunk: {}", user_id, payload.chunk_index);

    // Check if services are available for this user
    if !cost_billing_service.check_service_access(&user_id).await? {
        warn!("Service access blocked for user: {}", user_id);
        return Err(AppError::Payment("Transcription services blocked due to spending limit".to_string()));
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