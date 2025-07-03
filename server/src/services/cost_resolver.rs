/// Simplified cost resolver for server-side billing.
/// 
/// This service provides cost calculation using server-side model pricing.

use bigdecimal::BigDecimal;
use std::str::FromStr;
use tracing::{debug, info, warn};
use crate::clients::usage_extractor::ProviderUsage;
use crate::db::repositories::model_repository::ModelWithProvider;
use crate::models::model_pricing::ModelPricing;

/// Simple cost resolver for server-side calculations
pub struct CostResolver;

impl CostResolver {
    /// Resolve the final cost with provider cost prioritization
    /// 
    /// Cost resolution priority:
    /// 1. Provider-supplied cost (OpenRouter, future providers with cost data)
    /// 2. Server-calculated cost (Anthropic, OpenAI, Google, etc.)
    /// 
    /// This ensures that accurate provider costs are preserved instead of being
    /// discarded by server recalculation.
    pub fn resolve(usage: ProviderUsage, model: &ModelWithProvider) -> BigDecimal {
        // First priority: Use provider-supplied cost if available
        if let Some(provider_cost) = usage.cost {
            debug!(
                "Using provider-supplied cost for model {}: ${:.6}", 
                usage.model_id, 
                provider_cost
            );
            
            // Validate provider cost is non-negative
            if provider_cost < 0.0 {
                warn!(
                    "Invalid negative provider cost ${:.6} for model {}, falling back to server calculation",
                    provider_cost,
                    usage.model_id
                );
            } else {
                // Convert provider cost to BigDecimal
                match BigDecimal::from_str(&provider_cost.to_string()) {
                    Ok(cost_decimal) => {
                        info!(
                            "Cost resolved from provider: ${:.6} for {} tokens (model: {})",
                            provider_cost,
                            usage.total_tokens(),
                            usage.model_id
                        );
                        return cost_decimal;
                    }
                    Err(e) => {
                        warn!(
                            "Failed to convert provider cost ${:.6} to BigDecimal: {}, falling back to server calculation",
                            provider_cost,
                            e
                        );
                    }
                }
            }
        }
        
        // Second priority: Server-calculated cost
        debug!(
            "Using server-calculated cost for model {} ({} prompt tokens, {} completion tokens, {} cache write, {} cache read)",
            usage.model_id,
            usage.prompt_tokens,
            usage.completion_tokens,
            usage.cache_write_tokens,
            usage.cache_read_tokens
        );
        
        let input_cost = model.calculate_input_cost(
            usage.prompt_tokens as i64,
            usage.cache_write_tokens as i64, 
            usage.cache_read_tokens as i64
        ).unwrap_or_default();
        
        let output_cost = if let Some(rate) = model.get_output_cost_per_million_tokens() {
            let tokens = BigDecimal::from(usage.completion_tokens);
            (rate * tokens) / BigDecimal::from(1_000_000)
        } else {
            BigDecimal::from(0)
        };
        
        let server_calculated_cost = input_cost + output_cost;
        
        info!(
            "Cost resolved from server calculation: ${:.6} for {} tokens (model: {})",
            server_calculated_cost,
            usage.total_tokens(),
            usage.model_id
        );
        
        server_calculated_cost
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

    // Helper function to create a test model
    fn create_test_model() -> ModelWithProvider {
        ModelWithProvider {
            id: "test/model".to_string(),
            api_model_id: "model".to_string(),
            name: "Test Model".to_string(),
            context_window: 4096,
            price_input: BigDecimal::from_str("0.01").unwrap(),
            price_output: BigDecimal::from_str("0.02").unwrap(),
            model_type: "text".to_string(),
            capabilities: json!({}),
            status: "active".to_string(),
            description: Some("Test model".to_string()),
            created_at: Utc::now(),
            price_input_long_context: None,
            price_output_long_context: None,
            long_context_threshold: None,
            price_cache_write: Some(BigDecimal::from_str("0.015").unwrap()),
            price_cache_read: Some(BigDecimal::from_str("0.005").unwrap()),
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
    fn test_resolve_server_calculation() {
        let usage = ProviderUsage::new(1000, 500, "test-model".to_string());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should be calculated: (1000 * 0.01 / 1000000) + (500 * 0.02 / 1000000) = 0.00001 + 0.00001 = 0.00002
        let expected = BigDecimal::from_str("0.00002").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_provider_cost_priority() {
        let usage = ProviderUsage::with_cost(1000, 500, 0, 0, "test-model".to_string(), Some(0.0050));
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should use provider cost instead of server calculation
        let expected = BigDecimal::from_str("0.0050").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_provider_cost_zero() {
        let usage = ProviderUsage::with_cost(1000, 500, 0, 0, "test-model".to_string(), Some(0.0));
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should use provider cost of 0.0
        let expected = BigDecimal::from_str("0.0").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_negative_provider_cost_fallback() {
        let usage = ProviderUsage::with_cost(1000, 500, 0, 0, "test-model".to_string(), Some(-0.001));
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should fall back to server calculation for negative cost
        let expected = BigDecimal::from_str("0.00002").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_no_provider_cost() {
        let usage = ProviderUsage::with_cost(1000, 500, 0, 0, "test-model".to_string(), None);
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should use server calculation when provider cost is None
        let expected = BigDecimal::from_str("0.00002").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_provider_cost_with_cache_tokens() {
        let usage = ProviderUsage::with_cost(1000, 500, 200, 300, "test-model".to_string(), Some(0.0075));
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should use provider cost regardless of cache tokens present
        let expected = BigDecimal::from_str("0.0075").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_resolve_with_cache_tokens() {
        let usage = ProviderUsage::with_cache(1000, 500, 200, 300, "test-model".to_string());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should calculate with cache pricing
        assert!(cost > BigDecimal::from(0));
    }

    #[test]
    fn test_resolve_with_invalid_usage() {
        let usage = ProviderUsage {
            prompt_tokens: -1, // Invalid
            completion_tokens: 500,
            cache_write_tokens: 0,
            cache_read_tokens: 0,
            model_id: "test-model".to_string(),
            duration_ms: None,
            cost: None,
        };
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Should handle gracefully and return calculated cost or zero
        assert!(cost >= BigDecimal::from(0));
    }

    #[test]
    fn test_resolve_with_no_pricing_configuration() {
        let usage = ProviderUsage::new(1000, 500, "test-model".to_string());
        let mut model = create_test_model();
        model.price_input = BigDecimal::from(0);
        model.price_output = BigDecimal::from(0);

        let cost = CostResolver::resolve(usage, &model);

        assert_eq!(cost, BigDecimal::from(0));
    }

    #[test]
    fn test_cost_calculation_completeness() {
        let usage = ProviderUsage::new(1000, 500, "test-model".to_string());
        let model = create_test_model();

        let cost = CostResolver::resolve(usage, &model);

        // Verify cost is calculated properly
        assert!(cost >= BigDecimal::from(0));
    }
}