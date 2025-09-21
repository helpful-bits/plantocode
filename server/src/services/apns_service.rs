use std::sync::Arc;
use uuid::Uuid;
use serde_json::{json, Value as JsonValue};
use tracing::{info, warn, error, debug};
use reqwest::{Client, header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE}};
use chrono::{Utc, Duration};
use jsonwebtoken::{encode, Header, Algorithm, EncodingKey};
use serde::{Serialize, Deserialize};

use crate::db::repositories::device_repository::DeviceRepository;
use crate::error::AppError;

/// APNs service for sending push notifications to devices
pub struct ApnsService {
    device_repository: Arc<DeviceRepository>,
    http_client: Client,
    team_id: String,
    key_id: String,
    private_key: String,
    bundle_id: String,
    production: bool,
}

#[derive(Debug, Serialize)]
struct ApnsJwtClaims {
    iss: String, // Team ID
    iat: i64,    // Issued at
}

#[derive(Debug, Serialize)]
struct ApnsPayload {
    aps: ApnsAps,
    #[serde(flatten)]
    custom_data: JsonValue,
}

#[derive(Debug, Serialize)]
struct ApnsAps {
    alert: ApnsAlert,
    badge: Option<i32>,
    sound: Option<String>,
    category: Option<String>,
    #[serde(rename = "content-available")]
    content_available: Option<i32>,
    #[serde(rename = "mutable-content")]
    mutable_content: Option<i32>,
}

#[derive(Debug, Serialize)]
struct ApnsAlert {
    title: String,
    body: String,
    subtitle: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NotificationRequest {
    pub title: String,
    pub body: String,
    pub subtitle: Option<String>,
    pub badge: Option<i32>,
    pub sound: Option<String>,
    pub category: Option<String>,
    pub custom_data: Option<JsonValue>,
    pub content_available: bool,
    pub mutable_content: bool,
}

impl Default for NotificationRequest {
    fn default() -> Self {
        Self {
            title: String::new(),
            body: String::new(),
            subtitle: None,
            badge: None,
            sound: Some("default".to_string()),
            category: None,
            custom_data: None,
            content_available: false,
            mutable_content: false,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct NotificationResult {
    pub sent_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
}

impl ApnsService {
    pub fn new(
        device_repository: Arc<DeviceRepository>,
        team_id: String,
        key_id: String,
        private_key: String,
        bundle_id: String,
        production: bool,
    ) -> Self {
        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client for APNs");

        Self {
            device_repository,
            http_client,
            team_id,
            key_id,
            private_key,
            bundle_id,
            production,
        }
    }

    /// Generate JWT token for APNs authentication
    fn generate_jwt_token(&self) -> Result<String, AppError> {
        let header = Header {
            alg: Algorithm::ES256,
            kid: Some(self.key_id.clone()),
            ..Default::default()
        };

        let claims = ApnsJwtClaims {
            iss: self.team_id.clone(),
            iat: Utc::now().timestamp(),
        };

        // Decode the private key (assuming it's in PEM format)
        let encoding_key = EncodingKey::from_ec_pem(self.private_key.as_bytes())
            .map_err(|e| AppError::Configuration(format!("Invalid APNs private key: {}", e)))?;

        encode(&header, &claims, &encoding_key)
            .map_err(|e| AppError::Internal(format!("Failed to generate APNs JWT: {}", e)))
    }

    /// Get APNs server URL based on environment
    fn get_apns_url(&self) -> &'static str {
        if self.production {
            "https://api.push.apple.com"
        } else {
            "https://api.sandbox.push.apple.com"
        }
    }

    /// Send a notification to a specific device token
    async fn send_to_device_token(
        &self,
        device_token: &str,
        notification: &NotificationRequest,
    ) -> Result<(), String> {
        // Generate JWT token
        let jwt_token = self.generate_jwt_token()
            .map_err(|e| format!("Failed to generate JWT: {}", e))?;

        // Create APNs payload
        let payload = ApnsPayload {
            aps: ApnsAps {
                alert: ApnsAlert {
                    title: notification.title.clone(),
                    body: notification.body.clone(),
                    subtitle: notification.subtitle.clone(),
                },
                badge: notification.badge,
                sound: notification.sound.clone(),
                category: notification.category.clone(),
                content_available: if notification.content_available { Some(1) } else { None },
                mutable_content: if notification.mutable_content { Some(1) } else { None },
            },
            custom_data: notification.custom_data.clone().unwrap_or(JsonValue::Object(Default::default())),
        };

        // Create headers
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("bearer {}", jwt_token))
                .map_err(|e| format!("Invalid authorization header: {}", e))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            "apns-topic",
            HeaderValue::from_str(&self.bundle_id)
                .map_err(|e| format!("Invalid bundle ID: {}", e))?,
        );
        headers.insert("apns-push-type", HeaderValue::from_static("alert"));

        // Optional headers
        if let Some(category) = &notification.category {
            headers.insert(
                "apns-collapse-id",
                HeaderValue::from_str(category)
                    .map_err(|e| format!("Invalid collapse ID: {}", e))?,
            );
        }

        // Send request to APNs
        let url = format!("{}/3/device/{}", self.get_apns_url(), device_token);

        debug!(
            device_token = %device_token,
            url = %url,
            title = %notification.title,
            "Sending APNs notification"
        );

        let response = self.http_client
            .post(&url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        let response_body = response.text().await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        if status.is_success() {
            debug!(
                device_token = %device_token,
                status = %status,
                "APNs notification sent successfully"
            );
            Ok(())
        } else {
            let error_msg = if response_body.is_empty() {
                format!("APNs error: {}", status)
            } else {
                format!("APNs error: {} - {}", status, response_body)
            };

            warn!(
                device_token = %device_token,
                status = %status,
                response_body = %response_body,
                "APNs notification failed"
            );

            Err(error_msg)
        }
    }

    /// Send notification to all devices for a user
    pub async fn send_notification(
        &self,
        user_id: &Uuid,
        notification: NotificationRequest,
    ) -> Result<NotificationResult, AppError> {
        info!(
            user_id = %user_id,
            title = %notification.title,
            "Sending push notification to user devices"
        );

        // Get all push tokens for the user
        let push_tokens = self.device_repository
            .get_push_tokens_for_user(user_id)
            .await?;

        if push_tokens.is_empty() {
            info!(
                user_id = %user_id,
                "No push tokens found for user"
            );
            return Ok(NotificationResult {
                sent_count: 0,
                failed_count: 0,
                errors: vec!["No push tokens found for user".to_string()],
            });
        }

        let mut sent_count = 0;
        let mut failed_count = 0;
        let mut errors = Vec::new();

        // Send notification to each device
        for token in &push_tokens {
            match self.send_to_device_token(token, &notification).await {
                Ok(()) => {
                    sent_count += 1;
                    debug!(
                        user_id = %user_id,
                        device_token = %token,
                        "Notification sent successfully"
                    );
                }
                Err(e) => {
                    failed_count += 1;
                    errors.push(format!("Token {}: {}", token, e));
                    warn!(
                        user_id = %user_id,
                        device_token = %token,
                        error = %e,
                        "Failed to send notification"
                    );
                }
            }
        }

        let result = NotificationResult {
            sent_count,
            failed_count,
            errors,
        };

        info!(
            user_id = %user_id,
            sent_count = sent_count,
            failed_count = failed_count,
            total_tokens = push_tokens.len(),
            "Push notification delivery completed"
        );

        Ok(result)
    }

    /// Send a simple text notification to a user
    pub async fn send_simple_notification(
        &self,
        user_id: &Uuid,
        title: &str,
        body: &str,
    ) -> Result<NotificationResult, AppError> {
        let notification = NotificationRequest {
            title: title.to_string(),
            body: body.to_string(),
            ..Default::default()
        };

        self.send_notification(user_id, notification).await
    }

    /// Send a notification with custom data
    pub async fn send_data_notification(
        &self,
        user_id: &Uuid,
        title: &str,
        body: &str,
        custom_data: JsonValue,
    ) -> Result<NotificationResult, AppError> {
        let notification = NotificationRequest {
            title: title.to_string(),
            body: body.to_string(),
            custom_data: Some(custom_data),
            ..Default::default()
        };

        self.send_notification(user_id, notification).await
    }

    /// Send a silent notification (background update)
    pub async fn send_silent_notification(
        &self,
        user_id: &Uuid,
        custom_data: JsonValue,
    ) -> Result<NotificationResult, AppError> {
        let notification = NotificationRequest {
            title: String::new(), // Empty title for silent notifications
            body: String::new(),  // Empty body for silent notifications
            sound: None,          // No sound for silent notifications
            content_available: true, // Mark as background update
            custom_data: Some(custom_data),
            ..Default::default()
        };

        self.send_notification(user_id, notification).await
    }

    /// Test notification functionality (development only)
    pub async fn send_test_notification(
        &self,
        user_id: &Uuid,
    ) -> Result<NotificationResult, AppError> {
        let test_data = json!({
            "test": true,
            "timestamp": Utc::now().to_rfc3339(),
            "environment": if self.production { "production" } else { "sandbox" }
        });

        let notification = NotificationRequest {
            title: "Test Notification".to_string(),
            body: "This is a test notification from Vibe Manager.".to_string(),
            subtitle: Some("Testing APNs Integration".to_string()),
            badge: Some(1),
            category: Some("test".to_string()),
            custom_data: Some(test_data),
            ..Default::default()
        };

        info!(
            user_id = %user_id,
            environment = if self.production { "production" } else { "sandbox" },
            "Sending test notification"
        );

        self.send_notification(user_id, notification).await
    }
}

/// Builder for creating ApnsService instances
pub struct ApnsServiceBuilder {
    device_repository: Option<Arc<DeviceRepository>>,
    team_id: Option<String>,
    key_id: Option<String>,
    private_key: Option<String>,
    bundle_id: Option<String>,
    production: bool,
}

impl ApnsServiceBuilder {
    pub fn new() -> Self {
        Self {
            device_repository: None,
            team_id: None,
            key_id: None,
            private_key: None,
            bundle_id: None,
            production: false,
        }
    }

    pub fn device_repository(mut self, repo: Arc<DeviceRepository>) -> Self {
        self.device_repository = Some(repo);
        self
    }

    pub fn team_id(mut self, team_id: String) -> Self {
        self.team_id = Some(team_id);
        self
    }

    pub fn key_id(mut self, key_id: String) -> Self {
        self.key_id = Some(key_id);
        self
    }

    pub fn private_key(mut self, private_key: String) -> Self {
        self.private_key = Some(private_key);
        self
    }

    pub fn bundle_id(mut self, bundle_id: String) -> Self {
        self.bundle_id = Some(bundle_id);
        self
    }

    pub fn production(mut self, production: bool) -> Self {
        self.production = production;
        self
    }

    pub fn build(self) -> Result<ApnsService, AppError> {
        let device_repository = self.device_repository
            .ok_or_else(|| AppError::Configuration("Device repository is required".to_string()))?;
        let team_id = self.team_id
            .ok_or_else(|| AppError::Configuration("APNs team ID is required".to_string()))?;
        let key_id = self.key_id
            .ok_or_else(|| AppError::Configuration("APNs key ID is required".to_string()))?;
        let private_key = self.private_key
            .ok_or_else(|| AppError::Configuration("APNs private key is required".to_string()))?;
        let bundle_id = self.bundle_id
            .ok_or_else(|| AppError::Configuration("Bundle ID is required".to_string()))?;

        Ok(ApnsService::new(
            device_repository,
            team_id,
            key_id,
            private_key,
            bundle_id,
            self.production,
        ))
    }
}

impl Default for ApnsServiceBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_request_creation() {
        let notification = NotificationRequest {
            title: "Test Title".to_string(),
            body: "Test Body".to_string(),
            subtitle: Some("Test Subtitle".to_string()),
            badge: Some(5),
            sound: Some("custom.wav".to_string()),
            category: Some("test_category".to_string()),
            custom_data: Some(json!({"key": "value"})),
            content_available: true,
            mutable_content: false,
        };

        assert_eq!(notification.title, "Test Title");
        assert_eq!(notification.body, "Test Body");
        assert_eq!(notification.subtitle, Some("Test Subtitle".to_string()));
        assert_eq!(notification.badge, Some(5));
        assert!(notification.content_available);
        assert!(!notification.mutable_content);
    }

    #[test]
    fn test_apns_service_builder() {
        let builder = ApnsServiceBuilder::new()
            .team_id("TEAM123".to_string())
            .key_id("KEY123".to_string())
            .bundle_id("com.example.app".to_string())
            .production(true);

        // Can't fully test build() without a DeviceRepository and private key
        assert_eq!(builder.team_id, Some("TEAM123".to_string()));
        assert_eq!(builder.key_id, Some("KEY123".to_string()));
        assert_eq!(builder.bundle_id, Some("com.example.app".to_string()));
        assert!(builder.production);
    }

    #[test]
    fn test_notification_result() {
        let result = NotificationResult {
            sent_count: 3,
            failed_count: 1,
            errors: vec!["Token abc123: Network error".to_string()],
        };

        assert_eq!(result.sent_count, 3);
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.errors.len(), 1);
    }
}