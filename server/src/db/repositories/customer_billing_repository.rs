use uuid::Uuid;
use sqlx::{PgPool, query, query_as};
use chrono::{DateTime, Utc};
use bigdecimal::BigDecimal;
use crate::error::AppError;
use std::sync::Arc;

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
        let mut tx = self.db_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.create_with_executor(
            user_id,
            stripe_customer_id,
            &mut tx,
        ).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    // Create a new customer billing record with custom executor - simplified for credit-based billing
    pub async fn create_with_executor(
        &self,
        user_id: &Uuid,
        stripe_customer_id: Option<&str>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Uuid, AppError>
    {
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
        .map_err(|e| AppError::Database(format!("Failed to create customer billing record: {}", e)))?;

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
        .map_err(|e| AppError::Database(format!("Failed to fetch customer billing record: {}", e)))?;

        Ok(record)
    }

    // Get customer billing by ID with custom executor
    pub async fn get_by_id_with_executor(&self, id: &Uuid, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Option<CustomerBilling>, AppError> {
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
        .map_err(|e| AppError::Database(format!("Failed to fetch customer billing record: {}", e)))?;

        Ok(record)
    }

    // Get customer billing by user ID
    pub async fn get_by_user_id(&self, user_id: &Uuid) -> Result<Option<CustomerBilling>, AppError> {
        let mut tx = self.db_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.get_by_user_id_with_executor(user_id, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    // Get customer billing by user ID with custom executor
    pub async fn get_by_user_id_with_executor(&self, user_id: &Uuid, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Option<CustomerBilling>, AppError>
    {
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
        .map_err(|e| AppError::Database(format!("Failed to fetch user customer billing record: {}", e)))?;

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
        let result = query!(
            r#"
            UPDATE customer_billing 
            SET auto_top_off_enabled = $1,
                auto_top_off_threshold = $2,
                auto_top_off_amount = $3,
                updated_at = now()
            WHERE user_id = $4
            "#,
            enabled,
            threshold,
            amount,
            user_id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update auto top-off settings: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::Database("Customer billing record not found for update".to_string()));
        }

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
            return Err(AppError::NotFound("Customer billing record not found to update stripe customer id".to_string()));
        }

        Ok(())
    }
}