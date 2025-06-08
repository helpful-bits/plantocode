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

/// Audio Transcription API proxy (Groq)
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
    let model_from_payload = if multipart_data.model.is_empty() || multipart_data.model == "groq/whisper-large-v3" { 
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
        multipart_data.language.as_deref()
    ).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("Audio transcription request completed in {:?}", duration);
    
    // Return the response
    Ok(HttpResponse::Ok().json(result))
}

/// Audio Transcription Streaming API proxy (Groq)
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
    let model_from_payload = if model.is_none() || model.as_ref() == Some(&"groq/whisper-large-v3".to_string()) {
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
        language.as_deref()
    ).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("Audio transcription streaming request completed in {:?}", duration);
    
    // Return the response
    Ok(HttpResponse::Ok().json(result))
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