use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use sqlx::types::BigDecimal;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreference {
    pub user_id: Uuid,
    pub preferred_currency: String,
    pub timezone: Option<String>,
    pub locale: Option<String>,
    pub cost_alerts_enabled: Option<bool>,
    pub spending_alert_75_percent: Option<bool>,
    pub spending_alert_90_percent: Option<bool>,
    pub spending_alert_limit_reached: Option<bool>,
    pub spending_alert_services_blocked: Option<bool>,
    pub created_at: Option<DateTime<chrono::Utc>>,
    pub updated_at: Option<DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSpendingLimit {
    pub id: Uuid,
    pub user_id: Uuid,
    pub plan_id: String,
    pub billing_period_start: DateTime<Utc>,
    pub billing_period_end: DateTime<Utc>,
    pub included_allowance: BigDecimal,
    pub current_spending: BigDecimal,
    pub hard_limit: Option<BigDecimal>,
    pub services_blocked: bool,
    pub currency: String,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}


#[derive(Debug)]
pub struct SpendingRepository {
    pool: PgPool,
}

impl SpendingRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // User Preferences
    pub async fn get_user_preference(&self, user_id: &Uuid) -> Result<Option<UserPreference>, AppError> {
        let result = sqlx::query_as!(
            UserPreference,
            r#"
            SELECT user_id, preferred_currency, timezone, locale, cost_alerts_enabled,
                   spending_alert_75_percent, spending_alert_90_percent, 
                   spending_alert_limit_reached, spending_alert_services_blocked,
                   created_at, updated_at
            FROM user_preferences 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user preference: {}", e)))?;

        Ok(result)
    }

    pub async fn create_user_preference(&self, user_id: &Uuid, currency: &str) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            INSERT INTO user_preferences (user_id, preferred_currency)
            VALUES ($1, $2)
            ON CONFLICT (user_id) 
            DO UPDATE SET preferred_currency = $2, updated_at = NOW()
            "#,
            user_id,
            currency
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to set user preference: {}", e)))?;

        Ok(())
    }

    // UserSpendingLimit methods
    pub async fn get_user_spending_limit_for_period(&self, user_id: &Uuid, period_start: &DateTime<Utc>, _period_end: &DateTime<Utc>) -> Result<Option<UserSpendingLimit>, AppError> {
        let result = sqlx::query_as!(
            UserSpendingLimit,
            r#"
            SELECT id, user_id, plan_id, billing_period_start, billing_period_end,
                   included_allowance as "included_allowance: BigDecimal", 
                   current_spending as "current_spending: BigDecimal", 
                   hard_limit, 
                   services_blocked,
                   currency, created_at, updated_at
            FROM user_spending_limits
            WHERE user_id = $1 AND billing_period_start = $2
            "#,
            user_id,
            period_start
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user spending limit: {}", e)))?;

        Ok(result)
    }

    pub async fn get_user_spending_limit_for_period_with_executor(&self, user_id: &Uuid, period_start: &DateTime<Utc>, _period_end: &DateTime<Utc>, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Option<UserSpendingLimit>, AppError> {
        let result = sqlx::query_as!(
            UserSpendingLimit,
            r#"
            SELECT id, user_id, plan_id, billing_period_start, billing_period_end,
                   included_allowance as "included_allowance: BigDecimal", 
                   current_spending as "current_spending: BigDecimal", 
                   hard_limit, 
                   services_blocked,
                   currency, created_at, updated_at
            FROM user_spending_limits
            WHERE user_id = $1 AND billing_period_start = $2
            "#,
            user_id,
            period_start
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user spending limit: {}", e)))?;

        Ok(result)
    }

    pub async fn create_or_update_user_spending_limit(&self, spending_limit: &UserSpendingLimit) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            INSERT INTO user_spending_limits (
                id, user_id, plan_id, billing_period_start, billing_period_end,
                included_allowance, current_spending, hard_limit, services_blocked, currency
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id, billing_period_start)
            DO UPDATE SET
                plan_id = EXCLUDED.plan_id,
                billing_period_end = EXCLUDED.billing_period_end,
                included_allowance = EXCLUDED.included_allowance,
                current_spending = EXCLUDED.current_spending,
                hard_limit = EXCLUDED.hard_limit,
                services_blocked = EXCLUDED.services_blocked,
                currency = EXCLUDED.currency,
                updated_at = NOW()
            "#,
            spending_limit.id,
            spending_limit.user_id,
            spending_limit.plan_id,
            spending_limit.billing_period_start,
            spending_limit.billing_period_end,
            spending_limit.included_allowance,
            spending_limit.current_spending,
            spending_limit.hard_limit,
            spending_limit.services_blocked,
            spending_limit.currency
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create or update spending limit: {}", e)))?;

        Ok(())
    }

    pub async fn create_or_update_user_spending_limit_with_executor(&self, spending_limit: &UserSpendingLimit, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            INSERT INTO user_spending_limits (
                id, user_id, plan_id, billing_period_start, billing_period_end,
                included_allowance, current_spending, hard_limit, services_blocked, currency
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id, billing_period_start)
            DO UPDATE SET
                plan_id = EXCLUDED.plan_id,
                billing_period_end = EXCLUDED.billing_period_end,
                included_allowance = EXCLUDED.included_allowance,
                current_spending = EXCLUDED.current_spending,
                hard_limit = EXCLUDED.hard_limit,
                services_blocked = EXCLUDED.services_blocked,
                currency = EXCLUDED.currency,
                updated_at = NOW()
            "#,
            spending_limit.id,
            spending_limit.user_id,
            spending_limit.plan_id,
            spending_limit.billing_period_start,
            spending_limit.billing_period_end,
            spending_limit.included_allowance,
            spending_limit.current_spending,
            spending_limit.hard_limit,
            spending_limit.services_blocked,
            spending_limit.currency
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create or update spending limit: {}", e)))?;

        Ok(())
    }

    pub async fn increment_spending_with_executor(&self, user_id: &Uuid, billing_period_start: &DateTime<Utc>, amount: &BigDecimal, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<UserSpendingLimit, AppError> {
        let result = sqlx::query_as!(
            UserSpendingLimit,
            r#"
            UPDATE user_spending_limits
            SET current_spending = current_spending + $3,
                updated_at = NOW()
            WHERE user_id = $1 AND billing_period_start = $2
            RETURNING id, user_id, plan_id, billing_period_start, billing_period_end,
                      included_allowance as "included_allowance: BigDecimal", 
                      current_spending as "current_spending: BigDecimal", 
                      hard_limit, 
                      services_blocked,
                      currency, created_at, updated_at
            "#,
            user_id,
            billing_period_start,
            amount
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to increment spending: {}", e)))?;

        Ok(result)
    }

    pub async fn update_services_blocked_status_with_executor(&self, user_id: &Uuid, billing_period_start: &DateTime<Utc>, services_blocked: bool, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE user_spending_limits
            SET services_blocked = $3,
                updated_at = NOW()
            WHERE user_id = $1 AND billing_period_start = $2
            "#,
            user_id,
            billing_period_start,
            services_blocked
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update services blocked status: {}", e)))?;

        Ok(())
    }




}