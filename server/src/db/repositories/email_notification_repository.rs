use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailNotification {
    pub id: Uuid,
    pub user_id: Uuid,
    pub email_address: String,
    pub notification_type: String,
    pub subject: String,
    pub template_name: String,
    pub template_data: JsonValue,
    pub status: String, // pending, sent, failed, retrying
    pub attempts: i32,
    pub max_attempts: i32,
    pub last_attempt_at: Option<DateTime<Utc>>,
    pub sent_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub priority: i32, // 1=high, 2=medium, 3=low
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct EmailNotificationRepository {
    pool: PgPool,
}

impl EmailNotificationRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }

    /// Create a new email notification
    pub async fn create(&self, notification: &EmailNotification) -> Result<EmailNotification, AppError> {
        let created_notification = sqlx::query_as!(
            EmailNotification,
            r#"
            INSERT INTO email_notifications (
                id, user_id, email_address, notification_type, subject,
                template_name, template_data, status, attempts, max_attempts,
                priority, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
            )
            RETURNING *
            "#,
            notification.id,
            notification.user_id,
            notification.email_address,
            notification.notification_type,
            notification.subject,
            notification.template_name,
            notification.template_data,
            notification.status,
            notification.attempts,
            notification.max_attempts,
            notification.priority,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create email notification: {}", e)))?;

        Ok(created_notification)
    }

    /// Get pending notifications for processing (ordered by priority and creation time)
    pub async fn get_pending(&self, limit: i32) -> Result<Vec<EmailNotification>, AppError> {
        let notifications = sqlx::query_as!(
            EmailNotification,
            r#"
            SELECT * FROM email_notifications 
            WHERE status = 'pending' AND attempts < max_attempts
            ORDER BY priority ASC, created_at ASC
            LIMIT $1
            "#,
            limit as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get pending notifications: {}", e)))?;

        Ok(notifications)
    }

    /// Get failed notifications that can be retried
    pub async fn get_retryable(&self, limit: i32) -> Result<Vec<EmailNotification>, AppError> {
        let retry_after = Utc::now() - chrono::Duration::minutes(30); // Retry after 30 minutes

        let notifications = sqlx::query_as!(
            EmailNotification,
            r#"
            SELECT * FROM email_notifications 
            WHERE status = 'failed' 
            AND attempts < max_attempts
            AND (last_attempt_at IS NULL OR last_attempt_at < $1)
            ORDER BY priority ASC, created_at ASC
            LIMIT $2
            "#,
            retry_after,
            limit as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get retryable notifications: {}", e)))?;

        Ok(notifications)
    }

    /// Mark notification as being processed (increment attempts)
    pub async fn mark_processing(&self, notification_id: &Uuid) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE email_notifications 
            SET status = 'retrying', attempts = attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
            WHERE id = $1
            "#,
            notification_id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark notification as processing: {}", e)))?;

        Ok(())
    }

    /// Mark notification as sent successfully
    pub async fn mark_sent(&self, notification_id: &Uuid) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE email_notifications 
            SET status = 'sent', sent_at = NOW(), updated_at = NOW()
            WHERE id = $1
            "#,
            notification_id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark notification as sent: {}", e)))?;

        Ok(())
    }

    /// Mark notification as failed with error message
    pub async fn mark_failed(&self, notification_id: &Uuid, error_message: &str) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE email_notifications 
            SET status = 'failed', error_message = $2, updated_at = NOW()
            WHERE id = $1
            "#,
            notification_id,
            error_message
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark notification as failed: {}", e)))?;

        Ok(())
    }

    /// Get notification by ID
    pub async fn get_by_id(&self, notification_id: &Uuid) -> Result<Option<EmailNotification>, AppError> {
        let notification = sqlx::query_as!(
            EmailNotification,
            "SELECT * FROM email_notifications WHERE id = $1",
            notification_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get notification: {}", e)))?;

        Ok(notification)
    }

    /// Get notifications for a user with pagination
    pub async fn get_by_user_id(
        &self,
        user_id: &Uuid,
        limit: i32,
        offset: i32,
    ) -> Result<Vec<EmailNotification>, AppError> {
        let notifications = sqlx::query_as!(
            EmailNotification,
            r#"
            SELECT * FROM email_notifications 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit as i64,
            offset as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user notifications: {}", e)))?;

        Ok(notifications)
    }

    /// Get notification count by status
    pub async fn count_by_status(&self, status: &str) -> Result<i64, AppError> {
        let count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM email_notifications WHERE status = $1",
            status
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count notifications by status: {}", e)))?;

        Ok(count.unwrap_or(0))
    }

    /// Delete old processed notifications (cleanup job)
    pub async fn cleanup_old_notifications(&self, older_than_days: i32) -> Result<i64, AppError> {
        let cutoff_date = Utc::now() - chrono::Duration::days(older_than_days as i64);

        let result = sqlx::query!(
            r#"
            DELETE FROM email_notifications 
            WHERE status IN ('sent', 'failed') 
            AND attempts >= max_attempts 
            AND created_at < $1
            "#,
            cutoff_date
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to cleanup old notifications: {}", e)))?;

        Ok(result.rows_affected() as i64)
    }

    /// Check if there's a recent notification of the same type for a user (prevent spam)
    pub async fn has_recent_notification(
        &self,
        user_id: &Uuid,
        notification_type: &str,
        within_hours: i32,
    ) -> Result<bool, AppError> {
        let cutoff_date = Utc::now() - chrono::Duration::hours(within_hours as i64);

        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) FROM email_notifications 
            WHERE user_id = $1 
            AND notification_type = $2 
            AND created_at > $3
            "#,
            user_id,
            notification_type,
            cutoff_date
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to check recent notifications: {}", e)))?;

        Ok(count.unwrap_or(0) > 0)
    }

    /// Get statistics about email notifications
    pub async fn get_stats(&self) -> Result<EmailNotificationStats, AppError> {
        #[derive(Debug)]
        struct StatsRow {
            status: String,
            count: i64,
        }

        let stats_rows = sqlx::query_as!(
            StatsRow,
            r#"
            SELECT status, COUNT(*) as "count!" FROM email_notifications 
            GROUP BY status
            "#
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get notification stats: {}", e)))?;

        let mut stats = EmailNotificationStats::default();
        for row in stats_rows {
            match row.status.as_str() {
                "pending" => stats.pending = row.count,
                "sent" => stats.sent = row.count,
                "failed" => stats.failed = row.count,
                "retrying" => stats.retrying = row.count,
                _ => {}
            }
        }

        Ok(stats)
    }
}

#[derive(Debug, Default, Serialize)]
pub struct EmailNotificationStats {
    pub pending: i64,
    pub sent: i64,
    pub failed: i64,
    pub retrying: i64,
}