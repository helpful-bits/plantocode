use crate::clients::usage_extractor::ProviderUsage;
use crate::clients::GoogleClient;
use crate::config::settings::AppSettings;
use crate::db::repositories::api_usage_repository::ApiUsageEntryDto;
use crate::db::repositories::model_repository::ModelRepository;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::models::model_pricing::ModelPricing;
use crate::services::billing_service::BillingService;
use crate::utils::multipart_utils::process_video_analysis_multipart;
use actix_multipart::Multipart;
use actix_web::{HttpResponse, web};
use serde_json::json;
use std::sync::Arc;
use tracing::instrument;
use uuid;

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
            return Err(AppError::BadRequest(
                "Invalid model format. Expected: provider/model".to_string(),
            ));
        }
        (parts[0], parts[1])
    } else {
        return Err(AppError::BadRequest(
            "Invalid model format. Expected: provider/model".to_string(),
        ));
    };

    // Check if provider is supported
    if provider != "google" {
        return Err(AppError::BadRequest(format!(
            "Provider '{}' is not supported for video analysis. Only 'google' is supported.",
            provider
        )));
    }

    // Create charge context for billing
    let charge_context = format!(
        "Video analysis for user {} using model {}",
        user.user_id, model
    );

    // Look up model to get pricing information
    let model_info = model_repository
        .find_by_id_with_provider(&model)
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
        model.clone(),
    );

    // Calculate estimated cost using the model's pricing
    let estimated_cost = model_info
        .calculate_total_cost(&estimated_usage)
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
            "taskType": "video_analysis",
            "durationMs": duration_ms,
            "status": "pending",
            "originalRequestId": request_id
        })),
        provider_reported_cost: Some(estimated_cost.clone()),
    };

    // Initialize charge with billing service
    billing_service.initiate_api_charge(initial_entry).await?;

    // Get Google API key from settings
    let api_key = settings
        .api_keys
        .google_api_keys
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
            tracing::info!(
                "Using inline upload for video ({} MB) with {} FPS",
                file_size / (1024 * 1024),
                framerate
            );

            // Read video file bytes
            let video_bytes = std::fs::read(&video_path)
                .map_err(|e| AppError::Internal(format!("Failed to read video file: {}", e)))?;

            // Use inline upload method with user-specified FPS
            google_client
                .generate_multimodal_content_inline(
                    clean_model_id,
                    &video_bytes,
                    mime_type,
                    framerate, // User-specified FPS
                    &prompt,
                    system_prompt,
                    temperature,
                    api_key,
                )
                .await
        } else {
            // Large file: use File API upload with specified FPS
            tracing::info!(
                "Using File API upload for video ({} MB) with {} FPS",
                file_size / (1024 * 1024),
                framerate
            );

            // Upload video file to Google
            let (file_uri, _) = google_client
                .upload_file(video_path, mime_type, api_key)
                .await?;

            // Generate content with multimodal API with user-specified FPS
            google_client
                .generate_multimodal_content_with_fps(
                    clean_model_id,
                    &file_uri,
                    mime_type,
                    framerate, // User-specified FPS
                    &prompt,
                    system_prompt,
                    temperature,
                    api_key,
                )
                .await
        }
    }
    .await;

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
            model.clone(),
        )
    } else {
        // Fallback if no usage metadata
        ProviderUsage::new(
            estimated_tokens as i32,
            1000, // Estimated output tokens
            0,
            0,
            model.clone(),
        )
    };

    // Finalize charge with actual usage
    let final_metadata = json!({
        "task": "video_analysis",
        "durationMs": duration_ms,
        "status": "completed",
        "uploadMethod": if file_size < INLINE_SIZE_LIMIT { "inline" } else { "file_api" },
        "fileSizeMb": file_size / (1024 * 1024),
        "originalRequestId": request_id
    });

    billing_service
        .finalize_api_charge_with_metadata(
            &final_request_id,
            &user.user_id,
            usage.clone(),
            Some(final_metadata),
        )
        .await?;

    // Extract analysis text from response
    let analysis_text = response
        .candidates
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
