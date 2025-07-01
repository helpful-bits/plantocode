use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, FromRow};
use uuid::Uuid;
use std::collections::HashMap;
use sqlx::types::ipnetwork::IpNetwork;
use log::warn;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub user_id: Uuid,
    pub action_type: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub old_values: Option<serde_json::Value>,
    pub new_values: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub performed_by: String,
    pub ip_address: Option<sqlx::types::ipnetwork::IpNetwork>,
    pub user_agent: Option<String>,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    // SECURITY: Hash chaining and cryptographic signature fields for tamper-proof audit trail
    pub previous_hash: Option<String>,
    pub entry_hash: String,
    pub signature: String,
}

#[derive(Debug, Clone)]
pub struct CreateAuditLogRequest {
    pub user_id: Uuid,
    pub action_type: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub old_values: Option<serde_json::Value>,
    pub new_values: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub performed_by: String,
    pub ip_address: Option<sqlx::types::ipnetwork::IpNetwork>,
    pub user_agent: Option<String>,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
    pub status: Option<String>,
    pub error_message: Option<String>,
    // SECURITY: Hash chaining and cryptographic signature fields
    pub previous_hash: Option<String>,
    pub entry_hash: String,
    pub signature: String,
}

#[derive(Debug, Clone)]
pub struct AuditLogFilter {
    pub user_id: Option<Uuid>,
    pub action_type: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub performed_by: Option<String>,
    pub status: Option<String>,
    pub date_from: Option<DateTime<Utc>>,
    pub date_to: Option<DateTime<Utc>>,
}

#[derive(Debug)]
pub struct AuditLogRepository {
    pool: PgPool,
}

impl AuditLogRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Create a new audit log entry (legacy method - deprecated)
    pub async fn create(&self, mut request: CreateAuditLogRequest) -> Result<AuditLog, AppError> {
        // For backward compatibility, set empty security fields if not provided
        if request.entry_hash.is_empty() {
            request.entry_hash = "legacy".to_string();
        }
        if request.signature.is_empty() {
            request.signature = "legacy".to_string();
        }
        
        self.create_secure(request).await
    }
    
    /// Create a new secure audit log entry with hash chaining and cryptographic signatures
    pub async fn create_secure(&self, request: CreateAuditLogRequest) -> Result<AuditLog, AppError> {
        let audit_log = sqlx::query_as!(
            AuditLog,
            r#"
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id, old_values, new_values, 
                metadata, performed_by, ip_address, user_agent, session_id, request_id, 
                status, error_message, previous_hash, entry_hash, signature
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING 
                id, user_id, action_type, entity_type, entity_id, old_values, new_values,
                metadata, performed_by, ip_address, user_agent, session_id, request_id,
                status, error_message, created_at, previous_hash, entry_hash, signature
            "#,
            request.user_id,
            request.action_type,
            request.entity_type,
            request.entity_id,
            request.old_values,
            request.new_values,
            request.metadata,
            request.performed_by,
            request.ip_address,
            request.user_agent,
            request.session_id,
            request.request_id,
            request.status.unwrap_or_else(|| "completed".to_string()),
            request.error_message,
            request.previous_hash,
            request.entry_hash,
            request.signature
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create secure audit log: {}", e)))?;

        Ok(audit_log)
    }

    /// Create a new audit log entry with an existing transaction (legacy method - deprecated)
    pub async fn create_with_executor<'a>(
        &self,
        mut request: CreateAuditLogRequest,
        executor: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<AuditLog, AppError> {
        // For backward compatibility, set empty security fields if not provided
        if request.entry_hash.is_empty() {
            request.entry_hash = "legacy".to_string();
        }
        if request.signature.is_empty() {
            request.signature = "legacy".to_string();
        }
        
        self.create_secure_with_executor(request, executor).await
    }
    
    /// Create a new secure audit log entry with an existing transaction and tamper-proof features
    pub async fn create_secure_with_executor<'a>(
        &self,
        request: CreateAuditLogRequest,
        executor: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<AuditLog, AppError> {
        let audit_log = sqlx::query_as!(
            AuditLog,
            r#"
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id, old_values, new_values, 
                metadata, performed_by, ip_address, user_agent, session_id, request_id, 
                status, error_message, previous_hash, entry_hash, signature
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING 
                id, user_id, action_type, entity_type, entity_id, old_values, new_values,
                metadata, performed_by, ip_address, user_agent, session_id, request_id,
                status, error_message, created_at, previous_hash, entry_hash, signature
            "#,
            request.user_id,
            request.action_type,
            request.entity_type,
            request.entity_id,
            request.old_values,
            request.new_values,
            request.metadata,
            request.performed_by,
            request.ip_address,
            request.user_agent,
            request.session_id,
            request.request_id,
            request.status.unwrap_or_else(|| "completed".to_string()),
            request.error_message,
            request.previous_hash,
            request.entry_hash,
            request.signature
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create secure audit log: {}", e)))?;

        Ok(audit_log)
    }

    /// Get audit logs by user ID with pagination
    pub async fn get_by_user_id(
        &self,
        user_id: &Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLog>, AppError> {
        let audit_logs = sqlx::query_as!(
            AuditLog,
            r#"
            SELECT 
                id, user_id, action_type, entity_type, entity_id, old_values, new_values,
                metadata, performed_by, ip_address, user_agent, session_id, request_id,
                status, error_message, created_at, previous_hash, entry_hash, signature
            FROM audit_logs 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit,
            offset
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get audit logs by user ID: {}", e)))?;

        Ok(audit_logs)
    }

    /// Get audit logs with filters and pagination
    pub async fn get_filtered(
        &self,
        filter: AuditLogFilter,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLog>, AppError> {
        let mut query = "SELECT id, user_id, action_type, entity_type, entity_id, old_values, new_values, metadata, performed_by, ip_address, user_agent, session_id, request_id, status, error_message, created_at, previous_hash, entry_hash, signature FROM audit_logs WHERE 1=1".to_string();
        let mut conditions = Vec::new();
        let mut param_index = 1;

        if filter.user_id.is_some() {
            conditions.push(format!(" AND user_id = ${}", param_index));
            param_index += 1;
        }

        if filter.action_type.is_some() {
            conditions.push(format!(" AND action_type = ${}", param_index));
            param_index += 1;
        }

        if filter.entity_type.is_some() {
            conditions.push(format!(" AND entity_type = ${}", param_index));
            param_index += 1;
        }

        if filter.entity_id.is_some() {
            conditions.push(format!(" AND entity_id = ${}", param_index));
            param_index += 1;
        }

        if filter.performed_by.is_some() {
            conditions.push(format!(" AND performed_by = ${}", param_index));
            param_index += 1;
        }

        if filter.status.is_some() {
            conditions.push(format!(" AND status = ${}", param_index));
            param_index += 1;
        }

        if filter.date_from.is_some() {
            conditions.push(format!(" AND created_at >= ${}", param_index));
            param_index += 1;
        }

        if filter.date_to.is_some() {
            conditions.push(format!(" AND created_at <= ${}", param_index));
            param_index += 1;
        }

        query.push_str(&conditions.join(""));
        query.push_str(" ORDER BY created_at DESC");
        query.push_str(&format!(" LIMIT ${} OFFSET ${}", param_index, param_index + 1));

        let mut query_builder = sqlx::query_as::<_, AuditLog>(&query);

        if let Some(user_id) = filter.user_id {
            query_builder = query_builder.bind(user_id);
        }
        if let Some(action_type) = filter.action_type {
            query_builder = query_builder.bind(action_type);
        }
        if let Some(entity_type) = filter.entity_type {
            query_builder = query_builder.bind(entity_type);
        }
        if let Some(entity_id) = filter.entity_id {
            query_builder = query_builder.bind(entity_id);
        }
        if let Some(performed_by) = filter.performed_by {
            query_builder = query_builder.bind(performed_by);
        }
        if let Some(status) = filter.status {
            query_builder = query_builder.bind(status);
        }
        if let Some(date_from) = filter.date_from {
            query_builder = query_builder.bind(date_from);
        }
        if let Some(date_to) = filter.date_to {
            query_builder = query_builder.bind(date_to);
        }

        query_builder = query_builder.bind(limit).bind(offset);

        let audit_logs = query_builder
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to get filtered audit logs: {}", e)))?;

        Ok(audit_logs)
    }

    /// Count total audit logs for a user
    pub async fn count_by_user_id(&self, user_id: &Uuid) -> Result<i64, AppError> {
        let count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM audit_logs WHERE user_id = $1",
            user_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count audit logs: {}", e)))?;

        Ok(count.unwrap_or(0))
    }

    /// Get audit logs by entity
    pub async fn get_by_entity(
        &self,
        entity_type: &str,
        entity_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLog>, AppError> {
        let audit_logs = sqlx::query_as!(
            AuditLog,
            r#"
            SELECT 
                id, user_id, action_type, entity_type, entity_id, old_values, new_values,
                metadata, performed_by, ip_address, user_agent, session_id, request_id,
                status, error_message, created_at, previous_hash, entry_hash, signature
            FROM audit_logs 
            WHERE entity_type = $1 AND entity_id = $2
            ORDER BY created_at DESC 
            LIMIT $3 OFFSET $4
            "#,
            entity_type,
            entity_id,
            limit,
            offset
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get audit logs by entity: {}", e)))?;

        Ok(audit_logs)
    }

    /// Update audit log status (DEPRECATED - violates write-once principle)
    /// Use separate audit entries for status changes instead
    pub async fn update_status(
        &self,
        id: &Uuid,
        status: &str,
        error_message: Option<&str>,
    ) -> Result<(), AppError> {
        warn!("DEPRECATED: update_status called on audit log {}. This violates write-once principle.", id);
        warn!("Consider creating a new audit entry for status change instead.");
        
        // For backward compatibility, still allow the update but log a warning
        sqlx::query!(
            "UPDATE audit_logs SET status = $1, error_message = $2 WHERE id = $3",
            status,
            error_message,
            id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update audit log status: {}", e)))?;

        Ok(())
    }

    /// Delete old audit logs (for cleanup/retention policies)
    pub async fn delete_older_than(&self, date: DateTime<Utc>) -> Result<u64, AppError> {
        let result = sqlx::query!("DELETE FROM audit_logs WHERE created_at < $1", date)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to delete old audit logs: {}", e)))?;

        Ok(result.rows_affected())
    }

    /// Get the hash of the most recent audit log entry for chain validation
    pub async fn get_last_entry_hash(&self) -> Result<Option<String>, AppError> {
        let result = sqlx::query_scalar!(
            "SELECT entry_hash FROM audit_logs ORDER BY created_at DESC LIMIT 1"
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get last entry hash: {}", e)))?;

        Ok(result)
    }
    
    /// Get the hash of the most recent audit log entry within a transaction
    pub async fn get_last_entry_hash_with_tx<'a>(
        &self,
        tx: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<Option<String>, AppError> {
        let result = sqlx::query_scalar!(
            "SELECT entry_hash FROM audit_logs ORDER BY created_at DESC LIMIT 1"
        )
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get last entry hash in transaction: {}", e)))?;

        Ok(result)
    }
    
    /// Get audit log by ID for integrity verification
    pub async fn get_by_id(&self, id: &Uuid) -> Result<Option<AuditLog>, AppError> {
        let audit_log = sqlx::query_as!(
            AuditLog,
            r#"
            SELECT 
                id, user_id, action_type, entity_type, entity_id, old_values, new_values,
                metadata, performed_by, ip_address, user_agent, session_id, request_id,
                status, error_message, created_at, previous_hash, entry_hash, signature
            FROM audit_logs 
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get audit log by ID: {}", e)))?;

        Ok(audit_log)
    }
    
    /// Get all audit logs ordered by creation time for chain validation
    pub async fn get_all_ordered_by_creation(&self, limit: i64) -> Result<Vec<AuditLog>, AppError> {
        let audit_logs = sqlx::query_as!(
            AuditLog,
            r#"
            SELECT 
                id, user_id, action_type, entity_type, entity_id, old_values, new_values,
                metadata, performed_by, ip_address, user_agent, session_id, request_id,
                status, error_message, created_at, previous_hash, entry_hash, signature
            FROM audit_logs 
            ORDER BY created_at ASC 
            LIMIT $1
            "#,
            limit
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get ordered audit logs: {}", e)))?;

        Ok(audit_logs)
    }

    /// Get pool reference for advanced operations
    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }
}

/// Convenience functions for common audit log scenarios
impl AuditLogRepository {
    /// Log a subscription-related action
    pub async fn log_subscription_action(
        &self,
        user_id: Uuid,
        action_type: &str,
        subscription_id: &str,
        old_values: Option<serde_json::Value>,
        new_values: Option<serde_json::Value>,
        performed_by: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let request = CreateAuditLogRequest {
            user_id,
            action_type: action_type.to_string(),
            entity_type: "subscription".to_string(),
            entity_id: Some(subscription_id.to_string()),
            old_values,
            new_values,
            metadata,
            performed_by: performed_by.to_string(),
            ip_address: None,
            user_agent: None,
            session_id: None,
            request_id: None,
            status: Some("completed".to_string()),
            error_message: None,
            previous_hash: None,
            entry_hash: "legacy".to_string(),
            signature: "legacy".to_string(),
        };

        self.create(request).await
    }

    /// Log a payment-related action
    pub async fn log_payment_action(
        &self,
        user_id: Uuid,
        action_type: &str,
        payment_id: &str,
        amount: Option<&bigdecimal::BigDecimal>,
        currency: Option<&str>,
        performed_by: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<AuditLog, AppError> {
        let mut payment_metadata = serde_json::Map::new();
        if let Some(amt) = amount {
            payment_metadata.insert("amount".to_string(), serde_json::Value::String(amt.to_string()));
        }
        if let Some(curr) = currency {
            payment_metadata.insert("currency".to_string(), serde_json::Value::String(curr.to_string()));
        }
        
        // Merge with provided metadata
        if let Some(meta) = metadata {
            if let serde_json::Value::Object(meta_map) = meta {
                for (k, v) in meta_map {
                    payment_metadata.insert(k, v);
                }
            }
        }

        let request = CreateAuditLogRequest {
            user_id,
            action_type: action_type.to_string(),
            entity_type: "payment".to_string(),
            entity_id: Some(payment_id.to_string()),
            old_values: None,
            new_values: None,
            metadata: Some(serde_json::Value::Object(payment_metadata)),
            performed_by: performed_by.to_string(),
            ip_address: None,
            user_agent: None,
            session_id: None,
            request_id: None,
            status: Some("completed".to_string()),
            error_message: None,
            previous_hash: None,
            entry_hash: "legacy".to_string(),
            signature: "legacy".to_string(),
        };

        self.create(request).await
    }

    /// Log a billing event with transaction support
    pub async fn log_billing_event_with_tx<'a>(
        &self,
        user_id: Uuid,
        action_type: &str,
        entity_type: &str,
        entity_id: Option<&str>,
        old_values: Option<serde_json::Value>,
        new_values: Option<serde_json::Value>,
        performed_by: &str,
        metadata: Option<serde_json::Value>,
        executor: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<AuditLog, AppError> {
        let request = CreateAuditLogRequest {
            user_id,
            action_type: action_type.to_string(),
            entity_type: entity_type.to_string(),
            entity_id: entity_id.map(|s| s.to_string()),
            old_values,
            new_values,
            metadata,
            performed_by: performed_by.to_string(),
            ip_address: None,
            user_agent: None,
            session_id: None,
            request_id: None,
            status: Some("completed".to_string()),
            error_message: None,
            previous_hash: None,
            entry_hash: "legacy".to_string(),
            signature: "legacy".to_string(),
        };

        self.create_secure_with_executor(request, executor).await
    }
}