use crate::db::connection::DatabasePools;
use crate::error::AppError;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use log::{debug, error, info};
use reqwest;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug)]
pub struct EmailNotificationService {
    mailgun_config: MailgunConfig,
    http_client: reqwest::Client,
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
    pub fn new(_db_pools: DatabasePools) -> Result<Self, AppError> {
        let mailgun_config = MailgunConfig::from_env()?;
        let http_client = reqwest::Client::new();

        Ok(Self {
            mailgun_config,
            http_client,
        })
    }

    pub async fn send_credit_purchase_notification(
        &self,
        user_id: &Uuid,
        user_email: &str,
        amount: &BigDecimal,
        currency: &str,
    ) -> Result<(), AppError> {
        let subject = "Credits Successfully Added to Your Account".to_string();

        // Format the amount to 2 decimal places
        let formatted_amount = format!("{:.2}", amount);

        let html_content = format!(
            r#"
            <html>
            <body>
                <h2>Credits Added Successfully!</h2>
                <p>Hi there,</p>
                <p>We've successfully added <strong>{} {}</strong> to your account.</p>
                <p>You can now use these credits for AI services.</p>
                <p>Thank you for using PlanToCode!</p>
            </body>
            </html>
            "#,
            formatted_amount, currency
        );

        self.send_via_mailgun_direct(&subject, &html_content, user_email)
            .await
    }

    async fn send_via_mailgun_direct(
        &self,
        subject: &str,
        html_content: &str,
        email_address: &str,
    ) -> Result<(), AppError> {
        debug!("Sending email via Mailgun API:");
        debug!(
            "  From: {} <{}>",
            self.mailgun_config.from_name, self.mailgun_config.from_email
        );
        debug!("  To: {}", email_address);
        debug!("  Subject: {}", subject);

        let base_url = self
            .mailgun_config
            .base_url
            .as_deref()
            .unwrap_or("https://api.mailgun.net");
        let url = format!("{}/v3/{}/messages", base_url, self.mailgun_config.domain);

        let from_email = format!(
            "{} <{}>",
            self.mailgun_config.from_name, self.mailgun_config.from_email
        );

        let mut form = HashMap::new();
        form.insert("from", from_email.as_str());
        form.insert("to", email_address);
        form.insert("subject", subject);
        form.insert("html", html_content);

        match self
            .http_client
            .post(&url)
            .basic_auth("api", Some(&self.mailgun_config.api_key))
            .form(&form)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    let response_text = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "no response body".to_string());
                    info!(
                        "Email sent successfully via Mailgun to {}: {}",
                        email_address, response_text
                    );
                    Ok(())
                } else {
                    let error_text = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "no error details".to_string());
                    error!("Mailgun API error ({}): {}", status, error_text);
                    Err(AppError::External(format!(
                        "Mailgun API error: {} - {}",
                        status, error_text
                    )))
                }
            }
            Err(e) => {
                error!("Failed to send email via Mailgun: {}", e);
                Err(AppError::External(format!("Mailgun request error: {}", e)))
            }
        }
    }
}
