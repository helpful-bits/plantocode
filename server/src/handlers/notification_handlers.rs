use actix_web::{HttpResponse, Result, web};
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::Arc;
use tracing::{error, info};

use crate::error::AppError;
use crate::models::authenticated_user::AuthenticatedUser;
use crate::services::apns_service::{ApnsService, NotificationRequest};

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobNotificationPayload {
    pub job_id: String,
    pub title: String,
    pub body: String,
    pub custom_data: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationResponse {
    pub success: bool,
    pub sent_count: usize,
    pub failed_count: usize,
    pub message: String,
}

/// Handler for job completion notifications
pub async fn job_completed_handler(
    user: web::ReqData<AuthenticatedUser>,
    payload: web::Json<JobNotificationPayload>,
    apns_service: web::Data<Arc<ApnsService>>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;

    info!(
        user_id = %user_id,
        job_id = %payload.job_id,
        "Processing job completion notification"
    );

    // Use custom data from desktop as-is (already in camelCase format)
    // Desktop sends: type, jobId, sessionId, projectDirectory, etc.
    let mut custom_data = payload.custom_data.clone().unwrap_or_else(|| json!({}));

    // Add timestamp if not already present
    if let Value::Object(custom_map) = &mut custom_data {
        if !custom_map.contains_key("timestamp") {
            custom_map.insert("timestamp".to_string(), json!(chrono::Utc::now().to_rfc3339()));
        }
    }

    let notification = NotificationRequest {
        title: payload.title.clone(),
        body: payload.body.clone(),
        badge: Some(1), // Show badge for completed jobs
        sound: Some("default".to_string()),
        category: Some("job_completed".to_string()),
        custom_data: Some(custom_data),
        content_available: true, // Allow background processing
        ..Default::default()
    };

    // Send the notification
    match apns_service.send_notification(&user_id, notification).await {
        Ok(result) => {
            info!(
                user_id = %user_id,
                job_id = %payload.job_id,
                sent_count = result.sent_count,
                failed_count = result.failed_count,
                "Job completion notification sent"
            );

            Ok(HttpResponse::Ok().json(NotificationResponse {
                success: true,
                sent_count: result.sent_count,
                failed_count: result.failed_count,
                message: format!("Notification sent to {} devices", result.sent_count),
            }))
        }
        Err(e) => {
            error!(
                user_id = %user_id,
                job_id = %payload.job_id,
                error = %e,
                "Failed to send job completion notification"
            );

            Err(AppError::External(format!(
                "Failed to send notification: {}",
                e
            )))
        }
    }
}

/// Handler for job failure notifications
pub async fn job_failed_handler(
    user: web::ReqData<AuthenticatedUser>,
    payload: web::Json<JobNotificationPayload>,
    apns_service: web::Data<Arc<ApnsService>>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;

    info!(
        user_id = %user_id,
        job_id = %payload.job_id,
        "Processing job failure notification"
    );

    // Use custom data from desktop as-is (already in camelCase format)
    // Desktop sends: type, jobId, sessionId, projectDirectory, errorMessage, etc.
    let mut custom_data = payload.custom_data.clone().unwrap_or_else(|| json!({}));

    // Add timestamp if not already present
    if let Value::Object(custom_map) = &mut custom_data {
        if !custom_map.contains_key("timestamp") {
            custom_map.insert("timestamp".to_string(), json!(chrono::Utc::now().to_rfc3339()));
        }
    }

    let notification = NotificationRequest {
        title: payload.title.clone(),
        body: payload.body.clone(),
        badge: Some(1), // Show badge for failed jobs
        sound: Some("default".to_string()),
        category: Some("job_failed".to_string()),
        custom_data: Some(custom_data),
        content_available: true, // Allow background processing
        ..Default::default()
    };

    // Send the notification
    match apns_service.send_notification(&user_id, notification).await {
        Ok(result) => {
            info!(
                user_id = %user_id,
                job_id = %payload.job_id,
                sent_count = result.sent_count,
                failed_count = result.failed_count,
                "Job failure notification sent"
            );

            Ok(HttpResponse::Ok().json(NotificationResponse {
                success: true,
                sent_count: result.sent_count,
                failed_count: result.failed_count,
                message: format!("Notification sent to {} devices", result.sent_count),
            }))
        }
        Err(e) => {
            error!(
                user_id = %user_id,
                job_id = %payload.job_id,
                error = %e,
                "Failed to send job failure notification"
            );

            Err(AppError::External(format!(
                "Failed to send notification: {}",
                e
            )))
        }
    }
}

/// Handler for general progress notifications
pub async fn job_progress_handler(
    user: web::ReqData<AuthenticatedUser>,
    payload: web::Json<JobNotificationPayload>,
    apns_service: web::Data<Arc<ApnsService>>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;

    info!(
        user_id = %user_id,
        job_id = %payload.job_id,
        "Processing job progress notification"
    );

    // Use custom data from desktop as-is (already in camelCase format)
    // Desktop sends: type, jobId, sessionId, projectDirectory, progress, etc.
    let mut custom_data = payload.custom_data.clone().unwrap_or_else(|| json!({}));

    // Add timestamp if not already present
    if let Value::Object(custom_map) = &mut custom_data {
        if !custom_map.contains_key("timestamp") {
            custom_map.insert("timestamp".to_string(), json!(chrono::Utc::now().to_rfc3339()));
        }
    }

    // For progress notifications, use silent notifications to avoid spam
    let notification = NotificationRequest {
        title: String::new(), // Empty for silent notification
        body: String::new(),  // Empty for silent notification
        sound: None,          // No sound for progress updates
        category: Some("job_progress".to_string()),
        custom_data: Some(custom_data),
        content_available: true, // Background processing only
        ..Default::default()
    };

    // Send the silent notification
    match apns_service.send_notification(&user_id, notification).await {
        Ok(result) => {
            info!(
                user_id = %user_id,
                job_id = %payload.job_id,
                sent_count = result.sent_count,
                failed_count = result.failed_count,
                "Job progress notification sent"
            );

            Ok(HttpResponse::Ok().json(NotificationResponse {
                success: true,
                sent_count: result.sent_count,
                failed_count: result.failed_count,
                message: format!("Silent notification sent to {} devices", result.sent_count),
            }))
        }
        Err(e) => {
            error!(
                user_id = %user_id,
                job_id = %payload.job_id,
                error = %e,
                "Failed to send job progress notification"
            );

            Err(AppError::External(format!(
                "Failed to send notification: {}",
                e
            )))
        }
    }
}

/// Test notification handler for development purposes
pub async fn test_notification_handler(
    user: web::ReqData<AuthenticatedUser>,
    apns_service: web::Data<Arc<ApnsService>>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;

    info!(
        user_id = %user_id,
        "Sending test notification"
    );

    match apns_service.send_test_notification(&user_id).await {
        Ok(result) => {
            info!(
                user_id = %user_id,
                sent_count = result.sent_count,
                failed_count = result.failed_count,
                "Test notification sent"
            );

            Ok(HttpResponse::Ok().json(NotificationResponse {
                success: true,
                sent_count: result.sent_count,
                failed_count: result.failed_count,
                message: format!("Test notification sent to {} devices", result.sent_count),
            }))
        }
        Err(e) => {
            error!(
                user_id = %user_id,
                error = %e,
                "Failed to send test notification"
            );

            Err(AppError::External(format!(
                "Failed to send test notification: {}",
                e
            )))
        }
    }
}

