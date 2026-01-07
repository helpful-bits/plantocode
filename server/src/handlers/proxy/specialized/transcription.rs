use crate::clients::usage_extractor::ProviderUsage;
use crate::clients::{GoogleClient, OpenAIClient};
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
use actix_web::http::header;
use bigdecimal::BigDecimal;
use futures_util::StreamExt;
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

    let _validation_context = RequestValidationContext {
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

    // Model-specific prompt length validation using capabilities.max_prompt_length
    if let Some(ref prompt_str) = validated_prompt {
        let max_prompt_length = model_with_provider
            .capabilities
            .get("max_prompt_length")
            .and_then(|v| v.as_u64())
            .unwrap_or(100000) as usize; // Default to 100K if not specified

        if prompt_str.len() > max_prompt_length {
            return Err(AppError::BadRequest(format!(
                "Prompt too long: {} characters (max: {} for model {})",
                prompt_str.len(),
                max_prompt_length,
                model_with_provider.id
            )));
        }
    }

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

    // Provider-based routing for transcription
    let (transcription_text, usage) = match model_with_provider.provider_code.as_str() {
        "openai" => {
            // OpenAI transcription flow
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

            (transcription_text, usage)
        }
        "google" => {
            // Google/Gemini transcription flow using generateContent
            let google_client = GoogleClient::new(&app_settings)?;

            // Call transcribe_audio_via_generate_content
            // The validated_prompt is used as vocabulary hints for the transcription
            let (transcript_text, usage) = google_client
                .transcribe_audio_via_generate_content(
                    &model_with_provider,
                    &user_id.to_string(),
                    &file_data,
                    &final_filename,
                    &multipart_data.mime_type,
                    validated_prompt.clone(), // Option<String> for vocabulary injection
                    validated_temperature,
                )
                .await?;

            // If usage tokens are zero (missing metadata), fall back to duration-based heuristics
            let final_usage = if usage.prompt_tokens == 0 && usage.completion_tokens == 0 {
                info!(
                    "Google transcription returned no usage metadata, using duration-based estimate"
                );
                // Estimate input tokens based on audio duration (similar to OpenAI: 10 tokens per second)
                let tokens_input = (duration_ms / 1000) * 10;
                let tokens_output = crate::utils::token_estimator::estimate_tokens(
                    &transcript_text,
                    &model_with_provider.id,
                ) as i32;

                ProviderUsage::new(
                    tokens_input as i32,
                    tokens_output,
                    0,
                    0,
                    model_with_provider.id.clone(),
                )
            } else {
                usage
            };

            (transcript_text, final_usage)
        }
        _ => {
            return Err(AppError::BadRequest(format!(
                "Provider '{}' is not supported for transcription. Supported providers: openai, google",
                model_with_provider.provider_code
            )));
        }
    };

    // Calculate cost using model pricing
    let final_cost = model_with_provider
        .calculate_total_cost(&usage)
        .map_err(|e| AppError::Internal(format!("Cost calculation failed: {}", e)))?;

    // Create API usage entry
    let api_usage_entry = ApiUsageEntryDto {
        user_id,
        service_name: model_with_provider.id.clone(),
        tokens_input: usage.prompt_tokens as i64,
        tokens_output: usage.completion_tokens as i64,
        cache_write_tokens: usage.cache_write_tokens as i64,
        cache_read_tokens: usage.cache_read_tokens as i64,
        request_id: None,
        metadata: Some(serde_json::json!({
            "transcription": true,
            "provider": model_with_provider.provider_code,
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

#[instrument(skip(req, payload, user, app_settings, billing_service, model_repository))]
pub async fn streaming_transcription_handler(
    req: HttpRequest,
    payload: Multipart,
    user: web::ReqData<AuthenticatedUser>,
    app_settings: web::Data<AppSettings>,
    billing_service: web::Data<Arc<BillingService>>,
    model_repository: web::Data<ModelRepository>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;
    info!("Processing streaming transcription request for user: {}", user_id);

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

    if model_with_provider.provider_code != "google" {
        return Err(AppError::BadRequest(format!(
            "Streaming transcription is only supported for Google/Gemini models. Provider '{}' does not support streaming.",
            model_with_provider.provider_code
        )));
    }

    let balance = billing_service
        .get_credit_service()
        .get_user_balance(&user_id)
        .await?;

    let total_available = &balance.balance + &balance.free_credit_balance;

    if total_available <= BigDecimal::from(0) {
        return Err(AppError::CreditInsufficient(
            "No credits available".to_string(),
        ));
    }

    if file_data.is_empty() {
        return Err(AppError::BadRequest("Audio file is required".to_string()));
    }

    let client_ip = req
        .connection_info()
        .realip_remote_addr()
        .unwrap_or("unknown")
        .to_string();

    let user_agent = req
        .headers()
        .get("User-Agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let _validation_context = RequestValidationContext {
        user_id: user_id.to_string(),
        client_ip,
        user_agent,
        request_timestamp: chrono::Utc::now(),
    };

    let validated_prompt =
        validate_server_prompt(prompt.as_deref()).map_err(|e| AppError::from(e))?;

    let validated_temperature =
        validate_server_temperature(temperature).map_err(|e| AppError::from(e))?;

    let file_extension = mime_type_to_extension(&multipart_data.mime_type);
    let mut final_filename = filename;
    if final_filename == "audio.webm" {
        final_filename = format!("audio.{}", file_extension);
    }

    let _validated_audio =
        validate_server_audio_file(&final_filename, &multipart_data.mime_type, file_data.len())
            .map_err(|e| AppError::from(e))?;

    let google_client = GoogleClient::new(&app_settings)?;

    let stream = google_client
        .stream_transcription(
            &model_with_provider,
            &user_id.to_string(),
            &file_data,
            &final_filename,
            &multipart_data.mime_type,
            validated_prompt.clone(),
            validated_temperature,
        )
        .await?;

    let tokens_input = (duration_ms / 1000) * 10;
    let estimated_output_tokens = (duration_ms / 1000) * 15;

    let usage = ProviderUsage::new(
        tokens_input as i32,
        estimated_output_tokens as i32,
        0,
        0,
        model_with_provider.id.clone(),
    );

    let final_cost = model_with_provider
        .calculate_total_cost(&usage)
        .map_err(|e| AppError::Internal(format!("Cost calculation failed: {}", e)))?;

    let api_usage_entry = ApiUsageEntryDto {
        user_id,
        service_name: model_with_provider.id.clone(),
        tokens_input: usage.prompt_tokens as i64,
        tokens_output: usage.completion_tokens as i64,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        request_id: None,
        metadata: Some(serde_json::json!({
            "transcription": true,
            "streaming": true,
            "provider": model_with_provider.provider_code,
            "duration_ms": duration_ms,
            "timestamp": chrono::Utc::now().to_rfc3339()
        })),
        provider_reported_cost: Some(final_cost.clone()),
    };

    billing_service
        .charge_for_api_usage(api_usage_entry, final_cost)
        .await?;

    let body_stream = stream.map(|result| {
        result.map_err(|e| {
            actix_web::error::ErrorInternalServerError(format!("Stream error: {}", e))
        })
    });

    Ok(HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, "text/event-stream"))
        .insert_header((header::CACHE_CONTROL, "no-cache"))
        .insert_header(("X-Accel-Buffering", "no"))
        .streaming(body_stream))
}
