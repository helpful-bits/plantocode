use sqlx::{PgPool, query, postgres::PgRow, Row};
use serde_json::Value;
use serde::{Deserialize, Serialize, Serializer};
use bigdecimal::{BigDecimal, ToPrimitive};
use crate::error::AppError;


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanFeatures {
    #[serde(default)]
    pub core_features: Vec<String>,
    #[serde(default = "default_support_level")]
    pub support_level: String,
    #[serde(default)]
    pub api_access: bool,
    #[serde(default = "default_analytics_level")]
    pub analytics_level: String,
}

fn default_support_level() -> String {
    "Standard".to_string()
}

fn default_analytics_level() -> String {
    "Basic".to_string()
}

impl PlanFeatures {
    /// Check if the plan has API access
    pub fn has_api_access(&self) -> bool {
        self.api_access
    }

    /// Get the support level as an enum-like value
    pub fn get_support_level(&self) -> SupportLevel {
        match self.support_level.to_lowercase().as_str() {
            "community" => SupportLevel::Community,
            "priority" => SupportLevel::Priority,
            "dedicated" => SupportLevel::Dedicated,
            _ => SupportLevel::Standard,
        }
    }

}

#[derive(Debug, Clone, PartialEq)]
pub enum SupportLevel {
    Community,
    Standard,
    Priority,
    Dedicated,
}


#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub base_price_weekly: BigDecimal,
    #[serde(serialize_with = "serialize_bigdecimal_as_f64")]
    pub base_price_monthly: BigDecimal,
    pub base_price_yearly: BigDecimal,
    pub currency: String,
    pub stripe_price_id_weekly: Option<String>,
    pub stripe_price_id_monthly: Option<String>,
    pub stripe_price_id_yearly: Option<String>,
    pub features: Value,
    pub active: bool,
    pub typed_features: Option<PlanFeatures>,
}

impl SubscriptionPlan {
    /// Get typed features, parsing from JSON if not already parsed
    pub fn get_typed_features(&self) -> Result<PlanFeatures, AppError> {
        if let Some(ref typed_features) = self.typed_features {
            Ok(typed_features.clone())
        } else {
            serde_json::from_value(self.features.clone())
                .map_err(|e| AppError::Internal(format!("Failed to parse plan features for plan {}: {}", self.id, e)))
        }
    }

    /// Parse and cache typed features
    pub fn with_typed_features(mut self) -> Self {
        self.typed_features = serde_json::from_value(self.features.clone())
            .map_err(|e| {
                log::warn!("Failed to parse features for plan {}: {}", self.id, e);
                e
            })
            .ok();
        self
    }


    /// Check if the plan has API access
    pub fn has_api_access(&self) -> Result<bool, AppError> {
        let features = self.get_typed_features()?;
        Ok(features.has_api_access())
    }


    /// Get the support level for this plan
    pub fn get_support_level(&self) -> Result<SupportLevel, AppError> {
        let features = self.get_typed_features()?;
        Ok(features.get_support_level())
    }


    /// Check if this is a free plan
    pub fn is_free_plan(&self) -> bool {
        self.base_price_monthly == bigdecimal::BigDecimal::from(0)
    }

    /// Get the monthly price as a float (for display purposes only)
    /// WARNING: Use BigDecimal for all billing calculations!
    pub fn get_monthly_price_float(&self) -> f64 {
        self.base_price_monthly.to_f64().unwrap_or(0.0)
    }
}

fn serialize_bigdecimal_as_f64<S>(value: &BigDecimal, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let float_value = value.to_f64().unwrap_or(0.0);
    serializer.serialize_f64(float_value)
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
        let query_str = "SELECT id, name, description, base_price_weekly, base_price_monthly, base_price_yearly, currency, stripe_price_id_weekly, stripe_price_id_monthly, stripe_price_id_yearly, features, active FROM subscription_plans WHERE id = $1";
        
        let record = sqlx::query(query_str)
            .bind(plan_id)
            .map(|row: PgRow| {
                SubscriptionPlan {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    base_price_weekly: row.get("base_price_weekly"),
                    base_price_monthly: row.get("base_price_monthly"),
                    base_price_yearly: row.get("base_price_yearly"),
                    currency: row.get("currency"),
                    stripe_price_id_weekly: row.get("stripe_price_id_weekly"),
                    stripe_price_id_monthly: row.get("stripe_price_id_monthly"),
                    stripe_price_id_yearly: row.get("stripe_price_id_yearly"),
                    features: row.get("features"),
                    active: row.get("active"),
                    typed_features: None,
                }.with_typed_features()
            })
            .fetch_optional(&self.db_pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to fetch plan: {}", e)))?;

        record.ok_or_else(|| AppError::NotFound(format!("Subscription plan not found: {}", plan_id)))
    }

    pub async fn get_all_plans(&self) -> Result<Vec<SubscriptionPlan>, AppError> {
        let query_str = "SELECT id, name, description, base_price_weekly, base_price_monthly, base_price_yearly, currency, stripe_price_id_weekly, stripe_price_id_monthly, stripe_price_id_yearly, features, active FROM subscription_plans ORDER BY id";
        
        let records = sqlx::query(query_str)
            .map(|row: PgRow| {
                SubscriptionPlan {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    base_price_weekly: row.get("base_price_weekly"),
                    base_price_monthly: row.get("base_price_monthly"),
                    base_price_yearly: row.get("base_price_yearly"),
                    currency: row.get("currency"),
                    stripe_price_id_weekly: row.get("stripe_price_id_weekly"),
                    stripe_price_id_monthly: row.get("stripe_price_id_monthly"),
                    stripe_price_id_yearly: row.get("stripe_price_id_yearly"),
                    features: row.get("features"),
                    active: row.get("active"),
                    typed_features: None,
                }.with_typed_features()
            })
            .fetch_all(&self.db_pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to fetch plans: {}", e)))?;

        Ok(records)
    }
}

