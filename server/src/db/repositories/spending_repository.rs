use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use bigdecimal::BigDecimal;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingAlert {
    pub id: Uuid,
    pub user_id: Uuid,
    pub alert_type: String,
    pub threshold_amount: BigDecimal,
    pub current_spending: BigDecimal,
    pub billing_period_start: DateTime<Utc>,
    pub alert_sent_at: DateTime<Utc>,
    pub acknowledged: bool,
}

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

    // User Spending Limits

    pub async fn get_user_spending_limit_for_period(&self, user_id: &Uuid, billing_period_start: &chrono::DateTime<chrono::Utc>) -> Result<Option<UserSpendingLimit>, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.get_user_spending_limit_for_period_with_executor(user_id, billing_period_start, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    pub async fn get_user_spending_limit_for_period_with_executor(
        &self, 
        user_id: &Uuid, 
        billing_period_start: &chrono::DateTime<chrono::Utc>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<Option<UserSpendingLimit>, AppError>
    {
        // Set user context for RLS within this transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut **executor)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context for RLS: {}", e)))?;

        let result = sqlx::query_as!(
            UserSpendingLimit,
            r#"
            SELECT id, user_id, plan_id, billing_period_start, billing_period_end,
                   included_allowance, current_spending, hard_limit, services_blocked,
                   currency, created_at, updated_at
            FROM user_spending_limits 
            WHERE user_id = $1 AND billing_period_start = $2
            "#,
            user_id,
            billing_period_start
        )
        .fetch_optional(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user spending limit for period: {}", e)))?;

        Ok(result)
    }

    pub async fn create_or_update_user_spending_limit(&self, limit: &UserSpendingLimit) -> Result<UserSpendingLimit, AppError> {
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
        let result = self.create_or_update_user_spending_limit_with_executor(limit, &mut tx).await?;
        tx.commit().await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
        Ok(result)
    }

    pub async fn create_or_update_user_spending_limit_with_executor(
        &self, 
        limit: &UserSpendingLimit, 
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>
    ) -> Result<UserSpendingLimit, AppError>
    {
        let result = sqlx::query_as!(
            UserSpendingLimit,
            r#"
            INSERT INTO user_spending_limits 
            (id, user_id, plan_id, billing_period_start, billing_period_end,
             included_allowance, current_spending, hard_limit, services_blocked, currency, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (user_id, billing_period_start) 
            DO UPDATE SET 
                included_allowance = EXCLUDED.included_allowance,
                hard_limit = EXCLUDED.hard_limit,
                plan_id = EXCLUDED.plan_id,
                currency = EXCLUDED.currency,
                updated_at = NOW()
            RETURNING id, user_id, plan_id, billing_period_start, billing_period_end,
                      included_allowance, current_spending, hard_limit, services_blocked,
                      currency, created_at, updated_at
            "#,
            limit.id,
            limit.user_id,
            limit.plan_id,
            limit.billing_period_start,
            limit.billing_period_end,
            limit.included_allowance,
            limit.current_spending,
            limit.hard_limit,
            limit.services_blocked,
            limit.currency,
            limit.created_at,
            limit.updated_at
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create or update user spending limit: {}", e)))?;

        Ok(result)
    }

    pub async fn create_user_spending_limit(&self, limit: &UserSpendingLimit) -> Result<UserSpendingLimit, AppError> {
        let result = sqlx::query_as!(
            UserSpendingLimit,
            r#"
            INSERT INTO user_spending_limits 
            (id, user_id, plan_id, billing_period_start, billing_period_end,
             included_allowance, current_spending, hard_limit, services_blocked, currency, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id, user_id, plan_id, billing_period_start, billing_period_end,
                      included_allowance, current_spending, hard_limit, services_blocked,
                      currency, created_at, updated_at
            "#,
            limit.id,
            limit.user_id,
            limit.plan_id,
            limit.billing_period_start,
            limit.billing_period_end,
            limit.included_allowance,
            limit.current_spending,
            limit.hard_limit,
            limit.services_blocked,
            limit.currency,
            limit.created_at,
            limit.updated_at
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create user spending limit: {}", e)))?;

        Ok(result)
    }

    pub async fn update_user_spending_for_period_with_executor(&self, user_id: &Uuid, amount: &BigDecimal, billing_period_start: &chrono::DateTime<chrono::Utc>, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE user_spending_limits 
            SET current_spending = current_spending + $3,
                updated_at = NOW()
            WHERE user_id = $1 AND billing_period_start = $2
            "#,
            user_id,
            billing_period_start,
            amount
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update user spending: {}", e)))?;

        Ok(())
    }

    pub async fn update_user_spending_for_period(&self, user_id: &Uuid, amount: &BigDecimal, billing_period_start: &chrono::DateTime<chrono::Utc>) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await.map_err(AppError::from)?;
        self.update_user_spending_for_period_with_executor(user_id, amount, billing_period_start, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(())
    }

    pub async fn block_services_for_period_with_executor(&self, user_id: &Uuid, billing_period_start: &chrono::DateTime<chrono::Utc>, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE user_spending_limits 
            SET services_blocked = true,
                updated_at = NOW()
            WHERE user_id = $1 AND billing_period_start = $2
            "#,
            user_id,
            billing_period_start
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to block services: {}", e)))?;

        Ok(())
    }

    pub async fn block_services_for_period(&self, user_id: &Uuid, billing_period_start: &chrono::DateTime<chrono::Utc>) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await.map_err(AppError::from)?;
        self.block_services_for_period_with_executor(user_id, billing_period_start, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(())
    }

    pub async fn unblock_services_for_period_with_executor(&self, user_id: &Uuid, billing_period_start: &chrono::DateTime<chrono::Utc>, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE user_spending_limits 
            SET services_blocked = false,
                updated_at = NOW()
            WHERE user_id = $1 AND billing_period_start = $2
            "#,
            user_id,
            billing_period_start
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to unblock services: {}", e)))?;

        Ok(())
    }

    pub async fn unblock_services_for_period(&self, user_id: &Uuid, billing_period_start: &chrono::DateTime<chrono::Utc>) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await.map_err(AppError::from)?;
        self.unblock_services_for_period_with_executor(user_id, billing_period_start, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(())
    }

    // Spending Alerts
    pub async fn get_user_alerts(&self, user_id: &Uuid) -> Result<Vec<SpendingAlert>, AppError> {
        let results = sqlx::query!(
            r#"
            SELECT id, user_id, alert_type, threshold_amount,
                   current_spending, billing_period_start, alert_sent_at, acknowledged
            FROM spending_alerts 
            WHERE user_id = $1
            ORDER BY alert_sent_at DESC
            "#,
            user_id
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user alerts: {}", e)))?;

        let alerts = results.into_iter().map(|row| SpendingAlert {
            id: row.id,
            user_id: row.user_id,
            alert_type: row.alert_type,
            threshold_amount: row.threshold_amount,
            current_spending: row.current_spending,
            billing_period_start: row.billing_period_start,
            alert_sent_at: row.alert_sent_at.unwrap_or_else(Utc::now),
            acknowledged: row.acknowledged.unwrap_or(false),
        }).collect();

        Ok(alerts)
    }

    pub async fn create_spending_alert_with_executor(&self, alert: &SpendingAlert, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<SpendingAlert, AppError> {
        let result = sqlx::query!(
            r#"
            INSERT INTO spending_alerts 
            (id, user_id, alert_type, threshold_amount, current_spending, 
             billing_period_start, alert_sent_at, acknowledged)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, user_id, alert_type, threshold_amount,
                      current_spending, billing_period_start, alert_sent_at, acknowledged
            "#,
            alert.id,
            alert.user_id,
            alert.alert_type,
            alert.threshold_amount,
            alert.current_spending,
            alert.billing_period_start,
            alert.alert_sent_at,
            alert.acknowledged
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create spending alert: {}", e)))?;

        Ok(SpendingAlert {
            id: result.id,
            user_id: result.user_id,
            alert_type: result.alert_type,
            threshold_amount: result.threshold_amount,
            current_spending: result.current_spending,
            billing_period_start: result.billing_period_start,
            alert_sent_at: result.alert_sent_at.unwrap_or_else(Utc::now),
            acknowledged: result.acknowledged.unwrap_or(false),
        })
    }

    pub async fn create_spending_alert(&self, alert: &SpendingAlert) -> Result<SpendingAlert, AppError> {
        let mut tx = self.pool.begin().await.map_err(AppError::from)?;
        let result = self.create_spending_alert_with_executor(alert, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(result)
    }

    pub async fn acknowledge_alert(&self, alert_id: &Uuid) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE spending_alerts 
            SET acknowledged = true
            WHERE id = $1
            "#,
            alert_id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to acknowledge alert: {}", e)))?;

        Ok(())
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

    pub async fn delete_user_spending_limit_for_period_with_executor(&self, user_id: &Uuid, billing_period_start: &chrono::DateTime<chrono::Utc>, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            DELETE FROM user_spending_limits 
            WHERE user_id = $1 AND billing_period_start = $2
            "#,
            user_id,
            billing_period_start
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to delete user spending limit: {}", e)))?;

        Ok(())
    }

    pub async fn delete_user_spending_limit_for_period(&self, user_id: &Uuid, billing_period_start: &chrono::DateTime<chrono::Utc>) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await.map_err(AppError::from)?;
        self.delete_user_spending_limit_for_period_with_executor(user_id, billing_period_start, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(())
    }

}