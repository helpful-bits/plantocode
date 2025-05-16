use actix_web::{web, HttpResponse, post, http::header, HttpRequest, HttpMessage};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::proxy_service::ProxyService;
use futures_util::StreamExt;
use actix_multipart::Multipart;
use log::{debug, error, info};
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
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<uuid::Uuid>().cloned().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("OpenRouter chat completions request from user: {}", user_id);
    
    let payload = body.into_inner().payload;
    
    // Check if streaming is requested
    let is_streaming = payload.get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    if is_streaming {
        // Get an Arc<ProxyService> from the Data<ProxyService>
        let proxy_arc = Arc::clone(&proxy_service);
        
        // Handle streaming request
        let stream = proxy_arc.forward_chat_completions_stream_request(user_id, payload).await?;
        
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
        let result = proxy_service.forward_chat_completions_request(&user_id, payload).await?;
        
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
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<uuid::Uuid>().cloned().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("OpenRouter audio transcription request from user: {}", user_id);
    
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
        &user_id, 
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