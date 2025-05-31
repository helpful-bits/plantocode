use crate::error::AppError;
use crate::db::repositories::{
    EmailNotificationRepository, EmailNotification, BillingConfigurationRepository, EmailTemplates
};
use uuid::Uuid;
use chrono::Utc;
use serde_json::{json, Value as JsonValue};
use log::{debug, error, info, warn};
use std::sync::Arc;
use sqlx::PgPool;
use bigdecimal::BigDecimal;

#[derive(Debug, Clone)]
pub struct EmailNotificationService {
    email_repository: Arc<EmailNotificationRepository>,
    config_repository: Arc<BillingConfigurationRepository>,
    smtp_config: SmtpConfig,
}

#[derive(Debug, Clone)]
pub struct SmtpConfig {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub from_email: String,
    pub from_name: String,
}

impl SmtpConfig {
    pub fn from_env() -> Result<Self, AppError> {
        Ok(Self {
            smtp_host: std::env::var("SMTP_HOST")
                .unwrap_or_else(|_| "localhost".to_string()),
            smtp_port: std::env::var("SMTP_PORT")
                .unwrap_or_else(|_| "587".to_string())
                .parse()
                .map_err(|_| AppError::Configuration("Invalid SMTP_PORT".to_string()))?,
            smtp_username: std::env::var("SMTP_USERNAME")
                .map_err(|_| AppError::Configuration("SMTP_USERNAME not set".to_string()))?,
            smtp_password: std::env::var("SMTP_PASSWORD")
                .map_err(|_| AppError::Configuration("SMTP_PASSWORD not set".to_string()))?,
            from_email: std::env::var("FROM_EMAIL")
                .unwrap_or_else(|_| "noreply@vibemanager.com".to_string()),
            from_name: std::env::var("FROM_NAME")
                .unwrap_or_else(|_| "Vibe Manager".to_string()),
        })
    }
}

impl EmailNotificationService {
    pub fn new(db_pool: PgPool) -> Result<Self, AppError> {
        let email_repository = Arc::new(EmailNotificationRepository::new(db_pool.clone()));
        let config_repository = Arc::new(BillingConfigurationRepository::new(db_pool));
        let smtp_config = SmtpConfig::from_env()?;

        Ok(Self {
            email_repository,
            config_repository,
            smtp_config,
        })
    }

    /// Queue a spending alert email notification
    pub async fn queue_spending_alert(
        &self,
        user_id: &Uuid,
        user_email: &str,
        alert_type: &str,
        current_spending: &BigDecimal,
        threshold_amount: &BigDecimal,
        usage_percentage: f64,
        currency: &str,
    ) -> Result<(), AppError> {
        // Check if we've sent this type of alert recently to prevent spam
        if self.email_repository.has_recent_notification(user_id, alert_type, 24).await? {
            debug!("Skipping duplicate spending alert {} for user {}", alert_type, user_id);
            return Ok(());
        }

        let templates = self.config_repository.get_email_templates().await?;
        
        let (subject, template_name) = match alert_type {
            "75_percent" => (
                templates.spending_alert_75.subject.clone(),
                templates.spending_alert_75.template.clone(),
            ),
            "90_percent" => (
                templates.spending_alert_90.subject.clone(),
                templates.spending_alert_90.template.clone(),
            ),
            "limit_reached" => (
                templates.spending_limit_reached.subject.clone(),
                templates.spending_limit_reached.template.clone(),
            ),
            "services_blocked" => (
                templates.services_blocked.subject.clone(),
                templates.services_blocked.template.clone(),
            ),
            _ => return Err(AppError::InvalidArgument(format!("Unknown alert type: {}", alert_type))),
        };

        let template_data = json!({
            "user_id": user_id,
            "alert_type": alert_type,
            "current_spending": current_spending.to_string(),
            "threshold_amount": threshold_amount.to_string(),
            "usage_percentage": usage_percentage,
            "currency": currency,
            "currency_symbol": if currency == "USD" { "$" } else { currency },
            "dashboard_url": format!("{}/account", self.get_app_base_url().await?),
            "billing_url": format!("{}/account", self.get_app_base_url().await?),
        });

        let notification = EmailNotification {
            id: Uuid::new_v4(),
            user_id: *user_id,
            email_address: user_email.to_string(),
            notification_type: format!("spending_alert_{}", alert_type),
            subject,
            template_name,
            template_data,
            status: "pending".to_string(),
            attempts: 0,
            max_attempts: 3,
            last_attempt_at: None,
            sent_at: None,
            error_message: None,
            priority: 1, // High priority for spending alerts
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.email_repository.create(&notification).await?;
        info!("Queued spending alert email {} for user {}", alert_type, user_id);

        Ok(())
    }

    /// Queue an invoice notification
    pub async fn queue_invoice_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        invoice_id: &str,
        amount_due: &BigDecimal,
        due_date: &chrono::DateTime<chrono::Utc>,
        currency: &str,
        invoice_url: Option<&str>,
    ) -> Result<(), AppError> {
        let templates = self.config_repository.get_email_templates().await?;

        let template_data = json!({
            "user_id": user_id,
            "invoice_id": invoice_id,
            "amount_due": amount_due.to_string(),
            "due_date": due_date.format("%B %d, %Y").to_string(),
            "currency": currency,
            "currency_symbol": if currency == "USD" { "$" } else { currency },
            "invoice_url": invoice_url,
            "pay_url": format!("{}/account", self.get_app_base_url().await?),
        });

        let notification = EmailNotification {
            id: Uuid::new_v4(),
            user_id: *user_id,
            email_address: user_email.to_string(),
            notification_type: "invoice_created".to_string(),
            subject: templates.invoice_created.subject.clone(),
            template_name: templates.invoice_created.template.clone(),
            template_data,
            status: "pending".to_string(),
            attempts: 0,
            max_attempts: 3,
            last_attempt_at: None,
            sent_at: None,
            error_message: None,
            priority: 2, // Medium priority for invoices
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.email_repository.create(&notification).await?;
        info!("Queued invoice notification email for user {} (invoice: {})", user_id, invoice_id);

        Ok(())
    }

    /// Queue a payment failed notification
    pub async fn queue_payment_failed_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        invoice_id: &str,
        amount: &BigDecimal,
        currency: &str,
        retry_date: Option<&chrono::DateTime<chrono::Utc>>,
    ) -> Result<(), AppError> {
        let templates = self.config_repository.get_email_templates().await?;

        let template_data = json!({
            "user_id": user_id,
            "invoice_id": invoice_id,
            "amount": amount.to_string(),
            "currency": currency,
            "currency_symbol": if currency == "USD" { "$" } else { currency },
            "retry_date": retry_date.map(|d| d.format("%B %d, %Y").to_string()),
            "update_payment_url": format!("{}/account", self.get_app_base_url().await?),
        });

        let notification = EmailNotification {
            id: Uuid::new_v4(),
            user_id: *user_id,
            email_address: user_email.to_string(),
            notification_type: "payment_failed".to_string(),
            subject: templates.payment_failed.subject.clone(),
            template_name: templates.payment_failed.template.clone(),
            template_data,
            status: "pending".to_string(),
            attempts: 0,
            max_attempts: 3,
            last_attempt_at: None,
            sent_at: None,
            error_message: None,
            priority: 1, // High priority for payment failures
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.email_repository.create(&notification).await?;
        info!("Queued payment failed notification email for user {} (invoice: {})", user_id, invoice_id);

        Ok(())
    }

    /// Process pending email notifications
    pub async fn process_pending_notifications(&self, batch_size: i32) -> Result<ProcessingStats, AppError> {
        let mut stats = ProcessingStats::default();

        // Get pending notifications
        let pending = self.email_repository.get_pending(batch_size).await?;
        stats.total_processed = pending.len() as i32;

        for notification in pending {
            match self.send_notification(&notification).await {
                Ok(_) => {
                    self.email_repository.mark_sent(&notification.id).await?;
                    stats.successful += 1;
                    debug!("Successfully sent notification {}", notification.id);
                }
                Err(e) => {
                    let error_msg = format!("Failed to send notification: {}", e);
                    self.email_repository.mark_failed(&notification.id, &error_msg).await?;
                    stats.failed += 1;
                    error!("Failed to send notification {}: {}", notification.id, error_msg);
                }
            }
        }

        // Process retryable notifications
        let retryable = self.email_repository.get_retryable(batch_size / 2).await?;
        
        for notification in retryable {
            self.email_repository.mark_processing(&notification.id).await?;
            
            match self.send_notification(&notification).await {
                Ok(_) => {
                    self.email_repository.mark_sent(&notification.id).await?;
                    stats.successful += 1;
                    stats.retries_successful += 1;
                    debug!("Successfully sent retry notification {}", notification.id);
                }
                Err(e) => {
                    let error_msg = format!("Retry failed: {}", e);
                    self.email_repository.mark_failed(&notification.id, &error_msg).await?;
                    stats.failed += 1;
                    stats.retries_failed += 1;
                    error!("Retry failed for notification {}: {}", notification.id, error_msg);
                }
            }
        }

        if stats.total_processed > 0 {
            info!(
                "Email processing complete: {} total, {} successful, {} failed, {} retry successes, {} retry failures",
                stats.total_processed, stats.successful, stats.failed, stats.retries_successful, stats.retries_failed
            );
        }

        Ok(stats)
    }

    /// Send individual notification (this would integrate with actual email service)
    async fn send_notification(&self, notification: &EmailNotification) -> Result<(), AppError> {
        // In a real implementation, this would integrate with:
        // - AWS SES
        // - SendGrid 
        // - Mailgun
        // - SMTP server
        // etc.

        debug!("Sending email notification: {}", notification.id);
        debug!("To: {}", notification.email_address);
        debug!("Subject: {}", notification.subject);
        debug!("Template: {}", notification.template_name);

        // Simulate email sending for now
        // In production, replace this with actual email service integration

        #[cfg(feature = "mock_email")]
        {
            // Mock implementation for testing
            info!("MOCK EMAIL SENT: {} to {}", notification.subject, notification.email_address);
            return Ok(());
        }

        // Example implementation with a hypothetical email service
        self.send_via_smtp(notification).await
    }

    /// Example SMTP implementation (simplified)
    async fn send_via_smtp(&self, notification: &EmailNotification) -> Result<(), AppError> {
        // This is a simplified example. In production, you would use:
        // - lettre crate for SMTP
        // - AWS SDK for SES
        // - reqwest for API-based services like SendGrid

        info!("Would send email via SMTP:");
        info!("  From: {} <{}>", self.smtp_config.from_name, self.smtp_config.from_email);
        info!("  To: {}", notification.email_address);
        info!("  Subject: {}", notification.subject);
        info!("  Template: {}", notification.template_name);
        info!("  Template Data: {}", notification.template_data);

        // For now, just log the email details
        // In production, implement actual SMTP sending here

        Ok(())
    }

    /// Get application base URL for links in emails
    async fn get_app_base_url(&self) -> Result<String, AppError> {
        let environment = std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string());
        
        let base_url = match environment.as_str() {
            "development" => "http://localhost:1420",
            "staging" => "https://staging.vibemanager.com",
            _ => "https://app.vibemanager.com",
        };

        Ok(base_url.to_string())
    }

    /// Cleanup old processed notifications
    pub async fn cleanup_old_notifications(&self, days: i32) -> Result<i64, AppError> {
        let deleted_count = self.email_repository.cleanup_old_notifications(days).await?;
        
        if deleted_count > 0 {
            info!("Cleaned up {} old email notifications", deleted_count);
        }

        Ok(deleted_count)
    }

    /// Get notification statistics
    pub async fn get_stats(&self) -> Result<crate::db::repositories::EmailNotificationStats, AppError> {
        self.email_repository.get_stats().await
    }

    /// Get access to the email repository for advanced operations
    pub fn get_email_repository(&self) -> &Arc<EmailNotificationRepository> {
        &self.email_repository
    }
}

#[derive(Debug, Default)]
pub struct ProcessingStats {
    pub total_processed: i32,
    pub successful: i32,
    pub failed: i32,
    pub retries_successful: i32,
    pub retries_failed: i32,
}