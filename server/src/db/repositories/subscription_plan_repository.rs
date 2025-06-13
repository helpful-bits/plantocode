use sqlx::{PgPool, query, postgres::PgRow, Row};
use serde_json::Value;
use serde::{Deserialize, Serialize};
use bigdecimal::{BigDecimal, ToPrimitive};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingDetails {
    pub overage_policy: String,
    pub hard_cutoff: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanFeatures {
    pub core_features: Vec<String>,
    pub allowed_models: Vec<String>,
    pub support_level: String,
    pub api_access: bool,
    pub analytics_level: String,
    pub spending_details: SpendingDetails,
}

impl PlanFeatures {
    /// Check if the plan has API access
    pub fn has_api_access(&self) -> bool {
        self.api_access
    }

    /// Check if the plan allows a specific model
    pub fn allows_model(&self, model_id: &str) -> bool {
        self.allowed_models.contains(&"all".to_string()) || 
        self.allowed_models.contains(&model_id.to_string())
    }

    /// Check if the plan allows all models
    pub fn allows_all_models(&self) -> bool {
        self.allowed_models.contains(&"all".to_string())
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

    /// Check if overage is allowed
    pub fn allows_overage(&self) -> bool {
        !matches!(self.spending_details.overage_policy.as_str(), "none")
    }

    /// Get the overage policy
    pub fn get_overage_policy(&self) -> OveragePolicy {
        match self.spending_details.overage_policy.as_str() {
            "none" => OveragePolicy::None,
            "standard_rate" => OveragePolicy::StandardRate,
            "negotiated_rate" => OveragePolicy::NegotiatedRate,
            _ => OveragePolicy::None,
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

#[derive(Debug, Clone, PartialEq)]
pub enum OveragePolicy {
    None,
    StandardRate,
    NegotiatedRate,
}

#[derive(Debug, Clone)]
pub struct SubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub base_price_weekly: BigDecimal,
    pub base_price_monthly: BigDecimal,
    pub base_price_yearly: BigDecimal,
    pub included_spending_weekly: BigDecimal,
    pub included_spending_monthly: BigDecimal,
    pub overage_rate: BigDecimal,
    pub hard_limit_multiplier: BigDecimal,
    pub currency: String,
    pub stripe_price_id_weekly: Option<String>,
    pub stripe_price_id_monthly: Option<String>,
    pub stripe_price_id_yearly: Option<String>,
    pub plan_tier: i32,
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
                .map_err(|e| AppError::Internal(format!("Failed to parse plan features: {}", e)))
        }
    }

    /// Parse and cache typed features
    pub fn with_typed_features(mut self) -> Self {
        self.typed_features = serde_json::from_value(self.features.clone()).ok();
        self
    }

    /// Check if user with this plan can access a specific model
    pub fn can_use_model(&self, model_id: &str) -> Result<bool, AppError> {
        let features = self.get_typed_features()?;
        Ok(features.allows_model(model_id))
    }

    /// Check if the plan has API access
    pub fn has_api_access(&self) -> Result<bool, AppError> {
        let features = self.get_typed_features()?;
        Ok(features.has_api_access())
    }

    /// Check if overage is allowed for this plan
    pub fn allows_overage(&self) -> Result<bool, AppError> {
        let features = self.get_typed_features()?;
        Ok(features.allows_overage())
    }

    /// Get the support level for this plan
    pub fn get_support_level(&self) -> Result<SupportLevel, AppError> {
        let features = self.get_typed_features()?;
        Ok(features.get_support_level())
    }

    /// Get the overage policy for this plan
    pub fn get_overage_policy(&self) -> Result<OveragePolicy, AppError> {
        let features = self.get_typed_features()?;
        Ok(features.get_overage_policy())
    }

    /// Check if this is a free plan
    pub fn is_free_plan(&self) -> bool {
        self.base_price_monthly == bigdecimal::BigDecimal::from(0)
    }

    /// Get the monthly price as a float
    pub fn get_monthly_price_float(&self) -> f64 {
        self.base_price_monthly.to_f64().unwrap_or(0.0)
    }

    /// Get the plan tier for upgrade/downgrade comparison
    pub fn get_plan_tier(&self) -> i32 {
        self.plan_tier
    }

    /// Check if changing to another plan is an upgrade (higher tier)
    pub fn is_upgrade_to(&self, other_plan: &SubscriptionPlan) -> bool {
        other_plan.plan_tier > self.plan_tier
    }

    /// Check if changing to another plan is a downgrade (lower tier)
    pub fn is_downgrade_to(&self, other_plan: &SubscriptionPlan) -> bool {
        other_plan.plan_tier < self.plan_tier
    }

    /// Check if another plan is the same tier
    pub fn is_same_tier_as(&self, other_plan: &SubscriptionPlan) -> bool {
        other_plan.plan_tier == self.plan_tier
    }
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
        let query_str = "SELECT id, name, description, base_price_weekly, base_price_monthly, base_price_yearly, included_spending_weekly, included_spending_monthly, overage_rate, hard_limit_multiplier, currency, stripe_price_id_weekly, stripe_price_id_monthly, stripe_price_id_yearly, plan_tier, features, active FROM subscription_plans WHERE id = $1";
        
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
                    included_spending_weekly: row.get("included_spending_weekly"),
                    included_spending_monthly: row.get("included_spending_monthly"),
                    overage_rate: row.get("overage_rate"),
                    hard_limit_multiplier: row.get("hard_limit_multiplier"),
                    currency: row.get("currency"),
                    stripe_price_id_weekly: row.get("stripe_price_id_weekly"),
                    stripe_price_id_monthly: row.get("stripe_price_id_monthly"),
                    stripe_price_id_yearly: row.get("stripe_price_id_yearly"),
                    plan_tier: row.get("plan_tier"),
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
        let query_str = "SELECT id, name, description, base_price_weekly, base_price_monthly, base_price_yearly, included_spending_weekly, included_spending_monthly, overage_rate, hard_limit_multiplier, currency, stripe_price_id_weekly, stripe_price_id_monthly, stripe_price_id_yearly, plan_tier, features, active FROM subscription_plans ORDER BY plan_tier, id";
        
        let records = sqlx::query(query_str)
            .map(|row: PgRow| {
                SubscriptionPlan {
                    id: row.get("id"),
                    name: row.get("name"),
                    description: row.get("description"),
                    base_price_weekly: row.get("base_price_weekly"),
                    base_price_monthly: row.get("base_price_monthly"),
                    base_price_yearly: row.get("base_price_yearly"),
                    included_spending_weekly: row.get("included_spending_weekly"),
                    included_spending_monthly: row.get("included_spending_monthly"),
                    overage_rate: row.get("overage_rate"),
                    hard_limit_multiplier: row.get("hard_limit_multiplier"),
                    currency: row.get("currency"),
                    stripe_price_id_weekly: row.get("stripe_price_id_weekly"),
                    stripe_price_id_monthly: row.get("stripe_price_id_monthly"),
                    stripe_price_id_yearly: row.get("stripe_price_id_yearly"),
                    plan_tier: row.get("plan_tier"),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_plan_features_deserialization() {
        let json_data = json!({
            "coreFeatures": ["All AI models", "Priority support", "Advanced analytics", "API access"],
            "allowedModels": ["all"],
            "supportLevel": "Priority",
            "apiAccess": true,
            "analyticsLevel": "Advanced",
            "spendingDetails": {
                "overagePolicy": "standard_rate",
                "hardCutoff": true
            }
        });

        let features: PlanFeatures = serde_json::from_value(json_data).unwrap();
        
        assert_eq!(features.core_features.len(), 4);
        assert!(features.allows_all_models());
        assert!(features.has_api_access());
        assert_eq!(features.get_support_level(), SupportLevel::Priority);
        assert_eq!(features.get_overage_policy(), OveragePolicy::StandardRate);
        assert!(features.allows_overage());
    }

    #[test]
    fn test_free_plan_features() {
        let json_data = json!({
            "coreFeatures": ["Basic AI models", "Community support", "Usage analytics"],
            "allowedModels": ["anthropic/claude-sonnet-4", "openai/gpt-4.1-mini"],
            "supportLevel": "Community",
            "apiAccess": false,
            "analyticsLevel": "Basic",
            "spendingDetails": {
                "overagePolicy": "none",
                "hardCutoff": true
            }
        });

        let features: PlanFeatures = serde_json::from_value(json_data).unwrap();
        
        assert!(!features.allows_all_models());
        assert!(features.allows_model("anthropic/claude-sonnet-4"));
        assert!(!features.allows_model("anthropic/claude-opus-4"));
        assert!(!features.has_api_access());
        assert_eq!(features.get_support_level(), SupportLevel::Community);
        assert_eq!(features.get_overage_policy(), OveragePolicy::None);
        assert!(!features.allows_overage());
    }

    #[test]
    fn test_subscription_plan_convenience_methods() {
        let plan = SubscriptionPlan {
            id: "test".to_string(),
            name: "Test Plan".to_string(),
            description: Some("Test description".to_string()),
            base_price_weekly: BigDecimal::from(0),
            base_price_monthly: BigDecimal::from(0),
            base_price_yearly: BigDecimal::from(0),
            included_spending_weekly: BigDecimal::from(0),
            included_spending_monthly: BigDecimal::from(5),
            overage_rate: BigDecimal::from(1),
            hard_limit_multiplier: BigDecimal::from(2),
            currency: "USD".to_string(),
            stripe_price_id_weekly: None,
            stripe_price_id_monthly: None,
            stripe_price_id_yearly: None,
            plan_tier: 0,
            features: json!({
                "coreFeatures": ["Basic AI models"],
                "allowedModels": ["anthropic/claude-sonnet-4"],
                "supportLevel": "Community",
                "apiAccess": false,
                "analyticsLevel": "Basic",
                "spendingDetails": {
                    "overagePolicy": "none",
                    "hardCutoff": true
                }
            }),
            typed_features: None,
        }.with_typed_features();

        assert!(plan.is_free_plan());
        assert_eq!(plan.get_monthly_price_float(), 0.0);
        assert!(!plan.has_api_access().unwrap());
        assert!(!plan.allows_overage().unwrap());
        assert!(plan.can_use_model("anthropic/claude-sonnet-4").unwrap());
        assert!(!plan.can_use_model("anthropic/claude-opus-4").unwrap());
        assert_eq!(plan.get_support_level().unwrap(), SupportLevel::Community);
        assert_eq!(plan.get_overage_policy().unwrap(), OveragePolicy::None);
    }

    #[test]
    fn test_plan_tier_comparisons() {
        let free_plan = SubscriptionPlan {
            id: "free".to_string(),
            name: "Free".to_string(),
            description: None,
            base_price_weekly: BigDecimal::from(0),
            base_price_monthly: BigDecimal::from(0),
            base_price_yearly: BigDecimal::from(0),
            included_spending_weekly: BigDecimal::from(0),
            included_spending_monthly: BigDecimal::from(5),
            overage_rate: BigDecimal::from(1),
            hard_limit_multiplier: BigDecimal::from(2),
            currency: "USD".to_string(),
            stripe_price_id_weekly: None,
            stripe_price_id_monthly: None,
            stripe_price_id_yearly: None,
            plan_tier: 0,
            features: json!({}),
            typed_features: None,
        };

        let pro_plan = SubscriptionPlan {
            id: "pro".to_string(),
            name: "Pro".to_string(),
            description: None,
            base_price_weekly: BigDecimal::from(5),
            base_price_monthly: BigDecimal::from(20),
            base_price_yearly: BigDecimal::from(200),
            included_spending_weekly: BigDecimal::from(12),
            included_spending_monthly: BigDecimal::from(50),
            overage_rate: BigDecimal::from(1),
            hard_limit_multiplier: BigDecimal::from(3),
            currency: "USD".to_string(),
            stripe_price_id_weekly: None,
            stripe_price_id_monthly: None,
            stripe_price_id_yearly: None,
            plan_tier: 1,
            features: json!({}),
            typed_features: None,
        };

        let enterprise_plan = SubscriptionPlan {
            id: "enterprise".to_string(),
            name: "Enterprise".to_string(),
            description: None,
            base_price_weekly: BigDecimal::from(25),
            base_price_monthly: BigDecimal::from(100),
            base_price_yearly: BigDecimal::from(1000),
            included_spending_weekly: BigDecimal::from(50),
            included_spending_monthly: BigDecimal::from(200),
            overage_rate: BigDecimal::from(1),
            hard_limit_multiplier: BigDecimal::from(5),
            currency: "USD".to_string(),
            stripe_price_id_weekly: None,
            stripe_price_id_monthly: None,
            stripe_price_id_yearly: None,
            plan_tier: 2,
            features: json!({}),
            typed_features: None,
        };

        // Test tier comparisons
        assert_eq!(free_plan.get_plan_tier(), 0);
        assert_eq!(pro_plan.get_plan_tier(), 1);
        assert_eq!(enterprise_plan.get_plan_tier(), 2);

        // Test upgrade logic
        assert!(free_plan.is_upgrade_to(&pro_plan));
        assert!(free_plan.is_upgrade_to(&enterprise_plan));
        assert!(pro_plan.is_upgrade_to(&enterprise_plan));

        // Test downgrade logic
        assert!(pro_plan.is_downgrade_to(&free_plan));
        assert!(enterprise_plan.is_downgrade_to(&free_plan));
        assert!(enterprise_plan.is_downgrade_to(&pro_plan));

        // Test same tier logic
        assert!(free_plan.is_same_tier_as(&free_plan));
        assert!(pro_plan.is_same_tier_as(&pro_plan));
        assert!(enterprise_plan.is_same_tier_as(&enterprise_plan));

        // Test negatives
        assert!(!free_plan.is_downgrade_to(&pro_plan));
        assert!(!pro_plan.is_upgrade_to(&free_plan));
        assert!(!free_plan.is_same_tier_as(&pro_plan));
    }
}
