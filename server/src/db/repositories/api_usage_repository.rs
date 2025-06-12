use uuid::Uuid;
use sqlx::{PgPool, query, query_as, Row};
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
pub struct ApiUsageRecord {
    pub id: Option<Uuid>,
    pub user_id: Uuid,
    pub service_name: String,
    pub tokens_input: i32,
    pub tokens_output: i32,
    pub cost: BigDecimal,
    pub request_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub processing_ms: Option<i32>,
    pub input_duration_ms: Option<i64>,
    pub timestamp: DateTime<Utc>,
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

    /// Records API usage for billing purposes with executor
    pub async fn record_usage_with_executor(&self, entry: ApiUsageEntryDto, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<ApiUsageRecord, AppError> {
        // Set user context for RLS within this transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(entry.user_id.to_string())
            .execute(&mut **executor)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context for RLS: {}", e)))?;

        let metadata_to_store = match entry.metadata {
            Some(serde_json::Value::Object(ref map)) if map.is_empty() => None,
            other => other,
        };

        let result = query!(
            r#"
            INSERT INTO api_usage (user_id, service_name, tokens_input, tokens_output, cost, request_id, metadata, processing_ms, input_duration_ms)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, user_id, service_name, tokens_input, tokens_output, cost, request_id, metadata, processing_ms, input_duration_ms, timestamp
            "#,
            entry.user_id,
            entry.service_name,
            entry.tokens_input,
            entry.tokens_output,
            entry.cost,
            entry.request_id,
            metadata_to_store,
            entry.processing_ms,
            entry.input_duration_ms
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to record API usage: {}", e)))?;

        Ok(ApiUsageRecord {
            id: Some(result.id),
            user_id: result.user_id,
            service_name: result.service_name,
            tokens_input: result.tokens_input,
            tokens_output: result.tokens_output,
            cost: result.cost,
            request_id: result.request_id,
            metadata: result.metadata,
            processing_ms: result.processing_ms,
            input_duration_ms: result.input_duration_ms,
            timestamp: result.timestamp,
        })
    }

    /// Records API usage for billing purposes
    pub async fn record_usage(&self, entry: ApiUsageEntryDto) -> Result<ApiUsageRecord, AppError> {
        let mut tx = self.db_pool.begin().await.map_err(AppError::from)?;
        let record = self.record_usage_with_executor(entry, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(record)
    }

    /// Gets total usage for a user within a time period
    pub async fn get_user_usage(
        &self,
        user_id: &Uuid,
        start_date: chrono::DateTime<chrono::Utc>,
        end_date: chrono::DateTime<chrono::Utc>,
    ) -> Result<(i64, i64, BigDecimal), AppError> {
        let mut tx = self.db_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within this transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context for RLS: {}", e)))?;

        let result = sqlx::query(
            r#"
            SELECT 
                COALESCE(SUM(tokens_input), 0) as total_input,
                COALESCE(SUM(tokens_output), 0) as total_output, 
                COALESCE(SUM(cost), 0) as total_cost
            FROM api_usage
            WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
            "#
        )
        .bind(user_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user usage: {}", e)))?;
        
        tx.commit().await.map_err(AppError::from)?;

        let total_input: i64 = result.get("total_input");
        let total_output: i64 = result.get("total_output");
        let total_cost: BigDecimal = result.get("total_cost");

        Ok((total_input, total_output, total_cost))
    }
    
    /// Gets usage data for a specific time period
    pub async fn get_usage_for_period(
        &self,
        user_id: &Uuid,
        start_date: Option<DateTime<Utc>>,
        end_date: Option<DateTime<Utc>>,
    ) -> Result<ApiUsageReport, AppError> {
        let mut tx = self.db_pool.begin().await.map_err(AppError::from)?;
        
        // Set user context for RLS within this transaction
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context for RLS: {}", e)))?;

        let result = sqlx::query(
            r#"
            SELECT 
                COALESCE(SUM(tokens_input), 0) as tokens_input,
                COALESCE(SUM(tokens_output), 0) as tokens_output,
                COALESCE(SUM(cost), 0) as total_cost
            FROM api_usage
            WHERE user_id = $1
              AND ($2::timestamptz IS NULL OR timestamp >= $2)
              AND ($3::timestamptz IS NULL OR timestamp <= $3)
            "#
        )
        .bind(user_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get usage for period: {}", e)))?;
        
        tx.commit().await.map_err(AppError::from)?;

        Ok(ApiUsageReport {
            tokens_input: result.get("tokens_input"),
            tokens_output: result.get("tokens_output"),
            total_cost: result.get("total_cost"),
        })
    }

}