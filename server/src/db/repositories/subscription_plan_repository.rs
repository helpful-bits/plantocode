use sqlx::{PgPool, query, postgres::PgRow, Row};
use serde_json::Value;
use bigdecimal::ToPrimitive;
use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct SubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub price_monthly: f64,
    pub price_yearly: f64,
    pub features: Value,
    pub monthly_tokens: i64,
    pub services: Vec<String>,
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
        let query_str = "SELECT id, name, description, price_monthly, price_yearly, features FROM subscription_plans WHERE id = $1";
        
        let record = sqlx::query(query_str)
            .bind(plan_id)
            .map(|row: PgRow| {
                let features: Value = row.get("features");
                let services = features
                    .get("services")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|s| s.as_str().map(|st| st.to_string())).collect())
                    .unwrap_or_default();
                
                let monthly_tokens = features
                    .get("monthly_tokens")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(100_000); // fallback default
                
                SubscriptionPlan {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    price_monthly: row.get::<bigdecimal::BigDecimal, _>("price_monthly").to_f64().unwrap_or(0.0),
                    price_yearly: row.get::<bigdecimal::BigDecimal, _>("price_yearly").to_f64().unwrap_or(0.0),
                    features: features.clone(),
                    monthly_tokens,
                    services,
                }
            })
            .fetch_optional(&self.db_pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to fetch plan: {}", e)))?;

        record.ok_or_else(|| AppError::NotFound(format!("Subscription plan not found: {}", plan_id)))
    }

    pub async fn get_allowed_models(&self, plan_id: &str) -> Result<Vec<String>, AppError> {
        let plan = self.get_plan_by_id(plan_id).await?;
        Ok(plan.services)
    }

    pub async fn get_all_plans(&self) -> Result<Vec<SubscriptionPlan>, AppError> {
        let query_str = "SELECT id, name, description, price_monthly, price_yearly, features FROM subscription_plans ORDER BY id";
        
        let records = sqlx::query(query_str)
            .map(|row: PgRow| {
                let features: Value = row.get("features");
                let services = features
                    .get("services")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|s| s.as_str().map(|st| st.to_string())).collect())
                    .unwrap_or_default();
                
                let monthly_tokens = features
                    .get("monthly_tokens")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(100_000); // fallback default
                
                SubscriptionPlan {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    price_monthly: row.get::<bigdecimal::BigDecimal, _>("price_monthly").to_f64().unwrap_or(0.0),
                    price_yearly: row.get::<bigdecimal::BigDecimal, _>("price_yearly").to_f64().unwrap_or(0.0),
                    features: features.clone(),
                    monthly_tokens,
                    services,
                }
            })
            .fetch_all(&self.db_pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to fetch plans: {}", e)))?;

        Ok(records)
    }
}
