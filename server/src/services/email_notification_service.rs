use crate::error::AppError;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde_json::{json, Value as JsonValue};
use log::{debug, error, info, warn};
use sqlx::PgPool;
use crate::db::connection::DatabasePools;
use bigdecimal::BigDecimal;
use mailgun_v3::{Credentials, EmailAddress};
use mailgun_v3::email::{Message, MessageBody, send_email};

#[derive(Debug)]
pub struct EmailNotificationService {
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
    pub fn new(db_pools: DatabasePools) -> Result<Self, AppError> {
        let mailgun_config = MailgunConfig::from_env()?;
        
        // Initialize Mailgun credentials
        let mailgun_credentials = Credentials::new(&mailgun_config.api_key, &mailgun_config.domain);

        Ok(Self {
            mailgun_config,
            mailgun_credentials,
        })
    }

    /// Send a spending alert email notification directly
    pub async fn send_spending_alert(
        &self,
        user_id: &Uuid,
        user_email: &str,
        alert_type: &str,
        current_spending: &BigDecimal,
        threshold_amount: &BigDecimal,
        usage_percentage: f64,
        currency: &str,
    ) -> Result<(), AppError> {
        let (subject, template_name) = match alert_type {
            "75_percent" => (
                "75% of your monthly AI allowance used".to_string(),
                "spending_alert_75".to_string(),
            ),
            "90_percent" => (
                "90% of your monthly AI allowance used".to_string(),
                "spending_alert_90".to_string(),
            ),
            "limit_reached" => (
                "Monthly spending allowance reached".to_string(),
                "spending_limit_reached".to_string(),
            ),
            "services_blocked" => (
                "AI services blocked - spending limit exceeded".to_string(),
                "services_blocked".to_string(),
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

        self.send_email_directly(&subject, &template_name, &template_data, user_email).await?;
        info!("Sent spending alert email {} for user {}", alert_type, user_id);

        Ok(())
    }

    /// Send an invoice notification directly
    pub async fn send_invoice_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        invoice_id: &str,
        amount_due: &BigDecimal,
        due_date: &chrono::DateTime<chrono::Utc>,
        currency: &str,
        invoice_url: Option<&str>,
    ) -> Result<(), AppError> {
        // Use hardcoded template instead of database lookup

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

        let subject = "New Invoice Created".to_string();
        let template_name = "invoice_created".to_string();

        self.send_email_directly(&subject, &template_name, &template_data, user_email).await?;
        info!("Sent invoice notification email for user {} (invoice: {})", user_id, invoice_id);

        Ok(())
    }

    /// Send a payment failed notification directly
    pub async fn send_payment_failed_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        invoice_id: &str,
        amount: &BigDecimal,
        currency: &str,
        retry_date: Option<&chrono::DateTime<chrono::Utc>>,
    ) -> Result<(), AppError> {
        let subject = "Payment Failed - Action Required".to_string();
        let template_name = "payment_failed".to_string();

        let template_data = json!({
            "user_id": user_id,
            "invoice_id": invoice_id,
            "amount": amount.to_string(),
            "currency": currency,
            "currency_symbol": if currency == "USD" { "$" } else { currency },
            "retry_date": retry_date.map(|d| d.format("%B %d, %Y").to_string()),
            "update_payment_url": format!("{}/account", self.get_app_base_url().await?),
        });

        self.send_email_directly(&subject, &template_name, &template_data, user_email).await?;
        info!("Sent payment failed notification email for user {} (invoice: {})", user_id, invoice_id);

        Ok(())
    }

    /// Send a plan change failed notification directly (for failed proration charges)
    pub async fn send_plan_change_failed_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        invoice_id: &str,
        amount: &BigDecimal,
        currency: &str,
    ) -> Result<(), AppError> {
        let subject = "Plan Change Failed - Payment Issue".to_string();
        let template_name = "plan_change_failed".to_string();

        let template_data = json!({
            "user_id": user_id,
            "invoice_id": invoice_id,
            "amount": amount.to_string(),
            "currency": currency,
            "currency_symbol": if currency == "USD" { "$" } else { currency },
            "billing_portal_url": format!("{}/account", self.get_app_base_url().await?),
            "support_url": format!("{}/support", self.get_app_base_url().await?),
        });

        self.send_email_directly(&subject, &template_name, &template_data, user_email).await?;
        info!("Sent plan change failed notification email for user {} (invoice: {})", user_id, invoice_id);

        Ok(())
    }

    /// Send email directly without database queuing
    async fn send_email_directly(
        &self,
        subject: &str,
        template_name: &str,
        template_data: &JsonValue,
        email_address: &str,
    ) -> Result<(), AppError> {
        debug!("Sending email directly to {}: {}", email_address, subject);
        
        // Render email content from template data
        let html_content = self.render_email_template(template_name, template_data).await?;
        
        // Send via Mailgun
        self.send_via_mailgun_direct(subject, &html_content, email_address).await
    }

    /// Send email via Mailgun API (direct version)
    async fn send_via_mailgun_direct(
        &self, 
        subject: &str, 
        html_content: &str, 
        email_address: &str
    ) -> Result<(), AppError> {
        debug!("Sending email via Mailgun API:");
        debug!("  From: {} <{}>", self.mailgun_config.from_name, self.mailgun_config.from_email);
        debug!("  To: {}", email_address);
        debug!("  Subject: {}", subject);

        // Create email addresses
        let from_address = EmailAddress::name_address(&self.mailgun_config.from_name, &self.mailgun_config.from_email);
        let to_address = EmailAddress::address(email_address);

        // Build Mailgun message
        let message = Message {
            to: vec![to_address],
            subject: subject.to_string(),
            body: MessageBody::Html(html_content.to_string()),
            ..Default::default()
        };

        // Send email via Mailgun (non-async function)
        match send_email(&self.mailgun_credentials, &from_address, message) {
            Ok(response) => {
                info!("Email sent successfully via Mailgun: {} (ID: {})", 
                      email_address, 
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
            "plan_change" => self.create_plan_change_html(template_data),
            "subscription_cancel_at_period_end" => self.create_subscription_cancellation_html(template_data, true),
            "subscription_canceled_immediately" => self.create_subscription_cancellation_html(template_data, false),
            "subscription_reactivated" => self.create_subscription_reactivation_html(template_data),
            "subscription_resumed" => self.create_subscription_resumed_html(template_data),
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

    fn create_plan_change_html(&self, data: &JsonValue) -> String {
        let old_plan_id = data.get("old_plan_id").and_then(|v| v.as_str()).unwrap_or("previous plan");
        let new_plan_name = data.get("new_plan_name").and_then(|v| v.as_str()).unwrap_or("new plan");
        let changed_at = data.get("changed_at").and_then(|v| v.as_str()).unwrap_or("recently");
        let account_url = data.get("account_url").and_then(|v| v.as_str()).unwrap_or("#");

        format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Plan Updated</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .success {{ background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .btn {{ background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }}
        .plan-info {{ background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }}
        .highlight {{ color: #28a745; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Your Subscription Plan Has Been Updated</h1>
        <div class="success">
            <p>Great news! Your subscription plan has been successfully updated.</p>
        </div>
        <div class="plan-info">
            <p><strong>Previous Plan:</strong> {}</p>
            <p><strong>New Plan:</strong> <span class="highlight">{}</span></p>
            <p><strong>Changed:</strong> {}</p>
        </div>
        <p>Your new plan features are now active and ready to use. You can view your current subscription details and usage in your account dashboard.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{}" class="btn">View Account Dashboard</a>
        </div>
        <p><strong>Thank you for your continued trust in Vibe Manager!</strong></p>
        <p><small>This is an automated notification from Vibe Manager. If you have any questions about your subscription, please contact our support team.</small></p>
    </div>
</body>
</html>
        "#, old_plan_id, new_plan_name, changed_at, account_url)
    }

    fn create_subscription_cancellation_html(&self, data: &JsonValue, at_period_end: bool) -> String {
        let canceled_at = data.get("canceled_at").and_then(|v| v.as_str()).unwrap_or("recently");
        let period_ends_at = data.get("period_ends_at").and_then(|v| v.as_str()).unwrap_or("the end of your current billing period");
        let account_url = data.get("account_url").and_then(|v| v.as_str()).unwrap_or("#");
        let reactivate_url = data.get("reactivate_url").and_then(|v| v.as_str()).unwrap_or("#");
        let cancellation_reason = data.get("cancellation_reason").and_then(|v| v.as_str());

        let (title, main_message, status_color) = if at_period_end {
            (
                "Subscription Cancellation Scheduled",
                format!("Your subscription will be canceled on <strong>{}</strong>. You'll continue to have access to all features until then.", period_ends_at),
                "#ffc107" // Warning yellow
            )
        } else {
            (
                "Subscription Canceled",
                "Your subscription has been canceled immediately. Your access to premium features has ended.".to_string(),
                "#dc3545" // Danger red
            )
        };

        let reason_section = if let Some(reason) = cancellation_reason {
            format!("<p><strong>Reason:</strong> {}</p>", reason)
        } else {
            String::new()
        };

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
        .alert {{ background: #f8f9fa; border-left: 4px solid {}; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .btn {{ background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }}
        .btn-secondary {{ background: #6c757d; }}
        .cancellation-info {{ background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{}</h1>
        <div class="alert">
            <p>{}</p>
        </div>
        <div class="cancellation-info">
            <p><strong>Canceled:</strong> {}</p>
            {}
        </div>
        <p>We're sorry to see you go! If you change your mind, you can reactivate your subscription at any time.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{}" class="btn">View Account Dashboard</a>
            <a href="{}" class="btn btn-secondary">Reactivate Subscription</a>
        </div>
        <p>If you have any feedback about your experience or need assistance, please don't hesitate to reach out to our support team.</p>
        <p><small>This is an automated notification from Vibe Manager.</small></p>
    </div>
</body>
</html>
        "#, title, status_color, title, main_message, canceled_at, reason_section, account_url, reactivate_url)
    }

    fn create_subscription_reactivation_html(&self, data: &JsonValue) -> String {
        let plan_name = data.get("plan_name").and_then(|v| v.as_str()).unwrap_or("subscription plan");
        let reactivated_at = data.get("reactivated_at").and_then(|v| v.as_str()).unwrap_or("recently");
        let account_url = data.get("account_url").and_then(|v| v.as_str()).unwrap_or("#");

        format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome Back! Your Subscription is Active</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .success {{ background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .btn {{ background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }}
        .reactivation-info {{ background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }}
        .highlight {{ color: #28a745; font-weight: bold; }}
        .welcome {{ text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 10px; margin: 20px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="welcome">
            <h1 style="margin: 0; color: white;">🎉 Welcome Back!</h1>
            <p style="margin: 10px 0 0 0; color: white;">Your subscription has been successfully reactivated</p>
        </div>
        <div class="success">
            <p>Great news! Your subscription is now active and all premium features are available to you again.</p>
        </div>
        <div class="reactivation-info">
            <p><strong>Plan:</strong> <span class="highlight">{}</span></p>
            <p><strong>Reactivated:</strong> {}</p>
            <p><strong>Status:</strong> <span class="highlight">Active</span></p>
        </div>
        <p>You now have full access to:</p>
        <ul>
            <li>All AI services and models</li>
            <li>Unlimited voice transcription</li>
            <li>Advanced project management features</li>
            <li>Priority customer support</li>
        </ul>
        <p>We're excited to have you back! If you have any questions or need assistance getting started again, our support team is here to help.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{}" class="btn">Go to Dashboard</a>
        </div>
        <p><strong>Thank you for choosing Vibe Manager!</strong></p>
        <p><small>This is an automated notification from Vibe Manager. If you have any questions, please contact our support team.</small></p>
    </div>
</body>
</html>
        "#, plan_name, reactivated_at, account_url)
    }

    fn create_subscription_resumed_html(&self, data: &JsonValue) -> String {
        let resumed_at = data.get("resumed_at").and_then(|v| v.as_str()).unwrap_or("recently");
        let period_ends_at = data.get("period_ends_at").and_then(|v| v.as_str()).unwrap_or("your current billing period end");
        let account_url = data.get("account_url").and_then(|v| v.as_str()).unwrap_or("#");

        format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Subscription Cancellation Has Been Undone</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .success {{ background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .btn {{ background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }}
        .resume-info {{ background: #e9ecef; padding: 15px; border-radius: 5px; margin: 15px 0; }}
        .highlight {{ color: #28a745; font-weight: bold; }}
        .header {{ text-align: center; padding: 20px; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; border-radius: 10px; margin: 20px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; color: white;">✅ Great News!</h1>
            <p style="margin: 10px 0 0 0; color: white;">Your subscription cancellation has been undone</p>
        </div>
        <div class="success">
            <p>Your subscription will continue uninterrupted! The scheduled cancellation has been removed from your account.</p>
        </div>
        <div class="resume-info">
            <p><strong>Resumed:</strong> {}</p>
            <p><strong>Status:</strong> <span class="highlight">Active (Cancellation Removed)</span></p>
            <p><strong>Next Billing:</strong> {}</p>
        </div>
        <p>Your subscription will continue as normal, and you'll maintain access to all premium features. You'll be billed at your next billing cycle as scheduled.</p>
        <p>Key benefits you'll continue to enjoy:</p>
        <ul>
            <li>Uninterrupted access to all AI services</li>
            <li>Full voice transcription capabilities</li>
            <li>Complete project management suite</li>
            <li>Priority customer support</li>
        </ul>
        <p>Thank you for staying with us! If you have any questions or concerns, our support team is always here to help.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{}" class="btn">View Account Dashboard</a>
        </div>
        <p><strong>Thank you for continuing with Vibe Manager!</strong></p>
        <p><small>This is an automated notification from Vibe Manager. If you have any questions, please contact our support team.</small></p>
    </div>
</body>
</html>
        "#, resumed_at, period_ends_at, account_url)
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

    /// Log email statistics (replaced database cleanup)
    pub async fn log_email_stats(&self) -> Result<(), AppError> {
        info!("Email service running in direct mode - no database queuing");
        Ok(())
    }

    /// Send credit purchase success notification
    pub async fn send_credit_purchase_notification(
        &self,
        user_id: &Uuid,
        email_address: &str,
        credit_amount: &BigDecimal,
        currency: &str,
    ) -> Result<(), AppError> {
        debug!("Sending credit purchase notification for user: {} - {} {}", user_id, credit_amount, currency);

        let app_base_url = self.get_app_base_url().await?;
        
        let template_data = json!({
            "user_id": user_id,
            "credit_amount": credit_amount.to_string(),
            "currency": currency,
            "currency_symbol": if currency == "USD" { "$" } else { currency },
            "account_url": format!("{}/account", app_base_url),
            "support_url": format!("{}/support", app_base_url)
        });

        let subject = "Credits Successfully Added to Your Account".to_string();
        let template_name = "credit_purchase_success".to_string();

        self.send_email_directly(&subject, &template_name, &template_data, email_address).await?;
        info!("Credit purchase notification sent for user: {}", user_id);

        Ok(())
    }

    /// Send a plan change notification
    pub async fn send_plan_change_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        old_plan_id: &str,
        new_plan_id: &str,
        new_plan_name: &str,
    ) -> Result<(), AppError> {
        let app_base_url = self.get_app_base_url().await?;
        
        let template_data = json!({
            "user_id": user_id,
            "old_plan_id": old_plan_id,
            "new_plan_id": new_plan_id,
            "new_plan_name": new_plan_name,
            "account_url": format!("{}/account", app_base_url),
            "billing_url": format!("{}/account", app_base_url),
            "changed_at": Utc::now().format("%B %d, %Y at %I:%M %p UTC").to_string()
        });

        let subject = format!("Your subscription plan has been updated to {}", new_plan_name);
        let template_name = "plan_change".to_string();

        self.send_email_directly(&subject, &template_name, &template_data, user_email).await?;
        info!("Sent plan change notification for user: {} (from {} to {})", user_id, old_plan_id, new_plan_id);

        Ok(())
    }

    /// Send a subscription cancellation notification
    pub async fn send_subscription_cancellation_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        at_period_end: bool,
        period_ends_at: Option<&DateTime<Utc>>,
        cancellation_reason: Option<&str>,
    ) -> Result<(), AppError> {
        // Use hardcoded templates
        let app_base_url = self.get_app_base_url().await?;
        
        let (subject, template_name) = if at_period_end {
            (
                "Your subscription will cancel at the end of the current billing period".to_string(),
                "subscription_cancel_at_period_end".to_string()
            )
        } else {
            (
                "Your subscription has been canceled".to_string(),
                "subscription_canceled_immediately".to_string()
            )
        };

        let template_data = json!({
            "user_id": user_id,
            "at_period_end": at_period_end,
            "period_ends_at": period_ends_at.map(|dt| dt.format("%B %d, %Y at %I:%M %p UTC").to_string()),
            "cancellation_reason": cancellation_reason,
            "account_url": format!("{}/account", app_base_url),
            "reactivate_url": format!("{}/account", app_base_url),
            "canceled_at": Utc::now().format("%B %d, %Y at %I:%M %p UTC").to_string()
        });


        self.send_email_directly(&subject, &template_name, &template_data, user_email).await?;
        info!("Sent subscription cancellation notification for user: {} (at_period_end: {})", user_id, at_period_end);

        Ok(())
    }

    /// Send a subscription reactivation notification
    pub async fn send_reactivation_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        plan_name: &str,
    ) -> Result<(), AppError> {
        // Use hardcoded templates
        let app_base_url = self.get_app_base_url().await?;
        
        let template_data = json!({
            "user_id": user_id,
            "plan_name": plan_name,
            "account_url": format!("{}/account", app_base_url),
            "billing_url": format!("{}/account", app_base_url),
            "reactivated_at": Utc::now().format("%B %d, %Y at %I:%M %p UTC").to_string()
        });

        let subject = format!("Your subscription has been reactivated - Welcome back!");
        let template_name = "subscription_reactivated".to_string();

        self.send_email_directly(&subject, &template_name, &template_data, user_email).await?;
        info!("Sent subscription reactivation notification for user: {} (plan: {})", user_id, plan_name);

        Ok(())
    }

    /// Send a subscription resumed notification (for when cancellation is undone)
    pub async fn send_subscription_resumed_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        period_ends_at: Option<&DateTime<Utc>>,
    ) -> Result<(), AppError> {
        // Use hardcoded templates
        let app_base_url = self.get_app_base_url().await?;
        
        let template_data = json!({
            "user_id": user_id,
            "period_ends_at": period_ends_at.map(|dt| dt.format("%B %d, %Y at %I:%M %p UTC").to_string()),
            "account_url": format!("{}/account", app_base_url),
            "billing_url": format!("{}/account", app_base_url),
            "resumed_at": Utc::now().format("%B %d, %Y at %I:%M %p UTC").to_string()
        });

        let subject = "Your subscription cancellation has been undone".to_string();
        let template_name = "subscription_resumed".to_string();

        self.send_email_directly(&subject, &template_name, &template_data, user_email).await?;
        info!("Sent subscription resumed notification for user: {}", user_id);

        Ok(())
    }

}