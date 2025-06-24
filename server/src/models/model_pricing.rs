use bigdecimal::BigDecimal;
use std::str::FromStr;

pub trait ModelPricing {
    fn get_input_cost_per_million_tokens(&self) -> Option<BigDecimal>;
    fn get_output_cost_per_million_tokens(&self) -> Option<BigDecimal>;
    fn get_duration_cost_per_minute(&self) -> Option<BigDecimal>;
    fn get_minimum_billable_duration_ms(&self) -> Option<i32>;
    
    fn is_duration_based(&self) -> bool {
        self.get_duration_cost_per_minute().is_some()
    }
    
    fn calculate_duration_cost(&self, duration_ms: i64) -> Result<BigDecimal, String> {
        let cost_per_minute = self.get_duration_cost_per_minute()
            .ok_or_else(|| "Duration-based cost calculation requires cost_per_minute to be configured".to_string())?;
        
        let minimum_duration = self.get_minimum_billable_duration_ms()
            .ok_or_else(|| "Duration-based models must have minimum_billable_duration_ms configured".to_string())? as i64;
        
        let billable_duration = duration_ms.max(minimum_duration);
        let duration_minutes = BigDecimal::from_str(&(billable_duration as f64 / 60_000.0).to_string())
            .map_err(|e| format!("Failed to convert duration to BigDecimal: {}", e))?;
        
        Ok(&cost_per_minute * &duration_minutes)
    }
    
    /// Calculate token-based cost with precise BigDecimal arithmetic
    /// This is the core cost calculation method for token-based models
    fn calculate_token_cost(&self, input_tokens: i64, output_tokens: i64) -> BigDecimal {
        // Use BigDecimal constants to maintain precision
        let million = BigDecimal::from(1_000_000);
        
        // Calculate input cost: (input_tokens * rate_per_million) / 1_000_000
        let input_cost = self.get_input_cost_per_million_tokens()
            .map(|rate| {
                let input_tokens_bd = BigDecimal::from(input_tokens);
                (&rate * &input_tokens_bd) / &million
            })
            .unwrap_or_else(|| BigDecimal::from(0));
            
        // Calculate output cost: (output_tokens * rate_per_million) / 1_000_000
        let output_cost = self.get_output_cost_per_million_tokens()
            .map(|rate| {
                let output_tokens_bd = BigDecimal::from(output_tokens);
                (&rate * &output_tokens_bd) / &million
            })
            .unwrap_or_else(|| BigDecimal::from(0));
            
        // Return total cost as BigDecimal
        input_cost + output_cost
    }
    
    /// Calculate total cost including both tokens and duration if applicable
    /// This method combines token and duration costs for hybrid models
    fn calculate_total_cost(&self, input_tokens: i64, output_tokens: i64, duration_ms: Option<i64>) -> Result<BigDecimal, String> {
        let token_cost = self.calculate_token_cost(input_tokens, output_tokens);
        
        if let Some(duration) = duration_ms {
            let duration_cost = self.calculate_duration_cost(duration)?;
            Ok(token_cost + duration_cost)
        } else if self.is_duration_based() {
            Err("Duration-based models require duration_ms parameter".to_string())
        } else {
            Ok(token_cost)
        }
    }
    
    /// Validate that the model has valid pricing configuration
    fn has_valid_pricing(&self) -> bool {
        self.get_input_cost_per_million_tokens().is_some() 
            || self.get_output_cost_per_million_tokens().is_some()
            || self.get_duration_cost_per_minute().is_some()
    }
    
    /// Validate that duration-based model has complete configuration
    /// Returns specific error if duration-based model is missing required configuration
    fn validate_duration_model_config(&self) -> Result<(), String> {
        if self.is_duration_based() {
            if self.get_duration_cost_per_minute().is_none() {
                return Err("Duration-based model missing cost_per_minute configuration".to_string());
            }
            if self.get_minimum_billable_duration_ms().is_none() {
                return Err("Duration-based model missing minimum_billable_duration_ms configuration".to_string());
            }
        }
        Ok(())
    }
    
    /// Get a description of the pricing model for this model
    fn pricing_model_description(&self) -> String {
        let has_token_pricing = self.get_input_cost_per_million_tokens().is_some() 
            || self.get_output_cost_per_million_tokens().is_some();
        let has_duration_pricing = self.get_duration_cost_per_minute().is_some();
        
        match (has_token_pricing, has_duration_pricing) {
            (true, true) => "Hybrid (token + duration)".to_string(),
            (true, false) => "Token-based".to_string(),
            (false, true) => "Duration-based".to_string(),
            (false, false) => "No pricing configured".to_string(),
        }
    }
}

/// Helper functions for safe BigDecimal operations in pricing calculations
pub mod pricing_utils {
    use super::*;
    
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
    
    /// Apply markup percentage to a base cost using precise BigDecimal arithmetic
    pub fn apply_markup(base_cost: &BigDecimal, markup_percentage: &BigDecimal) -> BigDecimal {
        // markup_percentage should be like 1.20 for 20% markup
        base_cost * markup_percentage
    }
    
    /// Calculate percentage of cost used (for spending limit calculations)
    pub fn calculate_usage_percentage(current_cost: &BigDecimal, limit_cost: &BigDecimal) -> Option<BigDecimal> {
        if *limit_cost > BigDecimal::from(0) {
            let hundred = BigDecimal::from(100);
            Some((current_cost * hundred) / limit_cost)
        } else {
            None
        }
    }
}