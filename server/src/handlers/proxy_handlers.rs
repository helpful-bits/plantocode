use crate::clients::usage_extractor::ProviderUsage;
use crate::clients::{
    AnthropicClient, GoogleClient, OpenAIClient, OpenRouterClient, UsageExtractor, XaiClient,
};
use crate::config::settings::AppSettings;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::models::model_pricing::ModelPricing;
use crate::services::billing_service::BillingService;
use crate::services::model_mapping_service::ModelWithMapping;
use crate::services::request_tracker::RequestTracker;
use crate::utils::transcription_validation::{
    RequestValidationContext, mime_type_to_extension, validate_server_audio_file,
    validate_server_language, validate_server_prompt, validate_server_temperature,
};
use crate::utils::multipart_utils::process_video_analysis_multipart;
use actix_web::{HttpRequest, HttpResponse, web};
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;
use tracing::{error, info, instrument, warn};
use uuid::{self, Uuid};

use actix_multipart::Multipart;
use futures_util::{Stream, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use tokio_util::sync::CancellationToken;

use crate::handlers::provider_transformers::{
    GoogleStreamTransformer, OpenAIStreamTransformer,
    OpenRouterStreamTransformer, XaiStreamTransformer,
};
use crate::streaming::stream_handler::ModernStreamHandler;
use crate::models::error_details::{ErrorDetails, ProviderErrorInfo};
use actix_web_lab::sse;
use std::time::Duration;

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

/// Extract detailed error information from AppError
pub fn extract_error_details(error: &AppError, provider: &str) -> ErrorDetails {
    let (code, message) = match error {
        AppError::External(msg) => {
            // Try to extract provider-specific error details
            if msg.contains("context_length_exceeded") || msg.contains("context length") {
                ("context_length_exceeded", msg.clone())
            } else if msg.contains("status 429") || msg.contains("rate_limit") || msg.contains("rate limit") {
                ("rate_limit_exceeded", msg.clone())
            } else if msg.contains("status 401") || msg.contains("authentication") || msg.contains("unauthorized") {
                ("authentication_failed", msg.clone())
            } else if msg.contains("status 403") || msg.contains("forbidden") {
                ("permission_denied", msg.clone())
            } else if msg.contains("status 400") || msg.contains("bad request") {
                ("bad_request", msg.clone())
            } else if msg.contains("status 500") || msg.contains("internal server error") {
                ("provider_internal_error", msg.clone())
            } else if msg.contains("status 502") || msg.contains("bad gateway") {
                ("provider_gateway_error", msg.clone())
            } else if msg.contains("status 503") || msg.contains("service unavailable") {
                ("provider_unavailable", msg.clone())
            } else if msg.contains("timeout") || msg.contains("timed out") {
                ("timeout_error", msg.clone())
            } else if msg.contains("network") || msg.contains("connection") {
                ("network_error", msg.clone())
            } else {
                ("external_service_error", msg.clone())
            }
        }
        AppError::TooManyRequests(msg) => ("rate_limit_exceeded", msg.clone()),
        AppError::BadRequest(msg) => {
            // More specific error codes for bad requests
            if msg.contains("invalid") || msg.contains("validation") {
                ("validation_error", msg.clone())
            } else if msg.contains("missing") || msg.contains("required") {
                ("missing_parameter", msg.clone())
            } else {
                ("bad_request", msg.clone())
            }
        }
        AppError::Internal(msg) => {
            // More specific error codes for internal errors
            if msg.contains("deserialization") || msg.contains("JSON") || msg.contains("parse") {
                ("parsing_error", msg.clone())
            } else {
                ("internal_error", msg.clone())
            }
        }
        AppError::NotFound(msg) => ("not_found", msg.clone()),
        AppError::Unauthorized(msg) => ("unauthorized", msg.clone()),
        AppError::CreditInsufficient(msg) => ("insufficient_credits", msg.clone()),
        AppError::Configuration(msg) => ("configuration_error", msg.clone()),
        AppError::InvalidArgument(msg) => ("invalid_argument", msg.clone()),
        _ => ("unknown_error", error.to_string()),
    };
    
    let mut error_details = ErrorDetails::new(code, message.clone());
    
    // Extract provider error info if available
    if let AppError::External(msg) = error {
        // More robust status code extraction using regex
        let status_code = if let Some(captures) = regex::Regex::new(r"status (\d{3})").ok()
            .and_then(|re| re.captures(msg)) {
            captures.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0)
        } else {
            // Fallback to pattern matching
            if msg.contains("400") { 400 }
            else if msg.contains("401") { 401 }
            else if msg.contains("403") { 403 }
            else if msg.contains("429") { 429 }
            else if msg.contains("500") { 500 }
            else if msg.contains("502") { 502 }
            else if msg.contains("503") { 503 }
            else { 0 }
        };
        
        // Try to extract JSON error body from the message
        // Look for JSON anywhere in the message, not just at the start
        if let Some(json_start) = msg.find('{') {
            if let Some(json_end) = msg.rfind('}') {
                let json_str = &msg[json_start..=json_end];
                
                // Provider-specific error parsing
                match provider {
                    "openai" | "xai" => {
                        if let Some(provider_error) = ProviderErrorInfo::from_openai_error(status_code, json_str) {
                            error_details = error_details.with_provider_error(provider_error);
                        }
                    }
                    "anthropic" => {
                        // Anthropic has a similar error format to OpenAI
                        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(json_str) {
                            if let Some(error) = error_json.get("error") {
                                let error_type = error.get("type")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("unknown")
                                    .to_string();
                                
                                let details = error.get("message")
                                    .and_then(|m| m.as_str())
                                    .unwrap_or(json_str)
                                    .to_string();
                                
                                let provider_error = ProviderErrorInfo {
                                    provider: provider.to_string(),
                                    status_code,
                                    error_type,
                                    details,
                                    context: None,
                                };
                                error_details = error_details.with_provider_error(provider_error);
                            }
                        }
                    }
                    "google" => {
                        // Google has a different error format
                        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(json_str) {
                            if let Some(error) = error_json.get("error") {
                                let error_type = error.get("status")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("UNKNOWN")
                                    .to_string();
                                
                                let details = error.get("message")
                                    .and_then(|m| m.as_str())
                                    .unwrap_or(json_str)
                                    .to_string();
                                
                                let provider_error = ProviderErrorInfo {
                                    provider: provider.to_string(),
                                    status_code,
                                    error_type,
                                    details,
                                    context: None,
                                };
                                error_details = error_details.with_provider_error(provider_error);
                            }
                        }
                    }
                    _ => {
                        // Generic provider error handling
                        let provider_error = ProviderErrorInfo::from_provider_error(provider, status_code, json_str);
                        error_details = error_details.with_provider_error(provider_error);
                    }
                }
            }
        } else if status_code > 0 {
            // No JSON found, but we have a status code
            let provider_error = ProviderErrorInfo {
                provider: provider.to_string(),
                status_code,
                error_type: "http_error".to_string(),
                details: message.clone(),
                context: None,
            };
            error_details = error_details.with_provider_error(provider_error);
        }
    }
    
    error_details
}

/// Calculate input tokens from request payload using accurate tiktoken-rs estimation
/// 
/// This function provides accurate token estimation for upfront billing.
/// It uses the same tiktoken-rs library as the desktop client to ensure consistency.
/// 
/// # Arguments
/// 
/// * `payload` - The LLM completion request
/// * `model_id` - The model ID to use for tokenization
/// 
/// # Returns
/// 
/// Accurate token count as i32
fn calculate_input_tokens(payload: &LlmCompletionRequest, model_id: &str) -> i32 {
    use crate::utils::token_estimator::estimate_tokens_for_messages;
    
    // Use accurate tiktoken-rs estimation for upfront billing
    // This ensures consistency with desktop client estimates
    estimate_tokens_for_messages(&payload.messages, model_id) as i32
}

/// Helper function to create standardized usage response
fn create_standardized_usage_response(
    usage: &ProviderUsage,
    cost: &BigDecimal,
) -> Result<serde_json::Value, AppError> {
    // Create response with snake_case field names to match desktop client's OpenRouterUsage
    let response = serde_json::json!({
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
        "total_tokens": usage.prompt_tokens + usage.completion_tokens,
        "cost": cost.to_string().parse::<f64>().unwrap_or(0.0),
        "cache_write_tokens": usage.cache_write_tokens,
        "cache_read_tokens": usage.cache_read_tokens
    });
    
    Ok(response)
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

    // Look up model with provider information
    let model_with_provider = model_repository
        .find_by_id_with_provider(&model_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found or inactive", model_id)))?;

    // Validate prompt size against model's context window
    if model_with_provider.context_window > 0 {
        let context_window = model_with_provider.context_window;
        let estimated_tokens = calculate_input_tokens(&payload, &model_with_provider.id) as u32;
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


    // Calculate estimated input tokens for initial charge
    let base_input_tokens = calculate_input_tokens(&payload, &model_with_provider.id);
    
    // Get estimation coefficients from database for better accuracy
    let estimation_repo = crate::db::repositories::EstimationCoefficientRepository::new(
        model_repository.get_pool()
    );
    
    let (estimated_input_tokens, estimated_output_tokens) = estimation_repo
        .calculate_estimated_tokens(
            &model_with_provider.id,
            base_input_tokens as i64,
            payload.max_tokens.map(|v| v as i32)
        )
        .await?;
    
    info!("Estimated tokens (preliminary - subject to provider adjustments) - input: {} (base: {}), output: {}", 
          estimated_input_tokens, base_input_tokens, estimated_output_tokens);
    
    // Create API usage entry for initial charge
    let api_usage_entry = ApiUsageEntryDto {
        user_id,
        service_name: model_with_provider.id.clone(),
        tokens_input: estimated_input_tokens as i64,
        tokens_output: estimated_output_tokens,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        request_id: Some(request_id.clone()),
        metadata: Some(serde_json::json!({
            "billing_type": "initial_estimate",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "estimated_output": true,
            "pending_timeout_minutes": 10,
            "task_type": payload.task_type.as_deref().unwrap_or("general")
        })),
        provider_reported_cost: None,
    };

    // Initiate API charge with estimated usage
    billing_service.initiate_api_charge(api_usage_entry).await?;

    info!(
        "Initiated API charge for request {}: estimated {} input tokens, {} output tokens",
        request_id, estimated_input_tokens, estimated_output_tokens
    );

    // Check if task type indicates web search functionality
    let web_mode = payload
        .task_type
        .as_ref()
        .map(|task_type| task_type == "web_search_execution")
        .unwrap_or(false);

    // Check if request is streaming
    let is_streaming = payload.stream.unwrap_or(false);

    // Track the request in the request tracker
    request_tracker
        .track_request(
            request_id.clone(),
            user_id,
            model_with_provider.provider_code.clone(),
            is_streaming,
        )
        .await;

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
                    web_mode,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    request_id.clone(),
                    request_tracker.clone(),
                )
                .await
            } else {
                handle_openai_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    web_mode,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    request_id.clone(),
                    request_tracker.clone(),
                )
                .await
            }
        }
        "xai" => {
            if is_streaming {
                handle_xai_streaming_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    web_mode,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    request_id.clone(),
                    request_tracker.clone(),
                )
                .await
            } else {
                handle_xai_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    web_mode,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    model_repository.clone(),
                    request_id.clone(),
                    request_tracker.clone(),
                )
                .await
            }
        }
        "anthropic" => {
            if is_streaming {
                // Anthropic streaming has been removed - fallback to OpenRouter
                handle_openrouter_streaming_request(
                    payload_value.clone(),
                    &model_with_provider,
                    &user_id,
                    &app_settings,
                    billing_service.get_ref().clone(),
                    Arc::new(model_repository.get_ref().clone()),
                    request_id.clone(),
                    request_tracker.clone(),
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
                    request_tracker.clone(),
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
                    request_tracker.clone(),
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
                    request_tracker.clone(),
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
    web_mode: bool,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    request_id: String,
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    let client = OpenAIClient::new(app_settings)?;

    // Clone payload for fallback use
    let payload_value_clone = payload.clone();
    let mut request = client.convert_to_chat_request(payload)?;

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
        .extract_from_response_body(response_body.as_bytes(), &model.id)
        .await?;

    // Finalize API charge with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge_with_metadata(&request_id, user_id, usage.clone(), None)
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
    web_mode: bool,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    request_id: String,
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    let payload_value_clone = payload.clone();

    // Instantiate OpenAI client
    let client = OpenAIClient::new(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    request.model = model.resolved_model_id.clone();

    // Initiate provider streaming request
    let (_headers, provider_stream, response_id) =
        match client.stream_chat_completion(request, web_mode).await {
            Ok(result) => result,
            Err(error) => {
                if is_fallback_error(&error) {
                    warn!(
                        "[FALLBACK] OpenAI streaming request failed, retrying with OpenRouter: {}",
                        error
                    );
                    return handle_openrouter_streaming_request(
                        payload_value_clone,
                        model,
                        user_id,
                        app_settings,
                        billing_service,
                        Arc::clone(&model_repository),
                        request_id,
                        request_tracker.clone(),
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

    // Create cancellation token for streaming requests
    let cancellation_token = tokio_util::sync::CancellationToken::new();
    
    // Update request tracker with cancellation token
    request_tracker
        .track_request_with_cancellation(
            request_id.clone(),
            *user_id,
            model.provider_code.clone(),
            true, // is_streaming
            cancellation_token.clone(),
        )
        .await;
    
    // Instantiate OpenAI stream transformer
    let transformer = Box::new(OpenAIStreamTransformer::new(&model.id));
    
    // Create the modern stream handler
    let modern_handler = ModernStreamHandler::new(
        provider_stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
        cancellation_token,
    );
    
    // Convert to SSE stream and return as HttpResponse
    use actix_web::Responder;
    let sse_stream = modern_handler.into_sse_stream();
    
    // Create a dummy request to get HttpResponse from Responder
    let req = actix_web::test::TestRequest::default().to_http_request();
    Ok(sse_stream.respond_to(&req))
}

/// Handle XAI non-streaming request
async fn handle_xai_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    web_mode: bool,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    request_id: String,
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    let client = XaiClient::new_for_xai(app_settings)?;

    let mut request = client.convert_to_chat_request(payload)?;

    // Use the resolved model ID from mapping service
    request.model = model.resolved_model_id.clone();

    let (response, _headers, response_id) = match client.chat_completion(request, web_mode).await {
        Ok((response, headers, _, _, _, _, response_id)) => (response, headers, response_id),
        Err(error) => {
            return Err(error);
        }
    };

    // Update request tracker with XAI response_id if available
    if let Some(xai_response_id) = response_id {
        if let Err(e) = request_tracker
            .update_openai_response_id(&request_id, xai_response_id)
            .await
        {
            warn!("Failed to update request tracker with response_id: {}", e);
        }
    }

    // Serialize response to get HTTP body for usage extraction
    let response_body = serde_json::to_string(&response)?;

    // Get usage from provider using unified extraction
    let usage = client
        .extract_from_response_body(response_body.as_bytes(), &model.id)
        .await?;

    // Finalize API charge with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge_with_metadata(&request_id, user_id, usage.clone(), None)
        .await?;

    // Convert to OpenRouter format for consistent client parsing with standardized usage
    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage_response = create_standardized_usage_response(&usage, &api_usage_record.cost)?;
        obj.insert("usage".to_string(), usage_response);
    }

    Ok(HttpResponse::Ok().json(response_value))
}

/// Handle XAI streaming request
async fn handle_xai_streaming_request(
    payload: Value,
    model: &ModelWithProvider,
    user_id: &Uuid,
    web_mode: bool,
    app_settings: &AppSettings,
    billing_service: Arc<BillingService>,
    model_repository: web::Data<ModelRepository>,
    request_id: String,
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    // Instantiate XAI client
    let client = XaiClient::new_for_xai(app_settings)?;
    let mut request = client.convert_to_chat_request(payload)?;
    request.model = model.resolved_model_id.clone();

    // Initiate provider streaming request
    let (_headers, provider_stream, response_id) =
        match client.stream_chat_completion(request, web_mode).await {
            Ok(result) => result,
            Err(error) => {
                return Err(error);
            }
        };

    // Update request tracker with XAI response_id if available
    if let Some(xai_response_id) = response_id {
        if let Err(e) = request_tracker
            .update_openai_response_id(&request_id, xai_response_id)
            .await
        {
            warn!("Failed to update request tracker with response_id: {}", e);
        }
    }

    // Create cancellation token for streaming requests
    let cancellation_token = tokio_util::sync::CancellationToken::new();
    
    // Update request tracker with cancellation token
    request_tracker
        .track_request_with_cancellation(
            request_id.clone(),
            *user_id,
            model.provider_code.clone(),
            true, // is_streaming
            cancellation_token.clone(),
        )
        .await;
    
    // Instantiate XAI stream transformer
    let transformer = Box::new(XaiStreamTransformer::new(&model.id));
    
    // Create the modern stream handler
    let modern_handler = ModernStreamHandler::new(
        provider_stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
        cancellation_token,
    );
    
    // Convert to SSE stream and return as HttpResponse
    use actix_web::Responder;
    let sse_stream = modern_handler.into_sse_stream();
    
    // Create a dummy request to get HttpResponse from Responder
    let req = actix_web::test::TestRequest::default().to_http_request();
    Ok(sse_stream.respond_to(&req))
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
        .extract_from_response_body(response_body.as_bytes(), &model_with_provider.id)
        .await?;

    // Two-phase billing: Finalize the request with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge_with_metadata(&request_id, user_id, usage.clone(), None)
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
        .extract_from_response_body(response_body.as_bytes(), &model_with_provider.id)
        .await?;

    // Two-phase billing: Finalize the request with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge_with_metadata(&request_id, user_id, usage.clone(), None)
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
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    let original_model_id = payload["model"].as_str().unwrap_or_default().to_string();
    let payload_clone = payload.clone();
    
    // Create cancellation token for streaming requests
    let cancellation_token = CancellationToken::new();
    
    // Track request with cancellation token to support stream cancellation
    request_tracker
        .track_request_with_cancellation(
            request_id.clone(),
            *user_id,
            model_with_provider.provider_code.clone(),
            true, // is_streaming
            cancellation_token.clone(),
        )
        .await;
    
    // Instantiate Google client
    let client = GoogleClient::new(app_settings)?;
    let request = client.convert_to_chat_request_with_capabilities(
        payload,
        Some(&model_with_provider.capabilities),
    )?;

    // Initiate provider streaming request
    let (_headers, provider_stream) = match client
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
                    request_tracker.clone(),
                )
                .await;
            }
            return Err(error);
        }
    };

    // Instantiate Google stream transformer
    let transformer = Box::new(GoogleStreamTransformer::new(&model_with_provider.id));
    
    // Create the modern stream handler
    let modern_handler = ModernStreamHandler::new(
        provider_stream,
        transformer,
        model_with_provider.clone(),
        *user_id,
        billing_service,
        request_id,
        cancellation_token,
    );
    
    // Convert to SSE stream and return as HttpResponse
    use actix_web::Responder;
    let sse_stream = modern_handler.into_sse_stream();
    
    // Create a dummy request to get HttpResponse from Responder
    let req = actix_web::test::TestRequest::default().to_http_request();
    Ok(sse_stream.respond_to(&req))
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
        .extract_from_response_body(response_body.as_bytes(), &model.id)
        .await?;

    // Two-phase billing: Finalize the request with actual usage
    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge_with_metadata(&request_id, user_id, usage.clone(), None)
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
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    // Instantiate OpenRouter client
    let client = OpenRouterClient::new(app_settings, model_repository)?;
    let mut request = client.convert_to_chat_request(payload)?;
    request.model = model.id.clone();

    // Initiate provider streaming request
    let (_headers, provider_stream) = client
        .stream_chat_completion(request, user_id.to_string())
        .await?;

    // Create cancellation token for streaming requests
    let cancellation_token = CancellationToken::new();
    
    // Update request tracker with cancellation token
    request_tracker
        .track_request_with_cancellation(
            request_id.clone(),
            *user_id,
            model.provider_code.clone(),
            true, // is_streaming
            cancellation_token.clone(),
        )
        .await;
    
    // Instantiate OpenRouter stream transformer
    let transformer = Box::new(OpenRouterStreamTransformer::new(&model.id));
    
    // Create the modern stream handler
    let modern_handler = ModernStreamHandler::new(
        provider_stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
        cancellation_token,
    );
    
    // Convert to SSE stream and return as HttpResponse
    use actix_web::Responder;
    let sse_stream = modern_handler.into_sse_stream();
    
    // Create a dummy request to get HttpResponse from Responder
    let req = actix_web::test::TestRequest::default().to_http_request();
    Ok(sse_stream.respond_to(&req))
}

#[derive(Serialize)]
pub struct TranscriptionResponse {
    text: String,
}

/// Handle audio transcription (multipart form) - mimics OpenAI's /v1/audio/transcriptions
#[instrument(skip(req, payload, user, app_settings, billing_service, model_repository))]
pub async fn transcription_handler(
    req: HttpRequest,
    payload: Multipart,
    user: web::ReqData<AuthenticatedUser>,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;
    info!("Processing transcription request for user: {}", user_id);

    let multipart_data = crate::utils::multipart_utils::process_transcription_multipart(payload).await?;

    let model = multipart_data.model;
    let file_data = multipart_data.audio_data;
    let filename = multipart_data.filename;
    let language = multipart_data.language;
    let prompt = multipart_data.prompt;
    let temperature = multipart_data.temperature;
    let duration_ms = multipart_data.duration_ms;

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
    // Extract client IP from request headers (X-Forwarded-For or connection info)
    let client_ip = req.connection_info()
        .realip_remote_addr()
        .unwrap_or("unknown")
        .to_string();
    
    // Extract user agent from headers
    let user_agent = req.headers()
        .get("User-Agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    
    let validation_context = RequestValidationContext {
        user_id: user_id.to_string(),
        client_ip,
        user_agent,
        request_timestamp: chrono::Utc::now(),
    };

    // Validate parameters using validation module functions
    let validated_language =
        validate_server_language(language.as_deref()).map_err(|e| AppError::from(e))?;

    let validated_prompt =
        validate_server_prompt(prompt.as_deref()).map_err(|e| AppError::from(e))?;

    let validated_temperature =
        validate_server_temperature(temperature).map_err(|e| AppError::from(e))?;

    let cleaned_mime_type = "audio/webm".to_string();
    let file_extension = mime_type_to_extension(&cleaned_mime_type);

    // Update filename if it's the default
    let mut final_filename = filename;
    if final_filename == "audio.webm" {
        final_filename = format!("audio.{}", file_extension);
    }

    // Validate audio file
    let _validated_audio =
        validate_server_audio_file(&final_filename, &cleaned_mime_type, file_data.len())
            .map_err(|e| AppError::from(e))?;

    // Use OpenAI client for transcription
    let client = OpenAIClient::new(&app_settings)?;

    // Call the transcription API using the resolved model ID and validated parameters
    let transcription_text = client
        .transcribe_audio(
            &file_data,
            &final_filename,
            resolved_model_id,
            validated_language.as_deref(),
            validated_prompt.as_deref(),
            validated_temperature,
            &cleaned_mime_type,
        )
        .await?;

    // Calculate estimated token count based on audio duration (10 tokens per second)
    let tokens_input = (duration_ms / 1000) * 10;
    
    // Calculate tokens in transcribed text using token estimator
    let tokens_output = crate::utils::token_estimator::estimate_tokens(&transcription_text, &model_with_provider.id) as i32;

    // Create provider usage for billing
    let usage = ProviderUsage::new(
        tokens_input as i32,
        tokens_output,
        0,
        0,
        model_with_provider.id.clone()
    );

    // Calculate cost using model pricing
    let final_cost = model_with_provider.calculate_total_cost(&usage)
        .map_err(|e| AppError::Internal(format!("Cost calculation failed: {}", e)))?;

    // Create API usage entry
    let api_usage_entry = ApiUsageEntryDto {
        user_id,
        service_name: model_with_provider.id.clone(),
        tokens_input: tokens_input as i64,
        tokens_output: tokens_output as i64,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        request_id: None,
        metadata: Some(serde_json::json!({
            "transcription": true,
            "duration_ms": duration_ms,
            "timestamp": chrono::Utc::now().to_rfc3339()
        })),
        provider_reported_cost: Some(final_cost.clone()),
    };

    // Charge for API usage
    billing_service.charge_for_api_usage(api_usage_entry, final_cost).await?;

    let response = TranscriptionResponse {
        text: transcription_text,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[instrument(skip(payload, settings, billing_service, model_repository, user))]
pub async fn video_analysis_handler(
    payload: Multipart,
    settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
    user: web::ReqData<AuthenticatedUser>,
) -> Result<HttpResponse, AppError> {
    // Parse multipart payload
    let (video_file, prompt, model, temperature, system_prompt, duration_ms, framerate, request_id) = 
        process_video_analysis_multipart(payload).await?;
    
    // Parse provider from model string
    let (provider, model_id) = if model.contains('/') {
        let parts: Vec<&str> = model.split('/').collect();
        if parts.len() != 2 {
            return Err(AppError::BadRequest("Invalid model format. Expected: provider/model".to_string()));
        }
        (parts[0], parts[1])
    } else {
        return Err(AppError::BadRequest("Invalid model format. Expected: provider/model".to_string()));
    };
    
    // Check if provider is supported
    if provider != "google" {
        return Err(AppError::BadRequest(format!("Provider '{}' is not supported for video analysis. Only 'google' is supported.", provider)));
    }
    
    // Create charge context for billing
    let charge_context = format!("Video analysis for user {} using model {}", user.user_id, model);
    
    // Look up model to get pricing information
    let model_info = model_repository.find_by_id_with_provider(&model)
        .await?
        .ok_or_else(|| AppError::BadRequest(format!("Model '{}' not found", model)))?;
    
    // Calculate estimated tokens based on video duration (300 tokens per second)
    let estimated_tokens = (duration_ms / 1000) * 300;
    
    // Create a ProviderUsage for cost calculation
    let estimated_usage = ProviderUsage::new(
        estimated_tokens as i32,
        1000, // Estimated output tokens
        0,
        0,
        model.clone()
    );
    
    // Calculate estimated cost using the model's pricing
    let estimated_cost = model_info.calculate_total_cost(&estimated_usage)
        .map_err(|e| AppError::Internal(format!("Failed to calculate estimated cost: {}", e)))?;
    
    // Create API usage entry for initial charge
    // For video analysis, always generate a new request_id to avoid conflicts on retries
    let final_request_id = uuid::Uuid::new_v4().to_string();
    
    let initial_entry = ApiUsageEntryDto {
        user_id: user.user_id,
        service_name: model.clone(),
        tokens_input: estimated_tokens,
        tokens_output: 0,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        request_id: Some(final_request_id.clone()),
        metadata: Some(json!({
            "task": "video_analysis",
            "task_type": "video_analysis",
            "duration_ms": duration_ms,
            "status": "pending",
            "original_request_id": request_id
        })),
        provider_reported_cost: Some(estimated_cost.clone()),
    };
    
    // Initialize charge with billing service
    billing_service.initiate_api_charge(initial_entry).await?;
    
    // Get Google API key from settings
    let api_key = settings.api_keys.google_api_keys
        .as_ref()
        .and_then(|keys| keys.first())
        .ok_or_else(|| AppError::Configuration("Google API key not configured".to_string()))?;
    
    // Create Google client
    let google_client = GoogleClient::new(&settings)?;
    
    // Get video file path
    let video_path = video_file.path();
    
    // Determine MIME type from file extension
    let mime_type = match video_path.extension().and_then(|ext| ext.to_str()) {
        Some("mp4") => "video/mp4",
        Some("avi") => "video/x-msvideo",
        Some("mov") => "video/quicktime",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        _ => "video/mp4", // Default fallback
    };
    
    // Define size threshold for inline upload (19MB for safety margin)
    const INLINE_SIZE_LIMIT: usize = 19 * 1024 * 1024;
    
    // Get file size
    let file_metadata = std::fs::metadata(&video_path)
        .map_err(|e| AppError::Internal(format!("Failed to get file metadata: {}", e)))?;
    let file_size = file_metadata.len() as usize;
    
    // Extract model ID without provider prefix if present
    let clean_model_id = if model.contains('/') {
        model.split('/').nth(1).unwrap_or(&model)
    } else {
        &model
    };
    
    // Process the video and ensure cleanup happens regardless of success/failure
    let process_result = async {
        // Choose upload method based on file size
        if file_size < INLINE_SIZE_LIMIT {
            // Small file: use inline upload with specified FPS
            tracing::info!("Using inline upload for video ({} MB) with {} FPS", file_size / (1024 * 1024), framerate);
            
            // Read video file bytes
            let video_bytes = std::fs::read(&video_path)
                .map_err(|e| AppError::Internal(format!("Failed to read video file: {}", e)))?;
            
            // Use inline upload method with user-specified FPS
            google_client.generate_multimodal_content_inline(
                clean_model_id,
                &video_bytes,
                mime_type,
                framerate, // User-specified FPS
                &prompt,
                system_prompt,
                temperature,
                api_key
            ).await
        } else {
            // Large file: use File API upload with specified FPS
            tracing::info!("Using File API upload for video ({} MB) with {} FPS", file_size / (1024 * 1024), framerate);
            
            // Upload video file to Google
            let (file_uri, _) = google_client.upload_file(video_path, mime_type, api_key).await?;
            
            // Generate content with multimodal API with user-specified FPS
            google_client.generate_multimodal_content_with_fps(
                clean_model_id,
                &file_uri,
                mime_type,
                framerate, // User-specified FPS
                &prompt,
                system_prompt,
                temperature,
                api_key
            ).await
        }
    }.await;
    
    // Delete the temporary video file now that processing is complete (or failed)
    // Using drop() triggers NamedTempFile's destructor which deletes the file
    let video_path_for_log = video_file.path().to_path_buf();
    drop(video_file);
    tracing::debug!("Deleted temporary video file: {:?}", video_path_for_log);
    
    // Check if processing succeeded
    let response = process_result?;
    
    // Extract usage metadata
    let usage = if let Some(usage_metadata) = &response.usage_metadata {
        // Log Google usage metadata details for video analysis
        if let Some(usage_metadata) = &response.usage_metadata {
            if let Some(prompt_details) = &usage_metadata.prompt_tokens_details {
                for modality in prompt_details {
                    tracing::info!(
                        modality = %modality.modality,
                        token_count = %modality.token_count,
                        "Google usage metadata details for video analysis"
                    );
                }
            }
        }
        
        ProviderUsage::new(
            usage_metadata.prompt_token_count,
            usage_metadata.candidates_token_count.unwrap_or(0),
            0,
            usage_metadata.cached_content_token_count.unwrap_or(0),
            model.clone()
        )
    } else {
        // Fallback if no usage metadata
        ProviderUsage::new(
            estimated_tokens as i32,
            1000, // Estimated output tokens
            0,
            0,
            model.clone()
        )
    };
    
    // Finalize charge with actual usage
    let final_metadata = json!({
        "task": "video_analysis",
        "duration_ms": duration_ms,
        "status": "completed",
        "upload_method": if file_size < INLINE_SIZE_LIMIT { "inline" } else { "file_api" },
        "file_size_mb": file_size / (1024 * 1024),
        "original_request_id": request_id
    });
    
    billing_service.finalize_api_charge_with_metadata(
        &final_request_id,
        &user.user_id,
        usage.clone(),
        Some(final_metadata)
    ).await?;
    
    // Extract analysis text from response
    let analysis_text = response.candidates
        .first()
        .and_then(|candidate| candidate.content.parts.as_ref())
        .and_then(|parts| parts.first())
        .map(|part| part.text.clone())
        .unwrap_or_else(|| "No analysis generated".to_string());
    
    // Return response
    Ok(HttpResponse::Ok().json(json!({
        "analysis": analysis_text,
        "usage": {
            "promptTokens": usage.prompt_tokens,
            "completionTokens": usage.completion_tokens,
            "totalTokens": usage.prompt_tokens + usage.completion_tokens,
            "cachedTokens": usage.cache_read_tokens
        }
    })))
}
