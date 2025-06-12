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
    pub hard_limit: BigDecimal,
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
    pub async fn get_user_spending_limit_for_period(&self, user_id: &Uuid, period_start: &DateTime<Utc>, period_end: &DateTime<Utc>) -> Result<Option<UserSpendingLimit>, AppError> {
        let result = sqlx::query!(
            r#"
            SELECT s.id, s.user_id, s.plan_id, s.created_at, s.updated_at,
                   sp.included_spending_monthly,
                   sp.included_spending_weekly,
                   sp.hard_limit_multiplier,
                   sp.currency,
                   COALESCE(SUM(au.cost), 0) as current_spending,
                   false as services_blocked,
                   s.current_period_ends_at
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            LEFT JOIN api_usage au ON s.user_id = au.user_id 
                AND au.timestamp >= $2 AND au.timestamp <= $3
            WHERE s.user_id = $1 AND s.status = 'active'
            GROUP BY s.id, s.user_id, s.plan_id, s.created_at, s.updated_at,
                     sp.included_spending_monthly, sp.included_spending_weekly, 
                     sp.hard_limit_multiplier, sp.currency, s.current_period_ends_at
            "#,
            user_id,
            period_start,
            period_end
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user spending limit: {}", e)))?;

        if let Some(row) = result {
            let included_allowance = row.included_spending_monthly.unwrap_or_else(|| BigDecimal::from(0));
            let hard_limit = &included_allowance * row.hard_limit_multiplier.unwrap_or_else(|| BigDecimal::from(2));
            
            Ok(Some(UserSpendingLimit {
                id: row.id,
                user_id: *user_id,
                plan_id: row.plan_id,
                included_allowance,
                hard_limit,
                current_spending: row.current_spending.unwrap_or_default(),
                services_blocked: row.services_blocked.unwrap_or(false),
                currency: row.currency.unwrap_or_else(|| "USD".to_string()),
                billing_period_start: *period_start,
                billing_period_end: *period_end,
                created_at: Some(row.created_at),
                updated_at: Some(row.updated_at),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn get_user_spending_limit_for_period_with_executor(&self, user_id: &Uuid, period_start: &DateTime<Utc>, period_end: &DateTime<Utc>, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Option<UserSpendingLimit>, AppError> {
        let result = sqlx::query!(
            r#"
            SELECT s.id, s.user_id, s.plan_id, s.created_at, s.updated_at,
                   sp.included_spending_monthly,
                   sp.included_spending_weekly,
                   sp.hard_limit_multiplier,
                   sp.currency,
                   COALESCE(SUM(au.cost), 0) as current_spending,
                   false as services_blocked,
                   s.current_period_ends_at
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            LEFT JOIN api_usage au ON s.user_id = au.user_id 
                AND au.timestamp >= $2 AND au.timestamp <= $3
            WHERE s.user_id = $1 AND s.status = 'active'
            GROUP BY s.id, s.user_id, s.plan_id, s.created_at, s.updated_at,
                     sp.included_spending_monthly, sp.included_spending_weekly, 
                     sp.hard_limit_multiplier, sp.currency, s.current_period_ends_at
            "#,
            user_id,
            period_start,
            period_end
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user spending limit: {}", e)))?;

        if let Some(row) = result {
            let included_allowance = row.included_spending_monthly.unwrap_or_else(|| BigDecimal::from(0));
            let hard_limit = &included_allowance * row.hard_limit_multiplier.unwrap_or_else(|| BigDecimal::from(2));
            
            Ok(Some(UserSpendingLimit {
                id: row.id,
                user_id: *user_id,
                plan_id: row.plan_id,
                included_allowance,
                hard_limit,
                current_spending: row.current_spending.unwrap_or_default(),
                services_blocked: row.services_blocked.unwrap_or(false),
                currency: row.currency.unwrap_or_else(|| "USD".to_string()),
                billing_period_start: *period_start,
                billing_period_end: *period_end,
                created_at: Some(row.created_at),
                updated_at: Some(row.updated_at),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn create_or_update_user_spending_limit(&self, user_id: &Uuid, limit_amount: &BigDecimal) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE subscription_plans 
            SET included_spending_monthly = $2
            WHERE id = (SELECT plan_id FROM subscriptions WHERE user_id = $1 AND status = 'active')
            "#,
            user_id,
            limit_amount
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update spending limit: {}", e)))?;

        Ok(())
    }

    pub async fn create_or_update_user_spending_limit_with_executor(&self, user_id: &Uuid, limit_amount: &BigDecimal, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE subscription_plans 
            SET included_spending_monthly = $2
            WHERE id = (SELECT plan_id FROM subscriptions WHERE user_id = $1 AND status = 'active')
            "#,
            user_id,
            limit_amount
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update spending limit: {}", e)))?;

        Ok(())
    }




}