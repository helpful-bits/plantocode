use sqlx::{Pool, Postgres, query_as};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tracing::{info, instrument};
use bigdecimal::BigDecimal;

use crate::error::{AppResult, AppError};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: BigDecimal,
    pub price_output: BigDecimal,
    pub pricing_type: String,
    pub price_per_hour: Option<BigDecimal>,
    pub minimum_billable_seconds: Option<i32>,
    pub billing_unit: String,
    pub provider_id: Option<i32>,
    pub model_type: String,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelWithProvider {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: BigDecimal,
    pub price_output: BigDecimal,
    pub pricing_type: String,
    pub price_per_hour: Option<BigDecimal>,
    pub minimum_billable_seconds: Option<i32>,
    pub billing_unit: String,
    pub model_type: String,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    // Provider information
    pub provider_id: i32,
    pub provider_code: String,
    pub provider_name: String,
    pub provider_description: Option<String>,
    pub provider_website: Option<String>,
    pub provider_api_base: Option<String>,
    pub provider_capabilities: serde_json::Value,
    pub provider_status: String,
}

impl Model {
    /// Check if this model uses duration-based pricing
    pub fn is_duration_based(&self) -> bool {
        self.pricing_type == "duration_based"
    }

    /// Calculate cost for duration-based models (e.g., voice transcription)
    pub fn calculate_duration_cost(&self, duration_ms: i64, markup_percentage: &BigDecimal) -> AppResult<BigDecimal> {
        if !self.is_duration_based() {
            return Err(AppError::Internal(
                format!("Model {} is not duration-based", self.id)
            ));
        }

        let price_per_hour = self.price_per_hour.as_ref()
            .ok_or_else(|| AppError::Internal(
                format!("Model {} missing price_per_hour", self.id)
            ))?;

        // Apply minimum billing if specified
        let minimum_duration_ms = self.minimum_billable_seconds
            .map(|secs| secs as i64 * 1000)
            .unwrap_or(0);
        
        let billable_duration_ms = std::cmp::max(duration_ms, minimum_duration_ms);
        
        // Convert to hours and calculate cost
        let hours = BigDecimal::from(billable_duration_ms) / BigDecimal::from(3600000); // 1 hour = 3,600,000 ms
        let base_cost = price_per_hour * hours;
        let final_cost = base_cost * (BigDecimal::from(1) + markup_percentage);
        
        Ok(final_cost)
    }

    /// Get the minimum billable duration in milliseconds
    pub fn get_minimum_billable_duration_ms(&self) -> i64 {
        self.minimum_billable_seconds
            .map(|secs| secs as i64 * 1000)
            .unwrap_or(0)
    }

    /// Calculate cost for token-based models (e.g., chat completions)
    pub fn calculate_token_cost(&self, tokens_input: i32, tokens_output: i32, markup_percentage: &BigDecimal) -> AppResult<BigDecimal> {
        if self.is_duration_based() {
            return Err(AppError::Internal(
                format!("Model {} is duration-based, token pricing is not applicable", self.id)
            ));
        }

        // Calculate cost using BigDecimal arithmetic: (tokens / 1000) * price_per_1k
        let thousand = BigDecimal::from(1000);
        let tokens_input_bd = BigDecimal::from(tokens_input);
        let tokens_output_bd = BigDecimal::from(tokens_output);
        
        let input_cost = (&tokens_input_bd / &thousand) * &self.price_input;
        let output_cost = (&tokens_output_bd / &thousand) * &self.price_output;
        let base_cost = input_cost + output_cost;
        let final_cost = base_cost * (BigDecimal::from(1) + markup_percentage);
        
        Ok(final_cost)
    }
}

/// Repository for managing AI models with provider relationships
#[derive(Debug, Clone)]
pub struct ModelRepository {
    pool: Arc<Pool<Postgres>>,
}

impl ModelRepository {
    /// Create a new model repository
    pub fn new(pool: Arc<Pool<Postgres>>) -> Self {
        Self { pool }
    }

    /// Get a reference to the database pool
    pub fn get_pool(&self) -> Arc<Pool<Postgres>> {
        self.pool.clone()
    }

    /// Get all active models with provider information (replaces JSON-based approach)
    #[instrument(skip(self))]
    pub async fn get_all_with_providers(&self) -> AppResult<Vec<ModelWithProvider>> {
        info!("Fetching all active models with provider information");
        
        let models = sqlx::query!(
            r#"
            SELECT m.id, m.name, m.context_window, m.price_input, m.price_output,
                   m.pricing_type, m.price_per_hour, m.minimum_billable_seconds,
                   m.billing_unit, m.model_type, m.capabilities, m.status,
                   m.description, m.created_at,
                   p.id as provider_id, p.code as provider_code, p.name as provider_name,
                   p.description as provider_description, p.website_url as provider_website,
                   p.api_base_url as provider_api_base, p.capabilities as provider_capabilities,
                   p.status as provider_status
            FROM models m
            JOIN providers p ON m.provider_id = p.id
            WHERE m.status = 'active' AND p.status = 'active'
            ORDER BY p.name, m.name
            "#
        )
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch models with providers: {}", e)))?;

        let result: Vec<ModelWithProvider> = models.into_iter().map(|row| ModelWithProvider {
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            price_input: row.price_input,
            price_output: row.price_output,
            pricing_type: row.pricing_type,
            price_per_hour: row.price_per_hour,
            minimum_billable_seconds: row.minimum_billable_seconds,
            billing_unit: row.billing_unit,
            model_type: row.model_type,
            capabilities: row.capabilities,
            status: row.status,
            description: row.description,
            created_at: row.created_at,
            provider_id: row.provider_id,
            provider_code: row.provider_code,
            provider_name: row.provider_name,
            provider_description: row.provider_description,
            provider_website: row.provider_website,
            provider_api_base: row.provider_api_base,
            provider_capabilities: row.provider_capabilities,
            provider_status: row.provider_status,
        }).collect();

        info!("Retrieved {} active models with provider information", result.len());
        Ok(result)
    }


    /// Find a model by ID with provider information
    #[instrument(skip(self))]
    pub async fn find_by_id_with_provider(&self, id: &str) -> AppResult<Option<ModelWithProvider>> {
        info!("Fetching model by ID with provider: {}", id);
        
        let model = sqlx::query!(
            r#"
            SELECT m.id, m.name, m.context_window, m.price_input, m.price_output,
                   m.pricing_type,
                   m.price_per_hour, m.minimum_billable_seconds,
                   m.billing_unit,
                   m.model_type,
                   m.capabilities,
                   m.status,
                   m.description, m.created_at,
                   p.id as provider_id, p.code as provider_code, p.name as provider_name,
                   p.description as provider_description, p.website_url as provider_website,
                   p.api_base_url as provider_api_base, p.capabilities as provider_capabilities,
                   p.status as provider_status
            FROM models m
            JOIN providers p ON m.provider_id = p.id
            WHERE m.id = $1
            AND m.status = 'active' 
            AND p.status = 'active'
            "#,
            id
        )
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch model by ID {}: {}", id, e)))?;

        let result = model.map(|row| ModelWithProvider {
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            price_input: row.price_input,
            price_output: row.price_output,
            pricing_type: row.pricing_type,
            price_per_hour: row.price_per_hour,
            minimum_billable_seconds: row.minimum_billable_seconds,
            billing_unit: row.billing_unit,
            model_type: row.model_type,
            capabilities: row.capabilities,
            status: row.status,
            description: row.description,
            created_at: row.created_at,
            provider_id: row.provider_id,
            provider_code: row.provider_code,
            provider_name: row.provider_name,
            provider_description: row.provider_description,
            provider_website: row.provider_website,
            provider_api_base: row.provider_api_base,
            provider_capabilities: row.provider_capabilities,
            provider_status: row.provider_status,
        });

        match &result {
            Some(m) => info!("Found model: {} from provider {}", m.name, m.provider_name),
            None => info!("No model found with ID: {}", id),
        }

        Ok(result)
    }

    /// Find a model by ID (for cost calculations and basic lookups)
    #[instrument(skip(self))]
    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<Model>> {
        let model = query_as::<_, Model>(
            "SELECT id, name, context_window, price_input, price_output, pricing_type, price_per_hour, minimum_billable_seconds, billing_unit, provider_id, model_type, capabilities, status, description, created_at FROM models WHERE id = $1 AND status = 'active'"
        )
            .bind(id)
            .fetch_optional(&*self.pool)
            .await?;

        Ok(model)
    }

    /// Get models by provider code
    #[instrument(skip(self))]
    pub async fn get_by_provider_code(&self, provider_code: &str) -> AppResult<Vec<ModelWithProvider>> {
        info!("Fetching models for provider: {}", provider_code);
        
        let models = sqlx::query!(
            r#"
            SELECT m.id, m.name, m.context_window, m.price_input, m.price_output,
                   m.pricing_type,
                   m.price_per_hour, m.minimum_billable_seconds,
                   m.billing_unit,
                   m.model_type,
                   m.capabilities,
                   m.status,
                   m.description, m.created_at,
                   p.id as provider_id, p.code as provider_code, p.name as provider_name,
                   p.description as provider_description, p.website_url as provider_website,
                   p.api_base_url as provider_api_base, p.capabilities as provider_capabilities,
                   p.status as provider_status
            FROM models m
            JOIN providers p ON m.provider_id = p.id
            WHERE p.code = $1 
            AND m.status = 'active' 
            AND p.status = 'active'
            ORDER BY m.name
            "#,
            provider_code
        )
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch models for provider {}: {}", provider_code, e)))?;

        let result: Vec<ModelWithProvider> = models.into_iter().map(|row| ModelWithProvider {
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            price_input: row.price_input,
            price_output: row.price_output,
            pricing_type: row.pricing_type,
            price_per_hour: row.price_per_hour,
            minimum_billable_seconds: row.minimum_billable_seconds,
            billing_unit: row.billing_unit,
            model_type: row.model_type,
            capabilities: row.capabilities,
            status: row.status,
            description: row.description,
            created_at: row.created_at,
            provider_id: row.provider_id,
            provider_code: row.provider_code,
            provider_name: row.provider_name,
            provider_description: row.provider_description,
            provider_website: row.provider_website,
            provider_api_base: row.provider_api_base,
            provider_capabilities: row.provider_capabilities,
            provider_status: row.provider_status,
        }).collect();

        info!("Retrieved {} models for provider {}", result.len(), provider_code);
        Ok(result)
    }

    /// Get models by type (text, transcription, etc.)
    #[instrument(skip(self))]
    pub async fn get_by_type(&self, model_type: &str) -> AppResult<Vec<ModelWithProvider>> {
        info!("Fetching models of type: {}", model_type);
        
        let models = sqlx::query!(
            r#"
            SELECT m.id, m.name, m.context_window, m.price_input, m.price_output,
                   m.pricing_type,
                   m.price_per_hour, m.minimum_billable_seconds,
                   m.billing_unit,
                   m.model_type,
                   m.capabilities,
                   m.status,
                   m.description, m.created_at,
                   p.id as provider_id, p.code as provider_code, p.name as provider_name,
                   p.description as provider_description, p.website_url as provider_website,
                   p.api_base_url as provider_api_base, p.capabilities as provider_capabilities,
                   p.status as provider_status
            FROM models m
            JOIN providers p ON m.provider_id = p.id
            WHERE m.model_type = $1
            AND m.status = 'active' 
            AND p.status = 'active'
            ORDER BY p.name, m.name
            "#,
            model_type
        )
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch models of type {}: {}", model_type, e)))?;

        let result: Vec<ModelWithProvider> = models.into_iter().map(|row| ModelWithProvider {
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            price_input: row.price_input,
            price_output: row.price_output,
            pricing_type: row.pricing_type,
            price_per_hour: row.price_per_hour,
            minimum_billable_seconds: row.minimum_billable_seconds,
            billing_unit: row.billing_unit,
            model_type: row.model_type,
            capabilities: row.capabilities,
            status: row.status,
            description: row.description,
            created_at: row.created_at,
            provider_id: row.provider_id,
            provider_code: row.provider_code,
            provider_name: row.provider_name,
            provider_description: row.provider_description,
            provider_website: row.provider_website,
            provider_api_base: row.provider_api_base,
            provider_capabilities: row.provider_capabilities,
            provider_status: row.provider_status,
        }).collect();

        info!("Retrieved {} models of type {}", result.len(), model_type);
        Ok(result)
    }
}