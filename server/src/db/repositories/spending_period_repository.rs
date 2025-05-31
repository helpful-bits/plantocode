use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use bigdecimal::BigDecimal;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendingPeriod {
    pub id: Uuid,
    pub user_id: Uuid,
    pub plan_id: String,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub included_allowance: BigDecimal,
    pub total_spending: BigDecimal,
    pub overage_amount: BigDecimal,
    pub total_requests: i32,
    pub total_tokens_input: i64,
    pub total_tokens_output: i64,
    pub services_used: JsonValue,
    pub currency: String,
    pub invoice_id: Option<String>,
    pub archived: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct SpendingPeriodRepository {
    pool: PgPool,
}

impl SpendingPeriodRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn get_pool(&self) -> &PgPool {
        &self.pool
    }

    /// Create a new spending period
    pub async fn create(&self, period: &SpendingPeriod) -> Result<SpendingPeriod, AppError> {
        let created_period = sqlx::query_as!(
            SpendingPeriod,
            r#"
            INSERT INTO spending_periods (
                id, user_id, plan_id, period_start, period_end,
                included_allowance, total_spending, overage_amount,
                total_requests, total_tokens_input, total_tokens_output,
                services_used, currency, invoice_id, archived,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
            )
            RETURNING *
            "#,
            period.id,
            period.user_id,
            period.plan_id,
            period.period_start,
            period.period_end,
            period.included_allowance,
            period.total_spending,
            period.overage_amount,
            period.total_requests,
            period.total_tokens_input,
            period.total_tokens_output,
            period.services_used,
            period.currency,
            period.invoice_id,
            period.archived,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create spending period: {}", e)))?;

        Ok(created_period)
    }

    /// Get spending period by ID
    pub async fn get_by_id(&self, period_id: &Uuid) -> Result<Option<SpendingPeriod>, AppError> {
        let period = sqlx::query_as!(
            SpendingPeriod,
            "SELECT * FROM spending_periods WHERE id = $1",
            period_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get spending period: {}", e)))?;

        Ok(period)
    }

    /// Get spending period for user and period start date
    pub async fn get_by_user_and_period(
        &self,
        user_id: &Uuid,
        period_start: &DateTime<Utc>,
    ) -> Result<Option<SpendingPeriod>, AppError> {
        let period = sqlx::query_as!(
            SpendingPeriod,
            "SELECT * FROM spending_periods WHERE user_id = $1 AND period_start = $2",
            user_id,
            period_start
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get spending period by user and date: {}", e)))?;

        Ok(period)
    }

    /// Get spending periods for a user with pagination (most recent first)
    pub async fn get_by_user_id(
        &self,
        user_id: &Uuid,
        limit: i32,
        offset: i32,
    ) -> Result<Vec<SpendingPeriod>, AppError> {
        let periods = sqlx::query_as!(
            SpendingPeriod,
            r#"
            SELECT * FROM spending_periods 
            WHERE user_id = $1 
            ORDER BY period_start DESC 
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit as i64,
            offset as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user spending periods: {}", e)))?;

        Ok(periods)
    }

    /// Get spending periods for analytics (last N months)
    pub async fn get_historical_for_user(
        &self,
        user_id: &Uuid,
        months_back: i32,
    ) -> Result<Vec<SpendingPeriod>, AppError> {
        let cutoff_date = Utc::now() - chrono::Duration::days((months_back * 30) as i64);

        let periods = sqlx::query_as!(
            SpendingPeriod,
            r#"
            SELECT * FROM spending_periods 
            WHERE user_id = $1 AND period_start >= $2
            ORDER BY period_start DESC
            "#,
            user_id,
            cutoff_date
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get historical spending periods: {}", e)))?;

        Ok(periods)
    }

    /// Update spending period totals
    pub async fn update_totals(
        &self,
        period_id: &Uuid,
        total_spending: &BigDecimal,
        overage_amount: &BigDecimal,
        total_requests: i32,
        total_tokens_input: i64,
        total_tokens_output: i64,
        services_used: &JsonValue,
    ) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE spending_periods 
            SET total_spending = $2, overage_amount = $3, total_requests = $4,
                total_tokens_input = $5, total_tokens_output = $6, services_used = $7,
                updated_at = NOW()
            WHERE id = $1
            "#,
            period_id,
            total_spending,
            overage_amount,
            total_requests,
            total_tokens_input,
            total_tokens_output,
            services_used
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update spending period totals: {}", e)))?;

        Ok(())
    }

    /// Archive a spending period (when billing cycle ends)
    pub async fn archive(&self, period_id: &Uuid, invoice_id: Option<&str>) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE spending_periods 
            SET archived = true, invoice_id = $2, updated_at = NOW()
            WHERE id = $1
            "#,
            period_id,
            invoice_id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to archive spending period: {}", e)))?;

        Ok(())
    }

    /// Get spending periods that need to be archived (past due and not archived)
    pub async fn get_periods_to_archive(&self) -> Result<Vec<SpendingPeriod>, AppError> {
        let now = Utc::now();

        let periods = sqlx::query_as!(
            SpendingPeriod,
            r#"
            SELECT * FROM spending_periods 
            WHERE period_end < $1 AND archived = false
            ORDER BY period_end ASC
            "#,
            now
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get periods to archive: {}", e)))?;

        Ok(periods)
    }

    /// Get spending summary for a user (total across all periods)
    pub async fn get_user_spending_summary(&self, user_id: &Uuid) -> Result<UserSpendingSummary, AppError> {
        let summary = sqlx::query_as!(
            UserSpendingSummary,
            r#"
            SELECT 
                COALESCE(SUM(total_spending), 0) as "total_spending!: BigDecimal",
                COALESCE(SUM(overage_amount), 0) as "total_overage!: BigDecimal",
                COALESCE(SUM(total_requests), 0) as "total_requests!: i32",
                COALESCE(SUM(total_tokens_input), 0) as "total_tokens_input!: i64",
                COALESCE(SUM(total_tokens_output), 0) as "total_tokens_output!: i64",
                COUNT(*) as "total_periods!: i64"
            FROM spending_periods 
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user spending summary: {}", e)))?;

        Ok(summary)
    }

    /// Get spending trends for analytics
    pub async fn get_spending_trends(
        &self,
        user_id: &Uuid,
        months: i32,
    ) -> Result<Vec<SpendingTrend>, AppError> {
        let cutoff_date = Utc::now() - chrono::Duration::days((months * 30) as i64);

        let trends = sqlx::query_as!(
            SpendingTrend,
            r#"
            SELECT 
                period_start,
                total_spending,
                overage_amount,
                total_requests,
                plan_id
            FROM spending_periods 
            WHERE user_id = $1 AND period_start >= $2
            ORDER BY period_start ASC
            "#,
            user_id,
            cutoff_date
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get spending trends: {}", e)))?;

        Ok(trends)
    }

    /// Get top spending users for admin analytics
    pub async fn get_top_spenders(&self, limit: i32) -> Result<Vec<TopSpender>, AppError> {
        let top_spenders = sqlx::query_as!(
            TopSpender,
            r#"
            SELECT 
                user_id,
                SUM(total_spending) as "total_spending!: BigDecimal",
                COUNT(*) as "period_count!: i64",
                MAX(updated_at) as "last_activity!: DateTime<Utc>"
            FROM spending_periods 
            WHERE archived = false
            GROUP BY user_id
            ORDER BY SUM(total_spending) DESC
            LIMIT $1
            "#,
            limit as i64
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get top spenders: {}", e)))?;

        Ok(top_spenders)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSpendingSummary {
    pub total_spending: BigDecimal,
    pub total_overage: BigDecimal,
    pub total_requests: i32,
    pub total_tokens_input: i64,
    pub total_tokens_output: i64,
    pub total_periods: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendingTrend {
    pub period_start: DateTime<Utc>,
    pub total_spending: BigDecimal,
    pub overage_amount: BigDecimal,
    pub total_requests: i32,
    pub plan_id: String,
}

#[derive(Debug, Serialize)]
pub struct TopSpender {
    pub user_id: Uuid,
    pub total_spending: BigDecimal,
    pub period_count: i64,
    pub last_activity: DateTime<Utc>,
}