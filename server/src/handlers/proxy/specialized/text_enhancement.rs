use crate::clients::usage_extractor::ProviderUsage;
use crate::config::settings::AppSettings;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppError;
use crate::handlers::proxy::types::TextEnhancementRequest;
use crate::models::AuthenticatedUser;
use crate::services::billing_service::BillingService;
use actix_web::{HttpResponse, web};
use serde_json::json;
use std::sync::Arc;
use tracing::{info, instrument};
use uuid::Uuid;

/// Handle text enhancement requests
#[instrument(skip(payload, user, app_settings, billing_service, model_repository))]
pub async fn text_enhancement_handler(
    payload: web::Json<TextEnhancementRequest>,
    user: web::ReqData<AuthenticatedUser>,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let request_id = Uuid::new_v4().to_string();
    let start_time = std::time::Instant::now();

    info!(
        user_id = %user.user_id,
        request_id = %request_id,
        enhancement_type = ?payload.enhancement_type,
        text_length = payload.text.len(),
        "Processing text enhancement request"
    );

    // Validate input
    if payload.text.trim().is_empty() {
        return Err(AppError::BadRequest("Text cannot be empty".to_string()));
    }

    if payload.text.len() > 50000 {
        return Err(AppError::BadRequest(
            "Text too long (max 50,000 characters)".to_string(),
        ));
    }

    // Get the text enhancement model - prefer Claude for text tasks
    let models = model_repository
        .get_all_with_providers()
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch models: {}", e)))?;

    let model = models
        .iter()
        .find(|m| m.provider_code == "anthropic" && m.id.contains("claude-3-haiku"))
        .or_else(|| {
            models
                .iter()
                .find(|m| m.provider_code == "openai" && m.id.contains("gpt-4o-mini"))
        })
        .ok_or_else(|| {
            AppError::Configuration("No suitable model found for text enhancement".to_string())
        })?;

    info!(
        request_id = %request_id,
        model_id = %model.id,
        provider = %model.provider_code,
        "Selected model for text enhancement"
    );

    // Create enhancement prompt based on type
    let enhancement_type = payload.enhancement_type.as_deref().unwrap_or("improve");
    let system_prompt = match enhancement_type {
        "grammar" => {
            "You are a grammar expert. Fix grammatical errors and improve sentence structure while preserving the original meaning and tone."
        }
        "clarity" => {
            "You are a clarity expert. Rewrite the text to be clearer and more concise while preserving all important information."
        }
        "professional" => {
            "You are a professional writing expert. Transform the text into a more professional tone suitable for business communication."
        }
        "concise" => {
            "You are a conciseness expert. Make the text more concise while preserving all key information and meaning."
        }
        "expand" => {
            "You are a writing expert. Expand on the text to provide more detail and context while maintaining the original message."
        }
        _ => {
            "You are a writing expert. Improve the text for better clarity, grammar, and flow while preserving the original meaning and tone."
        }
    };

    let user_prompt = match &payload.context {
        Some(context) => format!("Context: {}\n\nText to enhance:\n{}", context, payload.text),
        None => format!("Text to enhance:\n{}", payload.text),
    };

    // Estimate tokens for billing
    let estimated_prompt_tokens = (system_prompt.len() + user_prompt.len()) / 4; // Rough estimation
    let estimated_completion_tokens = std::cmp::max(payload.text.len() / 4, 100); // At least 100 tokens

    // Create usage for pre-charge
    let estimated_usage = ProviderUsage::new(
        estimated_prompt_tokens as i32,
        estimated_completion_tokens as i32,
        0,
        0,
        model.id.clone(),
    );

    // Pre-charge for the request
    let charge_metadata = json!({
        "task": "text_enhancement",
        "enhancement_type": enhancement_type,
        "input_length": payload.text.len(),
        "original_request_id": request_id
    });

    let api_usage_entry = ApiUsageEntryDto {
        user_id: user.user_id,
        service_name: model.id.clone(),
        tokens_input: estimated_usage.prompt_tokens as i64,
        tokens_output: estimated_usage.completion_tokens as i64,
        cache_write_tokens: estimated_usage.cache_write_tokens as i64,
        cache_read_tokens: estimated_usage.cache_read_tokens as i64,
        request_id: Some(request_id.clone()),
        metadata: Some(charge_metadata),
        provider_reported_cost: None,
    };
    billing_service.initiate_api_charge(api_usage_entry).await?;

    // Make the API call based on provider
    match model.provider_code.as_str() {
        "anthropic" => {
            return Err(AppError::External(
                "Text enhancement not implemented for Anthropic".to_string(),
            ));
        }
        "openai" => {
            return Err(AppError::External(
                "Text enhancement not implemented for OpenAI".to_string(),
            ));
        }
        _ => {
            return Err(AppError::Configuration(format!(
                "Unsupported provider for text enhancement: {}",
                model.provider_code
            )));
        }
    }
}
