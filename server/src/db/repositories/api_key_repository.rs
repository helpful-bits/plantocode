use crate::error::AppError;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, query, query_as};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ApiKey {
    pub id: Uuid,
    pub user_id: Uuid,
    pub key_hash: String,
    pub label: Option<String>,
    pub role_override: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub request_count: i64,
}

pub struct ApiKeyRepository {
    db_pool: PgPool,
}

impl ApiKeyRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    /// Create a new API key
    /// SECURITY WARNING: This method bypasses RLS - only use with system pool (plantocode role)
    pub async fn create_key(
        &self,
        user_id: &Uuid,
        key_hash: &str,
        label: Option<&str>,
        role_override: Option<&str>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<Uuid, AppError> {
        let id = Uuid::new_v4();

        query!(
            r#"
            INSERT INTO api_keys (id, user_id, key_hash, label, role_override, created_at, expires_at, request_count)
            VALUES ($1, $2, $3, $4, $5, now(), $6, 0)
            "#,
            id,
            user_id,
            key_hash,
            label,
            role_override,
            expires_at
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create API key: {}", e)))?;

        Ok(id)
    }

    /// Find an active API key by its hash
    /// SECURITY WARNING: This method bypasses RLS - only use with system pool (plantocode role)
    /// Enforces NOT revoked AND NOT expired
    pub async fn find_active_by_hash(&self, key_hash: &str) -> Result<Option<ApiKey>, AppError> {
        let api_key = query_as!(
            ApiKey,
            r#"
            SELECT id, user_id, key_hash, label, role_override, created_at, last_used_at, revoked_at, expires_at, request_count
            FROM api_keys
            WHERE key_hash = $1
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > now())
            "#,
            key_hash
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| {
            log::error!("Database error finding API key: {}", e);
            AppError::Database(format!("Failed to fetch API key: {}", e))
        })?;

        Ok(api_key)
    }

    /// Revoke an API key
    /// SECURITY WARNING: This method bypasses RLS - only use with system pool (plantocode role)
    pub async fn revoke_key(&self, id: &Uuid) -> Result<(), AppError> {
        let result = query!(
            r#"
            UPDATE api_keys
            SET revoked_at = now()
            WHERE id = $1
              AND revoked_at IS NULL
            "#,
            id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to revoke API key: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("API key not found or already revoked: {}", id)));
        }

        Ok(())
    }

    /// Update last_used_at and increment request_count
    /// SECURITY WARNING: This method bypasses RLS - only use with system pool (plantocode role)
    pub async fn touch_usage(&self, id: &Uuid) -> Result<(), AppError> {
        query!(
            r#"
            UPDATE api_keys
            SET last_used_at = now(),
                request_count = request_count + 1
            WHERE id = $1
            "#,
            id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update API key usage: {}", e)))?;

        Ok(())
    }

    /// List all API keys for a user
    /// SECURITY WARNING: This method bypasses RLS - only use with system pool (plantocode role)
    pub async fn list_for_user(&self, user_id: &Uuid) -> Result<Vec<ApiKey>, AppError> {
        let api_keys = query_as!(
            ApiKey,
            r#"
            SELECT id, user_id, key_hash, label, role_override, created_at, last_used_at, revoked_at, expires_at, request_count
            FROM api_keys
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to list API keys: {}", e)))?;

        Ok(api_keys)
    }
}
