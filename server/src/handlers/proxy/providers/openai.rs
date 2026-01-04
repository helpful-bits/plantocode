use crate::clients::{OpenAIClient, UsageExtractor};
use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::error::AppError;
use crate::handlers::provider_transformers::OpenAIStreamTransformer;
use crate::handlers::proxy::utils::{is_fallback_error, create_standardized_usage_response};
use crate::services::billing_service::BillingService;
use crate::services::request_tracker::RequestTracker;
use crate::streaming::stream_handler::ModernStreamHandler;
use actix_web::{HttpResponse, web};
use serde_json::Value;
use std::sync::Arc;
use tracing::warn;
use uuid::Uuid;

/// Handle OpenAI non-streaming request
pub(crate) async fn handle_openai_request(
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

    let payload_value_clone = payload.clone();
    let mut request = client.convert_to_chat_request(payload)?;

    request.model = model.resolved_model_id.clone();

    let (response, _headers, response_id) = match client.chat_completion(request, web_mode).await {
        Ok((response, headers, _, _, _, _, response_id)) => (response, headers, response_id),
        Err(error) => {
            if is_fallback_error(&error) {
                warn!(
                    "[FALLBACK] OpenAI request failed, retrying with OpenRouter: {}",
                    error
                );
                return super::openrouter::handle_openrouter_request(
                    payload_value_clone,
                    model,
                    user_id,
                    app_settings,
                    billing_service,
                    Arc::new(model_repository.get_ref().clone()),
                    request_id,
                    request_tracker,
                )
                .await;
            }
            let _ = billing_service
                .fail_api_charge(&request_id, user_id, &error.to_string())
                .await;
            request_tracker.remove_request(&request_id).await;
            return Err(error);
        }
    };

    if let Some(openai_response_id) = response_id {
        if let Err(e) = request_tracker
            .update_openai_response_id(&request_id, openai_response_id)
            .await
        {
            warn!("Failed to update request tracker with response_id: {}", e);
        }
    }

    let response_body = serde_json::to_string(&response)?;

    let usage = client
        .extract_from_response_body(response_body.as_bytes(), &model.id)
        .await?;

    let (api_usage_record, _user_credit) = billing_service
        .finalize_api_charge_with_metadata(&request_id, user_id, usage.clone(), None)
        .await?;

    request_tracker.remove_request(&request_id).await;

    let mut response_value = serde_json::to_value(response)?;
    if let Some(obj) = response_value.as_object_mut() {
        let usage_response = create_standardized_usage_response(&usage, &api_usage_record.cost)?;
        obj.insert("usage".to_string(), usage_response);
    }

    Ok(HttpResponse::Ok().json(response_value))
}

/// Handle OpenAI streaming request
pub(crate) async fn handle_openai_streaming_request(
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
                    return super::openrouter::handle_openrouter_streaming_request(
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

    let modern_handler = ModernStreamHandler::new(
        provider_stream,
        transformer,
        model.clone(),
        *user_id,
        billing_service.clone(),
        request_id,
        cancellation_token,
        request_tracker.clone(),
    );

    // Convert to SSE stream and return as HttpResponse
    use actix_web::Responder;
    let sse_stream = modern_handler.into_sse_stream();

    // Create a dummy request to get HttpResponse from Responder
    let req = actix_web::test::TestRequest::default().to_http_request();
    Ok(sse_stream.respond_to(&req))
}
