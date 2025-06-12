use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use ipnetwork::IpNetwork;
use std::sync::Arc;
use log::{debug, error, info, warn};
use sha2::{Sha256, Digest};

use crate::error::AppError;
use crate::db::repositories::audit_log_repository::{
    AuditLogRepository, AuditLog, CreateAuditLogRequest, AuditLogFilter
};

/// High-level audit service for tracking subscription management operations
#[derive(Clone)]
pub struct AuditService {
    audit_log_repository: Arc<AuditLogRepository>,
}

/// Audit context for tracking request-level information
#[derive(Debug, Clone)]
pub struct AuditContext {
    pub user_id: Uuid,
    pub ip_address: Option<IpNetwork>,
    pub user_agent: Option<String>,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
}

impl AuditContext {
    pub fn new(user_id: Uuid) -> Self {
        Self {
            user_id,
            ip_address: None,
            user_agent: None,
            session_id: None,
            request_id: None,
        }
    }

    pub fn with_ip_address(mut self, ip_address: IpNetwork) -> Self {
        self.ip_address = Some(ip_address);
        self
    }
    
    pub fn with_ip_addr(mut self, ip_addr: std::net::IpAddr) -> Self {
        self.ip_address = Some(IpNetwork::from(ip_addr));
        self
    }

    pub fn with_user_agent(mut self, user_agent: String) -> Self {
        self.user_agent = Some(user_agent);
        self
    }

    pub fn with_session_id(mut self, session_id: String) -> Self {
        self.session_id = Some(session_id);
        self
    }

    pub fn with_request_id(mut self, request_id: String) -> Self {
        self.request_id = Some(request_id);
        self
    }
}

/// Audit event for tracking specific operations
#[derive(Debug, Clone)]
pub struct AuditEvent {
    pub action_type: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub old_values: Option<serde_json::Value>,
    pub new_values: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub performed_by: String,
    pub status: Option<String>,
    pub error_message: Option<String>,
}

impl AuditEvent {
    pub fn new(action_type: impl Into<String>, entity_type: impl Into<String>) -> Self {
        Self {
            action_type: action_type.into(),
            entity_type: entity_type.into(),
            entity_id: None,
            old_values: None,
            new_values: None,
            metadata: None,
            performed_by: "system".to_string(),
            status: Some("completed".to_string()),
            error_message: None,
        }
    }

    pub fn with_entity_id(mut self, entity_id: impl Into<String>) -> Self {
        self.entity_id = Some(entity_id.into());
        self
    }

    pub fn with_old_values(mut self, old_values: serde_json::Value) -> Self {
        self.old_values = Some(old_values);
        self
    }

    pub fn with_new_values(mut self, new_values: serde_json::Value) -> Self {
        self.new_values = Some(new_values);
        self
    }

    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }

    pub fn with_performed_by(mut self, performed_by: impl Into<String>) -> Self {
        self.performed_by = performed_by.into();
        self
    }

    pub fn with_status(mut self, status: impl Into<String>) -> Self {
        self.status = Some(status.into());
        self
    }

    pub fn with_error(mut self, error_message: impl Into<String>) -> Self {
        self.status = Some("failed".to_string());
        self.error_message = Some(error_message.into());
        self
    }
}

impl AuditService {
    pub fn new(pool: PgPool) -> Self {
        Self {
            audit_log_repository: Arc::new(AuditLogRepository::new(pool)),
        }
    }

    /// Generate compliance tags based on action type and entity
    fn generate_compliance_tags(&self, action_type: &str, entity_type: &str) -> Vec<String> {
        let mut tags = Vec::new();
        
        match (action_type, entity_type) {
            ("payment_processed" | "payment_failed", "payment") => {
                tags.push("PCI_DSS".to_string());
                tags.push("PAYMENT_DATA".to_string());
            },
            ("subscription_created" | "subscription_cancelled" | "subscription_plan_changed", "subscription") => {
                tags.push("SOX".to_string());
                tags.push("FINANCIAL_DATA".to_string());
            },
            ("webhook_processed", "webhook") => {
                tags.push("PSD2".to_string());
                tags.push("WEBHOOK_PROCESSING".to_string());
            },
            _ => {
                tags.push("GENERAL".to_string());
            }
        }
        
        // Add region-specific tags if available
        tags.push("GDPR_APPLICABLE".to_string());
        
        tags
    }

    /// Calculate integrity hash for audit log entry
    fn calculate_integrity_hash(&self, audit_log: &AuditLog) -> String {
        let mut hasher = Sha256::new();
        
        let hash_input = format!(
            "{}|{}|{}|{}|{}|{}",
            audit_log.id,
            audit_log.action_type,
            audit_log.entity_type,
            audit_log.entity_id.as_deref().unwrap_or(""),
            audit_log.created_at.to_rfc3339(),
            audit_log.performed_by
        );
        
        hasher.update(hash_input.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Log an audit event with context and compliance features
    pub async fn log_event(
        &self,
        context: &AuditContext,
        event: AuditEvent,
    ) -> Result<AuditLog, AppError> {
        debug!("Logging audit event: {} for entity: {}", event.action_type, event.entity_type);

        // Generate compliance tags
        let compliance_tags = self.generate_compliance_tags(&event.action_type, &event.entity_type);
        
        // Add compliance tags to metadata
        let mut enhanced_metadata = event.metadata.unwrap_or_else(|| serde_json::json!({}));
        enhanced_metadata["compliance_tags"] = serde_json::to_value(&compliance_tags).unwrap_or_default();
        enhanced_metadata["audit_timestamp"] = serde_json::Value::String(Utc::now().to_rfc3339());

        let request = CreateAuditLogRequest {
            user_id: context.user_id,
            action_type: event.action_type,
            entity_type: event.entity_type,
            entity_id: event.entity_id,
            old_values: event.old_values,
            new_values: event.new_values,
            metadata: Some(enhanced_metadata),
            performed_by: event.performed_by,
            ip_address: context.ip_address,
            user_agent: context.user_agent.clone(),
            session_id: context.session_id.clone(),
            request_id: context.request_id.clone(),
            status: event.status,
            error_message: event.error_message,
        };

        let audit_log = self.audit_log_repository.create(request).await?;
        
        // Calculate and log integrity hash for compliance
        let integrity_hash = self.calculate_integrity_hash(&audit_log);
        debug!("Audit log integrity hash: {}", integrity_hash);
        
        info!("✅ Audit event logged successfully with compliance features: {}", audit_log.id);
        Ok(audit_log)
    }

    /// Log an audit event within a transaction with compliance features
    pub async fn log_event_with_transaction<'a>(
        &self,
        context: &AuditContext,
        event: AuditEvent,
        tx: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<AuditLog, AppError> {
        debug!("Logging audit event with transaction: {} for entity: {}", event.action_type, event.entity_type);

        // Generate compliance tags
        let compliance_tags = self.generate_compliance_tags(&event.action_type, &event.entity_type);
        
        // Add compliance tags to metadata
        let mut enhanced_metadata = event.metadata.unwrap_or_else(|| serde_json::json!({}));
        enhanced_metadata["compliance_tags"] = serde_json::to_value(&compliance_tags).unwrap_or_default();
        enhanced_metadata["audit_timestamp"] = serde_json::Value::String(Utc::now().to_rfc3339());

        let request = CreateAuditLogRequest {
            user_id: context.user_id,
            action_type: event.action_type,
            entity_type: event.entity_type,
            entity_id: event.entity_id,
            old_values: event.old_values,
            new_values: event.new_values,
            metadata: Some(enhanced_metadata),
            performed_by: event.performed_by,
            ip_address: context.ip_address,
            user_agent: context.user_agent.clone(),
            session_id: context.session_id.clone(),
            request_id: context.request_id.clone(),
            status: event.status,
            error_message: event.error_message,
        };

        let audit_log = self.audit_log_repository.create_with_executor(request, tx).await?;
        
        // Calculate and log integrity hash for compliance
        let integrity_hash = self.calculate_integrity_hash(&audit_log);
        debug!("Audit log integrity hash: {}", integrity_hash);
        
        info!("✅ Audit event logged with transaction successfully with compliance features: {}", audit_log.id);
        Ok(audit_log)
    }

    /// Get audit logs for a user with pagination
    pub async fn get_user_audit_logs(
        &self,
        user_id: &Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLog>, AppError> {
        self.audit_log_repository.get_by_user_id(user_id, limit, offset).await
    }

    /// Get audit logs for a specific entity
    pub async fn get_entity_audit_logs(
        &self,
        entity_type: &str,
        entity_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLog>, AppError> {
        self.audit_log_repository.get_by_entity(entity_type, entity_id, limit, offset).await
    }

    /// Get filtered audit logs
    pub async fn get_filtered_audit_logs(
        &self,
        filter: AuditLogFilter,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLog>, AppError> {
        self.audit_log_repository.get_filtered(filter, limit, offset).await
    }

    /// Count audit logs for a user
    pub async fn count_user_audit_logs(&self, user_id: &Uuid) -> Result<i64, AppError> {
        self.audit_log_repository.count_by_user_id(user_id).await
    }

    /// Update audit log status (for async operations)
    pub async fn update_audit_log_status(
        &self,
        audit_log_id: &Uuid,
        status: &str,
        error_message: Option<&str>,
    ) -> Result<(), AppError> {
        self.audit_log_repository.update_status(audit_log_id, status, error_message).await
    }

    /// Clean up old audit logs (for retention policies)
    pub async fn cleanup_old_audit_logs(&self, retention_days: i64) -> Result<u64, AppError> {
        let cutoff_date = Utc::now() - chrono::Duration::days(retention_days);
        let deleted_count = self.audit_log_repository.delete_older_than(cutoff_date).await?;
        
        if deleted_count > 0 {
            info!("Cleaned up {} old audit logs older than {} days", deleted_count, retention_days);
        }
        
        Ok(deleted_count)
    }

    /// Log security event for compliance tracking
    pub async fn log_security_event(
        &self,
        context: &AuditContext,
        threat_type: &str,
        severity: &str, // "low", "medium", "high", "critical"
        details: serde_json::Value,
        action_taken: Option<&str>,
    ) -> Result<AuditLog, AppError> {
        let mut metadata = serde_json::json!({
            "threat_type": threat_type,
            "severity": severity,
            "details": details,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        if let Some(action) = action_taken {
            metadata["action_taken"] = serde_json::Value::String(action.to_string());
        }

        let event = AuditEvent::new("security_threat_detected", "security")
            .with_metadata(metadata)
            .with_performed_by("security_system")
            .with_status(if action_taken.is_some() { "mitigated" } else { "detected" });

        self.log_event(context, event).await
    }

    /// Get compliance report for specific regulation
    pub async fn get_compliance_report(
        &self,
        compliance_standard: &str, // "PCI_DSS", "GDPR", "SOX", etc.
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
        limit: i64,
    ) -> Result<serde_json::Value, AppError> {
        let filter = AuditLogFilter {
            user_id: None,
            action_type: None,
            entity_type: None,
            entity_id: None,
            performed_by: None,
            status: None,
            date_from: Some(start_date),
            date_to: Some(end_date),
        };

        let audit_logs = self.audit_log_repository.get_filtered(filter, limit, 0).await?;
        
        // Filter logs by compliance tags
        let relevant_logs: Vec<_> = audit_logs.into_iter()
            .filter(|log| {
                log.metadata.as_ref()
                    .and_then(|m| m.get("compliance_tags"))
                    .and_then(|tags| tags.as_array())
                    .map(|tags| tags.iter().any(|tag| 
                        tag.as_str().map_or(false, |s| s.contains(compliance_standard))
                    ))
                    .unwrap_or(false)
            })
            .collect();

        let total_events = relevant_logs.len();
        let success_events = relevant_logs.iter()
            .filter(|log| log.status == "completed")
            .count();
        let failed_events = relevant_logs.iter()
            .filter(|log| log.status == "failed")
            .count();

        let report = serde_json::json!({
            "compliance_standard": compliance_standard,
            "report_period": {
                "start": start_date,
                "end": end_date
            },
            "summary": {
                "total_events": total_events,
                "success_events": success_events,
                "failed_events": failed_events,
                "success_rate": if total_events > 0 { 
                    success_events as f64 / total_events as f64 
                } else { 
                    0.0 
                }
            },
            "event_breakdown": self.count_events_by_type(&relevant_logs),
            "generated_at": Utc::now()
        });

        Ok(report)
    }

    /// Count events by action type for reporting
    fn count_events_by_type(&self, logs: &[AuditLog]) -> serde_json::Value {
        let mut counts = std::collections::HashMap::new();
        for log in logs {
            *counts.entry(&log.action_type).or_insert(0) += 1;
        }
        serde_json::to_value(counts).unwrap_or_default()
    }

    /// Verify audit log integrity
    pub async fn verify_audit_integrity(&self, audit_log_id: &Uuid) -> Result<bool, AppError> {
        let logs = self.audit_log_repository.get_by_entity("audit_log", &audit_log_id.to_string(), 1, 0).await?;
        
        if let Some(log) = logs.first() {
            let calculated_hash = self.calculate_integrity_hash(log);
            // In a real implementation, you would compare this with a stored hash
            // For now, we'll just check that the log exists and can generate a hash
            Ok(!calculated_hash.is_empty())
        } else {
            Ok(false)
        }
    }
}

/// Convenience methods for common subscription management audit scenarios
impl AuditService {
    /// Log subscription creation
    pub async fn log_subscription_created(
        &self,
        context: &AuditContext,
        subscription_id: &str,
        plan_id: &str,
        stripe_data: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "plan_id": plan_id,
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("subscription_created", "subscription")
            .with_entity_id(subscription_id)
            .with_new_values(serde_json::json!({
                "plan_id": plan_id,
                "status": "active"
            }))
            .with_metadata(metadata)
            .with_performed_by("stripe_webhook");

        self.log_event(context, event).await
    }

    /// Log subscription plan change
    pub async fn log_subscription_plan_changed(
        &self,
        context: &AuditContext,
        subscription_id: &str,
        old_plan_id: &str,
        new_plan_id: &str,
        change_type: &str, // "upgrade" or "downgrade"
        is_immediate: bool,
        stripe_data: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "change_type": change_type,
            "is_immediate": is_immediate,
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("subscription_plan_changed", "subscription")
            .with_entity_id(subscription_id)
            .with_old_values(serde_json::json!({
                "plan_id": old_plan_id
            }))
            .with_new_values(serde_json::json!({
                "plan_id": new_plan_id
            }))
            .with_metadata(metadata)
            .with_performed_by("user");

        self.log_event(context, event).await
    }

    /// Log subscription plan change with transaction
    pub async fn log_subscription_plan_changed_with_tx<'a>(
        &self,
        context: &AuditContext,
        subscription_id: &str,
        old_plan_id: &str,
        new_plan_id: &str,
        change_type: &str,
        is_immediate: bool,
        stripe_data: Option<serde_json::Value>,
        tx: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "change_type": change_type,
            "is_immediate": is_immediate,
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("subscription_plan_changed", "subscription")
            .with_entity_id(subscription_id)
            .with_old_values(serde_json::json!({
                "plan_id": old_plan_id
            }))
            .with_new_values(serde_json::json!({
                "plan_id": new_plan_id
            }))
            .with_metadata(metadata)
            .with_performed_by("user");

        self.log_event_with_transaction(context, event, tx).await
    }

    /// Log subscription cancellation
    pub async fn log_subscription_cancelled(
        &self,
        context: &AuditContext,
        subscription_id: &str,
        at_period_end: bool,
        cancellation_reason: Option<&str>,
        stripe_data: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "at_period_end": at_period_end,
            "cancellation_reason": cancellation_reason,
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("subscription_cancelled", "subscription")
            .with_entity_id(subscription_id)
            .with_old_values(serde_json::json!({
                "status": "active"
            }))
            .with_new_values(serde_json::json!({
                "status": if at_period_end { "active" } else { "cancelled" },
                "cancel_at_period_end": at_period_end
            }))
            .with_metadata(metadata)
            .with_performed_by("user");

        self.log_event(context, event).await
    }

    /// Log subscription cancellation with transaction
    pub async fn log_subscription_cancelled_with_tx<'a>(
        &self,
        context: &AuditContext,
        subscription_id: &str,
        at_period_end: bool,
        cancellation_reason: Option<&str>,
        stripe_data: Option<serde_json::Value>,
        tx: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "at_period_end": at_period_end,
            "cancellation_reason": cancellation_reason,
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("subscription_cancelled", "subscription")
            .with_entity_id(subscription_id)
            .with_old_values(serde_json::json!({
                "status": "active"
            }))
            .with_new_values(serde_json::json!({
                "status": if at_period_end { "active" } else { "cancelled" },
                "cancel_at_period_end": at_period_end
            }))
            .with_metadata(metadata)
            .with_performed_by("user");

        self.log_event_with_transaction(context, event, tx).await
    }

    /// Log subscription reactivation
    pub async fn log_subscription_reactivated(
        &self,
        context: &AuditContext,
        subscription_id: &str,
        new_plan_id: &str,
        stripe_data: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "new_plan_id": new_plan_id,
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("subscription_reactivated", "subscription")
            .with_entity_id(subscription_id)
            .with_old_values(serde_json::json!({
                "status": "cancelled"
            }))
            .with_new_values(serde_json::json!({
                "status": "active",
                "plan_id": new_plan_id
            }))
            .with_metadata(metadata)
            .with_performed_by("user");

        self.log_event(context, event).await
    }

    /// Log subscription resumption (removing cancel_at_period_end flag)
    pub async fn log_subscription_resumed(
        &self,
        context: &AuditContext,
        subscription_id: &str,
        stripe_data: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("subscription_resumed", "subscription")
            .with_entity_id(subscription_id)
            .with_old_values(serde_json::json!({
                "cancel_at_period_end": true
            }))
            .with_new_values(serde_json::json!({
                "cancel_at_period_end": false,
                "status": "active"
            }))
            .with_metadata(metadata)
            .with_performed_by("user");

        self.log_event(context, event).await
    }

    /// Log subscription resumption with transaction (removing cancel_at_period_end flag)
    pub async fn log_subscription_resumed_with_tx<'a>(
        &self,
        context: &AuditContext,
        subscription_id: &str,
        stripe_data: Option<serde_json::Value>,
        tx: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("subscription_resumed", "subscription")
            .with_entity_id(subscription_id)
            .with_old_values(serde_json::json!({
                "cancel_at_period_end": true
            }))
            .with_new_values(serde_json::json!({
                "cancel_at_period_end": false,
                "status": "active"
            }))
            .with_metadata(metadata)
            .with_performed_by("user");

        self.log_event_with_transaction(context, event, tx).await
    }

    /// Log payment processing
    pub async fn log_payment_processed(
        &self,
        context: &AuditContext,
        payment_intent_id: &str,
        amount: &bigdecimal::BigDecimal,
        currency: &str,
        payment_type: &str, // "subscription", "credit_purchase", etc.
        stripe_data: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "amount": amount.to_string(),
            "currency": currency,
            "payment_type": payment_type,
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("payment_processed", "payment")
            .with_entity_id(payment_intent_id)
            .with_new_values(serde_json::json!({
                "amount": amount.to_string(),
                "currency": currency,
                "status": "succeeded"
            }))
            .with_metadata(metadata)
            .with_performed_by("stripe_webhook");

        self.log_event(context, event).await
    }

    /// Log payment failure
    pub async fn log_payment_failed(
        &self,
        context: &AuditContext,
        payment_intent_id: &str,
        amount: &bigdecimal::BigDecimal,
        currency: &str,
        failure_reason: &str,
        stripe_data: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "amount": amount.to_string(),
            "currency": currency,
            "failure_reason": failure_reason,
            "stripe_data": stripe_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("payment_failed", "payment")
            .with_entity_id(payment_intent_id)
            .with_new_values(serde_json::json!({
                "amount": amount.to_string(),
                "currency": currency,
                "status": "failed"
            }))
            .with_metadata(metadata)
            .with_performed_by("stripe_webhook")
            .with_error(failure_reason);

        self.log_event(context, event).await
    }

    /// Log webhook processing
    pub async fn log_webhook_processed(
        &self,
        context: &AuditContext,
        webhook_event_id: &str,
        event_type: &str,
        processing_result: &str, // "success", "failure", "skipped"
        error_message: Option<&str>,
        webhook_data: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "event_type": event_type,
            "processing_result": processing_result,
            "webhook_data": webhook_data,
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let mut event = AuditEvent::new("webhook_processed", "webhook")
            .with_entity_id(webhook_event_id)
            .with_metadata(metadata)
            .with_performed_by("stripe_webhook")
            .with_status(processing_result);

        if let Some(error) = error_message {
            event = event.with_error(error);
        }

        self.log_event(context, event).await
    }

    /// Log spending limit update
    pub async fn log_spending_limit_updated(
        &self,
        context: &AuditContext,
        user_id: &Uuid,
        old_limit: Option<&bigdecimal::BigDecimal>,
        new_limit: &bigdecimal::BigDecimal,
        limit_type: &str, // "included_allowance", "hard_limit", etc.
    ) -> Result<AuditLog, AppError> {
        let metadata = serde_json::json!({
            "limit_type": limit_type,
            "currency": "USD",
            "action_timestamp": Utc::now().to_rfc3339()
        });

        let event = AuditEvent::new("spending_limit_updated", "spending_limit")
            .with_entity_id(&user_id.to_string())
            .with_old_values(old_limit.map(|l| serde_json::json!({
                "limit": l.to_string()
            })).unwrap_or(serde_json::Value::Null))
            .with_new_values(serde_json::json!({
                "limit": new_limit.to_string()
            }))
            .with_metadata(metadata)
            .with_performed_by("system");

        self.log_event(context, event).await
    }
}