use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookIdempotencyRecord {
    pub id: Uuid,
    pub webhook_event_id: String,
    pub webhook_type: String,
    pub event_type: String,
    pub processed_at: DateTime<Utc>,
    pub processing_result: String,
    pub error_message: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct WebhookIdempotencyRepository {
    pool: PgPool,
}

impl WebhookIdempotencyRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Check if a webhook event has already been processed
    pub async fn is_already_processed(&self, webhook_event_id: &str) -> Result<bool, AppError> {
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) FROM webhook_idempotency 
            WHERE webhook_event_id = $1
            "#,
            webhook_event_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to check webhook idempotency: {}", e)))?;

        Ok(count.unwrap_or(0) > 0)
    }

    /// Get existing webhook processing record
    pub async fn get_processing_record(&self, webhook_event_id: &str) -> Result<Option<WebhookIdempotencyRecord>, AppError> {
        let record = sqlx::query_as!(
            WebhookIdempotencyRecord,
            r#"
            SELECT id, webhook_event_id, webhook_type, event_type, processed_at, 
                   processing_result, error_message, metadata, created_at
            FROM webhook_idempotency 
            WHERE webhook_event_id = $1
            "#,
            webhook_event_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get webhook processing record: {}", e)))?;

        Ok(record)
    }

    /// Mark webhook as being processed (creates initial record)
    pub async fn mark_processing_started(
        &self,
        webhook_event_id: &str,
        webhook_type: &str,
        event_type: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<Uuid, AppError> {
        let record_id = Uuid::new_v4();
        
        sqlx::query!(
            r#"
            INSERT INTO webhook_idempotency (
                id, webhook_event_id, webhook_type, event_type, 
                processing_result, metadata, processed_at, created_at
            ) VALUES (
                $1, $2, $3, $4, 'processing', $5, NOW(), NOW()
            )
            "#,
            record_id,
            webhook_event_id,
            webhook_type,
            event_type,
            metadata
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark webhook processing started: {}", e)))?;

        Ok(record_id)
    }

    /// Mark webhook processing as completed successfully
    pub async fn mark_processing_completed(
        &self,
        webhook_event_id: &str,
        result_metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE webhook_idempotency 
            SET processing_result = 'success', 
                processed_at = NOW(),
                metadata = COALESCE($2, metadata)
            WHERE webhook_event_id = $1
            "#,
            webhook_event_id,
            result_metadata
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark webhook processing completed: {}", e)))?;

        Ok(())
    }

    /// Mark webhook processing as failed
    pub async fn mark_processing_failed(
        &self,
        webhook_event_id: &str,
        error_message: &str,
        error_metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE webhook_idempotency 
            SET processing_result = 'failure', 
                processed_at = NOW(),
                error_message = $2,
                metadata = COALESCE($3, metadata)
            WHERE webhook_event_id = $1
            "#,
            webhook_event_id,
            error_message,
            error_metadata
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark webhook processing failed: {}", e)))?;

        Ok(())
    }

    /// Mark webhook as skipped (already processed or not relevant)
    pub async fn mark_processing_skipped(
        &self,
        webhook_event_id: &str,
        reason: &str,
    ) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE webhook_idempotency 
            SET processing_result = 'skipped', 
                processed_at = NOW(),
                error_message = $2
            WHERE webhook_event_id = $1
            "#,
            webhook_event_id,
            reason
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark webhook processing skipped: {}", e)))?;

        Ok(())
    }

    /// Cleanup old webhook records (older than specified days)
    pub async fn cleanup_old_records(&self, days_to_keep: i32) -> Result<u64, AppError> {
        let rows_affected = sqlx::query!(
            r#"
            DELETE FROM webhook_idempotency 
            WHERE created_at < NOW() - INTERVAL '1 day' * $1
            "#,
            days_to_keep as f64
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to cleanup old webhook records: {}", e)))?
        .rows_affected();

        Ok(rows_affected)
    }

    /// Get webhook processing statistics
    pub async fn get_processing_stats(&self, days_back: i32) -> Result<WebhookProcessingStats, AppError> {
        let stats = sqlx::query!(
            r#"
            SELECT 
                COUNT(*) as total_events,
                COUNT(CASE WHEN processing_result = 'success' THEN 1 END) as successful,
                COUNT(CASE WHEN processing_result = 'failure' THEN 1 END) as failed,
                COUNT(CASE WHEN processing_result = 'skipped' THEN 1 END) as skipped,
                COUNT(CASE WHEN processing_result = 'processing' THEN 1 END) as still_processing
            FROM webhook_idempotency 
            WHERE created_at > NOW() - INTERVAL '1 day' * $1
            "#,
            days_back as f64
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get webhook processing stats: {}", e)))?;

        Ok(WebhookProcessingStats {
            total_events: stats.total_events.unwrap_or(0),
            successful: stats.successful.unwrap_or(0),
            failed: stats.failed.unwrap_or(0),
            skipped: stats.skipped.unwrap_or(0),
            still_processing: stats.still_processing.unwrap_or(0),
        })
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