use sqlx::{PgPool, query, postgres::PgRow, Row};
use serde_json::Value;
use crate::error::AppError;

#[derive(Debug)]
pub struct SubscriptionPlanRepository {
    db_pool: PgPool,
}

impl SubscriptionPlanRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    pub async fn get_allowed_models(&self, plan_id: &str) -> Result<Vec<String>, AppError> {
        let query_str = "SELECT features FROM subscription_plans WHERE id = $1";
        
        let record = sqlx::query(query_str)
            .bind(plan_id)
            .map(|row: PgRow| {
                let features: Value = row.get("features");
                features
            })
            .fetch_optional(&self.db_pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to fetch plan features: {}", e)))?;

        if let Some(features) = record {
            let services = features
                .get("services")
                .and_then(|v| v.as_array())
                .ok_or_else(|| AppError::Internal("services not found in plan features".to_string()))?;
            Ok(services.iter().filter_map(|s| s.as_str().map(|st| st.to_string())).collect())
        } else {
            Err(AppError::NotFound(format!("Subscription plan not found: {}", plan_id)))
        }
    }
}
