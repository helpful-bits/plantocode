use super::providers::{anthropic, google, openai, openrouter, xai};
use super::types::LlmCompletionRequest;
use super::utils::calculate_input_tokens;
use crate::config::settings::AppSettings;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::services::billing_service::BillingService;
use crate::services::request_tracker::RequestTracker;
use crate::utils::vision_capabilities::model_supports_vision;
use crate::utils::vision_normalizer::{contains_images, parse_messages, VisionPart, ImageSource};
use crate::utils::vision_validation::{
    validate_vision_media_for_provider, VisionMediaItem, VisionMediaKind, canonicalize_mime,
};
use actix_web::{HttpResponse, web};
use std::sync::Arc;
use tracing::{error, info, instrument};

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

    // Parse messages using vision_normalizer for robust image detection
    let messages_value = serde_json::to_value(&payload.messages)?;
    let parsed_messages = parse_messages(&messages_value).unwrap_or_default();
    let has_images = contains_images(&parsed_messages);

    if has_images {
        // Check if model supports vision
        if !model_supports_vision(&model_with_provider.capabilities) {
            return Err(AppError::BadRequest(format!(
                "Model '{}' does not support vision/image inputs. Please use a vision-capable model.",
                model_id
            )));
        }

        // Build validation items from parsed messages for provider-specific validation
        let mut validation_items: Vec<VisionMediaItem> = Vec::new();
        for msg in &parsed_messages {
            for part in &msg.parts {
                if let VisionPart::Image { image } = part {
                    let (mime_type, base64_len) = match &image.source {
                        ImageSource::DataUrl { data_url } => {
                            // Extract MIME type and base64 length from data URL
                            if let Some(comma_pos) = data_url.find(',') {
                                let header = &data_url[..comma_pos];
                                let data = &data_url[comma_pos + 1..];
                                let mime = header
                                    .strip_prefix("data:")
                                    .and_then(|s| s.split(';').next())
                                    .unwrap_or("image/jpeg");
                                (canonicalize_mime(mime), Some(data.len()))
                            } else {
                                ("image/jpeg".to_string(), None)
                            }
                        }
                        ImageSource::Base64 { mime_type, data_base64 } => {
                            (canonicalize_mime(mime_type), Some(data_base64.len()))
                        }
                        ImageSource::Url { .. } => {
                            return Err(AppError::Validation(
                                "Remote image URLs are not supported; please send base64/data URLs".to_string()
                            ));
                        }
                        ImageSource::ProviderFileId { .. } => {
                            // File IDs don't need size validation
                            (image.media_type.clone().unwrap_or_else(|| "image/jpeg".to_string()), None)
                        }
                    };

                    validation_items.push(VisionMediaItem {
                        kind: VisionMediaKind::Image,
                        mime_type,
                        base64_len,
                    });
                }
            }
        }

        // Validate images against provider-specific constraints
        if !validation_items.is_empty() {
            validate_vision_media_for_provider(&model_with_provider.provider_code, &validation_items)?;
        }
    }

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
    let estimation_repo =
        crate::db::repositories::EstimationCoefficientRepository::new(model_repository.get_pool());

    let (estimated_input_tokens, estimated_output_tokens) = estimation_repo
        .calculate_estimated_tokens(
            &model_with_provider.id,
            base_input_tokens as i64,
            payload.max_tokens.map(|v| v as i32),
        )
        .await?;

    info!(
        "Estimated tokens (preliminary - subject to provider adjustments) - input: {} (base: {}), output: {}",
        estimated_input_tokens, base_input_tokens, estimated_output_tokens
    );

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
        .map(|task_type| {
            task_type == "web_search_execution" || task_type == "implementation_plan_with_web"
        })
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
                openai::handle_openai_streaming_request(
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
                openai::handle_openai_request(
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
                xai::handle_xai_streaming_request(
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
                xai::handle_xai_request(
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
                openrouter::handle_openrouter_streaming_request(
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
                anthropic::handle_anthropic_request(
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
            }
        }
        "google" => {
            if is_streaming {
                google::handle_google_streaming_request(
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
                google::handle_google_request(
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
            }
        }
        "deepseek" => {
            // Route DeepSeek models through OpenRouter
            if is_streaming {
                openrouter::handle_openrouter_streaming_request(
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
                openrouter::handle_openrouter_request(
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
            }
        }
        "openrouter" => {
            if is_streaming {
                openrouter::handle_openrouter_streaming_request(
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
                openrouter::handle_openrouter_request(
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
