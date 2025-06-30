use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::error::AppError;

/// Enhanced webhook idempotency record with locking, retries, and detailed status tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookIdempotencyRecord {
    pub id: Uuid,
    pub webhook_event_id: String,
    pub webhook_type: String,
    pub event_type: String,
    
    // Processing status and lifecycle
    pub status: String,
    pub processing_result: Option<String>,
    pub processed_at: Option<DateTime<Utc>>,
    
    // Locking mechanism for concurrent webhook handling
    pub locked_at: Option<DateTime<Utc>>,
    pub locked_by: Option<String>,
    pub lock_expires_at: Option<DateTime<Utc>>,
    
    // Retry mechanism for failed webhooks
    pub retry_count: i32,
    pub max_retries: i32,
    pub next_retry_at: Option<DateTime<Utc>>,
    
    // Error tracking and debugging
    pub error_message: Option<String>,
    pub error_details: Option<serde_json::Value>,
    pub last_error_at: Option<DateTime<Utc>>,
    
    // Webhook payload and metadata
    pub webhook_payload: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    
    // Audit and timing
    pub first_seen_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    
    // Performance and monitoring
    pub processing_duration_ms: Option<i32>,
    pub payload_size_bytes: Option<i32>,
}

#[derive(Debug)]
pub struct WebhookIdempotencyRepository {
    pool: PgPool,
}

impl WebhookIdempotencyRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Acquire a lock on a webhook event ID for processing
    /// Returns the full WebhookIdempotencyRecord or an error if the lock cannot be acquired
    pub async fn acquire_webhook_lock(
        &self,
        webhook_event_id: &str,
        webhook_type: &str,
        event_type: &str,
        locked_by: &str,
        lock_duration_minutes: i32,
        metadata: Option<serde_json::Value>,
    ) -> Result<WebhookIdempotencyRecord, AppError> {
        let record_id = Uuid::new_v4();
        let lock_expires_at = Utc::now() + chrono::Duration::minutes(lock_duration_minutes as i64);
        
        // Attempt to insert a new record or acquire lock on existing record
        let result = sqlx::query_as!(
            WebhookIdempotencyRecord,
            r#"
            WITH webhook_lock AS (
                INSERT INTO webhook_idempotency (
                    id, webhook_event_id, webhook_type, event_type,
                    status, locked_at, locked_by, lock_expires_at, 
                    retry_count, max_retries, metadata, created_at, updated_at, first_seen_at
                ) VALUES (
                    $1, $2, $3, $4, 'processing', NOW(), $5, $6, 0, 3, $7, NOW(), NOW(), NOW()
                )
                ON CONFLICT (webhook_event_id) DO UPDATE SET
                    locked_at = CASE 
                        WHEN webhook_idempotency.status = 'completed' 
                        THEN webhook_idempotency.locked_at
                        WHEN webhook_idempotency.locked_at IS NULL 
                             OR webhook_idempotency.lock_expires_at < NOW() 
                             OR webhook_idempotency.status = 'failed' 
                        THEN NOW()
                        ELSE webhook_idempotency.locked_at
                    END,
                    locked_by = CASE 
                        WHEN webhook_idempotency.status = 'completed' 
                        THEN webhook_idempotency.locked_by
                        WHEN webhook_idempotency.locked_at IS NULL 
                             OR webhook_idempotency.lock_expires_at < NOW() 
                             OR webhook_idempotency.status = 'failed' 
                        THEN $5
                        ELSE webhook_idempotency.locked_by
                    END,
                    lock_expires_at = CASE 
                        WHEN webhook_idempotency.status = 'completed' 
                        THEN webhook_idempotency.lock_expires_at
                        WHEN webhook_idempotency.locked_at IS NULL 
                             OR webhook_idempotency.lock_expires_at < NOW() 
                             OR webhook_idempotency.status = 'failed' 
                        THEN $6
                        ELSE webhook_idempotency.lock_expires_at
                    END,
                    status = CASE 
                        WHEN webhook_idempotency.status = 'completed' 
                        THEN webhook_idempotency.status
                        WHEN webhook_idempotency.locked_at IS NULL 
                             OR webhook_idempotency.lock_expires_at < NOW() 
                             OR webhook_idempotency.status = 'failed' 
                        THEN 'processing'
                        ELSE webhook_idempotency.status
                    END,
                    updated_at = NOW()
                RETURNING *
            )
            SELECT 
                id, webhook_event_id, webhook_type, event_type,
                status, processing_result, processed_at,
                locked_at, locked_by, lock_expires_at,
                retry_count, max_retries, next_retry_at,
                error_message, error_details, last_error_at,
                webhook_payload, metadata,
                first_seen_at, created_at, updated_at,
                processing_duration_ms, payload_size_bytes
            FROM webhook_lock
            "#,
            record_id,
            webhook_event_id,
            webhook_type,
            event_type,
            locked_by,
            lock_expires_at,
            metadata
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to acquire webhook lock: {}", e)))?;

        // Check if the webhook event has already been completed
        if result.status == "completed" {
            return Err(AppError::Database(format!(
                "Webhook event has already been completed"
            )));
        }

        // Check if we successfully acquired the lock
        if result.locked_by.as_ref() == Some(&locked_by.to_string()) && 
           result.status == "processing" {
            Ok(result)
        } else {
            Err(AppError::Database(format!(
                "Failed to acquire lock for webhook {}: already locked by {:?}",
                webhook_event_id,
                result.locked_by
            )))
        }
    }

    /// Mark webhook processing as completed successfully
    pub async fn mark_as_completed(
        &self,
        webhook_event_id: &str,
        result_metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE webhook_idempotency 
            SET status = 'completed',
                processing_result = 'success', 
                processed_at = NOW(),
                locked_at = NULL,
                locked_by = NULL,
                lock_expires_at = NULL,
                metadata = COALESCE($2, metadata),
                updated_at = NOW()
            WHERE webhook_event_id = $1
            "#,
            webhook_event_id,
            result_metadata
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark webhook completed: {}", e)))?;

        Ok(())
    }

    /// Mark webhook processing as failed
    pub async fn mark_as_failed(
        &self,
        webhook_event_id: &str,
        error_message: &str,
        error_metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE webhook_idempotency 
            SET status = 'failed',
                processing_result = 'failure', 
                processed_at = NOW(),
                locked_at = NULL,
                locked_by = NULL,
                lock_expires_at = NULL,
                error_message = $2,
                last_error_at = NOW(),
                metadata = COALESCE($3, metadata),
                updated_at = NOW()
            WHERE webhook_event_id = $1
            "#,
            webhook_event_id,
            error_message,
            error_metadata
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark webhook failed: {}", e)))?;

        Ok(())
    }

    /// Release webhook lock with failure and schedule retry if retries are available
    pub async fn release_webhook_lock_with_failure(
        &self,
        webhook_event_id: &str,
        error_message: &str,
        retry_delay_minutes: i32,
        error_metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        let next_retry_at = Utc::now() + chrono::Duration::minutes(retry_delay_minutes as i64);
        
        // First, get the current retry count to determine if we should retry or fail
        let current_record = self.get_by_event_id(webhook_event_id).await?
            .ok_or_else(|| AppError::Database(format!("Webhook record not found: {}", webhook_event_id)))?;
        
        let new_retry_count = current_record.retry_count + 1;
        let should_retry = new_retry_count < current_record.max_retries;
        
        if should_retry {
            // Schedule retry
            sqlx::query!(
                r#"
                UPDATE webhook_idempotency 
                SET retry_count = $2,
                    next_retry_at = $3,
                    status = 'pending',
                    processing_result = NULL,
                    locked_at = NULL,
                    locked_by = NULL,
                    lock_expires_at = NULL,
                    error_message = $4,
                    last_error_at = NOW(),
                    metadata = COALESCE($5, metadata),
                    updated_at = NOW()
                WHERE webhook_event_id = $1
                "#,
                webhook_event_id,
                new_retry_count,
                next_retry_at,
                error_message,
                error_metadata
            )
        } else {
            // Mark as permanently failed
            sqlx::query!(
                r#"
                UPDATE webhook_idempotency 
                SET retry_count = $2,
                    next_retry_at = NULL,
                    status = 'failed',
                    processing_result = 'failure',
                    locked_at = NULL,
                    locked_by = NULL,
                    lock_expires_at = NULL,
                    error_message = $3,
                    last_error_at = NOW(),
                    metadata = COALESCE($4, metadata),
                    updated_at = NOW()
                WHERE webhook_event_id = $1
                "#,
                webhook_event_id,
                new_retry_count,
                error_message,
                error_metadata
            )
        }
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to release webhook lock with failure: {}", e)))?;

        Ok(())
    }

    /// Get webhook record by event ID
    pub async fn get_by_event_id(&self, webhook_event_id: &str) -> Result<Option<WebhookIdempotencyRecord>, AppError> {
        let result = sqlx::query_as!(
            WebhookIdempotencyRecord,
            r#"
            SELECT 
                id, webhook_event_id, webhook_type, event_type,
                status, processing_result, processed_at,
                locked_at, locked_by, lock_expires_at,
                retry_count, max_retries, next_retry_at,
                error_message, error_details, last_error_at,
                webhook_payload, metadata,
                first_seen_at, created_at, updated_at,
                processing_duration_ms, payload_size_bytes
            FROM webhook_idempotency 
            WHERE webhook_event_id = $1
            "#,
            webhook_event_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get webhook record: {}", e)))?;

        Ok(result)
    }

    /// Get webhooks ready for retry
    pub async fn get_webhooks_ready_for_retry(&self, limit: i32) -> Result<Vec<WebhookIdempotencyRecord>, AppError> {
        let results = sqlx::query_as!(
            WebhookIdempotencyRecord,
            r#"
            SELECT 
                id, webhook_event_id, webhook_type, event_type,
                status, processing_result, processed_at,
                locked_at, locked_by, lock_expires_at,
                retry_count, max_retries, next_retry_at,
                error_message, error_details, last_error_at,
                webhook_payload, metadata,
                first_seen_at, created_at, updated_at,
                processing_duration_ms, payload_size_bytes
            FROM webhook_idempotency 
            WHERE status = 'pending' 
              AND retry_count < max_retries 
              AND next_retry_at <= NOW()
              AND (locked_at IS NULL OR lock_expires_at < NOW())
            ORDER BY next_retry_at ASC
            LIMIT $1
            "#,
            limit as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get webhooks ready for retry: {}", e)))?;

        Ok(results)
    }
}

#[derive(Debug, Serialize)]
pub struct WebhookProcessingStats {
    pub total_events: i64,
    pub successful: i64,
    pub failed: i64,
    pub skipped: i64,
    pub still_processing: i64,
}