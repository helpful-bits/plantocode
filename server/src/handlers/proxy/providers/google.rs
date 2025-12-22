use crate::clients::{GoogleClient, UsageExtractor};
use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::error::AppError;
use crate::handlers::provider_transformers::GoogleStreamTransformer;
use crate::handlers::proxy::utils::{is_fallback_error, create_standardized_usage_response};
use crate::services::billing_service::BillingService;
use crate::services::model_mapping_service::ModelWithMapping;
use crate::services::request_tracker::RequestTracker;
use crate::streaming::stream_handler::ModernStreamHandler;
use actix_web::{HttpResponse, web};
use chrono;
use serde_json::{Value, json};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tracing::warn;
use uuid::{self, Uuid};

/// Handle Google non-streaming request
pub(crate) async fn handle_google_request(
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

                return super::openrouter::handle_openrouter_request(
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
pub(crate) async fn handle_google_streaming_request(
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

                return super::openrouter::handle_openrouter_streaming_request(
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
