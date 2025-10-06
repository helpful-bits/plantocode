use crate::db::pool_ext::AcquireRetry;
use crate::error::AppError;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use log::debug;
use serde::Serialize;
use serde_json::json;
use sqlx::{FromRow, PgPool, Row, query, query_as};
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::OnceCell;
use uuid::Uuid;

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
    pub cache_write_tokens: i64,
    pub cache_read_tokens: i64,
    pub cost: BigDecimal,
    pub request_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
    pub provider_reported_cost: Option<BigDecimal>,
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
    pub total_cached_tokens: i64,
    pub total_duration_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub total_cost: f64,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cached_tokens: i64,
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
    pub cache_write_tokens: i64,
    pub cache_read_tokens: i64,
    pub request_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub provider_reported_cost: Option<BigDecimal>,
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
    pub async fn record_usage_with_executor(
        &self,
        entry: ApiUsageEntryDto,
        cost: BigDecimal,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<ApiUsageRecord, AppError> {
        let metadata_to_store = match entry.metadata {
            Some(serde_json::Value::Object(ref map)) if map.is_empty() => None,
            other => other,
        };

        let result = query!(
            r#"
            INSERT INTO api_usage (user_id, service_name, tokens_input, tokens_output, cache_write_tokens, cache_read_tokens, cost, request_id, metadata, provider_reported_cost, status, pending_timeout_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW() + INTERVAL '10 minutes')
            RETURNING id, user_id, service_name, tokens_input, tokens_output, cache_write_tokens, cache_read_tokens, cost, request_id, metadata, timestamp, provider_reported_cost
            "#,
            entry.user_id,
            entry.service_name,
            entry.tokens_input as i32,
            entry.tokens_output as i32,
            entry.cache_write_tokens as i32,
            entry.cache_read_tokens as i32,
            cost,
            entry.request_id,
            metadata_to_store,
            entry.provider_reported_cost
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
            cache_write_tokens: result.cache_write_tokens.unwrap_or(0) as i64,
            cache_read_tokens: result.cache_read_tokens.unwrap_or(0) as i64,
            cost: result.cost,
            request_id: result.request_id,
            metadata: result.metadata,
            timestamp: result.timestamp,
            provider_reported_cost: result.provider_reported_cost,
        })
    }

    /// Update API usage record with final token counts, cost, and metadata
    pub async fn update_usage_with_metadata_executor(
        &self,
        request_id: &str,
        tokens_input: i64,
        tokens_output: i64,
        cache_write_tokens: i64,
        cache_read_tokens: i64,
        final_cost: BigDecimal,
        metadata: Option<serde_json::Value>,
        status: &str,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError> {
        let rows_updated = sqlx::query!(
            r#"
            UPDATE api_usage
            SET tokens_input = $1,
                tokens_output = $2,
                cache_write_tokens = $3,
                cache_read_tokens = $4,
                cost = $5,
                metadata = $6,
                status = $7
            WHERE request_id = $8
            "#,
            tokens_input as i32,
            tokens_output as i32,
            cache_write_tokens as i32,
            cache_read_tokens as i32,
            final_cost,
            metadata,
            status,
            request_id
        )
        .execute(&mut **executor)
        .await
        .map_err(|e| {
            AppError::Database(format!("Failed to update API usage with metadata: {}", e))
        })?;

        if rows_updated.rows_affected() == 0 {
            return Err(AppError::NotFound(format!(
                "No API usage record found for request_id: {}",
                request_id
            )));
        }

        debug!(
            "Updated API usage record for request {} with metadata: tokens_input={}, tokens_output={}, cache_write_tokens={}, cache_read_tokens={}, cost={}, metadata_present={}",
            request_id,
            tokens_input,
            tokens_output,
            cache_write_tokens,
            cache_read_tokens,
            final_cost,
            metadata.is_some()
        );

        Ok(())
    }

    /// Records API usage for billing purposes (private - use record_usage_with_executor in transactions)
    async fn _record_usage(
        &self,
        entry: ApiUsageEntryDto,
        cost: BigDecimal,
    ) -> Result<ApiUsageRecord, AppError> {
        let mut tx = self.db_pool.begin().await.map_err(AppError::from)?;
        let record = self
            .record_usage_with_executor(entry, cost, &mut tx)
            .await?;
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
        let mut tx = AcquireRetry::begin_with_retry(&self.db_pool, 3, 100)
            .await
            .map_err(AppError::from)?;

        let result = sqlx::query(
            r#"
            SELECT
                COALESCE(SUM(tokens_input), 0) as total_input,
                COALESCE(SUM(tokens_output), 0) as total_output,
                COALESCE(SUM(cache_write_tokens), 0) as total_cache_write,
                COALESCE(SUM(cache_read_tokens), 0) as total_cache_read,
                COALESCE(SUM(cost), 0) as total_cost
            FROM api_usage
            WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
            "#,
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
        let mut tx = AcquireRetry::begin_with_retry(&self.db_pool, 3, 100)
            .await
            .map_err(AppError::from)?;

        let result = sqlx::query(
            r#"
            SELECT
                COALESCE(SUM(tokens_input), 0) as tokens_input,
                COALESCE(SUM(tokens_output), 0) as tokens_output,
                COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
                COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
                COALESCE(SUM(cost), 0) as total_cost
            FROM api_usage
            WHERE user_id = $1
              AND ($2::timestamptz IS NULL OR timestamp >= $2)
              AND ($3::timestamptz IS NULL OR timestamp <= $3)
            "#,
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
        let mut tx = AcquireRetry::begin_with_retry(&self.db_pool, 3, 100)
            .await
            .map_err(AppError::from)?;
        let result = self
            .get_detailed_usage(user_id, start_date, end_date, &mut tx)
            .await?;
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
        // Use the new efficient processing service instead of complex SQL
        use crate::services::usage_processing_service::UsageProcessingService;

        // We need system pool for models table access - get it from the handler
        // For now, we'll pass the same pool for both until we can get system pool access
        let processing_service = UsageProcessingService::new(
            Arc::new(self.db_pool.clone()),
            Arc::new(self.db_pool.clone()),
        )
        .await?;
        processing_service
            .get_detailed_usage(user_id, start_date, end_date)
            .await
    }

    /// Gets detailed usage data with pre-calculated summary totals using system pool for models
    pub async fn get_detailed_usage_with_summary_with_system_pool(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
        system_pool: &PgPool,
    ) -> Result<DetailedUsageResponse, AppError> {
        // Use the new efficient processing service instead of complex SQL
        use crate::services::usage_processing_service::UsageProcessingService;

        let processing_service = UsageProcessingService::new(
            Arc::new(self.db_pool.clone()),
            Arc::new(system_pool.clone()),
        )
        .await?;
        processing_service
            .get_detailed_usage(user_id, start_date, end_date)
            .await
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
                    id, cost, tokens_input, tokens_output, cache_write_tokens, cache_read_tokens, request_id,
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
                (COALESCE(SUM(u.cache_write_tokens), 0) + COALESCE(SUM(u.cache_read_tokens), 0))::bigint as total_cached_tokens,
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

        let results = rows
            .into_iter()
            .map(|row| DetailedUsageRecord {
                service_name: row.service_name.unwrap_or_default(),
                model_display_name: row.model_display_name.unwrap_or_default(),
                provider_code: row.provider_code.unwrap_or_default(),
                total_cost: row.total_cost.unwrap_or(0.0),
                total_requests: row.total_requests.unwrap_or(0),
                total_input_tokens: row.total_input_tokens.unwrap_or(0),
                total_output_tokens: row.total_output_tokens.unwrap_or(0),
                total_cached_tokens: row.total_cached_tokens.unwrap_or(0),
                total_duration_ms: row.total_duration_ms.unwrap_or(0),
            })
            .collect();

        Ok(results)
    }

    /// Admin-only method to fetch raw usage data for debugging (ADMIN USE ONLY)
    pub async fn get_raw_usage_records_for_debug(
        &self,
        limit: i64,
        user_filter: Option<Uuid>,
        service_filter: Option<&str>,
    ) -> Result<Vec<sqlx::postgres::PgRow>, AppError> {
        let (query_sql, bind_values) = self.build_debug_query(limit, user_filter, service_filter);

        let mut query = sqlx::query(&query_sql);

        // Bind values in order
        for value in bind_values {
            match value {
                DebugBindValue::Uuid(v) => query = query.bind(v),
                DebugBindValue::String(v) => query = query.bind(v),
                DebugBindValue::I64(v) => query = query.bind(v),
            }
        }

        let rows = query
            .fetch_all(&self.db_pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to fetch usage debug data: {}", e)))?;

        Ok(rows)
    }

    /// Build the debug query with appropriate filters (private helper)
    fn build_debug_query(
        &self,
        limit: i64,
        user_filter: Option<Uuid>,
        service_filter: Option<&str>,
    ) -> (String, Vec<DebugBindValue>) {
        let mut bind_values = Vec::new();
        let mut where_clauses = Vec::new();
        let mut bind_index = 1;

        // Build WHERE clause
        if let Some(user_id) = user_filter {
            where_clauses.push(format!("user_id = ${}", bind_index));
            bind_values.push(DebugBindValue::Uuid(user_id));
            bind_index += 1;
        }

        if let Some(service_name) = service_filter {
            where_clauses.push(format!("service_name ILIKE ${}", bind_index));
            bind_values.push(DebugBindValue::String(format!("%{}%", service_name)));
            bind_index += 1;
        }

        let where_clause = if where_clauses.is_empty() {
            "".to_string()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };

        bind_values.push(DebugBindValue::I64(limit));
        let limit_bind = format!("${}", bind_index);

        let query = format!(
            r#"
            WITH usage_records AS (
                SELECT 
                    id,
                    user_id,
                    service_name,
                    tokens_input,
                    tokens_output,
                    cache_write_tokens,
                    cache_read_tokens,
                    cost,
                    timestamp,
                    request_id,
                    metadata,
                    CASE
                        WHEN service_name LIKE '%/%' AND metadata->>'modelId' IS NOT NULL THEN 'provider_and_metadata'
                        WHEN service_name LIKE '%/%' THEN 'provider_service_name'
                        WHEN metadata->>'modelId' IS NOT NULL THEN 'metadata_model_id'
                        WHEN metadata->>'model_id' IS NOT NULL THEN 'metadata_model_id_alt'
                        ELSE 'service_name_fallback'
                    END as cost_resolution_method,
                    CASE
                        WHEN service_name LIKE '%/%' THEN service_name
                        WHEN metadata->>'modelId' IS NOT NULL THEN metadata->>'modelId'
                        WHEN metadata->>'model_id' IS NOT NULL THEN metadata->>'model_id'
                        ELSE service_name
                    END as effective_model_id
                FROM api_usage
                {}
                ORDER BY timestamp DESC
                LIMIT {}
            ),
            debug_summary AS (
                SELECT 
                    COUNT(*) as total_records,
                    array_agg(DISTINCT cost_resolution_method) as cost_methods,
                    array_agg(DISTINCT service_name) as service_names,
                    array_agg(DISTINCT user_id::text) as user_ids,
                    MIN(timestamp) as earliest_record,
                    MAX(timestamp) as latest_record
                FROM usage_records
            )
            SELECT 
                ur.*,
                ds.total_records,
                ds.cost_methods,
                ds.service_names,
                ds.user_ids,
                ds.earliest_record,
                ds.latest_record
            FROM usage_records ur
            CROSS JOIN debug_summary ds
            ORDER BY ur.timestamp DESC
            "#,
            where_clause, limit_bind
        );

        (query, bind_values)
    }
}

#[derive(Debug)]
enum DebugBindValue {
    Uuid(Uuid),
    String(String),
    I64(i64),
}
