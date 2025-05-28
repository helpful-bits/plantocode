use actix_web::{web, HttpResponse, post, http::header, HttpRequest};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::proxy_service::ProxyService;
use crate::services::cost_based_billing_service::CostBasedBillingService;
use crate::middleware::secure_auth::UserId;
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
#[post("/openrouter/chat/completions")]
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
#[post("/audio/transcriptions")]
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
    
    // Process the multipart form data to extract the audio file, model, and duration
    let mut audio_data = Vec::new();
    let mut filename = String::from("audio.webm");  // Default filename
    let mut model = String::from("groq/whisper-large-v3");  // Default model
    let mut input_duration_ms: i64 = 0;
    
    // Define a helper function to process the multipart payload
    let mut multipart = payload;
    
    // Process each field in the multipart form
    while let Some(item) = multipart.next().await {
        let mut field = item?;
        let content_disposition = field.content_disposition().ok_or_else(|| {
            AppError::InvalidArgument("Content-Disposition header missing".to_string())
        })?;
        
        let field_name = content_disposition.get_name().ok_or_else(|| {
            AppError::InvalidArgument("Field name missing".to_string())
        })?;
        
        match field_name {
            "file" => {
                // Extract filename if provided
                if let Some(fname) = content_disposition.get_filename() {
                    filename = fname.to_string();
                }
                
                // Extract audio data
                while let Some(chunk) = field.next().await {
                    let data = chunk?;
                    audio_data.extend_from_slice(&data);
                }
            },
            "model" => {
                // Extract model name
                let mut model_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    let data = chunk?;
                    model_data.extend_from_slice(&data);
                }
                
                model = String::from_utf8(model_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid model name encoding".to_string()))?;
            },
            "duration_ms" => {
                let mut duration_data = Vec::new();
                while let Some(chunk) = field.next().await {
                    let data = chunk?;
                    duration_data.extend_from_slice(&data);
                }
                input_duration_ms = String::from_utf8(duration_data)
                    .map_err(|_| AppError::InvalidArgument("Invalid duration_ms encoding".to_string()))?
                    .parse::<i64>()
                    .map_err(|_| AppError::InvalidArgument("Invalid duration_ms value".to_string()))?;
            },
            _ => {
                // Skip other fields
                while let Some(_) = field.next().await {}
            }
        }
    }
    
    // Ensure we got audio data
    if audio_data.is_empty() {
        return Err(AppError::InvalidArgument("No audio data provided".to_string()));
    }
    
    // Ensure we got audio duration
    if input_duration_ms == 0 {
        return Err(AppError::InvalidArgument("Missing or invalid audio duration_ms".to_string()));
    }
    
    // Forward the transcription request to the proxy service
    let model_from_payload = if model == "groq/whisper-large-v3" { 
        None // Use default from app_settings
    } else { 
        Some(model) 
    };
    
    let result = proxy_service.forward_transcription_request(
        &user_id.0, 
        &audio_data, 
        &filename, 
        model_from_payload,
        input_duration_ms
    ).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("Audio transcription request completed in {:?}", duration);
    
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