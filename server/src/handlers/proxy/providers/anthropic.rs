use crate::clients::{AnthropicClient, UsageExtractor};
use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::{ModelRepository, ModelWithProvider};
use crate::error::AppError;
use crate::handlers::proxy::utils::{is_fallback_error, create_standardized_usage_response};
use crate::services::billing_service::BillingService;
use crate::services::model_mapping_service::ModelWithMapping;
use actix_web::{HttpResponse, web};
use chrono;
use serde_json::{Value, json};
use std::sync::Arc;
use tracing::warn;
use uuid::Uuid;

/// Handle Anthropic non-streaming request
pub(crate) async fn handle_anthropic_request(
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
                return super::openrouter::handle_openrouter_request(
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
