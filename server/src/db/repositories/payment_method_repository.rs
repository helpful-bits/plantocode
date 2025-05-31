use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc, Datelike};
use serde::{Deserialize, Serialize};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentMethod {
    pub id: String, // Stripe payment method ID
    pub user_id: Uuid,
    pub stripe_customer_id: String,
    pub r#type: String, // 'type' is a Rust keyword, so we use r#type
    pub card_brand: Option<String>,
    pub card_last_four: Option<String>,
    pub card_exp_month: Option<i32>,
    pub card_exp_year: Option<i32>,
    pub card_country: Option<String>,
    pub card_funding: Option<String>,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
        let updated_payment_method = sqlx::query_as!(
            PaymentMethod,
            r#"
            INSERT INTO payment_methods (
                id, user_id, stripe_customer_id, type, card_brand,
                card_last_four, card_exp_month, card_exp_year, card_country,
                card_funding, is_default, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                card_brand = EXCLUDED.card_brand,
                card_last_four = EXCLUDED.card_last_four,
                card_exp_month = EXCLUDED.card_exp_month,
                card_exp_year = EXCLUDED.card_exp_year,
                card_country = EXCLUDED.card_country,
                card_funding = EXCLUDED.card_funding,
                is_default = EXCLUDED.is_default,
                updated_at = NOW()
            RETURNING id, user_id, stripe_customer_id, type as "type", card_brand,
                      card_last_four, card_exp_month, card_exp_year, card_country,
                      card_funding, is_default, created_at, updated_at
            "#,
            payment_method.id,
            payment_method.user_id,
            payment_method.stripe_customer_id,
            payment_method.r#type,
            payment_method.card_brand,
            payment_method.card_last_four,
            payment_method.card_exp_month,
            payment_method.card_exp_year,
            payment_method.card_country,
            payment_method.card_funding,
            payment_method.is_default,
            payment_method.created_at,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create/update payment method: {}", e)))?;

        Ok(updated_payment_method)
    }

    /// Get payment method by Stripe payment method ID
    pub async fn get_by_id(&self, payment_method_id: &str) -> Result<Option<PaymentMethod>, AppError> {
        let payment_method = sqlx::query_as!(
            PaymentMethod,
            r#"SELECT id, user_id, stripe_customer_id, type as "type", card_brand,
                      card_last_four, card_exp_month, card_exp_year, card_country,
                      card_funding, is_default, created_at, updated_at 
               FROM payment_methods WHERE id = $1"#,
            payment_method_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get payment method: {}", e)))?;

        Ok(payment_method)
    }

    /// Get payment methods for a user
    pub async fn get_by_user_id(&self, user_id: &Uuid) -> Result<Vec<PaymentMethod>, AppError> {
        let payment_methods = sqlx::query_as!(
            PaymentMethod,
            r#"
            SELECT id, user_id, stripe_customer_id, type as "type", card_brand,
                   card_last_four, card_exp_month, card_exp_year, card_country,
                   card_funding, is_default, created_at, updated_at
            FROM payment_methods 
            WHERE user_id = $1 
            ORDER BY is_default DESC, created_at DESC
            "#,
            user_id
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user payment methods: {}", e)))?;

        Ok(payment_methods)
    }

    /// Get payment methods by Stripe customer ID
    pub async fn get_by_stripe_customer_id(&self, stripe_customer_id: &str) -> Result<Vec<PaymentMethod>, AppError> {
        let payment_methods = sqlx::query_as!(
            PaymentMethod,
            r#"
            SELECT id, user_id, stripe_customer_id, type as "type", card_brand,
                   card_last_four, card_exp_month, card_exp_year, card_country,
                   card_funding, is_default, created_at, updated_at
            FROM payment_methods 
            WHERE stripe_customer_id = $1 
            ORDER BY is_default DESC, created_at DESC
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
            SELECT id, user_id, stripe_customer_id, type as "type", card_brand,
                   card_last_four, card_exp_month, card_exp_year, card_country,
                   card_funding, is_default, created_at, updated_at
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
        sqlx::query!(
            "DELETE FROM payment_methods WHERE id = $1 AND user_id = $2",
            payment_method_id,
            user_id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to delete payment method: {}", e)))?;

        Ok(())
    }

    /// Update payment method details
    pub async fn update_details(
        &self,
        payment_method_id: &str,
        card_exp_month: Option<i32>,
        card_exp_year: Option<i32>,
    ) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE payment_methods 
            SET card_exp_month = $2, card_exp_year = $3, updated_at = NOW()
            WHERE id = $1
            "#,
            payment_method_id,
            card_exp_month,
            card_exp_year
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update payment method details: {}", e)))?;

        Ok(())
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

    /// Get payment methods that are about to expire (within 30 days)
    pub async fn get_expiring_soon(&self) -> Result<Vec<PaymentMethod>, AppError> {
        let now = Utc::now();
        let current_year = now.year();
        let current_month = now.month() as i32;
        
        // Calculate 30 days from now
        let future_date = now + chrono::Duration::days(30);
        let future_year = future_date.year();
        let future_month = future_date.month() as i32;

        let payment_methods = sqlx::query_as!(
            PaymentMethod,
            r#"
            SELECT id, user_id, stripe_customer_id, type as "type", card_brand,
                   card_last_four, card_exp_month, card_exp_year, card_country,
                   card_funding, is_default, created_at, updated_at
            FROM payment_methods 
            WHERE type = 'card'
            AND (
                (card_exp_year = $1 AND card_exp_month <= $2) OR
                (card_exp_year = $3 AND card_exp_month <= $4 AND $1 != $3)
            )
            ORDER BY card_exp_year ASC, card_exp_month ASC
            "#,
            current_year,
            current_month,
            future_year,
            future_month
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get expiring payment methods: {}", e)))?;

        Ok(payment_methods)
    }
}