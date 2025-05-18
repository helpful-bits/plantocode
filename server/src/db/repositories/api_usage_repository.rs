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
    
    // Removed get_model_pricing and get_models_pricing methods
    // They are no longer needed as pricing is obtained directly from app_settings.ai_models

    /// Records API usage for billing purposes
    /// 
    /// # Arguments
    /// * `user_id` - The ID of the user making the request
    /// * `model_id` - The OpenRouter model ID being used (e.g., "anthropic/claude-3-opus-20240229")
    /// * `tokens_input` - Number of input tokens used
    /// * `tokens_output` - Number of output tokens generated
    /// * `final_cost` - The calculated or provided cost as a BigDecimal
    pub async fn record_usage(
        &self,
        user_id: &Uuid,
        model_id: &str,
        tokens_input: i32,
        tokens_output: i32,
        final_cost: BigDecimal,
    ) -> Result<(), AppError> {
        // Insert into api_usage table with the provided cost
        query!(
            r#"
            INSERT INTO api_usage (user_id, service_name, tokens_input, tokens_output, cost)
            VALUES ($1, $2, $3, $4, $5)
            "#,
            user_id,
            model_id,
            tokens_input,
            tokens_output,
            final_cost
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

    /// Calculates the cost for API usage based on token counts and provided pricing
    pub fn calculate_cost(
        tokens_input: i32,
        tokens_output: i32,
        input_price_per_1k: f64,
        output_price_per_1k: f64,
    ) -> Result<BigDecimal, AppError> {
        // Calculate cost: (tokens / 1000) * price_per_1k
        let input_cost_f64 = (tokens_input as f64 / 1000.0) * input_price_per_1k;
        let output_cost_f64 = (tokens_output as f64 / 1000.0) * output_price_per_1k;
        let total_cost_f64 = input_cost_f64 + output_cost_f64;

        // Convert to BigDecimal with appropriate precision (e.g., 6 decimal places)
        let cost_string = format!("{:.6}", total_cost_f64);
        BigDecimal::from_str(&cost_string)
            .map_err(|e| AppError::Internal(format!("Failed to parse calculated cost to BigDecimal: {}", e)))
    }
}