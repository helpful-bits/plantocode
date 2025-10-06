use crate::clients::usage_extractor::ProviderUsage;
use crate::db::repositories::model_repository::ModelWithProvider;
use crate::error::AppError;
use crate::models::model_pricing::ModelPricing;
use crate::utils::financial_validation::normalize_cost;
/// Simplified cost resolver for server-side billing.
///
/// This service provides cost calculation using server-side model pricing and serves as the
/// single source of truth for all cost calculations in the billing system.
///
/// It directly delegates to the model's calculate_total_cost method which handles all the
/// complexity of provider-specific pricing models. This design intentionally ignores
/// provider-reported costs in favor of server-authoritative pricing to ensure billing consistency.
use bigdecimal::{BigDecimal, Zero};
use tracing::{info, warn};

/// Simple cost resolver for server-side calculations
pub struct CostResolver;

impl CostResolver {
    /// Resolve the final cost using server-authoritative pricing
    ///
    /// This method serves as the single source of truth for cost calculation in the billing system.
    /// It directly delegates to the model's calculate_total_cost method, which handles all
    /// provider-specific pricing logic based on the flexible JSON pricing schema.
    ///
    /// Key design principles:
    /// - Server-authoritative pricing takes precedence over provider-reported costs
    /// - Provider-reported costs are logged for auditing purposes but never used for billing
    /// - All cost calculations must flow through this centralized resolution mechanism
    /// - This ensures billing consistency and prevents cost manipulation
    pub fn resolve(
        usage: ProviderUsage,
        model: &ModelWithProvider,
    ) -> Result<BigDecimal, AppError> {
        // Delegate to the model's calculate_total_cost method - this is the single source of truth
        match model.calculate_total_cost(&usage) {
            Ok(cost) => {
                let final_cost = normalize_cost(&cost);

                // Log detailed cost comparison for auditing
                if let Some(ref provider_cost) = usage.cost {
                    let diff = &final_cost - provider_cost;
                    let diff_percent = if !provider_cost.is_zero() {
                        ((&diff / provider_cost) * BigDecimal::from(100)).round(2)
                    } else {
                        BigDecimal::from(0)
                    };

                    info!(
                        "Cost audit - Model: {} | Provider: ${:.6} | Calculated: ${:.6} | Diff: ${:.6} ({:.2}%) | Tokens: {} input ({} cache_write, {} cache_read), {} output",
                        usage.model_id,
                        provider_cost,
                        final_cost,
                        diff,
                        diff_percent,
                        usage.prompt_tokens,
                        usage.cache_write_tokens,
                        usage.cache_read_tokens,
                        usage.completion_tokens
                    );
                } else {
                    info!(
                        "Cost calculated - Model: {} | Calculated: ${:.6} | Tokens: {} input ({} cache_write, {} cache_read), {} output",
                        usage.model_id,
                        final_cost,
                        usage.prompt_tokens,
                        usage.cache_write_tokens,
                        usage.cache_read_tokens,
                        usage.completion_tokens
                    );
                }

                Ok(final_cost)
            }
            Err(e) => Err(AppError::Internal(format!(
                "Failed to calculate cost for model {}: {}",
                usage.model_id, e
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients::usage_extractor::ProviderUsage;
    use crate::db::repositories::model_repository::ModelWithProvider;
    use bigdecimal::BigDecimal;
    use chrono::Utc;
    use serde_json::json;
    use std::str::FromStr;

    // Helper function to create a test model with new JSON pricing
    fn create_test_model() -> ModelWithProvider {
        ModelWithProvider {
            id: "test/model".to_string(),
            resolved_model_id: "model".to_string(),
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
        let usage = ProviderUsage::new(1000, 500, 0, 0, "test-model".to_string());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model).unwrap();

        // Should be calculated by model.calculate_total_cost
        // Expected: (1000 * 0.01 / 1000000) + (500 * 0.02 / 1000000) = 0.00001 + 0.00001 = 0.00002
        let expected = BigDecimal::from_str("0.00002").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_ignores_provider_cost() {
        let mut usage = ProviderUsage::new(1000, 500, 0, 0, "test-model".to_string());
        usage.cost = Some(BigDecimal::from_str("0.0050").unwrap());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model).unwrap();

        // Should ignore provider cost and use server calculation
        let expected = BigDecimal::from_str("0.00002").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_with_cache_tokens() {
        let usage = ProviderUsage::new(1000, 500, 200, 300, "test-model".to_string());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model).unwrap();

        // Should delegate to model.calculate_total_cost which handles cache pricing
        // Model uses default pricing logic, so calculation would be:
        // Base input tokens: 1000 - 200 - 300 = 500
        // Cost calculation:
        // - Base input: 500 * 0.01 / 1000000 = 0.000005
        // - Cache write: 200 * 0.015 / 1000000 = 0.000003
        // - Cache read: 300 * 0.005 / 1000000 = 0.0000015
        // - Completion: 500 * 0.02 / 1000000 = 0.00001
        // Total = 0.0000195
        // But BigDecimal representation shows scale=6, digits=[20] which is 0.000020
        let expected = BigDecimal::from_str("0.000020").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_handles_calculation_error() {
        let usage = ProviderUsage::new(-1000, 500, 0, 0, "test-model".to_string()); // Invalid negative tokens
        let model = create_test_model();

        let result = CostResolver::resolve(usage, &model);

        // Should return error on calculation failure
        assert!(result.is_err());
    }
}
