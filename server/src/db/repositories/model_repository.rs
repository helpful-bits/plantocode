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
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelCreateDto {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: BigDecimal,
    pub price_output: BigDecimal,
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

}
