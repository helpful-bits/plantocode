use crate::clients::usage_extractor::ProviderUsage;
use crate::clients::{OpenAIClient, UsageExtractor};
use crate::config::settings::AppSettings;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppError;
use crate::handlers::proxy::types::TranscriptionResponse;
use crate::models::AuthenticatedUser;
use crate::models::model_pricing::ModelPricing;
use crate::services::billing_service::BillingService;
use crate::utils::transcription_validation::{
    RequestValidationContext, mime_type_to_extension, validate_server_audio_file,
    validate_server_language, validate_server_prompt, validate_server_temperature,
};
use actix_multipart::Multipart;
use actix_web::{HttpRequest, HttpResponse, web};
use bigdecimal::{BigDecimal, FromPrimitive};
use std::sync::Arc;
use tracing::{info, instrument};

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

    let multipart_data =
        crate::utils::multipart_utils::process_transcription_multipart(payload).await?;

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

    // Validate user has sufficient credits (check both paid and free credits)
    let balance = billing_service
        .get_credit_service()
        .get_user_balance(&user_id)
        .await?;

    // Calculate total available credits (paid + free credits)
    let total_available = &balance.balance + &balance.free_credit_balance;

    if total_available <= BigDecimal::from(0) {
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
    let client_ip = req
        .connection_info()
        .realip_remote_addr()
        .unwrap_or("unknown")
        .to_string();

    // Extract user agent from headers
    let user_agent = req
        .headers()
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

    let file_extension = mime_type_to_extension(&multipart_data.mime_type);

    // Update filename if it's the default
    let mut final_filename = filename;
    if final_filename == "audio.webm" {
        final_filename = format!("audio.{}", file_extension);
    }

    // Validate audio file
    let _validated_audio =
        validate_server_audio_file(&final_filename, &multipart_data.mime_type, file_data.len())
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
            &multipart_data.mime_type,
        )
        .await?;

    // Calculate estimated token count based on audio duration (10 tokens per second)
    let tokens_input = (duration_ms / 1000) * 10;

    // Calculate tokens in transcribed text using token estimator
    let tokens_output = crate::utils::token_estimator::estimate_tokens(
        &transcription_text,
        &model_with_provider.id,
    ) as i32;

    // Create provider usage for billing
    let usage = ProviderUsage::new(
        tokens_input as i32,
        tokens_output,
        0,
        0,
        model_with_provider.id.clone(),
    );

    // Calculate cost using model pricing
    let final_cost = model_with_provider
        .calculate_total_cost(&usage)
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
    billing_service
        .charge_for_api_usage(api_usage_entry, final_cost)
        .await?;

    let response = TranscriptionResponse {
        text: transcription_text,
    };

    Ok(HttpResponse::Ok().json(response))
}
