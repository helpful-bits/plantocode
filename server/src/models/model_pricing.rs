// This module implements a flexible, data-driven pricing model. Note that all pricing is ultimately
// resolved to a token-based cost. For services billed by other units (e.g., audio duration),
// the conversion to an equivalent token cost is handled at the application/handler level before
// using this pricing logic.

use bigdecimal::BigDecimal;
use std::str::FromStr;
use serde_json::Value;
use crate::clients::usage_extractor::ProviderUsage;
use tracing::{debug, warn};

// Extension trait for checked arithmetic operations on BigDecimal
trait CheckedBigDecimal {
    fn checked_add(&self, other: &Self) -> Option<Self> where Self: Sized;
    fn checked_mul(&self, other: &Self) -> Option<Self> where Self: Sized;
    fn checked_div(&self, other: &Self) -> Option<Self> where Self: Sized;
}

impl CheckedBigDecimal for BigDecimal {
    fn checked_add(&self, other: &Self) -> Option<Self> {
        // BigDecimal addition doesn't overflow in the traditional sense,
        // but we check the result is within reasonable bounds
        let result = self + other;
        if result.to_string().len() > 100 { // Reasonable precision limit
            None
        } else {
            Some(result)
        }
    }
    
    fn checked_mul(&self, other: &Self) -> Option<Self> {
        // BigDecimal multiplication doesn't overflow traditionally,
        // but we check the result is within reasonable bounds
        let result = self * other;
        if result.to_string().len() > 100 { // Reasonable precision limit
            None
        } else {
            Some(result)
        }
    }
    
    fn checked_div(&self, other: &Self) -> Option<Self> {
        use bigdecimal::Zero;
        if other.is_zero() {
            None
        } else {
            let result = self / other;
            if result.to_string().len() > 100 { // Reasonable precision limit
                None
            } else {
                Some(result)
            }
        }
    }
}

// Security constants for cost calculation validation
// These constants prevent cost calculation manipulation and ensure financial data integrity
/// Maximum allowed token count to prevent overflow attacks
const MAX_TOKENS: i64 = 1_000_000_000;
/// Minimum allowed pricing rate to prevent zero/negative cost exploits
const MIN_PRICE: &str = "0.000001";
/// Maximum allowed pricing rate to prevent excessive billing
const MAX_PRICE: i64 = 1000;

/// Defines the server's authoritative cost calculation logic for AI model usage.
/// 
/// This trait provides the core billing functionality that ensures consistent cost calculations
/// across all AI providers integrated into the system. The calculations are based on token counts
/// reported by upstream providers, but use pricing rates stored in the local
/// database rather than provider-reported costs.
/// 
/// This approach enables several key benefits:
/// - **Custom markups**: Apply organization-specific markup rates to base provider costs
/// - **Flexible billing models**: Support token-based pricing schemes
/// - **Consistent billing**: Ensure uniform cost calculation logic regardless of provider
/// - **Rate stability**: Maintain stable pricing even when providers change their rates
/// - **Audit trail**: Track cost calculations with local pricing data for compliance
/// 
/// The trait now uses a flexible JSON-based pricing schema that can adapt to different
/// provider pricing models without code changes.
pub trait ModelPricing {
    /// Get the flexible pricing information as a JSON value
    /// 
    /// The JSON structure can contain provider-specific keys:
    /// - For OpenAI: `input_per_million`, `output_per_million`, `cached_input_per_million`
    /// - For Anthropic: `input_per_million`, `output_per_million`, `cache_write_per_million`, `cache_read_per_million`
    /// - For Google: `input_per_million`, `output_per_million`, `input_long_context_per_million`, 
    ///   `output_long_context_per_million`, `long_context_threshold`
    fn get_pricing_info(&self) -> &Value;
    
    /// Calculate total cost based on provider usage and flexible pricing schema
    /// 
    /// This method extracts pricing information from the JSON pricing_info field
    /// and calculates costs based on the data-driven pricing model without
    /// any provider-specific logic.
    /// 
    /// The implementation uses checked arithmetic throughout to prevent overflow attacks
    /// and includes comprehensive validation for token counts and pricing rates to
    /// defend against invalid data.
    /// 
    /// # Arguments
    /// 
    /// * `usage` - The ProviderUsage struct containing token counts and provider information
    /// 
    /// # Returns
    /// 
    /// * `Ok(BigDecimal)` - The calculated cost
    /// * `Err(String)` - Error message if calculation fails
    fn calculate_total_cost(&self, usage: &ProviderUsage) -> Result<BigDecimal, String> {
        let pricing_info = self.get_pricing_info();
        
        debug!(
            "Calculating cost with data-driven pricing for usage: prompt_tokens={}, completion_tokens={}, cache_write={}, cache_read={}",
            usage.prompt_tokens, usage.completion_tokens, usage.cache_write_tokens, usage.cache_read_tokens
        );
        
        // Validate token counts
        validate_token_count(usage.prompt_tokens as i64, "prompt")?;
        validate_token_count(usage.completion_tokens as i64, "completion")?;
        validate_token_count(usage.cache_write_tokens as i64, "cache_write")?;
        validate_token_count(usage.cache_read_tokens as i64, "cache_read")?;
        
        let million = BigDecimal::from(1_000_000);
        let min_price = BigDecimal::from_str(MIN_PRICE)
            .map_err(|e| format!("Failed to parse minimum price: {}", e))?;
        let max_price = BigDecimal::from(MAX_PRICE);
        
        // Data-driven calculation based on available pricing fields
        let mut total_cost = BigDecimal::from(0);
        
        // Check for long context pricing threshold
        let long_context_threshold = parse_pricing_field_i64(pricing_info, "long_context_threshold")
            .unwrap_or(i64::MAX);
        let total_tokens = usage.prompt_tokens + usage.completion_tokens;
        let use_long_context = total_tokens as i64 > long_context_threshold;
        
        // Determine input pricing rate (with long context support)
        let input_rate = if use_long_context {
            parse_pricing_field(pricing_info, "input_long_context_per_million", &min_price, &max_price)
                .or_else(|_| parse_pricing_field(pricing_info, "input_per_million", &min_price, &max_price))
        } else {
            parse_pricing_field(pricing_info, "input_per_million", &min_price, &max_price)
                .or_else(|_| parse_pricing_field(pricing_info, "prompt_per_million", &min_price, &max_price))
        }?;
        
        // Determine output pricing rate (with long context support)
        let output_rate = if use_long_context {
            parse_pricing_field(pricing_info, "output_long_context_per_million", &min_price, &max_price)
                .or_else(|_| parse_pricing_field(pricing_info, "output_per_million", &min_price, &max_price))
        } else {
            parse_pricing_field(pricing_info, "output_per_million", &min_price, &max_price)
                .or_else(|_| parse_pricing_field(pricing_info, "completion_per_million", &min_price, &max_price))
        }?;
        
        // Calculate base input cost with checked arithmetic and enhanced validation
        let base_input_tokens = usage.prompt_tokens
            .checked_sub(usage.cache_write_tokens)
            .and_then(|v| v.checked_sub(usage.cache_read_tokens))
            .ok_or_else(|| "Token arithmetic overflow: cache tokens exceed prompt tokens".to_string())?;
        
        // Additional validation: ensure result is non-negative
        if base_input_tokens < 0 {
            return Err("Invalid token calculation: cache tokens exceed prompt tokens".to_string());
        }
        
        if base_input_tokens > 0 {
            let input_cost = calculate_token_cost(base_input_tokens as i64, &input_rate, &million)?;
            total_cost = total_cost.checked_add(&input_cost)
                .ok_or_else(|| "Cost arithmetic overflow in base input calculation".to_string())?;
        }
        
        // Calculate cache write cost (if available)
        if usage.cache_write_tokens > 0 {
            let cache_write_rate = parse_pricing_field(pricing_info, "cache_write_per_million", &min_price, &max_price)
                .unwrap_or_else(|_| input_rate.clone());
            let cache_write_cost = calculate_token_cost(usage.cache_write_tokens as i64, &cache_write_rate, &million)?;
            total_cost = total_cost.checked_add(&cache_write_cost)
                .ok_or_else(|| "Cost arithmetic overflow in cache write calculation".to_string())?;
        }
        
        // Calculate cache read cost (if available)
        if usage.cache_read_tokens > 0 {
            let cache_read_rate = parse_pricing_field(pricing_info, "cache_read_per_million", &min_price, &max_price)
                .or_else(|_| parse_pricing_field(pricing_info, "cached_input_per_million", &min_price, &max_price))
                .unwrap_or_else(|_| input_rate.clone());
            let cache_read_cost = calculate_token_cost(usage.cache_read_tokens as i64, &cache_read_rate, &million)?;
            total_cost = total_cost.checked_add(&cache_read_cost)
                .ok_or_else(|| "Cost arithmetic overflow in cache read calculation".to_string())?;
        }
        
        // Calculate output cost
        if usage.completion_tokens > 0 {
            let output_cost = calculate_token_cost(usage.completion_tokens as i64, &output_rate, &million)?;
            total_cost = total_cost.checked_add(&output_cost)
                .ok_or_else(|| "Cost arithmetic overflow in output calculation".to_string())?;
        }
        
        validate_total_cost(&total_cost, &max_price)?;
        Ok(total_cost)
    }
    
    /// Get the provider code for this model
    /// This is used to determine which pricing logic to apply
    fn get_provider_code(&self) -> String;
    
    /// Validate that the model has valid pricing configuration
    fn has_valid_pricing(&self) -> bool {
        let pricing_info = self.get_pricing_info();
        
        // Check if pricing_info is not null and has at least basic pricing
        if pricing_info.is_null() {
            return false;
        }
        
        // Must have at least input and output pricing
        pricing_info.get("input_per_million").is_some() && 
        pricing_info.get("output_per_million").is_some()
    }
    
    /// Get a description of the pricing model for this model
    fn pricing_model_description(&self) -> String {
        if self.has_valid_pricing() {
            "Token-based (flexible JSON pricing)".to_string()
        } else {
            "No pricing configured".to_string()
        }
    }
}

/// Helper function to parse a pricing field from JSON and validate it
fn parse_pricing_field(
    pricing_info: &Value,
    key: &str,
    min_price: &BigDecimal,
    max_price: &BigDecimal,
) -> Result<BigDecimal, String> {
    let price = pricing_info.get(key)
        .and_then(|v| v.as_f64())
        .ok_or_else(|| format!("Missing or invalid {} in pricing info", key))?;
    
    let price_bd = BigDecimal::from_str(&price.to_string())
        .map_err(|e| format!("Failed to parse {} as BigDecimal: {}", key, e))?;
    
    if price_bd < *min_price || price_bd > *max_price {
        return Err(format!(
            "{} pricing rate {} is outside allowed bounds ({} - {})",
            key, price_bd, min_price, max_price
        ));
    }
    
    Ok(price_bd)
}

/// Helper function to parse an integer field from JSON
fn parse_pricing_field_i64(pricing_info: &Value, key: &str) -> Option<i64> {
    pricing_info.get(key).and_then(|v| v.as_i64())
}

/// Calculate cost for a specific token count with checked arithmetic and comprehensive validation
fn calculate_token_cost(
    token_count: i64,
    rate: &BigDecimal,
    million: &BigDecimal,
) -> Result<BigDecimal, String> {
    // Validate token count
    if token_count < 0 {
        return Ok(BigDecimal::from(0));
    }
    
    // Validate token count against maximum allowed
    if token_count > MAX_TOKENS {
        return Err(format!("Token count {} exceeds maximum allowed {}", token_count, MAX_TOKENS));
    }
    
    // Validate pricing rate
    validate_pricing_rate(rate, "token cost calculation")?;
    
    let tokens_bd = BigDecimal::from(token_count);
    
    // Use checked multiplication to prevent overflow
    let product = rate.checked_mul(&tokens_bd)
        .ok_or_else(|| "Token cost multiplication overflow".to_string())?;
    
    // Check for overflow against maximum allowed cost
    let max_allowed = BigDecimal::from(MAX_PRICE).checked_mul(million)
        .ok_or_else(|| "Maximum price calculation overflow".to_string())?;
    
    if product > max_allowed {
        return Err("Token cost calculation would overflow maximum allowed cost".to_string());
    }
    
    // Safe division with checked arithmetic
    Ok(product.checked_div(million)
        .ok_or_else(|| "Token cost division error".to_string())?)
}

/// Validate that a token count is within bounds
fn validate_token_count(token_count: i64, context: &str) -> Result<(), String> {
    if token_count < 0 || token_count > MAX_TOKENS {
        return Err(format!(
            "Invalid {} token count: {}. Must be between 0 and {}",
            context, token_count, MAX_TOKENS
        ));
    }
    Ok(())
}

/// Validate that a pricing rate is within bounds
fn validate_pricing_rate(rate: &BigDecimal, context: &str) -> Result<(), String> {
    let min_price = BigDecimal::from_str(MIN_PRICE)
        .map_err(|e| format!("Failed to parse minimum price: {}", e))?;
    let max_price = BigDecimal::from(MAX_PRICE);
    
    if *rate < min_price || *rate > max_price {
        return Err(format!(
            "{} pricing rate {} is outside allowed bounds ({} - {})",
            context, rate, min_price, max_price
        ));
    }
    Ok(())
}

/// Validate that the total cost is within bounds
fn validate_total_cost(total_cost: &BigDecimal, max_price: &BigDecimal) -> Result<(), String> {
    if total_cost > max_price {
        return Err("Total cost calculation would exceed maximum allowed cost".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Mock implementation for testing
    struct MockModel {
        pricing_info: Value,
        provider_code: String,
    }

    impl ModelPricing for MockModel {
        fn get_pricing_info(&self) -> &Value {
            &self.pricing_info
        }
        
        fn get_provider_code(&self) -> String {
            self.provider_code.clone()
        }
    }

    #[test]
    fn test_data_driven_pricing_with_cache_read() {
        let model = MockModel {
            pricing_info: json!({
                "input_per_million": 0.5,
                "output_per_million": 1.5,
                "cached_input_per_million": 0.25
            }),
            provider_code: "test".to_string(),
        };
        
        let usage = ProviderUsage::new(1000, 500, 0, 200, "test-model".to_string());
        let result = model.calculate_total_cost(&usage);
        assert!(result.is_ok());
        
        // Should calculate: (800 * 0.5 + 200 * 0.25) / 1M + (500 * 1.5) / 1M
        // = (400 + 50) / 1M + 750 / 1M = 0.00045 + 0.00075 = 0.0012
        let cost = result.unwrap();
        let expected = BigDecimal::from_str("0.0012").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_data_driven_pricing_with_cache_write_read() {
        let model = MockModel {
            pricing_info: json!({
                "input_per_million": 3.0,
                "output_per_million": 15.0,
                "cache_write_per_million": 3.75,
                "cache_read_per_million": 0.30
            }),
            provider_code: "test".to_string(),
        };
        
        let usage = ProviderUsage::new(1000, 500, 200, 300, "test-model".to_string());
        let result = model.calculate_total_cost(&usage);
        assert!(result.is_ok());
        
        // Uncached: 1000 - 200 - 300 = 500
        // Cost: (500 * 3.0 + 200 * 3.75 + 300 * 0.30) / 1M + (500 * 15.0) / 1M
        // = (1500 + 750 + 90) / 1M + 7500 / 1M = 0.00234 + 0.0075 = 0.00984
        let cost = result.unwrap();
        let expected = BigDecimal::from_str("0.00984").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_data_driven_long_context_pricing() {
        let model = MockModel {
            pricing_info: json!({
                "input_per_million": 0.125,
                "output_per_million": 0.375,
                "input_long_context_per_million": 0.25,
                "output_long_context_per_million": 0.75,
                "long_context_threshold": 128000
            }),
            provider_code: "test".to_string(),
        };
        
        // Test with tokens exceeding threshold
        let usage = ProviderUsage::new(100000, 50000, 0, 0, "test-model".to_string());
        let result = model.calculate_total_cost(&usage);
        assert!(result.is_ok());
        
        // Total tokens: 150000 > 128000, so use long context pricing
        // Cost: (100000 * 0.25) / 1M + (50000 * 0.75) / 1M = 0.025 + 0.0375 = 0.0625
        let cost = result.unwrap();
        let expected = BigDecimal::from_str("0.0625").unwrap();
        assert_eq!(cost, expected);
    }

    #[test]
    fn test_invalid_token_count() {
        let model = MockModel {
            pricing_info: json!({
                "input_per_million": 1.0,
                "output_per_million": 2.0
            }),
            provider_code: "test".to_string(),
        };
        
        let usage = ProviderUsage::new(-100, 500, 0, 0, "test-model".to_string());
        let result = model.calculate_total_cost(&usage);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid prompt token count"));
    }

    #[test]
    fn test_missing_pricing_info() {
        let model = MockModel {
            pricing_info: json!({}),
            provider_code: "test".to_string(),
        };
        
        let usage = ProviderUsage::new(1000, 500, 0, 0, "test-model".to_string());
        let result = model.calculate_total_cost(&usage);
        assert!(result.is_err());
    }

    #[test]
    fn test_has_valid_pricing() {
        let valid_model = MockModel {
            pricing_info: json!({
                "input_per_million": 1.0,
                "output_per_million": 2.0
            }),
            provider_code: "test".to_string(),
        };
        assert!(valid_model.has_valid_pricing());
        
        let invalid_model = MockModel {
            pricing_info: json!({
                "input_per_million": 1.0
                // Missing output pricing
            }),
            provider_code: "test".to_string(),
        };
        assert!(!invalid_model.has_valid_pricing());
        
        let null_model = MockModel {
            pricing_info: json!(null),
            provider_code: "test".to_string(),
        };
        assert!(!null_model.has_valid_pricing());
    }

    #[test]
    fn test_checked_arithmetic_overflow_protection() {
        let model = MockModel {
            pricing_info: json!({
                "input_per_million": 999.99,
                "output_per_million": 999.99
            }),
            provider_code: "test".to_string(),
        };
        
        // Test with very large token counts near MAX_TOKENS
        let usage = ProviderUsage::new(999_999_999, 999_999_999, 0, 0, "test-model".to_string());
        let result = model.calculate_total_cost(&usage);
        
        // Should handle large numbers without overflow
        assert!(result.is_ok());
        let cost = result.unwrap();
        assert!(cost > BigDecimal::from(0));
    }

    #[test]
    fn test_cache_tokens_exceed_prompt_tokens() {
        let model = MockModel {
            pricing_info: json!({
                "input_per_million": 1.0,
                "output_per_million": 2.0,
                "cache_write_per_million": 0.5,
                "cache_read_per_million": 0.25
            }),
            provider_code: "test".to_string(),
        };
        
        // Cache tokens exceed prompt tokens - this should fail
        let usage = ProviderUsage::new(1000, 500, 600, 600, "test-model".to_string());
        let result = model.calculate_total_cost(&usage);
        
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Token arithmetic overflow"));
    }
}