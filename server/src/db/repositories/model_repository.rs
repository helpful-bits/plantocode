use sqlx::{Pool, Postgres, query, query_as};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tracing::{info, error, instrument};
use uuid::Uuid;
use bigdecimal::BigDecimal;

use crate::error::{AppResult, AppError};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: BigDecimal,
    pub price_output: BigDecimal,
    pub pricing_type: Option<String>,
    pub price_per_hour: Option<BigDecimal>,
    pub minimum_billable_seconds: Option<i32>,
    pub billing_unit: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl Model {
    /// Check if this model uses duration-based pricing
    pub fn is_duration_based(&self) -> bool {
        self.pricing_type.as_deref() == Some("duration_based")
    }

    /// Calculate cost for duration-based models (e.g., voice transcription)
    pub fn calculate_duration_cost(&self, duration_ms: i64) -> crate::error::AppResult<BigDecimal> {
        if !self.is_duration_based() {
            return Err(crate::error::AppError::Internal(
                format!("Model {} is not duration-based", self.id)
            ));
        }

        let price_per_hour = self.price_per_hour.as_ref()
            .ok_or_else(|| crate::error::AppError::Internal(
                format!("Model {} missing price_per_hour", self.id)
            ))?;

        // Apply minimum billing if specified
        let minimum_duration_ms = self.minimum_billable_seconds
            .map(|secs| secs as i64 * 1000)
            .unwrap_or(0);
        
        let billable_duration_ms = std::cmp::max(duration_ms, minimum_duration_ms);
        
        // Convert to hours and calculate cost
        let hours = BigDecimal::from(billable_duration_ms) / BigDecimal::from(3600000); // 1 hour = 3,600,000 ms
        let cost = price_per_hour * hours;
        
        Ok(cost)
    }

    /// Get the minimum billable duration in milliseconds
    pub fn get_minimum_billable_duration_ms(&self) -> i64 {
        self.minimum_billable_seconds
            .map(|secs| secs as i64 * 1000)
            .unwrap_or(0)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelCreateDto {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: BigDecimal,
    pub price_output: BigDecimal,
    pub pricing_type: Option<String>,
    pub price_per_hour: Option<BigDecimal>,
    pub minimum_billable_seconds: Option<i32>,
    pub billing_unit: Option<String>,
}


/// Repository for managing AI models and tracking API usage
#[derive(Debug, Clone)]
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
        let models = query_as::<_, Model>(
            "SELECT id, name, context_window, price_input, price_output, pricing_type, price_per_hour, minimum_billable_seconds, billing_unit, created_at FROM models ORDER BY name"
        )
            .fetch_all(&*self.pool)
            .await?;

        Ok(models)
    }

    /// Find a model by its ID
    #[instrument(skip(self))]
    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<Model>> {
        let model = query_as::<_, Model>(
            "SELECT id, name, context_window, price_input, price_output, pricing_type, price_per_hour, minimum_billable_seconds, billing_unit, created_at FROM models WHERE id = $1"
        )
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
            INSERT INTO models (id, name, context_window, price_input, price_output, pricing_type, price_per_hour, minimum_billable_seconds, billing_unit)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                context_window = EXCLUDED.context_window,
                price_input = EXCLUDED.price_input,
                price_output = EXCLUDED.price_output,
                pricing_type = EXCLUDED.pricing_type,
                price_per_hour = EXCLUDED.price_per_hour,
                minimum_billable_seconds = EXCLUDED.minimum_billable_seconds,
                billing_unit = EXCLUDED.billing_unit
            RETURNING id, name, context_window, price_input, price_output, pricing_type, price_per_hour, minimum_billable_seconds, billing_unit, created_at
            "#,
        )
        .bind(model.id)
        .bind(model.name)
        .bind(model.context_window)
        .bind(model.price_input)
        .bind(model.price_output)
        .bind(model.pricing_type)
        .bind(model.price_per_hour)
        .bind(model.minimum_billable_seconds)
        .bind(model.billing_unit)
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

}
