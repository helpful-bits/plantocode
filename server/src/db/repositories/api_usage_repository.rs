use uuid::Uuid;
use sqlx::{PgPool, query, query_as, Row, FromRow};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use crate::error::AppError;
use std::str::FromStr;
use log::debug;
use serde_json::json;
use serde::Serialize;


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
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub cached_input_tokens: i64,
    pub cache_write_tokens: i64,
    pub cache_read_tokens: i64,
    pub cost: BigDecimal,
    pub request_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DetailedUsageRecord {
    pub service_name: String,
    pub model_display_name: String,
    pub provider_code: String,
    pub total_cost: f64,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cached_input_tokens: i64,
    pub total_cache_write_tokens: i64,
    pub total_cache_read_tokens: i64,
    pub total_duration_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub total_cost: f64,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_duration_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailedUsageResponse {
    pub detailed_usage: Vec<DetailedUsageRecord>,
    pub summary: UsageSummary,
}

#[derive(Debug)]
pub struct ApiUsageEntryDto {
    pub user_id: Uuid,
    pub service_name: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub cached_input_tokens: i64,
    pub cache_write_tokens: i64,
    pub cache_read_tokens: i64,
    pub request_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
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
    pub async fn record_usage_with_executor(&self, entry: ApiUsageEntryDto, cost: BigDecimal, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<ApiUsageRecord, AppError> {
        let metadata_to_store = match entry.metadata {
            Some(serde_json::Value::Object(ref map)) if map.is_empty() => None,
            other => other,
        };

        let result = query!(
            r#"
            INSERT INTO api_usage (user_id, service_name, tokens_input, tokens_output, cached_input_tokens, cache_write_tokens, cache_read_tokens, cost, request_id, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, user_id, service_name, tokens_input, tokens_output, cached_input_tokens, cache_write_tokens, cache_read_tokens, cost, request_id, metadata, timestamp
            "#,
            entry.user_id,
            entry.service_name,
            entry.tokens_input as i32,
            entry.tokens_output as i32,
            entry.cached_input_tokens as i32,
            entry.cache_write_tokens as i32,
            entry.cache_read_tokens as i32,
            cost,
            entry.request_id,
            metadata_to_store
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to record API usage: {}", e)))?;

        Ok(ApiUsageRecord {
            id: Some(result.id),
            user_id: result.user_id,
            service_name: result.service_name,
            tokens_input: result.tokens_input as i64,
            tokens_output: result.tokens_output as i64,
            cached_input_tokens: result.cached_input_tokens.unwrap_or(0) as i64,
            cache_write_tokens: result.cache_write_tokens.unwrap_or(0) as i64,
            cache_read_tokens: result.cache_read_tokens.unwrap_or(0) as i64,
            cost: result.cost,
            request_id: result.request_id,
            metadata: result.metadata,
            timestamp: result.timestamp,
        })
    }

    /// Records API usage for billing purposes (private - use record_usage_with_executor in transactions)
    async fn _record_usage(&self, entry: ApiUsageEntryDto, cost: BigDecimal) -> Result<ApiUsageRecord, AppError> {
        let mut tx = self.db_pool.begin().await.map_err(AppError::from)?;
        let record = self.record_usage_with_executor(entry, cost, &mut tx).await?;
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
        
        let result = sqlx::query(
            r#"
            SELECT 
                COALESCE(SUM(tokens_input), 0) as total_input,
                COALESCE(SUM(tokens_output), 0) as total_output, 
                COALESCE(SUM(cached_input_tokens), 0) as total_cached_input,
                COALESCE(SUM(cache_write_tokens), 0) as total_cache_write,
                COALESCE(SUM(cache_read_tokens), 0) as total_cache_read,
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
        
        let result = sqlx::query(
            r#"
            SELECT 
                COALESCE(SUM(tokens_input), 0) as tokens_input,
                COALESCE(SUM(tokens_output), 0) as tokens_output,
                COALESCE(SUM(cached_input_tokens), 0) as cached_input_tokens,
                COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
                COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
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

    /// Gets detailed usage data with model and provider information for a user in a period
    pub async fn get_detailed_usage_for_user_in_period(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<Vec<DetailedUsageRecord>, AppError> {
        let mut tx = self.db_pool.begin().await.map_err(AppError::from)?;
        let result = self.get_detailed_usage(user_id, start_date, end_date, &mut tx).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(result)
    }

    /// Gets detailed usage data with pre-calculated summary totals
    pub async fn get_detailed_usage_with_summary(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<DetailedUsageResponse, AppError> {
        let mut tx = self.db_pool.begin().await.map_err(AppError::from)?;
        let detailed_usage = self.get_detailed_usage(user_id, start_date, end_date, &mut tx).await?;
        
        // Calculate totals from the detailed usage data
        let summary = detailed_usage.iter().fold(
            UsageSummary {
                total_cost: 0.0,
                total_requests: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                total_duration_ms: 0,
            },
            |mut acc, usage| {
                acc.total_cost += usage.total_cost;
                acc.total_requests += usage.total_requests;
                acc.total_input_tokens += usage.total_input_tokens;
                acc.total_output_tokens += usage.total_output_tokens;
                acc.total_duration_ms += usage.total_duration_ms;
                acc
            }
        );

        tx.commit().await.map_err(AppError::from)?;
        
        Ok(DetailedUsageResponse {
            detailed_usage,
            summary,
        })
    }

    /// Gets detailed usage data with model and provider information
    pub async fn get_detailed_usage(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Vec<DetailedUsageRecord>, AppError> {
        let rows = sqlx::query!(
            r#"
            WITH usage_with_model_id AS (
                SELECT
                    id, cost, tokens_input, tokens_output, cached_input_tokens, cache_write_tokens, cache_read_tokens, request_id,
                    CASE
                        WHEN service_name LIKE '%/%' THEN service_name
                        WHEN metadata->>'modelId' IS NOT NULL THEN metadata->>'modelId'
                        WHEN metadata->>'model_id' IS NOT NULL THEN metadata->>'model_id'
                        ELSE service_name
                    END as effective_model_id
                FROM api_usage
                WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
            )
            SELECT
                u.effective_model_id as service_name,
                COALESCE(m.name, u.effective_model_id) as model_display_name,
                COALESCE(p.code, 'unknown') as provider_code,
                COALESCE(SUM(u.cost::numeric), 0.0)::float8 as total_cost,
                COUNT(DISTINCT COALESCE(u.request_id, u.id::text))::bigint as total_requests,
                COALESCE(SUM(u.tokens_input), 0)::bigint as total_input_tokens,
                COALESCE(SUM(u.tokens_output), 0)::bigint as total_output_tokens,
                COALESCE(SUM(u.cached_input_tokens), 0)::bigint as total_cached_input_tokens,
                COALESCE(SUM(u.cache_write_tokens), 0)::bigint as total_cache_write_tokens,
                COALESCE(SUM(u.cache_read_tokens), 0)::bigint as total_cache_read_tokens,
                0::bigint as total_duration_ms
            FROM usage_with_model_id u
            LEFT JOIN models m ON u.effective_model_id = m.id
            LEFT JOIN providers p ON m.provider_id = p.id
            GROUP BY u.effective_model_id, m.name, p.code
            ORDER BY total_cost DESC
            "#,
            user_id,
            start_date,
            end_date
        )
        .fetch_all(&mut **executor)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get detailed usage: {}", e)))?;
        
        let results = rows.into_iter().map(|row| DetailedUsageRecord {
            service_name: row.service_name.unwrap_or_default(),
            model_display_name: row.model_display_name.unwrap_or_default(),
            provider_code: row.provider_code.unwrap_or_default(),
            total_cost: row.total_cost.unwrap_or(0.0),
            total_requests: row.total_requests.unwrap_or(0),
            total_input_tokens: row.total_input_tokens.unwrap_or(0),
            total_output_tokens: row.total_output_tokens.unwrap_or(0),
            total_cached_input_tokens: row.total_cached_input_tokens.unwrap_or(0),
            total_cache_write_tokens: row.total_cache_write_tokens.unwrap_or(0),
            total_cache_read_tokens: row.total_cache_read_tokens.unwrap_or(0),
            total_duration_ms: row.total_duration_ms.unwrap_or(0),
        }).collect();

        Ok(results)
    }

}