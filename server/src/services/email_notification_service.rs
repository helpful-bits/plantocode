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
use mailgun_v3::{Credentials, EmailAddress};
use mailgun_v3::email::{Message, MessageBody, send_email};

#[derive(Debug)]
pub struct EmailNotificationService {
    email_repository: Arc<EmailNotificationRepository>,
    config_repository: Arc<BillingConfigurationRepository>,
    mailgun_config: MailgunConfig,
    mailgun_credentials: Credentials,
}

#[derive(Debug, Clone)]
pub struct MailgunConfig {
    pub api_key: String,
    pub domain: String,
    pub from_email: String,
    pub from_name: String,
    pub base_url: Option<String>,
}

impl MailgunConfig {
    pub fn from_env() -> Result<Self, AppError> {
        Ok(Self {
            api_key: std::env::var("MAILGUN_API_KEY")
                .map_err(|_| AppError::Configuration("MAILGUN_API_KEY not set".to_string()))?,
            domain: std::env::var("MAILGUN_DOMAIN")
                .map_err(|_| AppError::Configuration("MAILGUN_DOMAIN not set".to_string()))?,
            from_email: std::env::var("FROM_EMAIL")
                .map_err(|_| AppError::Configuration("FROM_EMAIL not set".to_string()))?,
            from_name: std::env::var("FROM_NAME")
                .map_err(|_| AppError::Configuration("FROM_NAME not set".to_string()))?,
            base_url: std::env::var("MAILGUN_BASE_URL").ok(),
        })
    }
}

impl EmailNotificationService {
    pub fn new(db_pool: PgPool) -> Result<Self, AppError> {
        let email_repository = Arc::new(EmailNotificationRepository::new(db_pool.clone()));
        let config_repository = Arc::new(BillingConfigurationRepository::new(db_pool));
        let mailgun_config = MailgunConfig::from_env()?;
        
        // Initialize Mailgun credentials
        let mailgun_credentials = Credentials::new(&mailgun_config.api_key, &mailgun_config.domain);

        Ok(Self {
            email_repository,
            config_repository,
            mailgun_config,
            mailgun_credentials,
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

        // Send email via Mailgun API
        self.send_via_mailgun(notification).await
    }

    /// Send email via Mailgun API
    async fn send_via_mailgun(&self, notification: &EmailNotification) -> Result<(), AppError> {
        debug!("Sending email via Mailgun API:");
        debug!("  From: {} <{}>", self.mailgun_config.from_name, self.mailgun_config.from_email);
        debug!("  To: {}", notification.email_address);
        debug!("  Subject: {}", notification.subject);
        debug!("  Template: {}", notification.template_name);

        // Render email content from template data
        let html_content = self.render_email_template(
            &notification.template_name, 
            &notification.template_data
        ).await?;

        // Create email addresses
        let from_address = EmailAddress::name_address(&self.mailgun_config.from_name, &self.mailgun_config.from_email);
        let to_address = EmailAddress::address(&notification.email_address);

        // Build Mailgun message
        let message = Message {
            to: vec![to_address],
            subject: notification.subject.clone(),
            body: MessageBody::Html(html_content),
            ..Default::default()
        };

        // Send email via Mailgun (non-async function)
        match send_email(&self.mailgun_credentials, &from_address, message) {
            Ok(response) => {
                info!("Email sent successfully via Mailgun: {} (ID: {})", 
                      notification.email_address, 
                      response.id);
                Ok(())
            }
            Err(e) => {
                error!("Failed to send email via Mailgun: {}", e);
                Err(AppError::External(format!("Mailgun error: {}", e)))
            }
        }
    }

    /// Render email template with data
    async fn render_email_template(&self, template_name: &str, template_data: &JsonValue) -> Result<String, AppError> {
        // For now, create a simple HTML template
        // In production, you would use a proper template engine like Tera or Handlebars
        let html = match template_name {
            "spending_alert_75" => self.create_spending_alert_html(template_data, "75% Spending Alert"),
            "spending_alert_90" => self.create_spending_alert_html(template_data, "90% Spending Alert"),
            "spending_limit_reached" => self.create_spending_alert_html(template_data, "Spending Limit Reached"),
            "services_blocked" => self.create_spending_alert_html(template_data, "Services Blocked"),
            "invoice_created" => self.create_invoice_html(template_data),
            "payment_failed" => self.create_payment_failed_html(template_data),
            "credit_purchase_success" => self.create_credit_purchase_html(template_data),
            _ => return Err(AppError::InvalidArgument(format!("Unknown template: {}", template_name))),
        };

        Ok(html)
    }

    fn create_spending_alert_html(&self, data: &JsonValue, alert_title: &str) -> String {
        let current_spending = data.get("current_spending").and_then(|v| v.as_str()).unwrap_or("0");
        let threshold_amount = data.get("threshold_amount").and_then(|v| v.as_str()).unwrap_or("0");
        let usage_percentage = data.get("usage_percentage").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let currency_symbol = data.get("currency_symbol").and_then(|v| v.as_str()).unwrap_or("$");
        let dashboard_url = data.get("dashboard_url").and_then(|v| v.as_str()).unwrap_or("#");

        format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .alert {{ background: #f8f9fa; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; }}
        .btn {{ background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }}
        .stats {{ background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{}</h1>
        <div class="alert">
            <p>Your current spending has reached <strong>{:.1}%</strong> of your threshold.</p>
        </div>
        <div class="stats">
            <p><strong>Current Spending:</strong> {}{}</p>
            <p><strong>Threshold Amount:</strong> {}{}</p>
            <p><strong>Usage Percentage:</strong> {:.1}%</p>
        </div>
        <p>You can view your detailed usage and billing information in your dashboard.</p>
        <a href="{}" class="btn">View Dashboard</a>
        <p><small>This is an automated notification from Vibe Manager.</small></p>
    </div>
</body>
</html>
        "#, alert_title, alert_title, usage_percentage, currency_symbol, current_spending, 
           currency_symbol, threshold_amount, usage_percentage, dashboard_url)
    }

    fn create_invoice_html(&self, data: &JsonValue) -> String {
        let invoice_id = data.get("invoice_id").and_then(|v| v.as_str()).unwrap_or("unknown");
        let amount_due = data.get("amount_due").and_then(|v| v.as_str()).unwrap_or("0");
        let due_date = data.get("due_date").and_then(|v| v.as_str()).unwrap_or("unknown");
        let currency_symbol = data.get("currency_symbol").and_then(|v| v.as_str()).unwrap_or("$");
        let pay_url = data.get("pay_url").and_then(|v| v.as_str()).unwrap_or("#");

        format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice Created</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .invoice-info {{ background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }}
        .btn {{ background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>New Invoice Created</h1>
        <p>A new invoice has been generated for your account.</p>
        <div class="invoice-info">
            <p><strong>Invoice ID:</strong> {}</p>
            <p><strong>Amount Due:</strong> {}{}</p>
            <p><strong>Due Date:</strong> {}</p>
        </div>
        <p>Please review and pay your invoice to continue using our services.</p>
        <a href="{}" class="btn">Pay Invoice</a>
        <p><small>This is an automated notification from Vibe Manager.</small></p>
    </div>
</body>
</html>
        "#, invoice_id, currency_symbol, amount_due, due_date, pay_url)
    }

    fn create_payment_failed_html(&self, data: &JsonValue) -> String {
        let invoice_id = data.get("invoice_id").and_then(|v| v.as_str()).unwrap_or("unknown");
        let amount = data.get("amount").and_then(|v| v.as_str()).unwrap_or("0");
        let currency_symbol = data.get("currency_symbol").and_then(|v| v.as_str()).unwrap_or("$");
        let update_payment_url = data.get("update_payment_url").and_then(|v| v.as_str()).unwrap_or("#");

        format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Failed</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .alert {{ background: #f8f9fa; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; }}
        .btn {{ background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }}
        .payment-info {{ background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Payment Failed</h1>
        <div class="alert">
            <p>We were unable to process your payment. Please update your payment method.</p>
        </div>
        <div class="payment-info">
            <p><strong>Invoice ID:</strong> {}</p>
            <p><strong>Amount:</strong> {}{}</p>
        </div>
        <p>To avoid service interruption, please update your payment method as soon as possible.</p>
        <a href="{}" class="btn">Update Payment Method</a>
        <p><small>This is an automated notification from Vibe Manager.</small></p>
    </div>
</body>
</html>
        "#, invoice_id, currency_symbol, amount, update_payment_url)
    }

    fn create_credit_purchase_html(&self, data: &JsonValue) -> String {
        let credit_amount = data.get("credit_amount").and_then(|v| v.as_str()).unwrap_or("0");
        let currency_symbol = data.get("currency_symbol").and_then(|v| v.as_str()).unwrap_or("$");
        let account_url = data.get("account_url").and_then(|v| v.as_str()).unwrap_or("#");
        let support_url = data.get("support_url").and_then(|v| v.as_str()).unwrap_or("#");

        format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Credits Added to Your Account</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .success {{ background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .btn {{ background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }}
        .credit-info {{ background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; text-align: center; }}
        .credit-amount {{ font-size: 24px; font-weight: bold; color: #28a745; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Credits Successfully Added!</h1>
        <div class="success">
            <p>Great news! Your credit purchase has been processed successfully.</p>
        </div>
        <div class="credit-info">
            <p>Credits Added to Your Account:</p>
            <div class="credit-amount">{}{}</div>
        </div>
        <p>Your credits are now available and ready to use for AI services. You can view your current balance and usage in your account dashboard.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{}" class="btn">View Account Dashboard</a>
            <a href="{}" class="btn" style="background: #6c757d;">Contact Support</a>
        </div>
        <p><strong>Thank you for your purchase!</strong></p>
        <p><small>This is an automated notification from Vibe Manager. If you have any questions, please contact our support team.</small></p>
    </div>
</body>
</html>
        "#, currency_symbol, credit_amount, account_url, support_url)
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

    /// Queue credit purchase success notification
    pub async fn queue_credit_purchase_notification(
        &self,
        user_id: &Uuid,
        email_address: &str,
        credit_amount: &BigDecimal,
        currency: &str,
    ) -> Result<(), AppError> {
        debug!("Queuing credit purchase notification for user: {} - {} {}", user_id, credit_amount, currency);

        let templates = self.config_repository.get_email_templates().await?;
        let app_base_url = self.get_app_base_url().await?;
        
        let template_data = json!({
            "user_id": user_id,
            "credit_amount": credit_amount.to_string(),
            "currency": currency,
            "currency_symbol": if currency == "USD" { "$" } else { currency },
            "account_url": format!("{}/account", app_base_url),
            "support_url": format!("{}/support", app_base_url)
        });

        let notification = EmailNotification {
            id: Uuid::new_v4(),
            user_id: *user_id,
            email_address: email_address.to_string(),
            notification_type: "credit_purchase_success".to_string(),
            subject: templates.credit_purchase_success.subject.clone(),
            template_name: templates.credit_purchase_success.template.clone(),
            template_data,
            status: "pending".to_string(),
            attempts: 0,
            max_attempts: 3,
            last_attempt_at: None,
            sent_at: None,
            error_message: None,
            priority: 2, // Medium priority
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.email_repository.create(&notification).await?;
        info!("Credit purchase notification queued for user: {}", user_id);

        Ok(())
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