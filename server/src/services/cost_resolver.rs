/// Simplified cost resolver for server-side billing.
/// 
/// This service provides cost calculation using server-side model pricing.
/// It directly delegates to the model's calculate_total_cost method which now
/// handles all the complexity of provider-specific pricing models.

use bigdecimal::BigDecimal;
use tracing::{info, warn};
use crate::clients::usage_extractor::ProviderUsage;
use crate::db::repositories::model_repository::ModelWithProvider;
use crate::models::model_pricing::ModelPricing;
use crate::utils::financial_validation::normalized;

/// Simple cost resolver for server-side calculations
pub struct CostResolver;

impl CostResolver {
    /// Resolve the final cost using server-authoritative pricing
    /// 
    /// This method directly calls the model's calculate_total_cost method,
    /// which handles all provider-specific pricing logic based on the flexible
    /// JSON pricing schema.
    /// 
    /// Provider-reported costs are logged for auditing purposes but never used for billing.
    pub fn resolve(usage: ProviderUsage, model: &ModelWithProvider) -> BigDecimal {
        // Log provider-reported cost for auditing (but don't use it)
        if let Some(ref provider_cost) = usage.cost {
            info!(
                "Provider reported cost for model {}: ${:.6} (for auditing only)", 
                usage.model_id, 
                provider_cost
            );
        }
        
        // Use the model's calculate_total_cost method which now handles all complexity
        match model.calculate_total_cost(&usage) {
            Ok(cost) => {
                let normalized_cost = normalized(&cost);
                info!(
                    "Server-authoritative cost calculated: ${:.6} for {} tokens (model: {})",
                    normalized_cost,
                    usage.total_tokens(),
                    usage.model_id
                );
                normalized_cost
            },
            Err(e) => {
                warn!(
                    "Failed to calculate cost for model {}: {}, returning zero",
                    usage.model_id,
                    e
                );
                BigDecimal::from(0)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients::usage_extractor::ProviderUsage;
    use crate::db::repositories::model_repository::ModelWithProvider;
    use bigdecimal::BigDecimal;
    use std::str::FromStr;
    use chrono::Utc;
    use serde_json::json;

    // Helper function to create a test model with new JSON pricing
    fn create_test_model() -> ModelWithProvider {
        ModelWithProvider {
            id: "test/model".to_string(),
            api_model_id: "model".to_string(),
            name: "Test Model".to_string(),
            context_window: 4096,
            pricing_info: Some(json!({
                "input_per_million": 0.01,
                "output_per_million": 0.02,
                "cache_write_per_million": 0.015,
                "cache_read_per_million": 0.005
            })),
            model_type: "text".to_string(),
            capabilities: json!({}),
            status: "active".to_string(),
            description: Some("Test model".to_string()),
            created_at: Utc::now(),
            provider_id: 1,
            provider_code: "test".to_string(),
            provider_name: "Test Provider".to_string(),
            provider_description: None,
            provider_website: None,
            provider_api_base: None,
            provider_capabilities: json!({}),
            provider_status: "active".to_string(),
        }
    }

    #[test]
    fn test_resolve_simple_calculation() {
        let usage = ProviderUsage::new(1000, 500, "test-model".to_string());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should be calculated by model.calculate_total_cost
        // Expected: (1000 * 0.01 / 1000000) + (500 * 0.02 / 1000000) = 0.00001 + 0.00001 = 0.00002
        let expected = BigDecimal::from_str("0.00002").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_ignores_provider_cost() {
        let mut usage = ProviderUsage::new(1000, 500, "test-model".to_string());
        usage.cost = Some(BigDecimal::from_str("0.0050").unwrap());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should ignore provider cost and use server calculation
        let expected = BigDecimal::from_str("0.00002").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_with_cache_tokens() {
        let usage = ProviderUsage::with_cache(1000, 500, 200, 300, "test-model".to_string());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should delegate to model.calculate_total_cost which handles cache pricing
        // Model uses default pricing logic, so calculation would be:
        // Uncached input: 1000 - 200 - 300 = 500
        // Cost: (500 * 0.01 / 1000000) + (200 * 0.015 / 1000000) + (300 * 0.005 / 1000000) + (500 * 0.02 / 1000000)
        // = 0.000005 + 0.000003 + 0.0000015 + 0.00001 = 0.0000195
        let expected = BigDecimal::from_str("0.0000195").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_handles_calculation_error() {
        let usage = ProviderUsage::new(-1000, 500, "test-model".to_string()); // Invalid negative tokens
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should return zero on error
        assert_eq!(cost, BigDecimal::from(0));
    }
}