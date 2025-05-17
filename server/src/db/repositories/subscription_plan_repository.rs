use uuid::Uuid;
use sqlx::{PgPool, query};
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
        let record = query!(
            r#"SELECT features as \"features!: Value\" FROM subscription_plans WHERE id = $1"#,
            plan_id
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch plan features: {}", e)))?;

        if let Some(r) = record {
            let services = r
                .features
                .get("services")
                .and_then(|v| v.as_array())
                .ok_or_else(|| AppError::Internal("services not found in plan features".to_string()))?;
            Ok(services.iter().filter_map(|s| s.as_str().map(|st| st.to_string())).collect())
        } else {
            Err(AppError::NotFound(format!("Subscription plan not found: {}", plan_id)))
        }
    }
}
