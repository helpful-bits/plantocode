use sqlx::{Pool, Postgres, query, query_as};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tracing::{info, error, instrument};
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: f64,
    pub price_output: f64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelCreateDto {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: f64,
    pub price_output: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct ApiUsage {
    pub id: i32,
    pub user_id: String,
    pub model_id: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub total_tokens: i32,
    pub cost: f64,
    pub processing_ms: Option<i32>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApiUsageCreateDto {
    pub user_id: String,
    pub model_id: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub total_tokens: i32,
    pub cost: f64,
    pub processing_ms: Option<i32>,
}

/// Repository for managing AI models and tracking API usage
pub struct ModelRepository {
    pool: Arc<Pool<Postgres>>,
}

impl ModelRepository {
    /// Create a new model repository
    pub fn new(pool: Arc<Pool<Postgres>>) -> Self {
        Self { pool }
    }

    /// Get all models
    #[instrument(skip(self))]
    pub async fn get_all(&self) -> AppResult<Vec<Model>> {
        let models = query_as::<_, Model>("SELECT * FROM models ORDER BY name")
            .fetch_all(&*self.pool)
            .await?;

        Ok(models)
    }

    /// Find a model by its ID
    #[instrument(skip(self))]
    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<Model>> {
        let model = query_as::<_, Model>("SELECT * FROM models WHERE id = $1")
            .bind(id)
            .fetch_optional(&*self.pool)
            .await?;

        Ok(model)
    }

    /// Insert or update a model
    #[instrument(skip(self))]
    pub async fn insert_or_update(&self, model: ModelCreateDto) -> AppResult<Model> {
        let model = query_as::<_, Model>(
            r#"
            INSERT INTO models (id, name, context_window, price_input, price_output)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                context_window = EXCLUDED.context_window,
                price_input = EXCLUDED.price_input,
                price_output = EXCLUDED.price_output
            RETURNING *
            "#,
        )
        .bind(model.id)
        .bind(model.name)
        .bind(model.context_window)
        .bind(model.price_input)
        .bind(model.price_output)
        .fetch_one(&*self.pool)
        .await?;

        Ok(model)
    }

    /// Delete a model by its ID
    #[instrument(skip(self))]
    pub async fn delete(&self, id: &str) -> AppResult<bool> {
        let result = query("DELETE FROM models WHERE id = $1")
            .bind(id)
            .execute(&*self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Record API usage for billing and analytics
    #[instrument(skip(self))]
    pub async fn record_usage(&self, usage: ApiUsageCreateDto) -> AppResult<ApiUsage> {
        let usage = query_as::<_, ApiUsage>(
            r#"
            INSERT INTO api_usage (user_id, model_id, input_tokens, output_tokens, total_tokens, cost, processing_ms)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(usage.user_id)
        .bind(usage.model_id)
        .bind(usage.input_tokens)
        .bind(usage.output_tokens)
        .bind(usage.total_tokens)
        .bind(usage.cost)
        .bind(usage.processing_ms)
        .fetch_one(&*self.pool)
        .await?;

        Ok(usage)
    }

    /// Get usage statistics for a user within a date range
    #[instrument(skip(self))]
    pub async fn get_user_usage(&self, user_id: &str, start_date: DateTime<Utc>, end_date: DateTime<Utc>) -> AppResult<Vec<ApiUsage>> {
        let usage = query_as::<_, ApiUsage>(
            r#"
            SELECT * FROM api_usage
            WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
            ORDER BY timestamp DESC
            "#,
        )
        .bind(user_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_all(&*self.pool)
        .await?;

        Ok(usage)
    }

    /// Get usage totals for a user grouped by model
    #[instrument(skip(self))]
    pub async fn get_user_usage_summary(&self, user_id: &str, start_date: DateTime<Utc>, end_date: DateTime<Utc>) -> AppResult<Vec<UserUsageSummary>> {
        let summary = query_as::<_, UserUsageSummary>(
            r#"
            SELECT 
                u.model_id,
                m.name as model_name,
                SUM(u.input_tokens) as total_input_tokens,
                SUM(u.output_tokens) as total_output_tokens,
                SUM(u.total_tokens) as total_tokens,
                SUM(u.cost) as total_cost
            FROM api_usage u
            JOIN models m ON u.model_id = m.id
            WHERE u.user_id = $1 AND u.timestamp BETWEEN $2 AND $3
            GROUP BY u.model_id, m.name
            ORDER BY total_cost DESC
            "#,
        )
        .bind(user_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_all(&*self.pool)
        .await?;

        Ok(summary)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct UserUsageSummary {
    pub model_id: String,
    pub model_name: String,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
}