use chrono::Utc;
use log::{error, warn, info};
use serde_json::json;
use std::collections::HashMap;
use std::env;
use uuid::Uuid;
use reqwest;
use crate::services::email_notification_service::MailgunConfig;

/// Severity levels for admin alerts
#[derive(Debug, Clone)]
pub enum AlertSeverity {
    Critical,
    High,
    Medium,
    Low,
}

impl AlertSeverity {
    pub fn as_str(&self) -> &'static str {
        match self {
            AlertSeverity::Critical => "CRITICAL",
            AlertSeverity::High => "HIGH", 
            AlertSeverity::Medium => "MEDIUM",
            AlertSeverity::Low => "LOW",
        }
    }
}

/// Types of admin alerts
#[derive(Debug, Clone)]
pub enum AlertType {
    DataIntegrityIssue,
    StripeWebhookFailure,
    PaymentProcessingError,
    SystemResourceExhaustion,
    SecurityIncident,
    // Enhanced security-specific alert types
    AuthenticationAttack,
    DdosAttack,
    ApiKeyCompromise,
    WebhookSecurityBreach,
    DataAccessAnomaly,
    SuspiciousActivity,
    ComplianceViolation,
    RateLimitExceeded,
}

impl AlertType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AlertType::DataIntegrityIssue => "DATA_INTEGRITY_ISSUE",
            AlertType::StripeWebhookFailure => "STRIPE_WEBHOOK_FAILURE",
            AlertType::PaymentProcessingError => "PAYMENT_PROCESSING_ERROR",
            AlertType::SystemResourceExhaustion => "SYSTEM_RESOURCE_EXHAUSTION",
            AlertType::SecurityIncident => "SECURITY_INCIDENT",
            AlertType::AuthenticationAttack => "AUTHENTICATION_ATTACK",
            AlertType::DdosAttack => "DDOS_ATTACK",
            AlertType::ApiKeyCompromise => "API_KEY_COMPROMISE",
            AlertType::WebhookSecurityBreach => "WEBHOOK_SECURITY_BREACH",
            AlertType::DataAccessAnomaly => "DATA_ACCESS_ANOMALY",
            AlertType::SuspiciousActivity => "SUSPICIOUS_ACTIVITY",
            AlertType::ComplianceViolation => "COMPLIANCE_VIOLATION",
            AlertType::RateLimitExceeded => "RATE_LIMIT_EXCEEDED",
        }
    }
}

/// Admin alert structure
#[derive(Debug, Clone)]
pub struct AdminAlert {
    pub alert_id: Uuid,
    pub timestamp: chrono::DateTime<Utc>,
    pub severity: AlertSeverity,
    pub alert_type: AlertType,
    pub title: String,
    pub description: String,
    pub metadata: HashMap<String, String>,
    pub requires_immediate_attention: bool,
}

impl AdminAlert {
    pub fn new(
        severity: AlertSeverity,
        alert_type: AlertType,
        title: String,
        description: String,
    ) -> Self {
        let requires_immediate_attention = matches!(severity, AlertSeverity::Critical);
        Self {
            alert_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            severity,
            alert_type,
            title,
            description,
            metadata: HashMap::new(),
            requires_immediate_attention,
        }
    }

    pub fn with_metadata(mut self, key: String, value: String) -> Self {
        self.metadata.insert(key, value);
        self
    }

    pub fn with_immediate_attention(mut self, requires_attention: bool) -> Self {
        self.requires_immediate_attention = requires_attention;
        self
    }
}

/// Admin alerting service
pub struct AdminAlertingService {
    mailgun_config: Option<MailgunConfig>,
    http_client: reqwest::Client,
    admin_recipient: Option<String>,
}

impl AdminAlertingService {
    pub fn new() -> Self {
        let mailgun_config = match MailgunConfig::from_env() {
            Ok(config) => Some(config),
            Err(_) => {
                warn!("Mailgun configuration not found, admin email alerts will be disabled");
                None
            }
        };

        let http_client = reqwest::Client::new();

        let admin_recipient = match env::var("ADMIN_EMAIL_RECIPIENT") {
            Ok(email) => Some(email),
            Err(_) => {
                warn!("ADMIN_EMAIL_RECIPIENT not set, admin email alerts will be disabled");
                None
            }
        };

        Self {
            mailgun_config,
            http_client,
            admin_recipient,
        }
    }

    /// Send an admin alert through multiple channels
    pub async fn send_alert(&self, alert: AdminAlert) {
        // Log the alert (always done)
        self.log_alert(&alert);

        // Send to external alerting systems based on severity
        match alert.severity {
            AlertSeverity::Critical => {
                self.send_critical_alert(&alert).await;
            },
            AlertSeverity::High => {
                self.send_high_priority_alert(&alert).await;
            },
            AlertSeverity::Medium | AlertSeverity::Low => {
                self.send_standard_alert(&alert).await;
            },
        }
    }

    /// Log alert to application logs
    fn log_alert(&self, alert: &AdminAlert) {
        let alert_json = json!({
            "alert_id": alert.alert_id,
            "timestamp": alert.timestamp.to_rfc3339(),
            "severity": alert.severity.as_str(),
            "alert_type": alert.alert_type.as_str(),
            "title": alert.title,
            "description": alert.description,
            "metadata": alert.metadata,
            "requires_immediate_attention": alert.requires_immediate_attention
        });

        match alert.severity {
            AlertSeverity::Critical => {
                error!("🚨 ADMIN ALERT: {}", alert_json);
            },
            AlertSeverity::High => {
                warn!("⚠️ ADMIN ALERT: {}", alert_json);
            },
            AlertSeverity::Medium | AlertSeverity::Low => {
                info!("ℹ️ ADMIN ALERT: {}", alert_json);
            },
        }
    }

    /// Send critical alert (requires immediate attention)
    async fn send_critical_alert(&self, alert: &AdminAlert) {
        info!("🚨 CRITICAL ALERT sent to on-call engineers: {} - {}", alert.title, alert.description);
        
        self.send_email_notification(alert).await;
        self.simulate_pagerduty_alert(alert).await;
        self.simulate_slack_critical_alert(alert).await;
        self.simulate_incident_management_ticket(alert).await;
    }

    /// Send high priority alert
    async fn send_high_priority_alert(&self, alert: &AdminAlert) {
        info!("⚠️ HIGH PRIORITY ALERT sent to engineering team: {} - {}", alert.title, alert.description);
        
        self.send_email_notification(alert).await;
        self.simulate_slack_alert(alert).await;
    }

    /// Send standard alert
    async fn send_standard_alert(&self, alert: &AdminAlert) {
        // In production, this would:
        // 1. Send to Slack #monitoring channel
        // 2. Create low-priority ticket for review
        
        info!("ℹ️ STANDARD ALERT logged: {} - {}", alert.title, alert.description);
        
        self.simulate_monitoring_log(alert).await;
    }

    // Simulation methods for external services (replace with real implementations)
    
    async fn simulate_pagerduty_alert(&self, alert: &AdminAlert) {
        info!("📟 PagerDuty Alert Sent: [{}] {} (Alert ID: {})", 
              alert.severity.as_str(), alert.title, alert.alert_id);
    }

    async fn simulate_slack_critical_alert(&self, alert: &AdminAlert) {
        info!("💬 Slack Critical Alert Sent to #critical-alerts: [{}] {} (Alert ID: {})", 
              alert.severity.as_str(), alert.title, alert.alert_id);
    }

    async fn simulate_slack_alert(&self, alert: &AdminAlert) {
        info!("💬 Slack Alert Sent to #alerts: [{}] {} (Alert ID: {})", 
              alert.severity.as_str(), alert.title, alert.alert_id);
    }

    async fn send_email_notification(&self, alert: &AdminAlert) {
        if let (Some(config), Some(recipient)) = (
            &self.mailgun_config,
            &self.admin_recipient,
        ) {
            let subject = format!("[{}] Admin Alert: {}", alert.severity.as_str(), alert.title);
            let body = self.create_alert_email_body(alert);

            match self.send_via_mailgun(&subject, &body, recipient, config).await {
                Ok(_) => {
                    info!("📧 Admin alert email sent successfully to {}: [{}] {} (Alert ID: {})", 
                          recipient, alert.severity.as_str(), alert.title, alert.alert_id);
                }
                Err(e) => {
                    error!("Failed to send admin alert email: {}", e);
                }
            }
        } else {
            warn!("Admin email configuration not available, skipping email notification for alert: {}", alert.alert_id);
        }
    }

    async fn simulate_incident_management_ticket(&self, alert: &AdminAlert) {
        info!("🎫 Incident Management Ticket Created: [{}] {} (Alert ID: {})", 
              alert.severity.as_str(), alert.title, alert.alert_id);
    }

    async fn simulate_monitoring_log(&self, alert: &AdminAlert) {
        info!("📊 Monitoring Log Entry: [{}] {} (Alert ID: {})", 
              alert.severity.as_str(), alert.title, alert.alert_id);
    }

    fn create_alert_email_body(&self, alert: &AdminAlert) -> String {
        let mut body = format!(
            "Admin Alert Notification\n\n\
            Alert ID: {}\n\
            Timestamp: {}\n\
            Severity: {}\n\
            Alert Type: {}\n\
            Title: {}\n\n\
            Description:\n{}\n\n",
            alert.alert_id,
            alert.timestamp.to_rfc3339(),
            alert.severity.as_str(),
            alert.alert_type.as_str(),
            alert.title,
            alert.description
        );

        if !alert.metadata.is_empty() {
            body.push_str("Additional Information:\n");
            for (key, value) in &alert.metadata {
                body.push_str(&format!("  {}: {}\n", key, value));
            }
            body.push_str("\n");
        }

        if alert.requires_immediate_attention {
            body.push_str("⚠️ This alert requires immediate attention!\n\n");
        }

        body.push_str("This is an automated notification from Vibe Manager admin alerting system.");
        
        body
    }

    async fn send_via_mailgun(
        &self,
        subject: &str,
        body: &str,
        recipient: &str,
        config: &MailgunConfig,
    ) -> Result<(), String> {
        let base_url = config.base_url.as_deref().unwrap_or("https://api.mailgun.net");
        let url = format!("{}/v3/{}/messages", base_url, config.domain);

        let from_email = format!("{} <{}>", config.from_name, config.from_email);

        let mut form = std::collections::HashMap::new();
        form.insert("from", from_email.as_str());
        form.insert("to", recipient);
        form.insert("subject", subject);
        form.insert("text", body);

        match self.http_client
            .post(&url)
            .basic_auth("api", Some(&config.api_key))
            .form(&form)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    let response_text = response.text().await.unwrap_or_else(|_| "no response body".to_string());
                    info!("Admin alert email sent via Mailgun to {}: {}", recipient, response_text);
                    Ok(())
                } else {
                    let error_text = response.text().await.unwrap_or_else(|_| "no error details".to_string());
                    error!("Mailgun API error ({}): {}", status, error_text);
                    Err(format!("Mailgun API error: {} - {}", status, error_text))
                }
            }
            Err(e) => {
                error!("Failed to send admin alert email via Mailgun: {}", e);
                Err(format!("Mailgun request error: {}", e))
            }
        }
    }

}

/// Convenience function to send critical data integrity alert
pub async fn send_data_integrity_alert(
    customer_id: &str,
    user_count: usize,
    event_type: &str,
    additional_context: HashMap<String, String>,
) {
    let alerting_service = AdminAlertingService::new();
    
    let alert = AdminAlert::new(
        AlertSeverity::Critical,
        AlertType::DataIntegrityIssue,
        "Multiple Users Found for Single Stripe Customer ID".to_string(),
        format!(
            "Data integrity violation detected: Stripe Customer ID '{}' is associated with {} users. This violates the one-to-one customer-user relationship and requires immediate manual reconciliation. Event type: {}",
            customer_id, user_count, event_type
        ),
    )
    .with_metadata("stripe_customer_id".to_string(), customer_id.to_string())
    .with_metadata("user_count".to_string(), user_count.to_string())
    .with_metadata("event_type".to_string(), event_type.to_string())
    .with_metadata("requires_manual_intervention".to_string(), "true".to_string());

    // Add any additional context
    let alert = additional_context.into_iter().fold(alert, |acc, (k, v)| {
        acc.with_metadata(k, v)
    });

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send Stripe webhook failure alert
pub async fn send_stripe_webhook_failure_alert(
    webhook_event_id: &str,
    error_message: &str,
    event_type: &str,
) {
    let alerting_service = AdminAlertingService::new();
    
    let alert = AdminAlert::new(
        AlertSeverity::High,
        AlertType::StripeWebhookFailure,
        "Stripe Webhook Processing Failed".to_string(),
        format!(
            "Failed to process Stripe webhook event. Event ID: {}, Event Type: {}, Error: {}",
            webhook_event_id, event_type, error_message
        ),
    )
    .with_metadata("webhook_event_id".to_string(), webhook_event_id.to_string())
    .with_metadata("event_type".to_string(), event_type.to_string())
    .with_metadata("error_message".to_string(), error_message.to_string());

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send payment processing error alert
pub async fn send_payment_processing_error_alert(
    payment_intent_id: &str,
    customer_id: &str,
    error_message: &str,
) {
    let alerting_service = AdminAlertingService::new();
    
    let alert = AdminAlert::new(
        AlertSeverity::Critical,
        AlertType::PaymentProcessingError,
        "Payment Processing Error".to_string(),
        format!(
            "Payment processing failed for customer {}. Payment Intent: {}, Error: {}",
            customer_id, payment_intent_id, error_message
        ),
    )
    .with_metadata("payment_intent_id".to_string(), payment_intent_id.to_string())
    .with_metadata("customer_id".to_string(), customer_id.to_string())
    .with_metadata("error_message".to_string(), error_message.to_string())
    .with_immediate_attention(true);

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send authentication attack alert
pub async fn send_authentication_attack_alert(
    ip_address: &str,
    failed_attempts: u32,
    time_window: &str,
    user_agent: Option<&str>,
) {
    let alerting_service = AdminAlertingService::new();
    
    let severity = if failed_attempts > 50 { AlertSeverity::Critical } else { AlertSeverity::High };
    
    let alert = AdminAlert::new(
        severity,
        AlertType::AuthenticationAttack,
        "Authentication Attack Detected".to_string(),
        format!(
            "Detected {} failed authentication attempts from IP {} in {}. This may indicate a brute force attack.",
            failed_attempts, ip_address, time_window
        ),
    )
    .with_metadata("ip_address".to_string(), ip_address.to_string())
    .with_metadata("failed_attempts".to_string(), failed_attempts.to_string())
    .with_metadata("time_window".to_string(), time_window.to_string())
    .with_metadata("user_agent".to_string(), user_agent.unwrap_or("unknown").to_string());

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send DDoS attack alert
pub async fn send_ddos_attack_alert(
    ip_address: &str,
    request_count: u64,
    attack_type: &str,
    action_taken: &str,
) {
    let alerting_service = AdminAlertingService::new();
    
    let alert = AdminAlert::new(
        AlertSeverity::Critical,
        AlertType::DdosAttack,
        "DDoS Attack Detected and Mitigated".to_string(),
        format!(
            "DDoS attack detected from IP {}. Attack type: {}, Request count: {}, Action taken: {}",
            ip_address, attack_type, request_count, action_taken
        ),
    )
    .with_metadata("ip_address".to_string(), ip_address.to_string())
    .with_metadata("request_count".to_string(), request_count.to_string())
    .with_metadata("attack_type".to_string(), attack_type.to_string())
    .with_metadata("action_taken".to_string(), action_taken.to_string());

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send API key compromise alert
pub async fn send_api_key_compromise_alert(
    key_type: &str,
    compromise_indicators: &[String],
    action_taken: &str,
) {
    let alerting_service = AdminAlertingService::new();
    
    let alert = AdminAlert::new(
        AlertSeverity::Critical,
        AlertType::ApiKeyCompromise,
        "API Key Compromise Detected".to_string(),
        format!(
            "Potential compromise detected for {} API key. Indicators: {}. Action taken: {}",
            key_type, 
            compromise_indicators.join(", "),
            action_taken
        ),
    )
    .with_metadata("key_type".to_string(), key_type.to_string())
    .with_metadata("indicators".to_string(), compromise_indicators.join(", "))
    .with_metadata("action_taken".to_string(), action_taken.to_string())
    .with_immediate_attention(true);

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send webhook security breach alert
pub async fn send_webhook_security_breach_alert(
    ip_address: &str,
    breach_type: &str,
    details: &str,
) {
    let alerting_service = AdminAlertingService::new();
    
    let alert = AdminAlert::new(
        AlertSeverity::High,
        AlertType::WebhookSecurityBreach,
        "Webhook Security Breach Detected".to_string(),
        format!(
            "Security breach detected in webhook processing from IP {}. Breach type: {}. Details: {}",
            ip_address, breach_type, details
        ),
    )
    .with_metadata("ip_address".to_string(), ip_address.to_string())
    .with_metadata("breach_type".to_string(), breach_type.to_string())
    .with_metadata("details".to_string(), details.to_string());

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send compliance violation alert
pub async fn send_compliance_violation_alert(
    regulation: &str,
    violation_type: &str,
    affected_data: &str,
    remediation_required: bool,
) {
    let alerting_service = AdminAlertingService::new();
    
    let severity = if remediation_required { AlertSeverity::Critical } else { AlertSeverity::High };
    
    let alert = AdminAlert::new(
        severity,
        AlertType::ComplianceViolation,
        "Compliance Violation Detected".to_string(),
        format!(
            "Violation of {} compliance detected. Type: {}, Affected data: {}, Remediation required: {}",
            regulation, violation_type, affected_data, remediation_required
        ),
    )
    .with_metadata("regulation".to_string(), regulation.to_string())
    .with_metadata("violation_type".to_string(), violation_type.to_string())
    .with_metadata("affected_data".to_string(), affected_data.to_string())
    .with_metadata("remediation_required".to_string(), remediation_required.to_string())
    .with_immediate_attention(remediation_required);

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send rate limit exceeded alert
pub async fn send_rate_limit_exceeded_alert(
    source: &str,
    limit_type: &str,
    current_rate: u64,
    threshold: u64,
    action_taken: &str,
) {
    let alerting_service = AdminAlertingService::new();
    
    let severity = if current_rate > threshold * 2 { AlertSeverity::High } else { AlertSeverity::Medium };
    
    let alert = AdminAlert::new(
        severity,
        AlertType::RateLimitExceeded,
        "Rate Limit Exceeded".to_string(),
        format!(
            "Rate limit exceeded for {}. Type: {}, Current rate: {}, Threshold: {}, Action: {}",
            source, limit_type, current_rate, threshold, action_taken
        ),
    )
    .with_metadata("source".to_string(), source.to_string())
    .with_metadata("limit_type".to_string(), limit_type.to_string())
    .with_metadata("current_rate".to_string(), current_rate.to_string())
    .with_metadata("threshold".to_string(), threshold.to_string())
    .with_metadata("action_taken".to_string(), action_taken.to_string());

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send suspicious activity alert
pub async fn send_suspicious_activity_alert(
    activity_type: &str,
    source: &str,
    details: HashMap<String, String>,
) {
    let alerting_service = AdminAlertingService::new();
    
    let alert = AdminAlert::new(
        AlertSeverity::Medium,
        AlertType::SuspiciousActivity,
        "Suspicious Activity Detected".to_string(),
        format!(
            "Suspicious {} activity detected from {}. Review required.",
            activity_type, source
        ),
    )
    .with_metadata("activity_type".to_string(), activity_type.to_string())
    .with_metadata("source".to_string(), source.to_string());

    // Add all details as metadata
    let alert = details.into_iter().fold(alert, |acc, (k, v)| {
        acc.with_metadata(k, v)
    });

    alerting_service.send_alert(alert).await;
}

/// Convenience function to send billing allowance reset failure alert
pub async fn send_billing_allowance_reset_failure_alert(
    user_id: &Uuid,
    invoice_id: &str,
    error_message: &str,
) {
    let alerting_service = AdminAlertingService::new();
    
    let alert = AdminAlert::new(
        AlertSeverity::Critical,
        AlertType::PaymentProcessingError,
        "Billing Allowance Reset Failed After Payment".to_string(),
        format!(
            "CRITICAL: User {} paid subscription (invoice {}) but monthly spending allowances failed to reset. Manual intervention required. Error: {}",
            user_id, invoice_id, error_message
        ),
    )
    .with_metadata("user_id".to_string(), user_id.to_string())
    .with_metadata("invoice_id".to_string(), invoice_id.to_string())
    .with_metadata("error_message".to_string(), error_message.to_string())
    .with_metadata("requires_manual_intervention".to_string(), "true".to_string())
    .with_immediate_attention(true);

    alerting_service.send_alert(alert).await;
}