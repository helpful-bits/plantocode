use actix_web::{web, HttpResponse, post, http::header, HttpRequest};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::proxy_service::ProxyService;
use crate::middleware::secure_auth::UserId;
use futures_util::StreamExt;
use actix_multipart::Multipart;
use tracing::{debug, error, info, instrument};
use std::sync::Arc;
use std::time::Instant;

#[derive(Debug, Deserialize)]
pub struct ProxyRequest {
    #[serde(flatten)]
    pub payload: serde_json::Value,
}

/// OpenRouter Chat Completions Proxy - handles both streaming and non-streaming
#[post("/openrouter/chat/completions")]
pub async fn openrouter_chat_completions_proxy(
    user_id: UserId,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    debug!("OpenRouter chat completions request from user: {}", user_id.0);
    
    let payload = body.into_inner().payload;
    
    // Check if streaming is requested
    let is_streaming = payload.get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    if is_streaming {
        // Get an Arc<ProxyService> from the Data<ProxyService>
        let proxy_arc = Arc::clone(&proxy_service);
        
        // Handle streaming request
        let stream = proxy_arc.forward_chat_completions_stream_request(user_id.0, payload).await?;
        
        // Log initiation
        info!("OpenRouter streaming chat completions initiated in {:?}", start.elapsed());
        
        // Return the streaming response
        Ok(HttpResponse::Ok()
            .insert_header(header::ContentType::plaintext())
            .insert_header((header::CACHE_CONTROL, "no-cache"))
            .insert_header((header::CONNECTION, "keep-alive"))
            .streaming(stream))
    } else {
        // Handle non-streaming request
        let result = proxy_service.forward_chat_completions_request(&user_id.0, payload).await?;
        
        // Log request duration
        let duration = start.elapsed();
        info!("OpenRouter chat completions request completed in {:?}", duration);
        
        // Return the response
        Ok(HttpResponse::Ok().json(result))
    }
}

/// OpenRouter Transcription API proxy
#[post("/openrouter/audio/transcriptions")]
pub async fn openrouter_audio_transcriptions_proxy(
    user_id: UserId,
    proxy_service: web::Data<ProxyService>,
    payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    debug!("OpenRouter audio transcription request from user: {}", user_id.0);
    
    // Process the multipart form data to extract the audio file and model
    let mut audio_data = Vec::new();
    let mut filename = String::from("audio.webm");  // Default filename
    let mut model = String::from("openai/whisper-1");  // Default model
    
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
    
    // Forward the transcription request to the proxy service
    let result = proxy_service.forward_transcription_request(
        &user_id.0, 
        &audio_data, 
        &filename, 
        &model
    ).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("OpenRouter transcription request completed in {:?}", duration);
    
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
    path: web::Path<String>,
    body: web::Json<serde_json::Value>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the endpoint from the path
    let endpoint = path.into_inner();
    
    // Get the model ID from the X-Model-Id header or from the request payload
    let model_id = req.headers()
        .get("X-Model-Id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| {
            body.get("model")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "anthropic/claude-3-sonnet".to_string());
    
    info!("AI proxy request: endpoint={}, model={}, user_id={}", endpoint, model_id, user_id.0);
    
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
                
                // Create a payload with the model explicitly set
                let mut new_payload = payload.clone();
                new_payload["model"] = serde_json::Value::String(model_id.clone());
                
                let stream = proxy_arc.forward_chat_completions_stream_request(user_id.0, new_payload).await?;
                
                info!("AI proxy streaming request initiated in {:?}", start.elapsed());
                
                Ok(HttpResponse::Ok()
                    .insert_header(header::ContentType::plaintext())
                    .insert_header((header::CACHE_CONTROL, "no-cache"))
                    .insert_header((header::CONNECTION, "keep-alive"))
                    .streaming(stream))
            } else {
                // For non-streaming requests
                // Create a payload with the model explicitly set
                let mut new_payload = payload.clone();
                new_payload["model"] = serde_json::Value::String(model_id.clone());
                
                let result = proxy_service.forward_chat_completions_request(&user_id.0, new_payload).await?;
                
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