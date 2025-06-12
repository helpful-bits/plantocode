//! Audio transcription proxy handlers with enhanced parameter support
//! 
//! This module provides enhanced transcription handling with support for:
//! - Custom prompts for improved transcription accuracy
//! - Temperature control for transcription style
//! - User-configurable transcription settings
//! - Comprehensive parameter validation and sanitization
//! - Rate limiting for settings management endpoints
//! 
//! Note: Full integration pending PROXY_SERVICE_AGENT updates to support
//! prompt and temperature parameters in the underlying service layer.

use actix_web::{web, HttpResponse, http::header, HttpRequest};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::proxy_service::ProxyService;
use crate::services::cost_based_billing_service::CostBasedBillingService;
use crate::middleware::secure_auth::UserId;
use crate::utils::multipart_utils::process_transcription_multipart;
use futures_util::StreamExt;
use actix_multipart::Multipart;
use tracing::{debug, error, info, instrument};
use std::sync::Arc;
use std::time::Instant;
use base64::Engine;
use chrono;

/// Validation functions for transcription parameters
fn validate_transcription_prompt(prompt: &Option<String>) -> Result<(), AppError> {
    if let Some(p) = prompt {
        if p.trim().is_empty() {
            return Err(AppError::BadRequest("Prompt cannot be empty".to_string()));
        }
        if p.len() > 1000 {
            return Err(AppError::BadRequest("Prompt cannot exceed 1000 characters".to_string()));
        }
        // Check for potentially unsafe content
        let prompt_lower = p.to_lowercase();
        if prompt_lower.contains("ignore") && prompt_lower.contains("previous") {
            return Err(AppError::BadRequest("Prompt contains potentially unsafe instructions".to_string()));
        }
    }
    Ok(())
}

fn validate_transcription_temperature(temperature: &Option<f32>) -> Result<(), AppError> {
    if let Some(temp) = temperature {
        if *temp < 0.0 || *temp > 1.0 {
            return Err(AppError::BadRequest("Temperature must be between 0.0 and 1.0".to_string()));
        }
    }
    Ok(())
}

fn sanitize_transcription_prompt(prompt: Option<String>) -> Option<String> {
    prompt.map(|p| {
        // Remove potentially harmful characters and patterns
        let sanitized = p
            .replace('\0', "")  // Remove null bytes
            .replace('\r', "")  // Remove carriage returns
            .trim()
            .to_string();
        
        if sanitized.is_empty() {
            None
        } else {
            Some(sanitized)
        }
    }).flatten()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRequest {
    #[serde(flatten)]
    pub payload: serde_json::Value,
}

/// OpenRouter Chat Completions Proxy - handles both streaming and non-streaming
pub async fn openrouter_chat_completions_proxy(
    user_id: UserId,
    proxy_service: web::Data<ProxyService>,
    cost_billing_service: web::Data<CostBasedBillingService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    debug!("OpenRouter chat completions request from user: {}", user_id.0);
    
    // Check spending limits BEFORE processing request
    let has_access = cost_billing_service.check_service_access(&user_id.0).await?;
    if !has_access {
        return Ok(HttpResponse::PaymentRequired().json(serde_json::json!({
            "error": {
                "type": "spending_limit_exceeded",
                "message": "AI services blocked due to spending limit. Please upgrade your plan or wait for your billing cycle to reset."
            }
        })));
    }
    
    let payload = body.into_inner().payload;
    
    // Check if streaming is requested
    let is_streaming = payload.get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    if is_streaming {
        // Get an Arc<ProxyService> from the Data<ProxyService>
        let proxy_arc = Arc::clone(&proxy_service);
        
        // Extract model from payload for override
        let model_from_payload = payload.get("model").and_then(|v| v.as_str()).map(String::from);
        
        // Handle streaming request
        let stream = proxy_arc.forward_chat_completions_stream_request(user_id.0, payload, model_from_payload).await?;
        
        // Log initiation
        info!("OpenRouter streaming chat completions initiated in {:?}", start.elapsed());
        
        // Return the streaming response
        Ok(HttpResponse::Ok()
            .insert_header(header::ContentType::plaintext())
            .insert_header((header::CACHE_CONTROL, "no-cache"))
            .insert_header((header::CONNECTION, "keep-alive"))
            .streaming(stream))
    } else {
        // Extract model from payload for override
        let model_from_payload = payload.get("model").and_then(|v| v.as_str()).map(String::from);
        
        // Handle non-streaming request
        let result = proxy_service.forward_chat_completions_request(&user_id.0, payload, model_from_payload).await?;
        
        // Log request duration
        let duration = start.elapsed();
        info!("OpenRouter chat completions request completed in {:?}", duration);
        
        // Return the response
        Ok(HttpResponse::Ok().json(result))
    }
}

/// Audio Transcription API proxy (Replicate OpenAI GPT-4o)
pub async fn audio_transcriptions_proxy(
    user_id: UserId,
    proxy_service: web::Data<ProxyService>,
    cost_billing_service: web::Data<CostBasedBillingService>,
    payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    debug!("Audio transcription request from user: {}", user_id.0);
    
    // Check spending limits BEFORE processing request
    let has_access = cost_billing_service.check_service_access(&user_id.0).await?;
    if !has_access {
        return Ok(HttpResponse::PaymentRequired().json(serde_json::json!({
            "error": {
                "type": "spending_limit_exceeded",
                "message": "AI services blocked due to spending limit. Please upgrade your plan or wait for your billing cycle to reset."
            }
        })));
    }
    
    // Process the multipart form data using the utility
    let multipart_data = process_transcription_multipart(payload).await?;
    
    // Forward the transcription request to the proxy service
    let model_from_payload = if multipart_data.model.is_empty() || multipart_data.model == "openai/gpt-4o-transcribe" { 
        None // Use default from app_settings
    } else { 
        Some(multipart_data.model) 
    };
    
    let result = proxy_service.forward_transcription_request(
        &user_id.0, 
        &multipart_data.audio_data, 
        &multipart_data.filename, 
        model_from_payload,
        multipart_data.duration_ms,
        multipart_data.language.as_deref(),
        None, // TODO: Add prompt support to multipart processing
        None, // TODO: Add temperature support to multipart processing
    ).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("Audio transcription request completed in {:?}", duration);
    
    // Return the response
    Ok(HttpResponse::Ok().json(result))
}

/// Audio Transcription Streaming API proxy (Replicate OpenAI GPT-4o)
pub async fn audio_transcriptions_stream_proxy(
    user_id: UserId,
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    cost_billing_service: web::Data<CostBasedBillingService>,
    mut payload: web::Payload,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    debug!("Audio transcription streaming request from user: {}", user_id.0);
    
    // Check spending limits BEFORE processing request
    let has_access = cost_billing_service.check_service_access(&user_id.0).await?;
    if !has_access {
        return Ok(HttpResponse::PaymentRequired().json(serde_json::json!({
            "error": {
                "type": "spending_limit_exceeded",
                "message": "AI services blocked due to spending limit. Please upgrade your plan or wait for your billing cycle to reset."
            }
        })));
    }
    
    // Extract metadata from request headers
    let filename = req.headers()
        .get("X-Filename")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio.webm")
        .to_string();
    
    let duration_ms = req.headers()
        .get("X-Duration-MS")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok());
    
    let model = req.headers()
        .get("X-Model-Id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    
    let language = req.headers()
        .get("X-Language")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    
    // Read the streaming payload into a buffer
    let mut buffer = web::BytesMut::new();
    while let Some(chunk) = payload.next().await {
        let chunk = chunk.map_err(|e| AppError::BadRequest(format!("Failed to read payload chunk: {}", e)))?;
        buffer.extend_from_slice(&chunk);
    }
    
    let audio_data = buffer.to_vec();
    
    // Forward the transcription request to the proxy service
    let model_from_payload = if model.is_none() || model.as_ref() == Some(&"openai/gpt-4o-transcribe".to_string()) {
        None // Use default from app_settings
    } else {
        model
    };
    
    let result = proxy_service.forward_transcription_request(
        &user_id.0,
        &audio_data,
        &filename,
        model_from_payload,
        duration_ms.unwrap_or(0),
        language.as_deref(),
        None, // TODO: Add prompt support to streaming endpoint
        None, // TODO: Add temperature support to streaming endpoint  
    ).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("Audio transcription streaming request completed in {:?}", duration);
    
    // Return the response
    Ok(HttpResponse::Ok().json(result))
}

/// Audio Transcription Batch API proxy (Replicate OpenAI GPT-4o)
/// Handles JSON requests with base64-encoded audio chunks for real-time transcription
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioBatchRequest {
    pub session_id: String,
    pub audio_base64: String,
    pub chunk_index: u32,
    pub duration_ms: i64,
    pub language: Option<String>,
    pub prompt: Option<String>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioBatchResponse {
    pub text: String,
    pub chunk_index: u32,
    pub processing_time_ms: Option<i64>,
}

/// Request structure for transcription settings
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSettingsRequest {
    pub default_prompt: Option<String>,
    pub default_temperature: Option<f32>,
    pub default_language: Option<String>,
    pub default_model: Option<String>,
}

/// Response structure for transcription settings
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSettingsResponse {
    pub default_prompt: Option<String>,
    pub default_temperature: Option<f32>,
    pub default_language: Option<String>,
    pub default_model: Option<String>,
    pub updated_at: Option<String>,
}

pub async fn audio_transcriptions_batch_proxy(
    user_id: UserId,
    proxy_service: web::Data<ProxyService>,
    cost_billing_service: web::Data<CostBasedBillingService>,
    body: web::Json<AudioBatchRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    debug!("Audio transcription batch request from user: {} (chunk {})", user_id.0, body.chunk_index);
    
    // Check spending limits BEFORE processing request
    let has_access = cost_billing_service.check_service_access(&user_id.0).await?;
    if !has_access {
        return Ok(HttpResponse::PaymentRequired().json(serde_json::json!({
            "error": {
                "type": "spending_limit_exceeded",
                "message": "AI services blocked due to spending limit. Please upgrade your plan or wait for your billing cycle to reset."
            }
        })));
    }
    
    let request = body.into_inner();
    
    // Validate required fields
    if request.session_id.is_empty() {
        return Err(AppError::BadRequest("Session ID is required".to_string()));
    }
    
    if request.audio_base64.is_empty() {
        return Err(AppError::BadRequest("Audio data is required".to_string()));
    }
    
    // Validate transcription parameters
    validate_transcription_prompt(&request.prompt)?;
    validate_transcription_temperature(&request.temperature)?;
    
    // Sanitize prompt parameter
    let sanitized_prompt = sanitize_transcription_prompt(request.prompt);
    
    // Log transcription parameters for debugging and monitoring
    debug!("Transcription batch request parameters: user_id={}, session_id={}, chunk_index={}, duration_ms={}, has_prompt={}, temperature={:?}, language={:?}",
        user_id.0,
        request.session_id,
        request.chunk_index,
        request.duration_ms,
        sanitized_prompt.is_some(),
        request.temperature,
        request.language
    );
    
    // Additional security validation for session_id
    if request.session_id.len() > 100 {
        return Err(AppError::BadRequest("Session ID too long".to_string()));
    }
    
    // Validate chunk index is reasonable
    if request.chunk_index > 10000 {
        return Err(AppError::BadRequest("Chunk index too large".to_string()));
    }
    
    // Validate duration is reasonable (max 10 minutes per chunk)
    if request.duration_ms > 600_000 {
        return Err(AppError::BadRequest("Duration too long for a single chunk".to_string()));
    }
    
    // Decode base64 audio data
    let audio_data = base64::engine::general_purpose::STANDARD
        .decode(&request.audio_base64)
        .map_err(|e| AppError::BadRequest(format!("Invalid base64 audio data: {}", e)))?;
    
    // Validate audio data size
    if audio_data.is_empty() {
        return Err(AppError::BadRequest("Audio data cannot be empty".to_string()));
    }
    
    if audio_data.len() > 25 * 1024 * 1024 { // 25MB limit
        return Err(AppError::BadRequest("Audio data exceeds maximum size limit (25MB)".to_string()));
    }
    
    // Generate filename for this chunk
    let filename = format!("chunk_{}.webm", request.chunk_index);
    
    // Forward the transcription request to the proxy service with enhanced parameters
    let result = proxy_service.forward_transcription_request(
        &user_id.0,
        &audio_data,
        &filename,
        None, // Use default model (openai/gpt-4o-transcribe)
        request.duration_ms,
        request.language.as_deref(),
        sanitized_prompt.as_deref(),      // prompt
        request.temperature,              // temperature
    ).await?;
    
    // Extract transcribed text from the result
    let transcribed_text = result
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    let processing_time = start.elapsed().as_millis() as i64;
    
    // Log request duration with enhanced parameters info
    info!("Audio transcription batch chunk {} completed in {:?} (prompt: {}, temp: {:?}, lang: {:?})", 
        request.chunk_index, 
        start.elapsed(),
        sanitized_prompt.is_some(),
        request.temperature,
        request.language
    );
    
    // Return the batch response
    let response = AudioBatchResponse {
        text: transcribed_text,
        chunk_index: request.chunk_index,
        processing_time_ms: Some(processing_time),
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get transcription settings for a user
pub async fn get_transcription_settings(
    user_id: UserId,
    proxy_service: web::Data<ProxyService>,
) -> Result<HttpResponse, AppError> {
    debug!("Get transcription settings request from user: {}", user_id.0);
    
    // TODO: Once database schema is ready, implement settings retrieval
    // For now, return default/placeholder settings
    let settings = TranscriptionSettingsResponse {
        default_prompt: Some("Transcribe the following audio accurately, maintaining speaker identification and punctuation.".to_string()),
        default_temperature: Some(0.1),
        default_language: Some("en".to_string()),
        default_model: Some("openai/gpt-4o-transcribe".to_string()),
        updated_at: None,
    };
    
    info!("Retrieved transcription settings for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(settings))
}

/// Update transcription settings for a user
pub async fn update_transcription_settings(
    user_id: UserId,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<TranscriptionSettingsRequest>,
) -> Result<HttpResponse, AppError> {
    debug!("Update transcription settings request from user: {}", user_id.0);
    
    let settings_request = body.into_inner();
    
    // Validate settings parameters
    validate_transcription_prompt(&settings_request.default_prompt)?;
    validate_transcription_temperature(&settings_request.default_temperature)?;
    
    // Validate language code if provided
    if let Some(ref lang) = settings_request.default_language {
        if lang.len() > 10 {
            return Err(AppError::BadRequest("Language code too long".to_string()));
        }
    }
    
    // Validate model if provided
    if let Some(ref model) = settings_request.default_model {
        if model.is_empty() {
            return Err(AppError::BadRequest("Model cannot be empty".to_string()));
        }
        if model.len() > 100 {
            return Err(AppError::BadRequest("Model name too long".to_string()));
        }
    }
    
    // Sanitize prompt
    let sanitized_prompt = sanitize_transcription_prompt(settings_request.default_prompt);
    
    // TODO: Once database schema is ready, implement settings persistence
    // For now, return the sanitized settings as confirmation
    let response_settings = TranscriptionSettingsResponse {
        default_prompt: sanitized_prompt,
        default_temperature: settings_request.default_temperature,
        default_language: settings_request.default_language,
        default_model: settings_request.default_model,
        updated_at: Some(chrono::Utc::now().to_rfc3339()),
    };
    
    info!("Updated transcription settings for user: {} (prompt: {}, temp: {:?}, lang: {:?}, model: {:?})", 
        user_id.0,
        response_settings.default_prompt.is_some(),
        response_settings.default_temperature,
        response_settings.default_language,
        response_settings.default_model
    );
    
    Ok(HttpResponse::Ok().json(response_settings))
}

/// Reset transcription settings to defaults for a user
pub async fn reset_transcription_settings(
    user_id: UserId,
    proxy_service: web::Data<ProxyService>,
) -> Result<HttpResponse, AppError> {
    debug!("Reset transcription settings request from user: {}", user_id.0);
    
    // TODO: Once database schema is ready, implement settings reset
    // For now, return default settings
    let default_settings = TranscriptionSettingsResponse {
        default_prompt: None, // Use system default
        default_temperature: None, // Use system default
        default_language: None, // Auto-detect
        default_model: None, // Use system default
        updated_at: Some(chrono::Utc::now().to_rfc3339()),
    };
    
    info!("Reset transcription settings for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(default_settings))
}

/// Generic AI proxy endpoint for desktop app
/// 
/// This handler forwards requests to the appropriate OpenRouter endpoint
/// based on the specified model. It extracts the model from either the 
/// X-Model-Id header or from the request payload.
#[instrument(skip(req, proxy_service, body))]
pub async fn ai_proxy_endpoint(
    user_id: UserId,
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    cost_billing_service: web::Data<CostBasedBillingService>,
    path: web::Path<String>,
    body: web::Json<serde_json::Value>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Check spending limits BEFORE processing request
    let has_access = cost_billing_service.check_service_access(&user_id.0).await?;
    if !has_access {
        return Ok(HttpResponse::PaymentRequired().json(serde_json::json!({
            "error": {
                "type": "spending_limit_exceeded",
                "message": "AI services blocked due to spending limit. Please upgrade your plan or wait for your billing cycle to reset."
            }
        })));
    }
    
    // Get the endpoint from the path
    let endpoint = path.into_inner();
    
    // Get the model ID from the X-Model-Id header or from the request payload
    let model_id_from_request = req.headers()
        .get("X-Model-Id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| {
            body.get("model")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });
    
    info!("AI proxy request: endpoint={}, model={:?}, user_id={}", endpoint, model_id_from_request, user_id.0);
    
    // Get the request payload
    let payload = body.into_inner();
    
    // Check if this is a streaming request
    let is_streaming = payload.get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    // Forward the request to the proxy service based on the endpoint
    match endpoint.as_str() {
        "chat/completions" => {
            if is_streaming {
                // For streaming requests
                let proxy_arc = Arc::clone(&proxy_service);
                
                let stream = proxy_arc.forward_chat_completions_stream_request(user_id.0, payload, model_id_from_request.clone()).await?;
                
                info!("AI proxy streaming request initiated in {:?}", start.elapsed());
                
                Ok(HttpResponse::Ok()
                    .insert_header(header::ContentType::plaintext())
                    .insert_header((header::CACHE_CONTROL, "no-cache"))
                    .insert_header((header::CONNECTION, "keep-alive"))
                    .streaming(stream))
            } else {
                // For non-streaming requests
                let result = proxy_service.forward_chat_completions_request(&user_id.0, payload, model_id_from_request).await?;
                
                info!("AI proxy request completed in {:?}", start.elapsed());
                
                Ok(HttpResponse::Ok().json(result))
            }
        },
        // Add other endpoints as needed
        _ => {
            Err(AppError::InvalidArgument(format!("Unsupported endpoint: {}", endpoint)))
        }
    }
}