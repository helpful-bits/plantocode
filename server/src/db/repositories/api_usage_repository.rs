use uuid::Uuid;
use sqlx::{PgPool, query, query_as};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use crate::error::AppError;
use std::str::FromStr;
use log::debug;

#[derive(Debug)]
pub struct ApiUsage {
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub total_cost: BigDecimal,
}

#[derive(Debug)]
pub struct ApiUsageRepository {
    db_pool: PgPool,
}

impl ApiUsageRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }
    
    /// Fetch pricing information for a specific model
    pub async fn get_model_pricing(&self, model_id: &str) -> Result<Option<(f64, f64)>, AppError> {
        let result = query!(
            r#"
            SELECT input_token_price, output_token_price
            FROM service_pricing
            WHERE service_name = $1
            "#,
            model_id
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get model pricing: {}", e)))?;
        
        match result {
            Some(pricing) => {
                // Directly convert BigDecimal to f64
                let input_price = pricing.input_token_price.to_string().parse::<f64>()
                    .map_err(|e| AppError::Internal(format!("Failed to parse input_token_price: {}", e)))?;
                
                let output_price = pricing.output_token_price.to_string().parse::<f64>()
                    .map_err(|e| AppError::Internal(format!("Failed to parse output_token_price: {}", e)))?;
                
                Ok(Some((input_price, output_price)))
            },
            None => Ok(None),
        }
    }
    
    /// Fetch pricing information for a list of models
    pub async fn get_models_pricing(&self, model_ids: &[String]) -> Result<Vec<(String, Option<(f64, f64)>)>, AppError> {
        let mut results = Vec::new();
        
        for model_id in model_ids {
            let pricing = self.get_model_pricing(model_id).await?;
            results.push((model_id.clone(), pricing));
        }
        
        Ok(results)
    }

    /// Records API usage for billing purposes
    /// 
    /// # Arguments
    /// * `user_id` - The ID of the user making the request
    /// * `model_id` - The OpenRouter model ID being used (e.g., "anthropic/claude-3-opus-20240229")
    /// * `tokens_input` - Number of input tokens used
    /// * `tokens_output` - Number of output tokens generated
    /// * `provided_cost` - Optional cost value provided by OpenRouter
    pub async fn record_usage(
        &self,
        user_id: &Uuid,
        model_id: &str,
        tokens_input: i32,
        tokens_output: i32,
        provided_cost: Option<f64>,
    ) -> Result<(), AppError> {
        // Use provided cost if available, otherwise calculate based on model and token counts
        // OpenRouter provides accurate cost information so prioritize it when available
        let cost = match provided_cost {
            Some(cost) => {
                // Convert to BigDecimal with 6 decimal precision
                let cost_string = format!("{:.6}", cost);
                let parsed_cost = cost_string.parse::<BigDecimal>()
                    .map_err(|e| AppError::Internal(format!("Failed to parse provided cost: {}", e)))?;
                debug!("Using OpenRouter-provided cost ({}) for model {}", cost, model_id);
                parsed_cost
            },
            None => {
                // Fallback to our calculation if OpenRouter doesn't provide cost
                debug!("No cost provided by OpenRouter for model {}, calculating locally", model_id);
                self.calculate_cost(model_id, tokens_input, tokens_output).await?
            },
        };
        
        // Insert into api_usage table
        query!(
            r#"
            INSERT INTO api_usage (user_id, service_name, tokens_input, tokens_output, cost)
            VALUES ($1, $2, $3, $4, $5)
            "#,
            user_id,
            model_id,
            tokens_input,
            tokens_output,
            cost
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to record API usage: {}", e)))?;

        Ok(())
    }

    /// Gets total usage for a user within a time period
    pub async fn get_user_usage(
        &self,
        user_id: &Uuid,
        start_date: chrono::DateTime<chrono::Utc>,
        end_date: chrono::DateTime<chrono::Utc>,
    ) -> Result<(i64, i64, BigDecimal), AppError> {
        let result = query!(
            r#"
            SELECT 
                COALESCE(SUM(tokens_input), 0) as total_input,
                COALESCE(SUM(tokens_output), 0) as total_output,
                COALESCE(SUM(cost), 0) as total_cost
            FROM api_usage
            WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
            "#,
            user_id,
            start_date,
            end_date
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user usage: {}", e)))?;

        let total_input = result.total_input.unwrap_or(0);
        let total_output = result.total_output.unwrap_or(0);
        let total_cost = result.total_cost.unwrap_or_else(|| BigDecimal::from_str("0").unwrap());

        Ok((total_input, total_output, total_cost))
    }
    
    /// Gets usage data for a specific time period
    pub async fn get_usage_for_period(
        &self,
        user_id: &Uuid,
        start_date: Option<DateTime<Utc>>,
        end_date: Option<DateTime<Utc>>,
    ) -> Result<ApiUsage, AppError> {
        let result = query!(
            r#"
            SELECT 
                COALESCE(SUM(tokens_input), 0) as tokens_input,
                COALESCE(SUM(tokens_output), 0) as tokens_output,
                COALESCE(SUM(cost), 0) as total_cost
            FROM api_usage
            WHERE user_id = $1
              AND ($2::timestamptz IS NULL OR timestamp >= $2)
              AND ($3::timestamptz IS NULL OR timestamp <= $3)
            "#,
            user_id,
            start_date,
            end_date,
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get usage for period: {}", e)))?;

        Ok(ApiUsage {
            tokens_input: result.tokens_input.unwrap_or(0),
            tokens_output: result.tokens_output.unwrap_or(0),
            total_cost: result.total_cost.unwrap_or_else(|| BigDecimal::from_str("0").unwrap()),
        })
    }

    /// Calculates the cost for API usage based on model ID and token counts
    async fn calculate_cost(
        &self,
        model_id: &str,
        tokens_input: i32,
        tokens_output: i32,
    ) -> Result<BigDecimal, AppError> {
        // Lookup model prices from the service_pricing table
        let result = query!(
            r#"
            SELECT input_token_price, output_token_price
            FROM service_pricing
            WHERE service_name = $1
            "#,
            model_id
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get model pricing: {}", e)))?;

        // Get the pricing for this model, or use default pricing if not found
        let (input_price, output_price) = match result {
            Some(pricing) => {
                let default_input_price_str = "0.001";
                let default_output_price_str = "0.002";

                // Directly convert BigDecimal to string and then parse
                let input_price = pricing.input_token_price.to_string().parse::<f64>()
                    .unwrap_or_else(|e| {
                        log::warn!("Failed to parse input_token_price '{}', using default: {}", pricing.input_token_price.to_string(), e);
                        default_input_price_str.parse::<f64>().unwrap()
                    });

                let output_price = pricing.output_token_price.to_string().parse::<f64>()
                    .unwrap_or_else(|e| {
                        log::warn!("Failed to parse output_token_price '{}', using default: {}", pricing.output_token_price.to_string(), e);
                        default_output_price_str.parse::<f64>().unwrap()
                    });
                (input_price, output_price)
            },
            None => {
                // Default prices if model not found in the database
                // Conservative defaults slightly higher than typical rates
                (0.001, 0.002) // $1/1M input, $2/1M output
            }
        };

        // Calculate cost: (tokens / 1000) * price_per_1k
        let input_cost = (tokens_input as f64 / 1000.0) * input_price;
        let output_cost = (tokens_output as f64 / 1000.0) * output_price;
        let total_cost = input_cost + output_cost;

        // Convert to BigDecimal with 6 decimal precision
        let cost_string = format!("{:.6}", total_cost);
        let cost = cost_string.parse::<BigDecimal>()
            .map_err(|e| AppError::Internal(format!("Failed to parse cost: {}", e)))?;

        Ok(cost)
    }
}