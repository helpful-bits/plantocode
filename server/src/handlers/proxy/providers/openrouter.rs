use crate::clients::{OpenRouterClient, UsageExtractor};
use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::error::AppError;
use crate::handlers::provider_transformers::OpenRouterStreamTransformer;
use crate::handlers::proxy::utils::create_standardized_usage_response;
use crate::services::billing_service::BillingService;
use crate::services::request_tracker::RequestTracker;
use crate::streaming::stream_handler::ModernStreamHandler;
use actix_web::{HttpResponse, web};
use serde_json::Value;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Handle OpenRouter (DeepSeek) non-streaming request
pub(crate) async fn handle_openrouter_request(
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
pub(crate) async fn handle_openrouter_streaming_request(
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
