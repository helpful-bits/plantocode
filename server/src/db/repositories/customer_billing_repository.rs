use crate::error::AppError;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, query, query_as};
use std::sync::Arc;
use uuid::Uuid;

// Customer billing model - simplified for credit-based billing
#[derive(Debug, Clone)]
pub struct CustomerBilling {
    pub id: Uuid,
    pub user_id: Uuid,
    pub stripe_customer_id: Option<String>,
    // Auto top-off settings
    pub auto_top_off_enabled: bool,
    pub auto_top_off_threshold: Option<BigDecimal>,
    pub auto_top_off_amount: Option<BigDecimal>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct CustomerBillingRepository {
    db_pool: PgPool,
}

impl CustomerBillingRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    // Get the database pool reference
    pub fn get_pool(&self) -> &PgPool {
        &self.db_pool
    }

    // Create a new customer billing record - simplified for credit-based billing
    pub async fn create(
        &self,
        user_id: &Uuid,
        stripe_customer_id: Option<&str>,
    ) -> Result<Uuid, AppError> {
        let mut tx = self
            .db_pool
            .begin()
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self
            .create_with_executor(user_id, stripe_customer_id, &mut tx)
            .await?;
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    // Create a new customer billing record with custom executor - simplified for credit-based billing
    pub async fn create_with_executor(
        &self,
        user_id: &Uuid,
        stripe_customer_id: Option<&str>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Uuid, AppError> {
        let id = Uuid::new_v4();

        query!(
            r#"
            INSERT INTO customer_billing 
            (id, user_id, stripe_customer_id, auto_top_off_enabled, created_at, updated_at)
            VALUES 
            ($1, $2, $3, false, now(), now())
            "#,
            id,
            user_id,
            stripe_customer_id,
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| {
            AppError::Database(format!("Failed to create customer billing record: {}", e))
        })?;

        Ok(id)
    }

    // Get customer billing by ID
    pub async fn get_by_id(&self, id: &Uuid) -> Result<Option<CustomerBilling>, AppError> {
        let record = query_as!(
            CustomerBilling,
            r#"
            SELECT id, user_id, stripe_customer_id,
                   auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount,
                   created_at, updated_at
            FROM customer_billing
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| {
            AppError::Database(format!("Failed to fetch customer billing record: {}", e))
        })?;

        Ok(record)
    }

    // Get customer billing by ID with custom executor
    pub async fn get_by_id_with_executor(
        &self,
        id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Option<CustomerBilling>, AppError> {
        let record = query_as!(
            CustomerBilling,
            r#"
            SELECT id, user_id, stripe_customer_id,
                   auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount,
                   created_at, updated_at
            FROM customer_billing
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| {
            AppError::Database(format!("Failed to fetch customer billing record: {}", e))
        })?;

        Ok(record)
    }

    /// Load CustomerBilling for a user by starting a new transaction on this
    /// repository's pool and explicitly setting `app.current_user_id` for RLS.
    ///
    /// IMPORTANT:
    /// - This is intended for normal user-facing flows using the user_pool
    ///   under RLS (e.g. dashboards, billing pages).
    /// - It opens its own transaction and manipulates RLS context via
    ///   `set_config('app.current_user_id', ...)`.
    /// - It is NOT suitable for privileged, system-level operations such as
    ///   account deletion. For those, prefer:
    ///     - a system-pool query (using db_pools.system_pool) with explicit
    ///       WHERE user_id = $1 filters, or
    ///     - the `get_by_user_id_with_executor` variant using a
    ///       system-level transaction that does not rely on RLS.
    pub async fn get_by_user_id(
        &self,
        user_id: &Uuid,
    ) -> Result<Option<CustomerBilling>, AppError> {
        let mut tx = self
            .db_pool
            .begin()
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        let result = self.get_by_user_id_with_executor(user_id, &mut tx).await?;
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    /// Like `get_by_user_id`, but uses an existing transaction as executor.
    ///
    /// - This function does NOT set `app.current_user_id` itself; it assumes
    ///   the caller has already established any required RLS or is using a
    ///   system-level transaction where RLS is not needed.
    /// - Suitable for system-pool transactions in privileged flows, provided
    ///   queries use explicit user_id filters.
    pub async fn get_by_user_id_with_executor(
        &self,
        user_id: &Uuid,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Option<CustomerBilling>, AppError> {
        let record = query_as!(
            CustomerBilling,
            r#"
            SELECT id, user_id, stripe_customer_id,
                   auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount,
                   created_at, updated_at
            FROM customer_billing
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            "#,
            user_id
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| {
            AppError::Database(format!(
                "Failed to fetch user customer billing record: {}",
                e
            ))
        })?;

        Ok(record)
    }

    // Update auto top-off settings
    pub async fn update_auto_top_off_settings(
        &self,
        user_id: &Uuid,
        enabled: bool,
        threshold: Option<BigDecimal>,
        amount: Option<BigDecimal>,
    ) -> Result<(), AppError> {
        query!(
            r#"
            INSERT INTO customer_billing 
            (id, user_id, stripe_customer_id, auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount, created_at, updated_at)
            VALUES 
            (gen_random_uuid(), $1, NULL, $2, $3, $4, now(), now())
            ON CONFLICT (user_id) DO UPDATE
            SET auto_top_off_enabled = EXCLUDED.auto_top_off_enabled,
                auto_top_off_threshold = EXCLUDED.auto_top_off_threshold,
                auto_top_off_amount = EXCLUDED.auto_top_off_amount,
                updated_at = now()
            "#,
            user_id,
            enabled,
            threshold,
            amount
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update auto top-off settings: {}", e)))?;

        Ok(())
    }

    // Set stripe customer ID with custom executor
    pub async fn set_stripe_customer_id_with_executor(
        &self,
        id: &Uuid,
        stripe_customer_id: &str,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError> {
        let result = query!(
            r#"
            UPDATE customer_billing 
            SET stripe_customer_id = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            "#,
            stripe_customer_id,
            id
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to set stripe customer id: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(
                "Customer billing record not found to update stripe customer id".to_string(),
            ));
        }

        Ok(())
    }

    // Upsert stripe customer ID with custom executor
    pub async fn upsert_stripe_customer_id_with_executor(
        &self,
        user_id: &Uuid,
        stripe_customer_id: &str,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError> {
        query!(
            r#"
            INSERT INTO customer_billing 
            (id, user_id, stripe_customer_id, auto_top_off_enabled, created_at, updated_at)
            VALUES 
            (gen_random_uuid(), $1, $2, false, now(), now())
            ON CONFLICT (user_id) DO UPDATE
            SET stripe_customer_id = EXCLUDED.stripe_customer_id,
                updated_at = now()
            "#,
            user_id,
            stripe_customer_id
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to upsert stripe customer id: {}", e)))?;

        Ok(())
    }
}
