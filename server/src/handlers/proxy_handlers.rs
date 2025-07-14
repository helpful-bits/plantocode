use crate::clients::usage_extractor::ProviderUsage;
use crate::clients::{
    AnthropicClient, GoogleClient, OpenAIClient, OpenRouterClient, UsageExtractor,
};
use crate::config::settings::AppSettings;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::models::model_pricing::ModelPricing;
use crate::models::standardized_usage_response::StandardizedUsageResponse;
use crate::services::billing_service::BillingService;
use crate::services::model_mapping_service::ModelWithMapping;
use crate::services::request_tracker::RequestTracker;
use crate::utils::transcription_validation::{
    RequestValidationContext, mime_type_to_extension, validate_server_audio_file,
    validate_server_language, validate_server_prompt, validate_server_temperature,
};
use actix_web::{HttpResponse, web};
use bigdecimal::BigDecimal;
use chrono;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use tracing::{debug, error, info, instrument, warn};
use uuid::{self, Uuid};

use actix_multipart::Multipart;
use futures_util::{Stream, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use std::pin::Pin;

use crate::handlers::provider_transformers::{
    AnthropicStreamTransformer, GoogleStreamTransformer, OpenAIStreamTransformer,
    OpenRouterStreamTransformer,
};
use crate::handlers::streaming_handler::StandardizedStreamHandler;

/// Helper function to determine if an error should trigger a fallback to OpenRouter
fn is_fallback_error(error: &AppError) -> bool {
    match error {
        AppError::External(_) => true,
        AppError::TooManyRequests(_) => true,
        AppError::BadRequest(msg) => {
            msg.contains("rate limit") || msg.contains("quota") || msg.contains("capacity")
        }
        AppError::Internal(msg) => {
            msg.contains("deserialization failed") || msg.contains("JSON parse")
        }
        _ => false,
    }
}

/// Calculate input tokens from request payload
fn calculate_input_tokens(payload: &LlmCompletionRequest) -> i32 {
    use crate::utils::token_estimator::estimate_tokens;

    let mut total_chars = 0;

    // Count characters in all messages
    for message in &payload.messages {
        // Count characters in the message content
        match message {
            serde_json::Value::Object(obj) => {
                if let Some(content) = obj.get("content") {
                    match content {
                        serde_json::Value::String(s) => {
                            total_chars += s.len();
                        }
                        serde_json::Value::Array(arr) => {
                            for part in arr {
                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    total_chars += text.len();
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    // Use token estimator to convert characters to tokens
    estimate_tokens(&"x".repeat(total_chars)) as i32
}

/// Helper function to create standardized usage response
fn create_standardized_usage_response(
    usage: &ProviderUsage,
    cost: &BigDecimal,
) -> Result<serde_json::Value, AppError> {
    let response = StandardizedUsageResponse {
        prompt_tokens: usage.prompt_tokens as u32,
        completion_tokens: usage.completion_tokens as u32,
        total_tokens: (usage.prompt_tokens + usage.completion_tokens) as u32,
        cache_write_tokens: usage.cache_write_tokens as u32,
        cache_read_tokens: usage.cache_read_tokens as u32,
        cost: Some(cost.to_string().parse::<f64>().unwrap_or(0.0)),
    };
    serde_json::to_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to serialize usage response: {}", e)))
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
#[instrument(skip(
    payload,
    app_settings,
    billing_service,
    model_repository,
    user,
    request_tracker
))]
pub async fn llm_chat_completion_handler(
    payload: web::Json<LlmCompletionRequest>,
    user: web::ReqData<AuthenticatedUser>,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    // User ID is already extracted by authentication middleware
    let user_id = user.user_id;

    // Generate unique request ID for tracking
    let request_id = uuid::Uuid::new_v4().to_string();

    info!(
        "Processing LLM chat completion request for user: {} (request_id: {})",
        user_id, request_id
    );

    // Extract model ID from request payload
    let model_id = payload.model.clone();
    debug!("Routing request for model: {}", model_id);

    // Look up model with provider information
    let model_with_provider = model_repository
        .find_by_id_with_provider(&model_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found or inactive", model_id)))?;

    // Validate prompt size against model's context window
    if model_with_provider.context_window > 0 {
        let context_window = model_with_provider.context_window;
        let estimated_tokens = calculate_input_tokens(&payload) as u32;
        if estimated_tokens > context_window as u32 {
            return Err(AppError::BadRequest(format!(
                "Prompt size ({} tokens) exceeds the model's context window ({} tokens)",
                estimated_tokens, context_window
            )));
        }
    }

    info!(
        "Routing to provider: {} for model: {}",
        model_with_provider.provider_code, model_with_provider.name
    );

    // Track the request in the request tracker
    request_tracker
        .track_request(
            request_id.clone(),
            user_id,
            model_with_provider.provider_code.clone(),
        )
        .await;

    // Calculate estimated input tokens for initial charge
    let estimated_input_tokens = calculate_input_tokens(&payload);
    info!("Estimated input tokens: {} tokens", estimated_input_tokens);

    // Create API usage entry for initial charge
    let api_usage_entry = ApiUsageEntryDto {
        user_id,
        service_name: model_with_provider.id.clone(),
        tokens_input: estimated_input_tokens as i64,
        tokens_output: 0,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        request_id: Some(request_id.clone()),
        metadata: Some(serde_json::json!({
            "billing_type": "initial_estimate",
            "timestamp": chrono::Utc::now().to_rfc3339()
        })),
        provider_reported_cost: None,
    };

    // Initiate API charge with estimated usage
    billing_service.initiate_api_charge(api_usage_entry).await?;

    info!(
        "Initiated API charge for request {}: estimated {} input tokens",
        request_id, estimated_input_tokens
    );

    // Check if task type indicates web search functionality
    let web_mode = payload
        .task_type
        .as_ref()
        .map(|task_type| task_type == "web_search_execution")
        .unwrap_or(false);

    // Check if request is streaming
    let is_streaming = payload.stream.unwrap_or(false);
    debug!("Request mode - web_mode: {}, is_streaming: {}", web_mode, is_streaming);

    // Extract payload for different handler types
    let payload_inner = payload.into_inner();
    let payload_value = serde_json::to_value(&payload_inner)?;

    // Get model with mapping information for the specific provider
    let model_with_mapping = model_repository
        .find_by_id_with_mapping(&model_id, &model_with_provider.provider_code)
        .await?
        .ok_or_else(|| {
            AppError::NotFound(format!(
                "Model mapping not found for '{}' with provider '{}'",
                model_id, model_with_provider.provider_code
            ))
        })?;

    // Route to appropriate provider based on provider_code
    match model_with_provider.provider_code.as_str() {
        "openai" => {
            if is_streaming {
                handle_openai_streaming_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    web_mode,
                    request_id.clone(),
                    request_tracker.clone(),
                    estimated_input_tokens,
                )
                .await
            } else {
                handle_openai_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    web_mode,
                    request_id.clone(),
                    request_tracker.clone(),
                )
                .await
            }
        }
        "anthropic" => {
            if is_streaming {
                handle_anthropic_streaming_request(
                    payload_value.clone(),
                    &model_with_mapping,
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    request_id.clone(),
                    estimated_input_tokens,
                )
                .await
            } else {
                handle_anthropic_request(
                    payload_value.clone(),
                    &model_with_mapping,
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    request_id.clone(),
                )
                .await
            }
        }
        "google" => {
            if is_streaming {
                handle_google_streaming_request(
                    payload_value.clone(),
                    &model_with_mapping,
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    request_id.clone(),
                    estimated_input_tokens,
                )
                .await
            } else {
                handle_google_request(
                    payload_value.clone(),
                    &model_with_mapping,
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    request_id.clone(),
                )
                .await
            }
        }
        "deepseek" => {
            // Route DeepSeek models through OpenRouter
            if is_streaming {
                handle_openrouter_streaming_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    Arc::clone(&model_repository),
                    request_id.clone(),
                    estimated_input_tokens,
                )
                .await
            } else {
                handle_openrouter_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    Arc::clone(&model_repository),
                    request_id.clone(),
                )
                .await
            }
        }
        "openrouter" => {
            // Route OpenRouter models
            if is_streaming {
                handle_openrouter_streaming_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    Arc::clone(&model_repository),
                    request_id.clone(),
                    estimated_input_tokens,
                )
                .await
            } else {
                handle_openrouter_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    Arc::clone(&model_repository),
                    request_id.clone(),
                )
                .await
            }
        }
        _ => {
            error!(
                "Unsupported provider: {}",
                model_with_provider.provider_code
            );
            Err(AppError::BadRequest(format!(
                "Provider '{}' is not supported",
                model_with_provider.provider_code
            )))
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
    request_id: String,
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    let client = OpenAIClient::new(app_settings)?;

    // Clone payload for fallback use
    let payload_value_clone = payload.clone();
    let mut request = client.convert_to_openai_request(payload)?;

    // Use the resolved model ID from mapping service
    request.model = model.resolved_model_id.clone();

    let (response, _headers, response_id) = match client.chat_completion(request, web_mode).await {
        Ok((response, headers, _, _, _, _, response_id)) => (response, headers, response_id),
        Err(error) => {
            if is_fallback_error(&error) {
                warn!(
                    "[FALLBACK] OpenAI request failed, retrying with OpenRouter: {}",
                    error
                );
                // Note: OpenRouter doesn't support cancellation, so we don't pass request_tracker
                return handle_openrouter_request(
                    payload_value_clone,
                    model,
                    user_id,
                    app_settings,
                    billing_service,
                    Arc::new(model_repository.get_ref().clone()),
                    request_id,
                )
                .await;
            }
            return Err(error);
        }
    };

    // Update request tracker with OpenAI response_id if available
    if let Some(openai_response_id) = response_id {
        if let Err(e) = request_tracker
            .update_openai_response_id(&request_id, openai_response_id)
            .await
        {
            warn!("Failed to update request tracker with response_id: {}", e);
        }
    }

    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;

    // Get usage from provider using unified extraction
    let usage = client
        .extract_from_http_body(response_body.as_bytes(), &model.id, false)
        .await?;

    // Finalize API charge with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge(&request_id, user_id, usage.clone())
        .await?;

    // Convert to OpenRouter format for consistent client parsing with standardized usage
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage_response = create_standardized_usage_response(&usage, &api_usage_record.cost)?;
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
    request_id: String,
    request_tracker: web::Data<RequestTracker>,
    estimated_input_tokens: i32,
) -> Result<HttpResponse, AppError> {
    let payload_value_clone = payload.clone();

    let client = OpenAIClient::new(app_settings)?;
    let mut request = client.convert_to_openai_request(payload)?;

    request.model = model.resolved_model_id.clone();

    let (_headers, provider_stream, response_id) =
        match client.stream_chat_completion(request, web_mode).await {
            Ok(result) => result,
            Err(error) => {
                if is_fallback_error(&error) {
                    warn!(
                        "[FALLBACK] OpenAI streaming request failed, retrying with OpenRouter: {}",
                        error
                    );
                    // Note: OpenRouter doesn't support cancellation, so we don't pass request_tracker
                    return handle_openrouter_streaming_request(
                        payload_value_clone,
                        model,
                        user_id,
                        app_settings,
                        billing_service,
                        Arc::clone(&model_repository),
                        request_id,
                        estimated_input_tokens,
                    )
                    .await;
                }
                return Err(error);
            }
        };

    // Update request tracker with OpenAI response_id if available
    if let Some(openai_response_id) = response_id {
        if let Err(e) = request_tracker
            .update_openai_response_id(&request_id, openai_response_id)
            .await
        {
            warn!("Failed to update request tracker with response_id: {}", e);
        }
    }

    let transformer = Box::new(OpenAIStreamTransformer::new(&model.id));
    let standardized_handler = StandardizedStreamHandler::new(
        provider_stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
        estimated_input_tokens as i64,
    );

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(standardized_handler))
}

/// Handle Anthropic non-streaming request
async fn handle_anthropic_request(
    payload: Value,
    model_with_mapping: &ModelWithMapping,
    model_with_provider: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    request_id: String,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = AnthropicClient::new(app_settings)?;

    let mut request = client.convert_to_chat_request(payload)?;

    let (response, _headers, _, _, _, _) = match client
        .chat_completion(request, &model_with_mapping, &user_id.to_string())
        .await
    {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!(
                    "[FALLBACK] Anthropic request failed, retrying with OpenRouter: {}",
                    error
                );
                return handle_openrouter_request(
                    payload_clone,
                    &model_with_provider,
                    user_id,
                    app_settings,
                    billing_service,
                    Arc::clone(&model_repository),
                    request_id,
                )
                .await;
            } else {
                return Err(error);
            }
        }
    };

    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;

    // Get usage from provider using unified extraction
    let usage = client
        .extract_from_http_body(response_body.as_bytes(), &model_with_provider.id, false)
        .await?;

    // Two-phase billing: Finalize the request with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge(&request_id, user_id, usage.clone())
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
    model_with_mapping: &ModelWithMapping,
    model_with_provider: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    request_id: String,
    estimated_input_tokens: i32,
) -> Result<HttpResponse, AppError> {
    let payload_clone = payload.clone();
    let client = AnthropicClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;

    let (headers, provider_stream) = match client
        .stream_chat_completion(request, &model_with_mapping, user_id.to_string())
        .await
    {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!(
                    "[FALLBACK] Anthropic streaming request failed, retrying with OpenRouter: {}",
                    error
                );
                return handle_openrouter_streaming_request(
                    payload_clone,
                    &model_with_provider,
                    user_id,
                    app_settings,
                    billing_service,
                    Arc::clone(&model_repository),
                    request_id,
                    estimated_input_tokens,
                )
                .await;
            }
            return Err(error);
        }
    };

    let transformer = Box::new(AnthropicStreamTransformer::new(&model_with_provider.id));
    let standardized_handler = StandardizedStreamHandler::new(
        provider_stream,
        transformer,
        model_with_provider.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
        estimated_input_tokens as i64,
    );

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(standardized_handler))
}

/// Handle Google non-streaming request
async fn handle_google_request(
    payload: Value,
    model_with_mapping: &ModelWithMapping,
    model_with_provider: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    request_id: String,
) -> Result<HttpResponse, AppError> {
    // Extract the original model ID from the payload before it gets transformed
    let original_model_id = payload["model"].as_str().unwrap_or_default().to_string();
    let payload_clone = payload.clone();
    let client = GoogleClient::new(app_settings)?;

    let request = client.convert_to_chat_request_with_capabilities(
        payload,
        Some(&model_with_provider.capabilities),
    )?;

    let (response, _headers, _, _, _, _) = match client
        .chat_completion(request, &model_with_mapping, &user_id.to_string())
        .await
    {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!(
                    "[FALLBACK] Google request failed, retrying with OpenRouter: {}",
                    error
                );
                // Get the model with OpenRouter mapping
                let openrouter_mapping = model_repository
                    .find_by_id_with_mapping(&original_model_id, "openrouter")
                    .await?
                    .ok_or_else(|| {
                        AppError::NotFound(format!(
                            "Model '{}' not found for OpenRouter fallback",
                            original_model_id
                        ))
                    })?;

                // Create a ModelWithProvider from the mapping for OpenRouter
                let openrouter_model = ModelWithProvider {
                    id: openrouter_mapping.id,
                    name: openrouter_mapping.name,
                    context_window: openrouter_mapping.context_window,
                    pricing_info: openrouter_mapping.pricing_info,
                    model_type: openrouter_mapping.model_type,
                    capabilities: openrouter_mapping.capabilities,
                    status: openrouter_mapping.status,
                    description: openrouter_mapping.description,
                    created_at: openrouter_mapping.created_at,
                    provider_id: openrouter_mapping.provider_id,
                    provider_code: openrouter_mapping.provider_code,
                    provider_name: openrouter_mapping.provider_name,
                    provider_description: openrouter_mapping.provider_description,
                    provider_website: openrouter_mapping.provider_website,
                    provider_api_base: openrouter_mapping.provider_api_base,
                    provider_capabilities: openrouter_mapping.provider_capabilities,
                    provider_status: openrouter_mapping.provider_status,
                    resolved_model_id: openrouter_mapping.resolved_model_id,
                };

                return handle_openrouter_request(
                    payload_clone,
                    &openrouter_model,
                    user_id,
                    app_settings,
                    billing_service,
                    Arc::clone(&model_repository),
                    request_id,
                )
                .await;
            }
            return Err(error);
        }
    };

    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;

    // Get usage from provider using unified extraction
    let usage = client
        .extract_from_http_body(response_body.as_bytes(), &model_with_provider.id, false)
        .await?;

    // Two-phase billing: Finalize the request with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge(&request_id, user_id, usage.clone())
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
        "model": model_with_provider.id,
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
    model_with_mapping: &ModelWithMapping,
    model_with_provider: &ModelWithProvider,
    user_id: &Uuid,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    request_id: String,
    estimated_input_tokens: i32,
) -> Result<HttpResponse, AppError> {
    // Extract the original model ID from the payload before it gets transformed
    let original_model_id = payload["model"].as_str().unwrap_or_default().to_string();
    let payload_clone = payload.clone();
    let client = GoogleClient::new(app_settings)?;
    let request = client.convert_to_chat_request_with_capabilities(
        payload,
        Some(&model_with_provider.capabilities),
    )?;

    let (_headers, google_stream) = match client
        .stream_chat_completion(request, &model_with_mapping, user_id.to_string())
        .await
    {
        Ok(result) => result,
        Err(error) => {
            if is_fallback_error(&error) {
                warn!(
                    "[FALLBACK] Google streaming request failed, retrying with OpenRouter: {}",
                    error
                );
                // Get the model with OpenRouter mapping
                let openrouter_mapping = model_repository
                    .find_by_id_with_mapping(&original_model_id, "openrouter")
                    .await?
                    .ok_or_else(|| {
                        AppError::NotFound(format!(
                            "Model '{}' not found for OpenRouter fallback",
                            original_model_id
                        ))
                    })?;

                // Create a ModelWithProvider from the mapping for OpenRouter
                let openrouter_model = ModelWithProvider {
                    id: openrouter_mapping.id,
                    name: openrouter_mapping.name,
                    context_window: openrouter_mapping.context_window,
                    pricing_info: openrouter_mapping.pricing_info,
                    model_type: openrouter_mapping.model_type,
                    capabilities: openrouter_mapping.capabilities,
                    status: openrouter_mapping.status,
                    description: openrouter_mapping.description,
                    created_at: openrouter_mapping.created_at,
                    provider_id: openrouter_mapping.provider_id,
                    provider_code: openrouter_mapping.provider_code,
                    provider_name: openrouter_mapping.provider_name,
                    provider_description: openrouter_mapping.provider_description,
                    provider_website: openrouter_mapping.provider_website,
                    provider_api_base: openrouter_mapping.provider_api_base,
                    provider_capabilities: openrouter_mapping.provider_capabilities,
                    provider_status: openrouter_mapping.provider_status,
                    resolved_model_id: openrouter_mapping.resolved_model_id,
                };

                return handle_openrouter_streaming_request(
                    payload_clone,
                    &openrouter_model,
                    user_id,
                    app_settings,
                    billing_service,
                    Arc::clone(&model_repository),
                    request_id,
                    estimated_input_tokens,
                )
                .await;
            }
            return Err(error);
        }
    };

    // Use standardized streaming handler with Google transformer
    let transformer = Box::new(GoogleStreamTransformer::new(&model_with_provider.id));
    let standardized_handler = StandardizedStreamHandler::new(
        google_stream,
        transformer,
        model_with_provider.clone(),
        *user_id,
        billing_service,
        request_id,
        estimated_input_tokens as i64,
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
    request_id: String,
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings, model_repository)?;

    let mut request = client.convert_to_chat_request(payload)?;

    request.model = model.id.clone();

    let (response, _headers, _, _, _, _) = client
        .chat_completion(request, &user_id.to_string())
        .await?;

    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;

    // Get usage from provider using unified extraction
    let usage = client
        .extract_from_http_body(response_body.as_bytes(), &model.id, false)
        .await?;

    // Two-phase billing: Finalize the request with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge(&request_id, user_id, usage.clone())
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
    request_id: String,
    estimated_input_tokens: i32,
) -> Result<HttpResponse, AppError> {
    let client = OpenRouterClient::new(app_settings, model_repository)?;
    let mut request = client.convert_to_chat_request(payload)?;

    request.model = model.id.clone();

    let (_headers, stream) = client
        .stream_chat_completion(request, user_id.to_string())
        .await?;

    let transformer = Box::new(OpenRouterStreamTransformer::new(&model.id));
    let standardized_handler = StandardizedStreamHandler::new(
        stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
        estimated_input_tokens as i64,
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
#[instrument(skip(payload, user, app_settings, billing_service, model_repository))]
pub async fn transcription_handler(
    mut payload: Multipart,
    user: web::ReqData<AuthenticatedUser>,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;
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
    while let Some(mut field) = payload
        .try_next()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to parse multipart data: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "model" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read field data: {}", e))
                })? {
                    data.extend_from_slice(&chunk);
                }
                model = String::from_utf8(data)
                    .map_err(|e| AppError::BadRequest(format!("Invalid model field: {}", e)))?;
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

                while let Some(chunk) = field
                    .try_next()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Failed to read file data: {}", e)))?
                {
                    file_data.extend_from_slice(&chunk);
                }
            }
            "language" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read language field: {}", e))
                })? {
                    data.extend_from_slice(&chunk);
                }
                if !data.is_empty() {
                    language = Some(String::from_utf8(data).map_err(|e| {
                        AppError::BadRequest(format!("Invalid language field: {}", e))
                    })?);
                }
            }
            "prompt" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read prompt field: {}", e))
                })? {
                    data.extend_from_slice(&chunk);
                }
                if !data.is_empty() {
                    prompt = Some(String::from_utf8(data).map_err(|e| {
                        AppError::BadRequest(format!("Invalid prompt field: {}", e))
                    })?);
                }
            }
            "temperature" => {
                let mut data = Vec::new();
                while let Some(chunk) = field.try_next().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read temperature field: {}", e))
                })? {
                    data.extend_from_slice(&chunk);
                }
                if !data.is_empty() {
                    let temp_str = String::from_utf8(data).map_err(|e| {
                        AppError::BadRequest(format!("Invalid temperature field: {}", e))
                    })?;
                    temperature = Some(temp_str.parse().map_err(|e| {
                        AppError::BadRequest(format!("Invalid temperature value: {}", e))
                    })?);
                }
            }
            _ => {
                // Skip unknown fields
                while let Some(_chunk) = field.try_next().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to skip field data: {}", e))
                })? {
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

    // Validate user has sufficient credits
    let balance = billing_service
        .get_credit_service()
        .get_user_balance(&user_id)
        .await?;
    if balance.balance <= BigDecimal::from(0) {
        return Err(AppError::CreditInsufficient(
            "No credits available".to_string(),
        ));
    }

    // Use the resolved model ID for the actual API call
    let resolved_model_id = &model_with_provider.resolved_model_id;

    if file_data.is_empty() {
        return Err(AppError::BadRequest("Audio file is required".to_string()));
    }

    // Create validation context
    let validation_context = RequestValidationContext {
        user_id: user_id.to_string(),
        client_ip: "127.0.0.1".to_string(), // TODO: Extract from request headers
        user_agent: None,                   // TODO: Extract from request headers
        request_timestamp: chrono::Utc::now(),
    };

    // Validate parameters using validation module functions
    let validated_language =
        validate_server_language(language.as_deref()).map_err(|e| AppError::from(e))?;

    let validated_prompt =
        validate_server_prompt(prompt.as_deref()).map_err(|e| AppError::from(e))?;

    let validated_temperature =
        validate_server_temperature(temperature).map_err(|e| AppError::from(e))?;

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
    let _validated_audio =
        validate_server_audio_file(&filename, &cleaned_mime_type, file_data.len())
            .map_err(|e| AppError::from(e))?;

    // Use OpenAI client for transcription
    let client = OpenAIClient::new(&app_settings)?;

    // Call the transcription API using the resolved model ID and validated parameters
    let transcription_text = client
        .transcribe_audio(
            &file_data,
            &filename,
            resolved_model_id,
            validated_language.as_deref(),
            validated_prompt.as_deref(),
            validated_temperature,
            &cleaned_mime_type,
        )
        .await?;

    let response = TranscriptionResponse {
        text: transcription_text,
    };

    Ok(HttpResponse::Ok().json(response))
}
