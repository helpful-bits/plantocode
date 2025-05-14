use uuid::Uuid;
use sqlx::{PgPool, query, query_as};
use chrono::{DateTime, Utc};
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
    pub trial_ends_at: Option<DateTime<Utc>>,
    pub current_period_ends_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

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
        trial_ends_at: Option<DateTime<Utc>>,
        current_period_ends_at: DateTime<Utc>,
    ) -> Result<Uuid, AppError> {
        let id = Uuid::new_v4();
        
        query!(
            r#"
            INSERT INTO subscriptions 
            (id, user_id, plan_id, status, stripe_customer_id, stripe_subscription_id, 
             trial_ends_at, current_period_ends_at, created_at, updated_at)
            VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
            "#,
            id,
            user_id,
            plan_id,
            status,
            stripe_customer_id,
            stripe_subscription_id,
            trial_ends_at,
            current_period_ends_at,
        )
        .execute(&self.db_pool)
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
                   trial_ends_at, current_period_ends_at,
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

    // Get subscription by user ID
    pub async fn get_by_user_id(&self, user_id: &Uuid) -> Result<Option<Subscription>, AppError> {
        let record = query_as!(
            Subscription,
            r#"
            SELECT id, user_id, 
                   stripe_customer_id, stripe_subscription_id,
                   plan_id, status, 
                   trial_ends_at, current_period_ends_at,
                   created_at, updated_at
            FROM subscriptions
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            "#,
            user_id
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch user subscription: {}", e)))?;

        Ok(record)
    }

    // Update an existing subscription
    pub async fn update(&self, subscription: &Subscription) -> Result<(), AppError> {
        query!(
            r#"
            UPDATE subscriptions 
            SET stripe_customer_id = $1,
                stripe_subscription_id = $2,
                plan_id = $3,
                status = $4,
                trial_ends_at = $5,
                current_period_ends_at = $6,
                updated_at = now()
            WHERE id = $7
            "#,
            subscription.stripe_customer_id,
            subscription.stripe_subscription_id,
            subscription.plan_id,
            subscription.status,
            subscription.trial_ends_at,
            subscription.current_period_ends_at,
            subscription.id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update subscription: {}", e)))?;

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
}