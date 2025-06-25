use uuid::Uuid;
use sqlx::{PgPool, query, query_as};
use chrono::{DateTime, Utc};
use bigdecimal::BigDecimal;
use crate::error::AppError;
use std::sync::Arc;

// Subscription model
#[derive(Debug, Clone)]
pub struct Subscription {
    pub id: Uuid,
    pub user_id: Uuid,
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    pub plan_id: String,
    pub status: String,
    pub cancel_at_period_end: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    // Enhanced Stripe webhook synchronization fields
    pub stripe_plan_id: String,
    pub current_period_start: DateTime<Utc>,
    pub current_period_end: DateTime<Utc>,
    pub trial_start: Option<DateTime<Utc>>,
    pub trial_end: Option<DateTime<Utc>>,
    pub pending_plan_id: Option<String>,
    // Auto top-off settings
    pub auto_top_off_enabled: bool,
    pub auto_top_off_threshold: Option<BigDecimal>,
    pub auto_top_off_amount: Option<BigDecimal>,
}

#[derive(Debug)]
pub struct SubscriptionRepository {
    db_pool: PgPool,
}

impl SubscriptionRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    // Get the database pool reference
    pub fn get_pool(&self) -> &PgPool {
        &self.db_pool
    }

    // Create a new subscription
    pub async fn create(
        &self,
        user_id: &Uuid,
        plan_id: &str,
        status: &str,
        stripe_customer_id: Option<&str>,
        stripe_subscription_id: Option<&str>,
        trial_end: Option<DateTime<Utc>>,
        current_period_end: DateTime<Utc>,
    ) -> Result<Uuid, AppError> {
        let mut tx = self.db_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.create_with_executor(
            user_id,
            plan_id,
            status,
            stripe_customer_id,
            stripe_subscription_id,
            trial_end,
            current_period_end,
            &mut tx,
        ).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    // Create a new subscription with custom executor
    pub async fn create_with_executor(
        &self,
        user_id: &Uuid,
        plan_id: &str,
        status: &str,
        stripe_customer_id: Option<&str>,
        stripe_subscription_id: Option<&str>,
        trial_end: Option<DateTime<Utc>>,
        current_period_end: DateTime<Utc>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Uuid, AppError>
    {
        let id = Uuid::new_v4();
        let now = Utc::now();
        
        query!(
            r#"
            INSERT INTO subscriptions 
            (id, user_id, plan_id, status, stripe_customer_id, stripe_subscription_id, 
             cancel_at_period_end, stripe_plan_id, current_period_start, current_period_end, 
             trial_start, trial_end, pending_plan_id, created_at, updated_at)
            VALUES 
            ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, $11, NULL, now(), now())
            "#,
            id,
            user_id,
            plan_id,
            status,
            stripe_customer_id,
            stripe_subscription_id,
            plan_id, // Default stripe_plan_id to plan_id for backward compatibility
            now, // Default current_period_start to now
            current_period_end, // current_period_end
            trial_end, // trial_start (backward compatibility - if trial_end exists, assume trial started now)
            trial_end, // trial_end
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create subscription: {}", e)))?;

        Ok(id)
    }

    // Get subscription by ID
    pub async fn get_by_id(&self, id: &Uuid) -> Result<Option<Subscription>, AppError> {
        let record = query_as!(
            Subscription,
            r#"
            SELECT id, user_id, 
                   stripe_customer_id, stripe_subscription_id,
                   plan_id, status, 
                   cancel_at_period_end,
                   stripe_plan_id, current_period_start, current_period_end,
                   trial_start, trial_end, pending_plan_id,
                   auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount,
                   created_at, updated_at
            FROM subscriptions
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch subscription: {}", e)))?;

        Ok(record)
    }

    // Get subscription by ID with custom executor
    pub async fn get_by_id_with_executor(&self, id: &Uuid, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Option<Subscription>, AppError> {
        let record = query_as!(
            Subscription,
            r#"
            SELECT id, user_id, 
                   stripe_customer_id, stripe_subscription_id,
                   plan_id, status, 
                   cancel_at_period_end,
                   stripe_plan_id, current_period_start, current_period_end,
                   trial_start, trial_end, pending_plan_id,
                   auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount,
                   created_at, updated_at
            FROM subscriptions
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch subscription: {}", e)))?;

        Ok(record)
    }

    // Get subscription by user ID
    pub async fn get_by_user_id(&self, user_id: &Uuid) -> Result<Option<Subscription>, AppError> {
        let mut tx = self.db_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.get_by_user_id_with_executor(user_id, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    // Get subscription by user ID with custom executor
    pub async fn get_by_user_id_with_executor(&self, user_id: &Uuid, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Option<Subscription>, AppError>
    {
        let record = query_as!(
            Subscription,
            r#"
            SELECT id, user_id, 
                   stripe_customer_id, stripe_subscription_id,
                   plan_id, status, 
                   cancel_at_period_end,
                   stripe_plan_id, current_period_start, current_period_end,
                   trial_start, trial_end, pending_plan_id,
                   auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount,
                   created_at, updated_at
            FROM subscriptions
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            "#,
            user_id
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch user subscription: {}", e)))?;

        Ok(record)
    }

    // Get subscription by Stripe subscription ID with custom executor
    pub async fn get_by_stripe_subscription_id_with_executor(&self, stripe_subscription_id: &str, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Option<Subscription>, AppError>
    {
        let record = query_as!(
            Subscription,
            r#"
            SELECT id, user_id, 
                   stripe_customer_id, stripe_subscription_id,
                   plan_id, status, 
                   cancel_at_period_end,
                   stripe_plan_id, current_period_start, current_period_end,
                   trial_start, trial_end, pending_plan_id,
                   auto_top_off_enabled, auto_top_off_threshold, auto_top_off_amount,
                   created_at, updated_at
            FROM subscriptions
            WHERE stripe_subscription_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            "#,
            stripe_subscription_id
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch subscription by Stripe ID: {}", e)))?;

        Ok(record)
    }

    // Update an existing subscription
    pub async fn update(&self, subscription: &Subscription) -> Result<(), AppError> {
        let mut tx = self.db_pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        self.update_with_executor(subscription, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(())
    }

    // Update an existing subscription with custom executor
    pub async fn update_with_executor(&self, subscription: &Subscription, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError>
    {
        let result = query!(
            r#"
            UPDATE subscriptions 
            SET stripe_customer_id = $1,
                stripe_subscription_id = $2,
                plan_id = $3,
                status = $4,
                cancel_at_period_end = $5,
                stripe_plan_id = $6,
                current_period_start = $7,
                current_period_end = $8,
                trial_start = $9,
                trial_end = $10,
                pending_plan_id = $11,
                auto_top_off_enabled = $12,
                auto_top_off_threshold = $13,
                auto_top_off_amount = $14,
                updated_at = now()
            WHERE id = $15
            "#,
            subscription.stripe_customer_id,
            subscription.stripe_subscription_id,
            subscription.plan_id,
            subscription.status,
            subscription.cancel_at_period_end,
            subscription.stripe_plan_id,
            subscription.current_period_start,
            subscription.current_period_end,
            subscription.trial_start,
            subscription.trial_end,
            subscription.pending_plan_id,
            subscription.auto_top_off_enabled,
            subscription.auto_top_off_threshold,
            subscription.auto_top_off_amount,
            subscription.id
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update subscription: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::Database("Subscription not found for update".to_string()));
        }

        Ok(())
    }

    // Cancel a subscription
    pub async fn cancel(&self, id: &Uuid) -> Result<(), AppError> {
        query!(
            r#"
            UPDATE subscriptions 
            SET status = 'canceled',
                updated_at = now()
            WHERE id = $1
            "#,
            id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to cancel subscription: {}", e)))?;

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
            UPDATE subscriptions 
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
            return Err(AppError::NotFound("Subscription not found to update stripe customer id".to_string()));
        }

        Ok(())
    }


}