use uuid::Uuid;
use sqlx::{PgPool, query, query_as};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use crate::error::AppError;
use std::str::FromStr;
use log::debug;
use serde_json::json;

#[derive(Debug)]
pub struct ApiUsageReport {
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub total_cost: BigDecimal,
}

#[derive(Debug)]
pub struct ApiUsageEntryDto {
    pub user_id: Uuid,
    pub service_name: String,
    pub tokens_input: i32,
    pub tokens_output: i32,
    pub cost: BigDecimal,
    pub request_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub processing_ms: Option<i32>,
    pub input_duration_ms: Option<i64>,
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
    pub async fn record_usage(&self, entry: ApiUsageEntryDto) -> Result<(), AppError> {
        let mut final_metadata_json = entry.metadata.unwrap_or_else(|| json!({}));
        if let Some(ms) = entry.processing_ms {
            if let Some(obj) = final_metadata_json.as_object_mut() {
                obj.insert("processing_ms".to_string(), json!(ms));
            } else {
                // This case implies original metadata was not an object (e.g., null, string, array)
                // or entry.metadata was None and json!({}) was created.
                // If it was None, it's already an empty object, so this branch might be less likely
                // if json!({}) always creates an object.
                // For safety, if it's not an object, we create a new one with processing_ms.
                // However, standardizing on metadata being an object is better.
                // Assuming metadata should always be an object if present.
                final_metadata_json = json!({ "processing_ms": ms });
                // If entry.metadata was Some but not an object, it gets overwritten.
                // A more robust merge would be needed if entry.metadata could be non-object.
                // For now, this prioritizes adding processing_ms.
            }
        }
        // If final_metadata_json is an empty object after this, store it as NULL in DB.
        let metadata_to_store = if final_metadata_json.as_object().map_or(false, |m| m.is_empty()) {
            None
        } else {
            Some(final_metadata_json)
        };

        query!(
            r#"
            INSERT INTO api_usage (user_id, service_name, tokens_input, tokens_output, cost, request_id, metadata, input_duration_ms)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
            entry.user_id,
            entry.service_name,
            entry.tokens_input,
            entry.tokens_output,
            entry.cost,
            entry.request_id,
            metadata_to_store,
            entry.input_duration_ms
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
    ) -> Result<ApiUsageReport, AppError> {
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

        Ok(ApiUsageReport {
            tokens_input: result.tokens_input.unwrap_or(0),
            tokens_output: result.tokens_output.unwrap_or(0),
            total_cost: result.total_cost.unwrap_or_else(|| BigDecimal::from_str("0").unwrap()),
        })
    }

    /// Calculates the cost for API usage based on token counts and provided pricing
    pub fn calculate_cost(
        tokens_input: i32,
        tokens_output: i32,
        input_price_per_1k: &BigDecimal,
        output_price_per_1k: &BigDecimal,
    ) -> Result<BigDecimal, AppError> {
        // Calculate cost using BigDecimal arithmetic: (tokens / 1000) * price_per_1k
        let thousand = BigDecimal::from(1000);
        let tokens_input_bd = BigDecimal::from(tokens_input);
        let tokens_output_bd = BigDecimal::from(tokens_output);
        
        let input_cost = (&tokens_input_bd / &thousand) * input_price_per_1k;
        let output_cost = (&tokens_output_bd / &thousand) * output_price_per_1k;
        
        Ok(input_cost + output_cost)
    }
}