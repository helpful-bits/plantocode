use uuid::Uuid;
use sqlx::{PgPool, query, query_as};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use crate::error::AppError;

#[derive(Debug)]
pub struct ApiUsage {
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub total_cost: BigDecimal,
}

pub struct ApiUsageRepository {
    db_pool: PgPool,
}

impl ApiUsageRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    /// Records API usage for billing purposes
    /// 
    /// # Arguments
    /// * `user_id` - The ID of the user making the request
    /// * `service_name` - The name of the AI service being used (e.g., "gemini", "claude", "groq")
    /// * `tokens_input` - Number of input tokens used
    /// * `tokens_output` - Number of output tokens generated
    pub async fn record_usage(
        &self,
        user_id: &Uuid,
        service_name: &str,
        tokens_input: i32,
        tokens_output: i32,
    ) -> Result<(), AppError> {
        // Calculate cost based on service and token counts
        // This is a simplified calculation and should be based on actual pricing
        let cost = self.calculate_cost(service_name, tokens_input, tokens_output)?;
        
        // Insert into api_usage table
        query!(
            r#"
            INSERT INTO api_usage (user_id, service_name, tokens_input, tokens_output, cost)
            VALUES ($1, $2, $3, $4, $5)
            "#,
            user_id,
            service_name,
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
        let total_cost = result.total_cost.unwrap_or(BigDecimal::from(0));

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
            total_cost: result.total_cost.unwrap_or(BigDecimal::from(0)),
        })
    }

    /// Calculates the cost for API usage based on service and token counts
    fn calculate_cost(
        &self,
        service_name: &str,
        tokens_input: i32,
        tokens_output: i32,
    ) -> Result<BigDecimal, AppError> {
        // Token prices per 1K tokens (these should come from configuration)
        let (input_price, output_price) = match service_name {
            "gemini" => (0.00025, 0.00050),  // $0.25/1M input, $0.50/1M output
            "claude" => (0.00080, 0.00240),  // $0.80/1M input, $2.40/1M output
            "groq"   => (0.00020, 0.00030),  // $0.20/1M input, $0.30/1M output
            _ => return Err(AppError::InvalidArgument(format!("Unknown service: {}", service_name))),
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