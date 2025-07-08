use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use tracing::{debug, error, info, instrument, warn};
use uuid::{self, Uuid};
use chrono;
use crate::error::AppError;
use crate::middleware::secure_auth::UserId;
use crate::clients::{
    OpenRouterClient, OpenAIClient, AnthropicClient, GoogleClient, UsageExtractor
};
use crate::services::cost_resolver::CostResolver;
use crate::clients::usage_extractor::ProviderUsage;
use crate::utils::transcription_validation::{
    mime_type_to_extension, validate_server_language, validate_server_prompt, 
    validate_server_temperature, validate_server_audio_file, RequestValidationContext
};
use crate::clients::open_router_client::{OpenRouterStreamChunk, OpenRouterStreamChoice, OpenRouterStreamDelta, OpenRouterUsage};
use crate::clients::google_client::GoogleStreamChunk;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::models::model_pricing::ModelPricing;
use crate::models::standardized_usage_response::StandardizedUsageResponse;
use crate::services::billing_service::BillingService;
use crate::config::settings::AppSettings;
use bigdecimal::BigDecimal;
use std::str::FromStr;

use futures_util::{StreamExt, TryStreamExt, Stream};
use std::pin::Pin;
use serde::{Deserialize, Serialize};
use actix_multipart::Multipart;

use crate::handlers::streaming_handler::StandardizedStreamHandler;
use crate::handlers::provider_transformers::{
    GoogleStreamTransformer, AnthropicStreamTransformer, OpenAIStreamTransformer, OpenRouterStreamTransformer
};

/// Helper function to determine if an error should trigger a fallback to OpenRouter
fn is_fallback_error(error: &AppError) -> bool {
    match error {
        AppError::External(_) => true,
        AppError::TooManyRequests(_) => true, 
        AppError::BadRequest(msg) => msg.contains("rate limit") || msg.contains("quota") || msg.contains("capacity"),
        AppError::Internal(msg) => msg.contains("deserialization failed") || msg.contains("JSON parse"),
        _ => false,
    }
}

/// Comprehensive cost validation for API endpoints
/// Ensures that all cost calculations follow server-side validation rules
async fn validate_request_cost_limits(
    model: &ModelWithProvider,
    input_tokens: i64,
    output_tokens: i64,
    cache_write_tokens: i64,
    cache_read_tokens: i64,
    user_balance: &BigDecimal,
) -> Result<BigDecimal, AppError> {
    // Validate model has pricing configuration

    if !model.has_valid_pricing() {
        return Err(AppError::InvalidArgument(format!("Model '{}' has no valid pricing configuration", model.id)));
    }

    // Calculate estimated cost using server-side pricing logic (no duration-based billing)
    let usage = ProviderUsage::with_cache(
        input_tokens as i32,
        output_tokens as i32,
        cache_write_tokens as i32,
        cache_read_tokens as i32,
        model.id.clone()
    );
    let estimated_cost = model.calculate_total_cost(&usage)
        .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;

    // Validate user has sufficient credits for the estimated cost
    if estimated_cost > *user_balance {
        return Err(AppError::CreditInsufficient(
            format!("Insufficient credits. Required: {}, Available: {}", estimated_cost, user_balance)
        ));
    }

    // Validate against maximum cost per request limits
    let max_cost_per_request = BigDecimal::from(50); // $50 max per request
    if estimated_cost > max_cost_per_request {
        return Err(AppError::InvalidArgument(
            format!("Request cost {} exceeds maximum allowed cost per request ({})", estimated_cost, max_cost_per_request)
        ));
    }

    // Validate token limits for security
    if input_tokens > 1_000_000 || output_tokens > 1_000_000 {
        return Err(AppError::InvalidArgument(
            "Token counts exceed maximum allowed limits (1M tokens per type)".to_string()
        ));
    }

    if cache_write_tokens > 1_000_000 || cache_read_tokens > 1_000_000 {
        return Err(AppError::InvalidArgument(
            "Cache token counts exceed maximum allowed limits (1M tokens per type)".to_string()
        ));
    }

    Ok(estimated_cost)
}

/// Pre-request validation for all API endpoints
/// Ensures the request meets all cost and security requirements before processing
async fn validate_api_request(
    user_id: &uuid::Uuid,
    model: &ModelWithProvider,
    max_tokens: Option<u32>,
    billing_service: &BillingService,
) -> Result<BigDecimal, AppError> {
    // Get current user balance
    let balance = billing_service.get_credit_service().get_user_balance(user_id).await?;
    if balance.balance <= BigDecimal::from(0) {
        return Err(AppError::CreditInsufficient("No credits available".to_string()));
    }

    // Estimate tokens based on max_tokens parameter (conservative estimate)
    let estimated_input_tokens = max_tokens.unwrap_or(4000) as i64 / 2; // Assume 50% for input
    let estimated_output_tokens = max_tokens.unwrap_or(4000) as i64 / 2; // Assume 50% for output

    // Validate cost limits with conservative estimates
    validate_request_cost_limits(
        model,
        estimated_input_tokens,
        estimated_output_tokens,
        0, // No cache tokens in estimate
        0,
        &balance.balance,
    ).await
}


/// Helper function to create standardized usage response
fn create_standardized_usage_response(usage: &ProviderUsage, cost: &BigDecimal) -> Result<serde_json::Value, AppError> {
    let response = StandardizedUsageResponse {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.prompt_tokens + usage.completion_tokens,
        cache_write_tokens: usage.cache_write_tokens,
        cache_read_tokens: usage.cache_read_tokens,
        cached_input_tokens: usage.cache_write_tokens + usage.cache_read_tokens,
        cost: Some(cost.to_string().parse::<f64>().unwrap_or(0.0)),
    };
    serde_json::to_value(response).map_err(|e| AppError::Internal(format!("Failed to serialize usage response: {}", e)))
}


#[derive(Deserialize, Serialize, Clone)]
pub struct LlmCompletionRequest {
    pub model: String,
    pub messages: Vec<Value>,
    pub stream: Option<bool>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub task_type: Option<String>,
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
    
    // Extract or generate unique request ID for tracking streaming costs
    let request_id = payload.other.get("request_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    
    info!("Processing LLM chat completion request for user: {} (request_id: {})", user_id, request_id);
    
    // Extract model ID from request payload
    let model_id = payload.model.clone();
    debug!("Routing request for model: {}", model_id);
    
    // Look up model with provider information
    let model_with_provider = model_repository
        .find_by_id_with_provider(&model_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found or inactive", model_id)))?;
    
    info!("Routing to provider: {} for model: {}", model_with_provider.provider_code, model_with_provider.name);
    
    // Comprehensive cost and security validation
    let _estimated_cost = validate_api_request(
        &user_id,
        &model_with_provider,
        payload.max_tokens,
        &billing_service,
    ).await?;
    
    // Check if request is streaming
    let is_streaming = payload.stream.unwrap_or(false);
    
    // Check if task type indicates web search functionality
    let web_mode = payload.task_type.as_ref()
        .map(|task_type| task_type == "web_search_execution")
        .unwrap_or(false);
    
    // Extract payload for different handler types
    let payload_inner = payload.into_inner();
    let payload_value = serde_json::to_value(&payload_inner)?;
    
    // Route to appropriate provider based on provider_code
    match model_with_provider.provider_code.as_str() {
        "openai" => {
            if is_streaming {
                handle_openai_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), model_repository.clone(), web_mode).await
            } else {
                handle_openai_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), model_repository.clone(), web_mode).await
            }
        },
        "anthropic" => {
            if is_streaming {
                handle_anthropic_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), model_repository.clone()).await
            } else {
                handle_anthropic_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), model_repository.clone()).await
            }
        },
        "google" => {
            if is_streaming {
                handle_google_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), model_repository.clone()).await
            } else {
                handle_google_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), model_repository.clone()).await
            }
        },
        "deepseek" => {
            // Route DeepSeek models through OpenRouter
            if is_streaming {
                handle_openrouter_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), Arc::clone(&model_repository), &request_id).await
            } else {
                handle_openrouter_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), Arc::clone(&model_repository)).await
            }
        },
        "openrouter" => {
            // Route OpenRouter models
            if is_streaming {
                handle_openrouter_streaming_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), Arc::clone(&model_repository), &request_id).await
            } else {
                handle_openrouter_request(payload_value.clone(), &model_with_provider, &user_id, &app_settings, Arc::clone(&billing_service), Arc::clone(&model_repository)).await
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
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    web_mode: bool,
) -> Result<HttpResponse, AppError> {
    let client = OpenAIClient::new(app_settings)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    // Clone payload for fallback use
    let payload_value_clone = payload.clone();
    let mut request = client.convert_to_openai_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (response, _headers) = match client.chat_completion(request, web_mode).await {
        Ok((response, headers, _, _, _, _)) => (response, headers),
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] OpenAI request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_request(payload_value_clone, model, user_id, app_settings, billing_service, Arc::new(model_repository.get_ref().clone())).await;
            }
            return Err(error);
        }
    };
    
    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;
    
    // Get usage from provider using unified extraction
    let usage = client.extract_from_http_body(response_body.as_bytes(), &model.id, false).await?;
    let final_cost = CostResolver::resolve(usage.clone(), &model);
    
    // Create API usage entry
    let api_usage = ApiUsageEntryDto {
        user_id: *user_id,
        service_name: model.id.clone(),
        tokens_input: usage.prompt_tokens as i64,
        tokens_output: usage.completion_tokens as i64,
        cache_write_tokens: usage.cache_write_tokens as i64,
        cache_read_tokens: usage.cache_read_tokens as i64,
        request_id: Some(request_id),
        metadata: None,
        provider_reported_cost: usage.cost.as_ref().map(|c| BigDecimal::from_str(&c.to_string()).unwrap_or_default()),
    };
    
    let (api_usage_record, _user_credit) = billing_service
        .charge_for_api_usage(api_usage, final_cost)
        .await?;
    let cost = api_usage_record.cost;
    
    // Convert to OpenRouter format for consistent client parsing with standardized usage
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage_response = create_standardized_usage_response(&usage, &cost)?;
        obj.insert("usage".to_string(), usage_response);
    }
    
    Ok(HttpResponse::Ok().json(response_value))
}

/// Handle OpenAI streaming request
async fn handle_openai_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    web_mode: bool,
) -> Result<HttpResponse, AppError> {
    let payload_value_clone = payload.clone();
    
    let client = OpenAIClient::new(app_settings)?;
    let mut request = client.convert_to_openai_request(payload)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    request.model = model.api_model_id.clone();
    
    let (_headers, provider_stream) = match client.stream_chat_completion(request, web_mode).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] OpenAI streaming request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_streaming_request(payload_value_clone, model, user_id, app_settings, billing_service, Arc::clone(&model_repository), &request_id).await;
            }
            return Err(error);
        }
    };
    
    let transformer = Box::new(OpenAIStreamTransformer::new(&model.id));
    let standardized_handler = StandardizedStreamHandler::new(
        provider_stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
    );
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(standardized_handler))
}

/// Handle Anthropic non-streaming request
async fn handle_anthropic_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = AnthropicClient::new(app_settings)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    let mut request = client.convert_to_chat_request(payload)?;
    
    // Use the pre-computed API model ID
    request.model = model.api_model_id.clone();
    
    let (response, _headers, _, _, _, _) = match client.chat_completion(request, &user_id.to_string()).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] Anthropic request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_request(payload_clone, model, user_id, app_settings, billing_service, Arc::clone(&model_repository)).await;
            } else {
                return Err(error);
            }
        }
    };
    
    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;
    
    // Get usage from provider using unified extraction
    let usage = client.extract_from_http_body(response_body.as_bytes(), &model.id, false).await?;
    let final_cost = CostResolver::resolve(usage.clone(), &model);
    
    // Create API usage entry
    let api_usage = ApiUsageEntryDto {
        user_id: *user_id,
        service_name: model.id.clone(),
        tokens_input: usage.prompt_tokens as i64,
        tokens_output: usage.completion_tokens as i64,
        cache_write_tokens: usage.cache_write_tokens as i64,
        cache_read_tokens: usage.cache_read_tokens as i64,
        request_id: Some(request_id),
        metadata: None,
        provider_reported_cost: usage.cost.as_ref().map(|c| BigDecimal::from_str(&c.to_string()).unwrap_or_default()),
    };
    
    let (api_usage_record, _user_credit) = billing_service
        .charge_for_api_usage(api_usage, final_cost)
        .await?;
    let cost = api_usage_record.cost;
    
    // Transform Anthropic response to OpenRouter format for consistent client parsing
    let usage_response = create_standardized_usage_response(&usage, &cost)?;
    
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
        "usage": usage_response
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
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = AnthropicClient::new(app_settings)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let mut request = client.convert_to_chat_request(payload)?;
    
    request.model = model.api_model_id.clone();
    
    let (headers, provider_stream) = match client.stream_chat_completion(request, user_id.to_string()).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] Anthropic streaming request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_streaming_request(payload_clone, model, user_id, app_settings, billing_service, Arc::clone(&model_repository), &request_id).await;
            }
            return Err(error);
        }
    };
    
    let transformer = Box::new(AnthropicStreamTransformer::new(&model.id));
    let standardized_handler = StandardizedStreamHandler::new(
        provider_stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
    );
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(standardized_handler))
}

/// Handle Google non-streaming request
async fn handle_google_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = GoogleClient::new(app_settings)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    let request = client.convert_to_chat_request_with_capabilities(payload, Some(&model.capabilities))?;
    
    let (response, _headers, _, _, _, _) = match client.chat_completion(request, &model.api_model_id, &user_id.to_string()).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] Google request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_request(payload_clone, model, user_id, app_settings, billing_service, Arc::clone(&model_repository)).await;
            }
            return Err(error);
        }
    };
    
    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;
    
    // Get usage from provider using unified extraction
    let usage = client.extract_from_http_body(response_body.as_bytes(), &model.id, false).await?;
    let final_cost = CostResolver::resolve(usage.clone(), &model);
    
    // Create API usage entry
    let api_usage = ApiUsageEntryDto {
        user_id: *user_id,
        service_name: model.id.clone(),
        tokens_input: usage.prompt_tokens as i64,
        tokens_output: usage.completion_tokens as i64,
        cache_write_tokens: usage.cache_write_tokens as i64,
        cache_read_tokens: usage.cache_read_tokens as i64,
        request_id: Some(request_id),
        metadata: None,
        provider_reported_cost: usage.cost.as_ref().map(|c| BigDecimal::from_str(&c.to_string()).unwrap_or_default()),
    };
    
    let (api_usage_record, _user_credit) = billing_service
        .charge_for_api_usage(api_usage, final_cost)
        .await?;
    let cost = api_usage_record.cost;
    
    // Transform Google response to OpenRouter format for consistent client parsing
    let response_value = serde_json::to_value(&response)?;
    let content = response_value["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("");
    
    let usage_response = create_standardized_usage_response(&usage, &cost)?;
    
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
        "usage": usage_response
    });
    
    Ok(HttpResponse::Ok().json(openrouter_response))
}

/// Handle Google streaming request using standardized architecture
async fn handle_google_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let request_id = uuid::Uuid::new_v4().to_string();
    let client = GoogleClient::new(app_settings)?;
    let request = client.convert_to_chat_request_with_capabilities(payload, Some(&model.capabilities))?;
    
    let (_headers, google_stream) = match client.stream_chat_completion(request, model.api_model_id.clone(), user_id.to_string()).await {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!("[FALLBACK] Google streaming request failed, retrying with OpenRouter: {}", error);
                return handle_openrouter_streaming_request(payload_clone, model, user_id, app_settings, billing_service, Arc::clone(&model_repository), &uuid::Uuid::new_v4().to_string()).await;
            }
            return Err(error);
        }
    };
    
    // Use standardized streaming handler with Google transformer
    let transformer = Box::new(GoogleStreamTransformer::new(&model.id));
    let standardized_handler = StandardizedStreamHandler::new(
        google_stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service,
        request_id,
    );
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(standardized_handler))
}

/// Handle OpenRouter (DeepSeek) non-streaming request
async fn handle_openrouter_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: Arc<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings, model_repository)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    
    let mut request = client.convert_to_chat_request(payload)?;
    
    request.model = model.api_model_id.clone();
    
    let (response, _headers, _, _, _, _) = client.chat_completion(request, &user_id.to_string()).await?;
    
    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;
    
    // Get usage from provider using unified extraction
    let usage = client.extract_from_http_body(response_body.as_bytes(), &model.id, false).await?;
    let final_cost = CostResolver::resolve(usage.clone(), &model);
    
    // Create API usage entry
    let api_usage = ApiUsageEntryDto {
        user_id: *user_id,
        service_name: model.id.clone(),
        tokens_input: usage.prompt_tokens as i64,
        tokens_output: usage.completion_tokens as i64,
        cache_write_tokens: usage.cache_write_tokens as i64,
        cache_read_tokens: usage.cache_read_tokens as i64,
        request_id: Some(request_id),
        metadata: None,
        provider_reported_cost: usage.cost.as_ref().map(|c| BigDecimal::from_str(&c.to_string()).unwrap_or_default()),
    };
    
    let (api_usage_record, _user_credit) = billing_service
        .charge_for_api_usage(api_usage, final_cost)
        .await?;
    let cost = api_usage_record.cost;
    
    // Update response with centrally resolved cost using standardized usage
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage_response = create_standardized_usage_response(&usage, &cost)?;
        obj.insert("usage".to_string(), usage_response);
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
    model_repository: Arc<ModelRepository>,
    request_id: &str, // Use request_id from desktop client
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings, model_repository)?;
    let mut request = client.convert_to_chat_request(payload)?;
    
    request.model = model.api_model_id.clone();
    
    let (_headers, stream) = client.stream_chat_completion(request, user_id.to_string()).await?;
    
    let transformer = Box::new(OpenRouterStreamTransformer::new(&model.id));
    let standardized_handler = StandardizedStreamHandler::new(
        stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id.to_string(),
    );
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(standardized_handler))
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

    // Pre-validation will be done after we get the model information

    let mut model = String::new();
    let mut file_data = Vec::new();
    let mut filename = String::new();
    let mut language: Option<String> = None;
    let mut prompt: Option<String> = None;
    let mut temperature: Option<f32> = None;
    let mut mime_type: Option<String> = None;

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

    // Comprehensive cost and security validation for transcription
    let _estimated_cost = validate_api_request(
        &user_id,
        &model_with_provider,
        None, // No max_tokens for transcription
        &billing_service,
    ).await?;

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


    let response = TranscriptionResponse {
        text: transcription_text,
    };

    Ok(HttpResponse::Ok().json(response))
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
        cached_input_tokens: 0,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
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




