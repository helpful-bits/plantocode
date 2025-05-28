use sqlx::{PgPool, query, postgres::PgRow, Row};
use serde_json::Value;
use bigdecimal::ToPrimitive;
use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct SubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub base_price_monthly: f64,
    pub base_price_yearly: f64,
    pub included_spending_monthly: f64,
    pub overage_rate: f64,
    pub hard_limit_multiplier: f64,
    pub currency: String,
    pub features: Value,
}

#[derive(Debug)]
pub struct SubscriptionPlanRepository {
    db_pool: PgPool,
}

impl SubscriptionPlanRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    pub async fn get_plan_by_id(&self, plan_id: &str) -> Result<SubscriptionPlan, AppError> {
        let query_str = "SELECT id, name, description, base_price_monthly, base_price_yearly, included_spending_monthly, overage_rate, hard_limit_multiplier, currency, features FROM subscription_plans WHERE id = $1";
        
        let record = sqlx::query(query_str)
            .bind(plan_id)
            .map(|row: PgRow| {
                SubscriptionPlan {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    base_price_monthly: row.get::<bigdecimal::BigDecimal, _>("base_price_monthly").to_f64().unwrap_or(0.0),
                    base_price_yearly: row.get::<bigdecimal::BigDecimal, _>("base_price_yearly").to_f64().unwrap_or(0.0),
                    included_spending_monthly: row.get::<bigdecimal::BigDecimal, _>("included_spending_monthly").to_f64().unwrap_or(0.0),
                    overage_rate: row.get::<bigdecimal::BigDecimal, _>("overage_rate").to_f64().unwrap_or(1.0),
                    hard_limit_multiplier: row.get::<bigdecimal::BigDecimal, _>("hard_limit_multiplier").to_f64().unwrap_or(2.0),
                    currency: row.get("currency"),
                    features: row.get("features"),
                }
            })
            .fetch_optional(&self.db_pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to fetch plan: {}", e)))?;

        record.ok_or_else(|| AppError::NotFound(format!("Subscription plan not found: {}", plan_id)))
    }

    pub async fn get_all_plans(&self) -> Result<Vec<SubscriptionPlan>, AppError> {
        let query_str = "SELECT id, name, description, base_price_monthly, base_price_yearly, included_spending_monthly, overage_rate, hard_limit_multiplier, currency, features FROM subscription_plans ORDER BY id";
        
        let records = sqlx::query(query_str)
            .map(|row: PgRow| {
                SubscriptionPlan {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    base_price_monthly: row.get::<bigdecimal::BigDecimal, _>("base_price_monthly").to_f64().unwrap_or(0.0),
                    base_price_yearly: row.get::<bigdecimal::BigDecimal, _>("base_price_yearly").to_f64().unwrap_or(0.0),
                    included_spending_monthly: row.get::<bigdecimal::BigDecimal, _>("included_spending_monthly").to_f64().unwrap_or(0.0),
                    overage_rate: row.get::<bigdecimal::BigDecimal, _>("overage_rate").to_f64().unwrap_or(1.0),
                    hard_limit_multiplier: row.get::<bigdecimal::BigDecimal, _>("hard_limit_multiplier").to_f64().unwrap_or(2.0),
                    currency: row.get("currency"),
                    features: row.get("features"),
                }
            })
            .fetch_all(&self.db_pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to fetch plans: {}", e)))?;

        Ok(records)
    }
}
