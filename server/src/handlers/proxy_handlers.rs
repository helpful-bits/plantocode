use actix_web::{web, HttpRequest, HttpResponse};
use serde_json::{json, Value};
use std::collections::HashMap;
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
use crate::services::cost_based_billing_service::CostBasedBillingService;
use crate::config::settings::AppSettings;
use crate::db::connection::DatabasePools;
use sqlx::PgPool;
use std::sync::Arc;
use bigdecimal::BigDecimal;
use futures_util::StreamExt;

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
    let request = client.convert_to_chat_request(payload)?;
    
    let (response, _headers, tokens_input, tokens_output) = client.chat_completion(request).await?;
    
    // Token counts already extracted from the response tuple
    
    // Calculate cost using database pricing
    let markup_percentage = BigDecimal::from(0); // Assuming no markup for now
    let cost = model.calculate_token_cost(tokens_input, tokens_output, &markup_percentage)?;
    
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
    let request = client.convert_to_chat_request(payload)?;
    
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
                                let markup_percentage = BigDecimal::from(0);
                                if let Ok(cost) = model.calculate_token_cost(tokens_input, tokens_output, &markup_percentage) {
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
    let request = client.convert_to_chat_request(payload)?;
    
    let (response, _headers) = client.chat_completion(request, &user_id.to_string()).await?;
    
    // Extract token counts from response
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost using database pricing
    let markup_percentage = BigDecimal::from(0);
    let cost = model.calculate_token_cost(tokens_input, tokens_output, &markup_percentage)?;
    
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
    let request = client.convert_to_chat_request(payload)?;
    
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
                                let markup_percentage = BigDecimal::from(0);
                                if let Ok(cost) = model.calculate_token_cost(tokens_input, tokens_output, &markup_percentage) {
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
    
    let (response, _headers) = client.chat_completion(request, &model.id, &user_id.to_string()).await?;
    
    // Extract token counts from response
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost using database pricing
    let markup_percentage = BigDecimal::from(0);
    let cost = model.calculate_token_cost(tokens_input, tokens_output, &markup_percentage)?;
    
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
    
    let (headers, stream) = client.stream_chat_completion(request, model.id.clone(), user_id.to_string()).await?;
    
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
                                let markup_percentage = BigDecimal::from(0);
                                if let Ok(cost) = model.calculate_token_cost(tokens_input, tokens_output, &markup_percentage) {
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
    let request = client.convert_to_chat_request(payload)?;
    
    let (response, _headers) = client.chat_completion(request, &user_id.to_string()).await?;
    
    // Extract token counts from response (ignore OpenRouter's cost calculation)
    let (tokens_input, tokens_output) = client.extract_tokens_from_response(&response);
    
    // Calculate cost using database pricing
    let markup_percentage = BigDecimal::from(0);
    let cost = model.calculate_token_cost(tokens_input, tokens_output, &markup_percentage)?;
    
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
    let request = client.convert_to_chat_request(payload)?;
    
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
                                let markup_percentage = BigDecimal::from(0);
                                if let Ok(cost) = model.calculate_token_cost(tokens_input, tokens_output, &markup_percentage) {
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