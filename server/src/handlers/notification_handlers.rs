use actix_web::{HttpRequest, HttpResponse, Result, web};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::db::repositories::device_repository::{DeviceRepository, RegisterDeviceRequest};
use crate::error::AppError;
use crate::models::authenticated_user::AuthenticatedUser;
use crate::services::apns_service::{ApnsService, NotificationRequest};

#[derive(Debug, Deserialize)]
pub struct JobNotificationPayload {
    pub job_id: String,
    pub title: String,
    pub body: String,
    pub custom_data: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterPushTokenPayload {
    pub device_id: Uuid,
    pub platform: String,
    pub token: String,
}

#[derive(Deserialize)]
pub struct PushTokenRegistrationRequest {
    pub deviceToken: String,
    pub platform: String,
    pub environment: String,
}

#[derive(Serialize)]
pub struct PushTokenRegistrationResponse {
    pub success: bool,
}

#[derive(Debug, Serialize)]
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

    // Create notification with job completion data
    let mut custom_data = json!({
        "job_id": payload.job_id,
        "notification_type": "job_completed",
        "timestamp": chrono::Utc::now().to_rfc3339()
    });

    // Merge any additional custom data
    if let Some(additional_data) = &payload.custom_data {
        if let Value::Object(map) = additional_data {
            if let Value::Object(custom_map) = &mut custom_data {
                for (key, value) in map {
                    custom_map.insert(key.clone(), value.clone());
                }
            }
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

    // Create notification with job failure data
    let mut custom_data = json!({
        "job_id": payload.job_id,
        "notification_type": "job_failed",
        "timestamp": chrono::Utc::now().to_rfc3339()
    });

    // Merge any additional custom data
    if let Some(additional_data) = &payload.custom_data {
        if let Value::Object(map) = additional_data {
            if let Value::Object(custom_map) = &mut custom_data {
                for (key, value) in map {
                    custom_map.insert(key.clone(), value.clone());
                }
            }
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

    // Create notification with job progress data
    let mut custom_data = json!({
        "job_id": payload.job_id,
        "notification_type": "job_progress",
        "timestamp": chrono::Utc::now().to_rfc3339()
    });

    // Merge any additional custom data
    if let Some(additional_data) = &payload.custom_data {
        if let Value::Object(map) = additional_data {
            if let Value::Object(custom_map) = &mut custom_data {
                for (key, value) in map {
                    custom_map.insert(key.clone(), value.clone());
                }
            }
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

pub async fn register_push_token(
    user: web::ReqData<AuthenticatedUser>,
    payload: web::Json<RegisterPushTokenPayload>,
    device_repo: web::Data<Arc<DeviceRepository>>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;

    info!(
        user_id = %user_id,
        device_id = %payload.device_id,
        platform = %payload.platform,
        "Registering push token"
    );

    match device_repo
        .upsert_push_token(
            &user_id,
            &payload.device_id,
            &payload.platform,
            &payload.token,
        )
        .await
    {
        Ok(_) => {
            info!(
                user_id = %user_id,
                device_id = %payload.device_id,
                platform = %payload.platform,
                "Push token registered successfully"
            );

            Ok(HttpResponse::Ok().json(json!({
                "success": true,
                "message": "Push token registered successfully"
            })))
        }
        Err(e) => {
            error!(
                user_id = %user_id,
                device_id = %payload.device_id,
                platform = %payload.platform,
                error = %e,
                "Failed to register push token"
            );

            Err(e)
        }
    }
}

pub async fn register_push_token_handler(
    user: web::ReqData<AuthenticatedUser>,
    req: web::Json<PushTokenRegistrationRequest>,
    device_repo: web::Data<DeviceRepository>,
    http_req: HttpRequest,
) -> actix_web::Result<HttpResponse> {
    let device_id_str = http_req
        .headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| actix_web::error::ErrorBadRequest("Missing X-Device-ID header"))?;

    let device_id = uuid::Uuid::parse_str(device_id_str)
        .map_err(|_| actix_web::error::ErrorBadRequest("Invalid device ID format"))?;

    match device_repo
        .upsert_push_token(&user.user_id, &device_id, &req.platform, &req.deviceToken)
        .await
    {
        Ok(_) => Ok(HttpResponse::Ok().json(PushTokenRegistrationResponse { success: true })),
        Err(AppError::NotFound(_)) => {
            // Device doesn't exist - auto-register it
            info!(
                user_id = %user.user_id,
                device_id = %device_id,
                "Device not found during push token registration, auto-creating device"
            );

            // Create minimal device registration
            let register_request = RegisterDeviceRequest {
                device_id,
                user_id: user.user_id,
                device_name: "iOS Device".to_string(),
                device_type: "mobile".to_string(),
                platform: req.platform.clone(),
                platform_version: None,
                app_version: String::new(),
                local_ips: None,
                public_ip: None,
                relay_eligible: false,
                available_ports: None,
                capabilities: serde_json::json!({}),
            };

            // Register the device
            device_repo
                .register_device(register_request)
                .await
                .map_err(|e| {
                    error!(
                        user_id = %user.user_id,
                        device_id = %device_id,
                        error = %e,
                        "Failed to auto-register device"
                    );
                    actix_web::error::ErrorInternalServerError(e)
                })?;

            // Retry push token upsert
            device_repo
                .upsert_push_token(&user.user_id, &device_id, &req.platform, &req.deviceToken)
                .await
                .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;

            Ok(HttpResponse::Ok().json(PushTokenRegistrationResponse { success: true }))
        }
        Err(e) => Err(actix_web::error::ErrorInternalServerError(e)),
    }
}
