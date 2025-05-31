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
    // They are no longer needed as pricing is obtained directly from model repository

    /// Records API usage for billing purposes
    pub async fn record_usage(&self, entry: ApiUsageEntryDto) -> Result<(), AppError> {
        let final_metadata_to_store: Option<serde_json::Value>;

        if let Some(ms) = entry.processing_ms {
            // If processing_ms is present, we ensure the stored metadata is an object.
            let mut map_to_store = serde_json::Map::new();
            map_to_store.insert("processing_ms".to_string(), json!(ms));

            if let Some(original_metadata) = entry.metadata {
                if let serde_json::Value::Object(original_map) = original_metadata {
                    // Merge original object metadata, avoiding overwrite of the new processing_ms
                    for (k, v) in original_map {
                        if k != "processing_ms" {
                            map_to_store.insert(k, v);
                        }
                    }
                } else {
                    // Original metadata was not an object; store it under a special key
                    log::warn!("Original metadata (type: {:?}) was not an object but processing_ms was present. Storing original metadata under '_original_metadata_value_'.", std::any::type_name_of_val(&original_metadata));
                    map_to_store.insert("_original_metadata_value_".to_string(), original_metadata);
                }
            }
            final_metadata_to_store = Some(serde_json::Value::Object(map_to_store));
        } else {
            // No processing_ms, so use the original metadata as-is (it can be any JSON type, or None).
            final_metadata_to_store = entry.metadata;
        }

        // Ensure that if the final metadata is an explicitly empty JSON object, it's stored as NULL in the DB.
        // Other JSON types (null, string, number, array, non-empty object) are stored as themselves.
        let metadata_to_store = match final_metadata_to_store {
            Some(serde_json::Value::Object(ref map)) if map.is_empty() => None,
            other => other,
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
        let total_cost = result.total_cost.unwrap_or_else(|| {
            BigDecimal::from_str("0").unwrap_or_else(|_| BigDecimal::from(0))
        });

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
            total_cost: result.total_cost.unwrap_or_else(|| {
                BigDecimal::from_str("0").unwrap_or_else(|_| BigDecimal::from(0))
            }),
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