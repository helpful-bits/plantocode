use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde_json::Value;
use sqlx::{Pool, Postgres, Transaction};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::db::pool_ext::AcquireRetry;
use crate::db::repositories::api_usage_repository::{
    DetailedUsageRecord, DetailedUsageResponse, UsageSummary,
};
use crate::error::AppError;

#[derive(Debug, Clone)]
struct ModelInfo {
    name: String,
    provider_code: String,
}

#[derive(Debug, Clone)]
struct RawUsageRecord {
    id: Uuid,
    service_name: String,
    cost: f64,
    tokens_input: i64,
    tokens_output: i64,
    cache_write_tokens: i64,
    cache_read_tokens: i64,
    request_id: Option<String>,
    metadata: Option<Value>,
}

struct ResolvedRecord {
    model_id: String,
    cost: f64,
    tokens_input: i64,
    tokens_output: i64,
    cache_tokens: i64,
    request_id: Option<String>,
}

struct UsageAggregate {
    model_id: String,
    model_name: Option<String>,
    provider_code: Option<String>,
    total_cost: f64,
    total_input_tokens: i64,
    total_output_tokens: i64,
    total_cached_tokens: i64,
    unique_requests: HashMap<String, bool>,
}

pub struct ModelProviderCache {
    models: Arc<DashMap<String, ModelInfo>>,
    last_refresh: Arc<RwLock<Instant>>,
}

impl ModelProviderCache {
    pub async fn new(pool: &Pool<Postgres>) -> Result<Self, AppError> {
        let cache = Self {
            models: Arc::new(DashMap::new()),
            last_refresh: Arc::new(RwLock::new(Instant::now())),
        };
        cache.refresh(pool).await?;
        Ok(cache)
    }

    pub async fn get_or_refresh(&self, pool: &Pool<Postgres>) -> Result<(), AppError> {
        let last = *self.last_refresh.read().await;
        if last.elapsed() > Duration::from_secs(300) {
            self.refresh(pool).await?;
        }
        Ok(())
    }

    async fn refresh(&self, pool: &Pool<Postgres>) -> Result<(), AppError> {
        let rows = sqlx::query!(
            r#"
            SELECT m.id, m.name, p.code as provider_code
            FROM models m
            JOIN providers p ON m.provider_id = p.id
            WHERE m.status = 'active'
            "#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to load models: {}", e)))?;

        self.models.clear();
        for row in rows {
            self.models.insert(
                row.id.clone(),
                ModelInfo {
                    name: row.name,
                    provider_code: row.provider_code,
                },
            );
        }

        *self.last_refresh.write().await = Instant::now();
        Ok(())
    }

    pub fn get(&self, model_id: &str) -> Option<ModelInfo> {
        self.models.get(model_id).map(|entry| entry.value().clone())
    }
}

pub struct UsageProcessingService {
    user_pool: Arc<Pool<Postgres>>,
    system_pool: Arc<Pool<Postgres>>,
    model_cache: Arc<ModelProviderCache>,
}

impl UsageProcessingService {
    pub async fn new(
        user_pool: Arc<Pool<Postgres>>,
        system_pool: Arc<Pool<Postgres>>,
    ) -> Result<Self, AppError> {
        if Arc::ptr_eq(&user_pool, &system_pool) {
            return Err(AppError::Internal(
                "UsageProcessingService requires distinct user_pool and system_pool".to_string(),
            ));
        }
        let model_cache = Arc::new(ModelProviderCache::new(&system_pool).await?);
        Ok(Self {
            user_pool,
            system_pool,
            model_cache,
        })
    }

    pub async fn get_detailed_usage(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<DetailedUsageResponse, AppError> {
        // Ensure cache is fresh using system pool
        self.model_cache.get_or_refresh(&self.system_pool).await?;

        // Start transaction and set RLS context on user pool
        let mut tx = AcquireRetry::begin_with_retry(&*self.user_pool, 3, 100)
            .await
            .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

        // Set user context for RLS policies
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(format!("Failed to set user context: {}", e)))?;

        // Get raw data with simple indexed query
        let raw_records = self
            .get_raw_usage_data_with_tx(user_id, start_date, end_date, &mut tx)
            .await?;

        // Commit transaction
        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

        // Process in Rust
        let detailed_usage = self.process_usage_data(raw_records);

        // Calculate summary
        let summary = self.calculate_summary(&detailed_usage);

        Ok(DetailedUsageResponse {
            detailed_usage,
            summary,
        })
    }

    async fn get_raw_usage_data_with_tx(
        &self,
        user_id: &Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Vec<RawUsageRecord>, AppError> {
        let rows = sqlx::query!(
            r#"
            SELECT 
                id, service_name, cost::float8 as "cost!", 
                tokens_input, tokens_output,
                cache_write_tokens, cache_read_tokens, 
                request_id, metadata
            FROM api_usage
            WHERE user_id = $1 
              AND timestamp >= $2 
              AND timestamp <= $3
              AND status = 'completed'
            ORDER BY timestamp DESC
            "#,
            user_id,
            start_date,
            end_date
        )
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch usage data: {}", e)))?;

        Ok(rows
            .into_iter()
            .map(|row| RawUsageRecord {
                id: row.id,
                service_name: row.service_name,
                cost: row.cost,
                tokens_input: row.tokens_input as i64,
                tokens_output: row.tokens_output as i64,
                cache_write_tokens: row.cache_write_tokens.unwrap_or(0) as i64,
                cache_read_tokens: row.cache_read_tokens.unwrap_or(0) as i64,
                request_id: row.request_id,
                metadata: row.metadata,
            })
            .collect())
    }

    fn process_usage_data(&self, raw_records: Vec<RawUsageRecord>) -> Vec<DetailedUsageRecord> {
        // Step 1: Resolve model IDs
        let resolved_records: Vec<ResolvedRecord> = raw_records
            .into_iter()
            .map(|record| {
                let model_id = self.resolve_model_id(&record);
                ResolvedRecord {
                    model_id,
                    cost: record.cost,
                    tokens_input: record.tokens_input,
                    tokens_output: record.tokens_output,
                    cache_tokens: record.cache_write_tokens + record.cache_read_tokens,
                    request_id: record.request_id,
                }
            })
            .collect();

        // Step 2: Group and aggregate
        let mut aggregates: HashMap<String, UsageAggregate> = HashMap::new();

        for record in resolved_records {
            let entry = aggregates
                .entry(record.model_id.clone())
                .or_insert_with(|| {
                    let model_info = self.model_cache.get(&record.model_id);
                    UsageAggregate {
                        model_id: record.model_id.clone(),
                        model_name: model_info.as_ref().map(|m| m.name.clone()),
                        provider_code: model_info.as_ref().map(|m| m.provider_code.clone()),
                        total_cost: 0.0,
                        total_input_tokens: 0,
                        total_output_tokens: 0,
                        total_cached_tokens: 0,
                        unique_requests: HashMap::new(),
                    }
                });

            entry.total_cost += record.cost;
            entry.total_input_tokens += record.tokens_input;
            entry.total_output_tokens += record.tokens_output;
            entry.total_cached_tokens += record.cache_tokens;

            if let Some(request_id) = record.request_id {
                entry.unique_requests.insert(request_id, true);
            }
        }

        // Step 3: Convert to final format and sort by cost
        let mut results: Vec<DetailedUsageRecord> = aggregates
            .into_values()
            .map(|agg| DetailedUsageRecord {
                service_name: agg.model_id.clone(),
                model_display_name: agg.model_name.unwrap_or(agg.model_id),
                provider_code: agg.provider_code.unwrap_or_else(|| "unknown".to_string()),
                total_cost: agg.total_cost,
                total_requests: agg.unique_requests.len() as i64,
                total_input_tokens: agg.total_input_tokens,
                total_output_tokens: agg.total_output_tokens,
                total_cached_tokens: agg.total_cached_tokens,
                total_duration_ms: 0,
            })
            .collect();

        // Sort by total cost descending
        results.sort_by(|a, b| b.total_cost.partial_cmp(&a.total_cost).unwrap());

        results
    }

    fn resolve_model_id(&self, record: &RawUsageRecord) -> String {
        // Fast pattern matching in Rust
        if record.service_name.contains('/') {
            return record.service_name.clone();
        }

        // Parse JSON only if needed
        if let Some(metadata) = &record.metadata {
            if let Some(obj) = metadata.as_object() {
                // Only accept camelCase modelId
                if let Some(model_id) = obj.get("modelId") {
                    if let Some(id) = model_id.as_str() {
                        return id.to_string();
                    }
                }
            }
        }

        record.service_name.clone()
    }

    fn calculate_summary(&self, detailed_usage: &[DetailedUsageRecord]) -> UsageSummary {
        detailed_usage.iter().fold(
            UsageSummary {
                total_cost: 0.0,
                total_requests: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                total_cached_tokens: 0,
                total_duration_ms: 0,
            },
            |mut acc, usage| {
                acc.total_cost += usage.total_cost;
                acc.total_requests += usage.total_requests;
                acc.total_input_tokens += usage.total_input_tokens;
                acc.total_output_tokens += usage.total_output_tokens;
                acc.total_cached_tokens += usage.total_cached_tokens;
                acc.total_duration_ms += usage.total_duration_ms;
                acc
            },
        )
    }
}
