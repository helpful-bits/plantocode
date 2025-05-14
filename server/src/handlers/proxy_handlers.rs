use actix_web::{web, HttpResponse, post, http::header, HttpRequest};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::proxy_service::ProxyService;
use futures::StreamExt;
use log::{debug, error, info};
use std::time::Instant;

#[derive(Debug, Deserialize)]
pub struct ProxyRequest {
    #[serde(flatten)]
    pub payload: serde_json::Value,
    #[serde(skip, default)]
    pub service: String,
}

#[derive(Debug, Serialize)]
pub struct ProxyResponse {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

/// Proxy for Gemini API
#[post("/proxy/gemini")]
pub async fn gemini_proxy(
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<uuid::Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Gemini proxy request from user: {}", user_id);
    
    // Set the service name
    let mut payload = body.into_inner();
    payload.service = "gemini".to_string();
    
    // Forward the request to the proxy service
    let result = proxy_service.forward_request(user_id, "gemini", payload.payload).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("Gemini proxy request completed in {:?}", duration);
    
    // Return the response
    Ok(HttpResponse::Ok().json(result))
}

/// Proxy for Claude API
#[post("/proxy/claude")]
pub async fn claude_proxy(
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<uuid::Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Claude proxy request from user: {}", user_id);
    
    // Set the service name
    let mut payload = body.into_inner();
    payload.service = "claude".to_string();
    
    // Forward the request to the proxy service
    let result = proxy_service.forward_request(user_id, "claude", payload.payload).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("Claude proxy request completed in {:?}", duration);
    
    // Return the response
    Ok(HttpResponse::Ok().json(result))
}

/// Proxy for Groq API
#[post("/proxy/groq")]
pub async fn groq_proxy(
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<uuid::Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Groq proxy request from user: {}", user_id);
    
    // Set the service name
    let mut payload = body.into_inner();
    payload.service = "groq".to_string();
    
    // Forward the request to the proxy service
    let result = proxy_service.forward_request(user_id, "groq", payload.payload).await?;
    
    // Log request duration
    let duration = start.elapsed();
    info!("Groq proxy request completed in {:?}", duration);
    
    // Return the response
    Ok(HttpResponse::Ok().json(result))
}

/// Streaming proxy for Gemini API
#[post("/proxy/gemini/stream")]
pub async fn gemini_stream_proxy(
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<uuid::Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Gemini streaming proxy request from user: {}", user_id);
    
    // Set the service name
    let mut payload = body.into_inner();
    payload.service = "gemini".to_string();
    
    // Get the streaming response
    let stream = proxy_service.forward_stream_request(user_id, "gemini", payload.payload).await?;
    
    // Log initiation
    info!("Gemini streaming proxy initiated in {:?}", start.elapsed());
    
    // Return the streaming response
    Ok(HttpResponse::Ok()
        .insert_header(header::ContentType::json())
        .streaming(stream))
}

/// Streaming proxy for Claude API
#[post("/proxy/claude/stream")]
pub async fn claude_stream_proxy(
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<uuid::Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Claude streaming proxy request from user: {}", user_id);
    
    // Set the service name
    let mut payload = body.into_inner();
    payload.service = "claude".to_string();
    
    // Get the streaming response
    let stream = proxy_service.forward_stream_request(user_id, "claude", payload.payload).await?;
    
    // Log initiation
    info!("Claude streaming proxy initiated in {:?}", start.elapsed());
    
    // Return the streaming response
    Ok(HttpResponse::Ok()
        .insert_header(header::ContentType::json())
        .streaming(stream))
}

/// Streaming proxy for Groq API
#[post("/proxy/groq/stream")]
pub async fn groq_stream_proxy(
    req: HttpRequest,
    proxy_service: web::Data<ProxyService>,
    body: web::Json<ProxyRequest>,
) -> Result<HttpResponse, AppError> {
    let start = Instant::now();
    
    // Get the user ID from authentication middleware
    let user_id = req.extensions().get::<uuid::Uuid>().ok_or(AppError::Auth("Unauthorized".to_string()))?;
    debug!("Groq streaming proxy request from user: {}", user_id);
    
    // Set the service name
    let mut payload = body.into_inner();
    payload.service = "groq".to_string();
    
    // Get the streaming response
    let stream = proxy_service.forward_stream_request(user_id, "groq", payload.payload).await?;
    
    // Log initiation
    info!("Groq streaming proxy initiated in {:?}", start.elapsed());
    
    // Return the streaming response
    Ok(HttpResponse::Ok()
        .insert_header(header::ContentType::json())
        .streaming(stream))
}