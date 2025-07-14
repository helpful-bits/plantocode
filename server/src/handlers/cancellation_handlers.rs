use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use tracing::{info, warn, error, instrument};

use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::services::request_tracker::RequestTracker;
use crate::config::settings::AppSettings;
use crate::clients::http_client::new_api_client;

#[derive(Debug, Deserialize)]
pub struct CancelRequestPayload {
    pub request_id: String,
}

#[derive(Debug, Serialize)]
pub struct CancelRequestResponse {
    pub success: bool,
    pub message: String,
}

#[instrument(skip(payload, user, request_tracker, app_settings))]
pub async fn cancel_request_handler(
    payload: web::Json<CancelRequestPayload>,
    user: web::ReqData<AuthenticatedUser>,
    request_tracker: web::Data<RequestTracker>,
    app_settings: web::Data<AppSettings>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;
    let request_id = &payload.request_id;
    
    info!("Cancellation request received for request_id: {} by user: {}", request_id, user_id);
    
    // Look up the request in the tracker
    let tracked_request = request_tracker
        .get_request(request_id)
        .await
        .ok_or_else(|| {
            warn!("Request {} not found in tracker", request_id);
            AppError::NotFound(format!("Request {} not found or already completed", request_id))
        })?;
    
    // Verify the user owns this request
    if tracked_request.user_id != user_id {
        warn!("User {} attempted to cancel request {} owned by {}", user_id, request_id, tracked_request.user_id);
        return Err(AppError::Forbidden("You don't have permission to cancel this request".to_string()));
    }
    
    // Handle provider-specific cancellation
    match tracked_request.provider.as_str() {
        "openai" => {
            if let Some(response_id) = tracked_request.openai_response_id {
                // Call OpenAI's cancel endpoint
                let openai_api_key = app_settings
                    .api_keys
                    .openai_api_key
                    .as_ref()
                    .ok_or_else(|| AppError::Configuration("OpenAI API key not configured".to_string()))?;
                
                let cancel_url = format!("https://api.openai.com/v1/responses/{}/cancel", response_id);
                let client = new_api_client();
                
                let response = client
                    .post(&cancel_url)
                    .bearer_auth(openai_api_key)
                    .send()
                    .await
                    .map_err(|e| AppError::External(format!("Failed to send cancellation request: {}", e)))?;
                
                if response.status().is_success() {
                    info!("Successfully cancelled OpenAI response {} for request {}", response_id, request_id);
                } else {
                    let status = response.status();
                    let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                    error!("Failed to cancel OpenAI response {}: {} - {}", response_id, status, error_text);
                    
                    // Even if OpenAI cancellation fails, we'll still mark it as cancelled locally
                }
                
                // Remove from tracker
                request_tracker.remove_request(request_id).await;
                
                Ok(HttpResponse::Ok().json(CancelRequestResponse {
                    success: true,
                    message: format!("Request {} has been cancelled", request_id),
                }))
            } else {
                // Request hasn't reached OpenAI yet, just remove from tracker
                request_tracker.remove_request(request_id).await;
                
                Ok(HttpResponse::Ok().json(CancelRequestResponse {
                    success: true,
                    message: format!("Request {} has been cancelled before processing", request_id),
                }))
            }
        }
        _ => {
            // For other providers, we can't cancel but we'll remove from tracker
            warn!("Cancellation not supported for provider: {}", tracked_request.provider);
            request_tracker.remove_request(request_id).await;
            
            Ok(HttpResponse::Ok().json(CancelRequestResponse {
                success: true,
                message: format!("Request {} has been marked as cancelled", request_id),
            }))
        }
    }
}

#[instrument(skip(user, request_tracker))]
pub async fn get_request_status_handler(
    request_id: web::Path<String>,
    user: web::ReqData<AuthenticatedUser>,
    request_tracker: web::Data<RequestTracker>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;
    let request_id = request_id.into_inner();
    
    // Look up the request in the tracker
    let tracked_request = request_tracker
        .get_request(&request_id)
        .await
        .ok_or_else(|| {
            AppError::NotFound(format!("Request {} not found or already completed", request_id))
        })?;
    
    // Verify the user owns this request
    if tracked_request.user_id != user_id {
        return Err(AppError::Forbidden("You don't have permission to view this request".to_string()));
    }
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "request_id": tracked_request.request_id,
        "provider": tracked_request.provider,
        "status": "active",
        "openai_response_id": tracked_request.openai_response_id,
        "created_at": tracked_request.created_at,
    })))
}