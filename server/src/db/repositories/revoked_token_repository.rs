use crate::error::AppError;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, query, query_as};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct RevokedToken {
    pub jti: Uuid,
    pub user_id: Uuid,
    pub revoked_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

pub struct RevokedTokenRepository {
    db_pool: PgPool,
}

impl RevokedTokenRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    /// Revoke a token by its JTI
    pub async fn revoke(
        &self,
        jti: &str,
        user_id: &Uuid,
        expires_at: DateTime<Utc>,
    ) -> Result<(), AppError> {
        let jti_uuid = Uuid::parse_str(jti)
            .map_err(|_| AppError::InvalidArgument("Invalid JTI format".to_string()))?;

        query!(
            r#"
            INSERT INTO revoked_tokens (jti, user_id, revoked_at, expires_at)
            VALUES ($1, $2, now(), $3)
            ON CONFLICT (jti) DO NOTHING
            "#,
            jti_uuid,
            user_id,
            expires_at
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to revoke token: {}", e)))?;

        Ok(())
    }

    /// Check if a token is revoked
    pub async fn is_revoked(&self, jti: &str) -> Result<bool, AppError> {
        let jti_uuid = Uuid::parse_str(jti)
            .map_err(|_| AppError::InvalidArgument("Invalid JTI format".to_string()))?;

        let result = query!(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM revoked_tokens 
                WHERE jti = $1 AND expires_at > now()
            ) as is_revoked
            "#,
            jti_uuid
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to check token revocation: {}", e)))?;

        Ok(result.is_revoked.unwrap_or(false))
    }

    /// Clean up expired revoked tokens
    pub async fn cleanup_expired(&self) -> Result<u64, AppError> {
        let result = query!(
            r#"
            DELETE FROM revoked_tokens 
            WHERE expires_at <= now()
            "#,
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to cleanup expired tokens: {}", e)))?;

        Ok(result.rows_affected())
    }

    /// Get all revoked tokens for a user
    pub async fn get_user_revoked_tokens(
        &self,
        user_id: &Uuid,
    ) -> Result<Vec<RevokedToken>, AppError> {
        let tokens = query_as!(
            RevokedToken,
            r#"
            SELECT jti, user_id, revoked_at, expires_at
            FROM revoked_tokens
            WHERE user_id = $1 AND expires_at > now()
            ORDER BY revoked_at DESC
            "#,
            user_id
        )
        .fetch_all(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch user revoked tokens: {}", e)))?;

        Ok(tokens)
    }
}
