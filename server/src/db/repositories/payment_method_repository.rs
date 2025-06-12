use sqlx::PgPool;
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentMethod {
    pub id: String, // Stripe payment method ID
    pub user_id: Uuid,
    pub stripe_customer_id: String,
    pub card_brand: Option<String>,
    pub card_last_four: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone)]
pub struct PaymentMethodRepository {
    pool: PgPool,
}

impl PaymentMethodRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }

    /// Create or update a payment method from Stripe webhook data
    pub async fn create_or_update(&self, payment_method: &PaymentMethod) -> Result<PaymentMethod, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.create_or_update_with_executor(payment_method, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    /// Create or update a payment method from Stripe webhook data with custom executor
    pub async fn create_or_update_with_executor(&self, payment_method: &PaymentMethod, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<PaymentMethod, AppError>
    {
        let updated_payment_method = sqlx::query_as!(
            PaymentMethod,
            r#"
            INSERT INTO payment_methods (
                id, user_id, stripe_customer_id, card_brand,
                card_last_four, is_default
            ) VALUES (
                $1, $2, $3, $4, $5, $6
            )
            ON CONFLICT (id) DO UPDATE SET
                card_brand = EXCLUDED.card_brand,
                card_last_four = EXCLUDED.card_last_four,
                is_default = EXCLUDED.is_default
            RETURNING id, user_id, stripe_customer_id, card_brand,
                      card_last_four, is_default
            "#,
            payment_method.id,
            payment_method.user_id,
            payment_method.stripe_customer_id,
            payment_method.card_brand,
            payment_method.card_last_four,
            payment_method.is_default,
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create/update payment method: {}", e)))?;

        Ok(updated_payment_method)
    }

    /// Get payment method by Stripe payment method ID
    pub async fn get_by_id(&self, payment_method_id: &str) -> Result<Option<PaymentMethod>, AppError> {
        let payment_method = sqlx::query_as!(
            PaymentMethod,
            r#"SELECT id, user_id, stripe_customer_id, card_brand,
                      card_last_four, is_default
               FROM payment_methods WHERE id = $1"#,
            payment_method_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get payment method: {}", e)))?;

        Ok(payment_method)
    }

    /// Get payment methods for a user
    pub async fn get_by_user_id(&self, user_id: &Uuid, limit: i32, offset: i32) -> Result<Vec<PaymentMethod>, AppError> {
        let payment_methods = sqlx::query_as!(
            PaymentMethod,
            r#"
            SELECT id, user_id, stripe_customer_id, card_brand,
                   card_last_four, is_default
            FROM payment_methods 
            WHERE user_id = $1 
            ORDER BY is_default DESC, id DESC
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit as i64,
            offset as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user payment methods: {}", e)))?;

        Ok(payment_methods)
    }

    /// Count payment methods for a user
    pub async fn count_by_user_id(&self, user_id: &Uuid) -> Result<i64, AppError> {
        let count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM payment_methods WHERE user_id = $1",
            user_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count user payment methods: {}", e)))?;
        Ok(count.unwrap_or(0))
    }

    /// Get payment methods by Stripe customer ID
    pub async fn get_by_stripe_customer_id(&self, stripe_customer_id: &str) -> Result<Vec<PaymentMethod>, AppError> {
        let payment_methods = sqlx::query_as!(
            PaymentMethod,
            r#"
            SELECT id, user_id, stripe_customer_id, card_brand,
                   card_last_four, is_default
            FROM payment_methods 
            WHERE stripe_customer_id = $1 
            ORDER BY is_default DESC, id DESC
            "#,
            stripe_customer_id
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get customer payment methods: {}", e)))?;

        Ok(payment_methods)
    }

    /// Get default payment method for a user
    pub async fn get_default_by_user_id(&self, user_id: &Uuid) -> Result<Option<PaymentMethod>, AppError> {
        let payment_method = sqlx::query_as!(
            PaymentMethod,
            r#"
            SELECT id, user_id, stripe_customer_id, card_brand,
                   card_last_four, is_default
            FROM payment_methods 
            WHERE user_id = $1 AND is_default = true
            "#,
            user_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get default payment method: {}", e)))?;

        Ok(payment_method)
    }

    /// Set payment method as default for a user
    pub async fn set_as_default(&self, payment_method_id: &str, user_id: &Uuid) -> Result<(), AppError> {
        // Start a transaction to ensure consistency
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to start transaction: {}", e)))?;

        // Remove default flag from all user's payment methods
        sqlx::query!(
            "UPDATE payment_methods SET is_default = false WHERE user_id = $1",
            user_id
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to clear default flags: {}", e)))?;

        // Set the specified payment method as default
        sqlx::query!(
            "UPDATE payment_methods SET is_default = true WHERE id = $1 AND user_id = $2",
            payment_method_id,
            user_id
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to set default payment method: {}", e)))?;

        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        Ok(())
    }

    /// Delete a payment method
    pub async fn delete(&self, payment_method_id: &str, user_id: &Uuid) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        self.delete_with_executor(payment_method_id, user_id, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(())
    }

    /// Delete a payment method with custom executor
    pub async fn delete_with_executor(&self, payment_method_id: &str, user_id: &Uuid, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError>
    {
        sqlx::query!(
            "DELETE FROM payment_methods WHERE id = $1 AND user_id = $2",
            payment_method_id,
            user_id
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to delete payment method: {}", e)))?;

        Ok(())
    }

    /// Check if user has a default payment method
    pub async fn has_default_payment_method(&self, user_id: &Uuid) -> Result<bool, AppError> {
        let count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM payment_methods WHERE user_id = $1 AND is_default = true",
            user_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to check default payment method: {}", e)))?;

        Ok(count.unwrap_or(0) > 0)
    }

    /// Check if user has any payment methods
    pub async fn has_payment_methods(&self, user_id: &Uuid) -> Result<bool, AppError> {
        let count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM payment_methods WHERE user_id = $1",
            user_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count payment methods: {}", e)))?;

        Ok(count.unwrap_or(0) > 0)
    }

}