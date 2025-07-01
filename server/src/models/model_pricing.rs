use bigdecimal::BigDecimal;
use std::str::FromStr;

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
/// The trait supports token-based pricing models:
/// - Token-based: Costs calculated from input/output token counts
pub trait ModelPricing {
    fn get_input_cost_per_million_tokens(&self) -> Option<BigDecimal>;
    fn get_output_cost_per_million_tokens(&self) -> Option<BigDecimal>;
    fn get_cache_write_cost_per_million_tokens(&self) -> Option<BigDecimal>;
    fn get_cache_read_cost_per_million_tokens(&self) -> Option<BigDecimal>;
    fn get_input_long_context_cost_per_million_tokens(&self) -> Option<BigDecimal>;
    fn get_output_long_context_cost_per_million_tokens(&self) -> Option<BigDecimal>;
    fn get_long_context_threshold(&self) -> Option<i32>;
    
    /// Calculate input token cost with cached token pricing support and security validation
    /// This method handles uncached input tokens, cache write tokens, and cache read tokens
    fn calculate_input_cost(&self, uncached_tokens: i64, cache_write_tokens: i64, cache_read_tokens: i64) -> Result<BigDecimal, String> {
        // Validate all token counts
        if uncached_tokens < 0 || uncached_tokens > MAX_TOKENS {
            return Err(format!("Invalid uncached token count: {}. Must be between 0 and {}", uncached_tokens, MAX_TOKENS));
        }
        if cache_write_tokens < 0 || cache_write_tokens > MAX_TOKENS {
            return Err(format!("Invalid cache write token count: {}. Must be between 0 and {}", cache_write_tokens, MAX_TOKENS));
        }
        if cache_read_tokens < 0 || cache_read_tokens > MAX_TOKENS {
            return Err(format!("Invalid cache read token count: {}. Must be between 0 and {}", cache_read_tokens, MAX_TOKENS));
        }
        
        let million = BigDecimal::from(1_000_000);
        let min_price = BigDecimal::from_str(MIN_PRICE)
            .map_err(|e| format!("Failed to parse minimum price: {}", e))?;
        let max_price = BigDecimal::from(MAX_PRICE);
        
        // Calculate uncached input cost with validation
        let uncached_cost = if let Some(rate) = self.get_input_cost_per_million_tokens() {
            if rate < min_price || rate > max_price {
                return Err(format!("Input pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price));
            }
            
            let uncached_tokens_bd = BigDecimal::from(uncached_tokens);
            let product = &rate * &uncached_tokens_bd;
            if product > (&max_price * &million) {
                return Err("Uncached input cost calculation would overflow maximum allowed cost".to_string());
            }
            product / &million
        } else {
            BigDecimal::from(0)
        };
        
        // Calculate cache write cost with validation
        let cache_write_cost = if let Some(rate) = self.get_cache_write_cost_per_million_tokens() {
            if rate < min_price || rate > max_price {
                return Err(format!("Cache write pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price));
            }
            
            let cache_write_tokens_bd = BigDecimal::from(cache_write_tokens);
            let product = &rate * &cache_write_tokens_bd;
            if product > (&max_price * &million) {
                return Err("Cache write cost calculation would overflow maximum allowed cost".to_string());
            }
            product / &million
        } else if let Some(rate) = self.get_input_cost_per_million_tokens() {
            // Fallback to regular input pricing with validation
            if rate < min_price || rate > max_price {
                return Err(format!("Input pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price));
            }
            
            let cache_write_tokens_bd = BigDecimal::from(cache_write_tokens);
            let product = &rate * &cache_write_tokens_bd;
            if product > (&max_price * &million) {
                return Err("Cache write cost (fallback) calculation would overflow maximum allowed cost".to_string());
            }
            product / &million
        } else {
            BigDecimal::from(0)
        };
        
        // Calculate cache read cost with validation
        let cache_read_cost = if let Some(rate) = self.get_cache_read_cost_per_million_tokens() {
            if rate < min_price || rate > max_price {
                return Err(format!("Cache read pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price));
            }
            
            let cache_read_tokens_bd = BigDecimal::from(cache_read_tokens);
            let product = &rate * &cache_read_tokens_bd;
            if product > (&max_price * &million) {
                return Err("Cache read cost calculation would overflow maximum allowed cost".to_string());
            }
            product / &million
        } else if let Some(rate) = self.get_input_cost_per_million_tokens() {
            // Fallback to regular input pricing with validation
            if rate < min_price || rate > max_price {
                return Err(format!("Input pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price));
            }
            
            let cache_read_tokens_bd = BigDecimal::from(cache_read_tokens);
            let product = &rate * &cache_read_tokens_bd;
            if product > (&max_price * &million) {
                return Err("Cache read cost (fallback) calculation would overflow maximum allowed cost".to_string());
            }
            product / &million
        } else {
            BigDecimal::from(0)
        };
        
        // Check for overflow in final addition
        let total_cost = &uncached_cost + &cache_write_cost + &cache_read_cost;
        if total_cost > max_price {
            return Err("Total input cost calculation would exceed maximum allowed cost".to_string());
        }
        
        Ok(total_cost)
    }

    /// Calculate token-based cost with precise BigDecimal arithmetic and security validation
    /// This is the core cost calculation method for token-based models
    fn calculate_token_cost(&self, input_tokens: i64, output_tokens: i64) -> Result<BigDecimal, String> {
        // Validate token counts
        if input_tokens < 0 || input_tokens > MAX_TOKENS {
            return Err(format!("Invalid input token count: {}. Must be between 0 and {}", input_tokens, MAX_TOKENS));
        }
        if output_tokens < 0 || output_tokens > MAX_TOKENS {
            return Err(format!("Invalid output token count: {}. Must be between 0 and {}", output_tokens, MAX_TOKENS));
        }
        
        // Use BigDecimal constants to maintain precision
        let million = BigDecimal::from(1_000_000);
        let min_price = BigDecimal::from_str(MIN_PRICE)
            .map_err(|e| format!("Failed to parse minimum price: {}", e))?;
        let max_price = BigDecimal::from(MAX_PRICE);
        
        // Calculate input cost with bounds checking
        let input_cost = if let Some(rate) = self.get_input_cost_per_million_tokens() {
            // Validate pricing bounds
            if rate < min_price || rate > max_price {
                return Err(format!("Input pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price));
            }
            
            let input_tokens_bd = BigDecimal::from(input_tokens);
            
            // Check for potential overflow before multiplication
            let product = &rate * &input_tokens_bd;
            if product > (&max_price * &million) {
                return Err("Input cost calculation would overflow maximum allowed cost".to_string());
            }
            
            product / &million
        } else {
            BigDecimal::from(0)
        };
            
        // Calculate output cost with bounds checking
        let output_cost = if let Some(rate) = self.get_output_cost_per_million_tokens() {
            // Validate pricing bounds
            if rate < min_price || rate > max_price {
                return Err(format!("Output pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price));
            }
            
            let output_tokens_bd = BigDecimal::from(output_tokens);
            
            // Check for potential overflow before multiplication
            let product = &rate * &output_tokens_bd;
            if product > (&max_price * &million) {
                return Err("Output cost calculation would overflow maximum allowed cost".to_string());
            }
            
            product / &million
        } else {
            BigDecimal::from(0)
        };
        
        // Check for overflow in final addition
        let total_cost = &input_cost + &output_cost;
        if total_cost > max_price {
            return Err("Total cost calculation would exceed maximum allowed cost".to_string());
        }
            
        // Return total cost as BigDecimal
        Ok(total_cost)
    }
    
    /// Calculate total cost for token-based models with security validation
    fn calculate_total_cost(&self, input_tokens: i64, output_tokens: i64) -> Result<BigDecimal, String> {
        // Use secure cache-aware method for input cost (treating all as uncached for backwards compatibility)
        let input_cost = self.calculate_input_cost(input_tokens, 0, 0)?;
        
        // Calculate output cost separately with validation
        let million = BigDecimal::from(1_000_000);
        let min_price = BigDecimal::from_str(MIN_PRICE)
            .map_err(|e| format!("Failed to parse minimum price: {}", e))?;
        let max_price = BigDecimal::from(MAX_PRICE);
        
        // Validate output tokens
        if output_tokens < 0 || output_tokens > MAX_TOKENS {
            return Err(format!("Invalid output token count: {}. Must be between 0 and {}", output_tokens, MAX_TOKENS));
        }
        
        let output_cost = if let Some(rate) = self.get_output_cost_per_million_tokens() {
            if rate < min_price || rate > max_price {
                return Err(format!("Output pricing rate {} is outside allowed bounds ({} - {})", rate, min_price, max_price));
            }
            
            let output_tokens_bd = BigDecimal::from(output_tokens);
            let product = &rate * &output_tokens_bd;
            if product > (&max_price * &million) {
                return Err("Output cost calculation would overflow maximum allowed cost".to_string());
            }
            product / &million
        } else {
            BigDecimal::from(0)
        };
            
        let total_cost = &input_cost + &output_cost;
        if total_cost > max_price {
            return Err("Total cost calculation would exceed maximum allowed cost".to_string());
        }
        
        Ok(total_cost)
    }
    
    /// Validate that the model has valid pricing configuration
    fn has_valid_pricing(&self) -> bool {
        self.get_input_cost_per_million_tokens().is_some() 
            || self.get_output_cost_per_million_tokens().is_some()
    }
    
    /// Get a description of the pricing model for this model
    fn pricing_model_description(&self) -> String {
        let has_token_pricing = self.get_input_cost_per_million_tokens().is_some() 
            || self.get_output_cost_per_million_tokens().is_some();
        
        if has_token_pricing {
            "Token-based".to_string()
        } else {
            "No pricing configured".to_string()
        }
    }
}

/// Helper functions for safe BigDecimal operations in pricing calculations
pub mod pricing_utils {
    use super::*;
    
    /// Validate token count is within security bounds
    pub fn validate_token_count(token_count: i64, context: &str) -> Result<(), String> {
        if token_count < 0 || token_count > MAX_TOKENS {
            return Err(format!("Invalid {} token count: {}. Must be between 0 and {}", context, token_count, MAX_TOKENS));
        }
        Ok(())
    }
    
    /// Validate pricing rate is within security bounds
    pub fn validate_pricing_rate(rate: &BigDecimal, context: &str) -> Result<(), String> {
        let min_price = BigDecimal::from_str(MIN_PRICE)
            .map_err(|e| format!("Failed to parse minimum price: {}", e))?;
        let max_price = BigDecimal::from(MAX_PRICE);
        
        if *rate < min_price || *rate > max_price {
            return Err(format!("{} pricing rate {} is outside allowed bounds ({} - {})", context, rate, min_price, max_price));
        }
        Ok(())
    }
    
    /// Check for BigDecimal multiplication overflow before performing operation
    pub fn check_multiplication_overflow(a: &BigDecimal, b: &BigDecimal, context: &str) -> Result<(), String> {
        let max_price = BigDecimal::from(MAX_PRICE);
        let million = BigDecimal::from(1_000_000);
        let max_product = &max_price * &million;
        
        let product = a * b;
        if product > max_product {
            return Err(format!("{} calculation would overflow maximum allowed cost", context));
        }
        Ok(())
    }
    
    /// Safely convert a float to BigDecimal for pricing (should be avoided in production)
    /// This is provided for backward compatibility but BigDecimal constants should be preferred
    pub fn safe_float_to_bigdecimal(value: f64) -> Result<BigDecimal, String> {
        if value.is_finite() {
            BigDecimal::from_str(&value.to_string())
                .map_err(|e| format!("Failed to convert float to BigDecimal: {}", e))
        } else {
            Err("Cannot convert infinite or NaN float to BigDecimal".to_string())
        }
    }
    
    /// Apply markup percentage to a base cost using precise BigDecimal arithmetic with overflow protection
    pub fn apply_markup(base_cost: &BigDecimal, markup_percentage: &BigDecimal) -> Result<BigDecimal, String> {
        // Validate inputs
        if *base_cost < BigDecimal::from(0) {
            return Err("Base cost cannot be negative".to_string());
        }
        if *markup_percentage <= BigDecimal::from(0) {
            return Err("Markup percentage must be positive".to_string());
        }
        
        // Check for overflow
        check_multiplication_overflow(base_cost, markup_percentage, "Markup")?;
        
        // markup_percentage should be like 1.20 for 20% markup
        let result = base_cost * markup_percentage;
        let max_price = BigDecimal::from(MAX_PRICE);
        if result > max_price {
            return Err("Markup calculation would exceed maximum allowed cost".to_string());
        }
        
        Ok(result)
    }
    
    /// Calculate percentage of cost used (for spending limit calculations) with validation
    pub fn calculate_usage_percentage(current_cost: &BigDecimal, limit_cost: &BigDecimal) -> Result<Option<BigDecimal>, String> {
        if *current_cost < BigDecimal::from(0) {
            return Err("Current cost cannot be negative".to_string());
        }
        if *limit_cost < BigDecimal::from(0) {
            return Err("Limit cost cannot be negative".to_string());
        }
        
        if *limit_cost > BigDecimal::from(0) {
            let hundred = BigDecimal::from(100);
            // Check for overflow in multiplication
            check_multiplication_overflow(current_cost, &hundred, "Usage percentage")?;
            
            let result = (current_cost * hundred) / limit_cost;
            Ok(Some(result))
        } else {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::pricing_utils::*;

    // Mock implementation for testing
    struct MockModel {
        input_rate: Option<BigDecimal>,
        output_rate: Option<BigDecimal>,
    }

    impl ModelPricing for MockModel {
        fn get_input_cost_per_million_tokens(&self) -> Option<BigDecimal> {
            self.input_rate.clone()
        }
        
        fn get_output_cost_per_million_tokens(&self) -> Option<BigDecimal> {
            self.output_rate.clone()
        }
        
        fn get_cache_write_cost_per_million_tokens(&self) -> Option<BigDecimal> { None }
        fn get_cache_read_cost_per_million_tokens(&self) -> Option<BigDecimal> { None }
        fn get_input_long_context_cost_per_million_tokens(&self) -> Option<BigDecimal> { None }
        fn get_output_long_context_cost_per_million_tokens(&self) -> Option<BigDecimal> { None }
        fn get_long_context_threshold(&self) -> Option<i32> { None }
    }

    #[test]
    fn test_token_count_validation() {
        let model = MockModel {
            input_rate: Some(BigDecimal::from_str("0.01").unwrap()),
            output_rate: Some(BigDecimal::from_str("0.02").unwrap()),
        };

        // Test negative token count
        assert!(model.calculate_token_cost(-1, 1000).is_err());
        
        // Test excessive token count
        assert!(model.calculate_token_cost(MAX_TOKENS + 1, 1000).is_err());
        
        // Test valid token count
        assert!(model.calculate_token_cost(1000, 1000).is_ok());
    }

    #[test]
    fn test_pricing_bounds_validation() {
        // Test rate below minimum
        let model_low = MockModel {
            input_rate: Some(BigDecimal::from_str("0.0000001").unwrap()), // Below MIN_PRICE
            output_rate: Some(BigDecimal::from_str("0.01").unwrap()),
        };
        assert!(model_low.calculate_token_cost(1000, 1000).is_err());

        // Test rate above maximum
        let model_high = MockModel {
            input_rate: Some(BigDecimal::from_str("1001").unwrap()), // Above MAX_PRICE
            output_rate: Some(BigDecimal::from_str("0.01").unwrap()),
        };
        assert!(model_high.calculate_token_cost(1000, 1000).is_err());

        // Test valid rate
        let model_valid = MockModel {
            input_rate: Some(BigDecimal::from_str("0.01").unwrap()),
            output_rate: Some(BigDecimal::from_str("0.02").unwrap()),
        };
        assert!(model_valid.calculate_token_cost(1000, 1000).is_ok());
    }

    #[test]
    fn test_overflow_protection() {
        let model = MockModel {
            input_rate: Some(BigDecimal::from_str("999").unwrap()), // High rate
            output_rate: Some(BigDecimal::from_str("999").unwrap()),
        };

        // Test potential overflow with very high token counts
        assert!(model.calculate_token_cost(MAX_TOKENS, MAX_TOKENS).is_err());
    }

    #[test]
    fn test_input_cost_validation() {
        let model = MockModel {
            input_rate: Some(BigDecimal::from_str("0.01").unwrap()),
            output_rate: None,
        };

        // Test negative token counts
        assert!(model.calculate_input_cost(-1, 0, 0).is_err());
        assert!(model.calculate_input_cost(0, -1, 0).is_err());
        assert!(model.calculate_input_cost(0, 0, -1).is_err());
        
        // Test excessive token counts
        assert!(model.calculate_input_cost(MAX_TOKENS + 1, 0, 0).is_err());
        
        // Test valid input
        assert!(model.calculate_input_cost(1000, 500, 200).is_ok());
    }

    #[test]
    fn test_security_constants() {
        assert_eq!(MAX_TOKENS, 1_000_000_000);
        assert_eq!(MIN_PRICE, "0.000001");
        assert_eq!(MAX_PRICE, 1000);
    }

    #[test]
    fn test_pricing_utils_validation() {
        // Test token count validation
        assert!(validate_token_count(1000, "test").is_ok());
        assert!(validate_token_count(-1, "test").is_err());
        assert!(validate_token_count(MAX_TOKENS + 1, "test").is_err());

        // Test pricing rate validation
        let valid_rate = BigDecimal::from_str("0.01").unwrap();
        let invalid_low_rate = BigDecimal::from_str("0.0000001").unwrap();
        let invalid_high_rate = BigDecimal::from_str("1001").unwrap();
        
        assert!(validate_pricing_rate(&valid_rate, "test").is_ok());
        assert!(validate_pricing_rate(&invalid_low_rate, "test").is_err());
        assert!(validate_pricing_rate(&invalid_high_rate, "test").is_err());
    }
}