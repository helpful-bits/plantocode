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
    
    fn calculate_duration_cost(&self, duration_ms: i64) -> BigDecimal {
        if let Some(cost_per_minute) = self.get_duration_cost_per_minute() {
            let minimum_duration = self.get_minimum_billable_duration_ms().unwrap_or(0) as i64;
            let billable_duration = duration_ms.max(minimum_duration);
            let duration_minutes = BigDecimal::from_str(&(billable_duration as f64 / 60_000.0).to_string()).unwrap();
            &cost_per_minute * &duration_minutes
        } else {
            BigDecimal::from(0)
        }
    }
    
    fn calculate_token_cost(&self, input_tokens: i64, output_tokens: i64) -> BigDecimal {
        let million = BigDecimal::from(1_000_000);
        
        let input_cost = self.get_input_cost_per_million_tokens()
            .map(|rate| &rate * &BigDecimal::from(input_tokens) / &million)
            .unwrap_or_else(|| BigDecimal::from(0));
            
        let output_cost = self.get_output_cost_per_million_tokens()
            .map(|rate| &rate * &BigDecimal::from(output_tokens) / &million)
            .unwrap_or_else(|| BigDecimal::from(0));
            
        input_cost + output_cost
    }
}