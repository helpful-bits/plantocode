use sqlx::{Pool, Postgres, query_as};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tracing::{info, instrument};
use bigdecimal::BigDecimal;
use crate::models::model_pricing::ModelPricing;

use crate::error::{AppResult, AppError};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: BigDecimal,
    pub price_output: BigDecimal,
    pub provider_id: Option<i32>,
    pub model_type: String,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    // Tiered pricing support for models like Gemini 2.5 Pro
    pub price_input_long_context: Option<BigDecimal>,
    pub price_output_long_context: Option<BigDecimal>,
    pub long_context_threshold: Option<i32>,
    // Cached token pricing support
    pub price_cache_write: Option<BigDecimal>,
    pub price_cache_read: Option<BigDecimal>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelWithProvider {
    pub id: String,
    pub api_model_id: String, // Model ID for API calls (without provider prefix)
    pub name: String,
    pub context_window: i32,
    pub price_input: BigDecimal,
    pub price_output: BigDecimal,
    pub model_type: String,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    // Tiered pricing support for models like Gemini 2.5 Pro
    pub price_input_long_context: Option<BigDecimal>,
    pub price_output_long_context: Option<BigDecimal>,
    pub long_context_threshold: Option<i32>,
    // Cached token pricing support
    pub price_cache_write: Option<BigDecimal>,
    pub price_cache_read: Option<BigDecimal>,
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

impl ModelPricing for ModelWithProvider {
    fn get_input_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        Some(self.price_input.clone())
    }
    
    fn get_output_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        Some(self.price_output.clone())
    }
    
    fn get_cache_write_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        self.price_cache_write.clone()
    }
    
    fn get_cache_read_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        self.price_cache_read.clone()
    }

    fn get_input_long_context_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        self.price_input_long_context.clone()
    }

    fn get_output_long_context_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        self.price_output_long_context.clone()
    }

    fn get_long_context_threshold(&self) -> Option<i32> {
        self.long_context_threshold
    }
}

impl ModelPricing for Model {
    fn get_input_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        Some(self.price_input.clone())
    }
    
    fn get_output_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        Some(self.price_output.clone())
    }
    
    fn get_cache_write_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        self.price_cache_write.clone()
    }
    
    fn get_cache_read_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        self.price_cache_read.clone()
    }

    fn get_input_long_context_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        self.price_input_long_context.clone()
    }

    fn get_output_long_context_cost_per_million_tokens(&self) -> Option<BigDecimal> {
        self.price_output_long_context.clone()
    }

    fn get_long_context_threshold(&self) -> Option<i32> {
        self.long_context_threshold
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

    /// Extract and clean the API model ID from a full model ID
    /// For :web models, strips the :web suffix for API calls
    fn extract_api_model_id(model_id: &str) -> String {
        let model_name = model_id.split('/').last().unwrap_or(model_id);
        if model_name.contains(":web") {
            model_name.replace(":web", "")
        } else {
            model_name.to_string()
        }
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
                   m.model_type, m.capabilities, m.status,
                   m.description, m.created_at,
                   m.price_input_long_context, m.price_output_long_context, m.long_context_threshold,
                   m.price_cache_write, m.price_cache_read,
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
            api_model_id: Self::extract_api_model_id(&row.id),
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            price_input: row.price_input,
            price_output: row.price_output,
            model_type: row.model_type,
            capabilities: row.capabilities,
            status: row.status,
            description: row.description,
            created_at: row.created_at,
            price_input_long_context: row.price_input_long_context,
            price_output_long_context: row.price_output_long_context,
            long_context_threshold: row.long_context_threshold,
            price_cache_write: row.price_cache_write,
            price_cache_read: row.price_cache_read,
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
                   m.model_type,
                   m.capabilities,
                   m.status,
                   m.description, m.created_at,
                   m.price_input_long_context, m.price_output_long_context, m.long_context_threshold,
                   m.price_cache_write, m.price_cache_read,
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
            api_model_id: Self::extract_api_model_id(&row.id),
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            price_input: row.price_input,
            price_output: row.price_output,
            model_type: row.model_type,
            capabilities: row.capabilities,
            status: row.status,
            description: row.description,
            created_at: row.created_at,
            price_input_long_context: row.price_input_long_context,
            price_output_long_context: row.price_output_long_context,
            long_context_threshold: row.long_context_threshold,
            price_cache_write: row.price_cache_write,
            price_cache_read: row.price_cache_read,
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
            "SELECT id, name, context_window, price_input, price_output, provider_id, model_type, capabilities, status, description, created_at, price_input_long_context, price_output_long_context, long_context_threshold, price_cache_write, price_cache_read FROM models WHERE id = $1 AND status = 'active'"
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
                   m.model_type,
                   m.capabilities,
                   m.status,
                   m.description, m.created_at,
                   m.price_input_long_context, m.price_output_long_context, m.long_context_threshold,
                   m.price_cache_write, m.price_cache_read,
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
            api_model_id: Self::extract_api_model_id(&row.id),
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            price_input: row.price_input,
            price_output: row.price_output,
            model_type: row.model_type,
            capabilities: row.capabilities,
            status: row.status,
            description: row.description,
            created_at: row.created_at,
            price_input_long_context: row.price_input_long_context,
            price_output_long_context: row.price_output_long_context,
            long_context_threshold: row.long_context_threshold,
            price_cache_write: row.price_cache_write,
            price_cache_read: row.price_cache_read,
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
                   m.model_type,
                   m.capabilities,
                   m.status,
                   m.description, m.created_at,
                   m.price_input_long_context, m.price_output_long_context, m.long_context_threshold,
                   m.price_cache_write, m.price_cache_read,
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
            api_model_id: Self::extract_api_model_id(&row.id),
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            price_input: row.price_input,
            price_output: row.price_output,
            model_type: row.model_type,
            capabilities: row.capabilities,
            status: row.status,
            description: row.description,
            created_at: row.created_at,
            price_input_long_context: row.price_input_long_context,
            price_output_long_context: row.price_output_long_context,
            long_context_threshold: row.long_context_threshold,
            price_cache_write: row.price_cache_write,
            price_cache_read: row.price_cache_read,
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

    /// Update model pricing information
    #[instrument(skip(self))]
    pub async fn update_model_pricing(
        &self,
        model_id: &str,
        price_input: Option<&BigDecimal>,
        price_output: Option<&BigDecimal>,
        price_cache_write: Option<&BigDecimal>,
        price_cache_read: Option<&BigDecimal>,
        price_input_long_context: Option<&BigDecimal>,
        price_output_long_context: Option<&BigDecimal>,
        long_context_threshold: Option<i32>,
    ) -> AppResult<bool> {
        info!("Updating pricing for model: {}", model_id);
        
        let query = r#"
            UPDATE models 
            SET 
                price_input = COALESCE($2, price_input),
                price_output = COALESCE($3, price_output),
                price_cache_write = COALESCE($4, price_cache_write),
                price_cache_read = COALESCE($5, price_cache_read),
                price_input_long_context = COALESCE($6, price_input_long_context),
                price_output_long_context = COALESCE($7, price_output_long_context),
                long_context_threshold = COALESCE($8, long_context_threshold)
            WHERE id = $1 AND status = 'active'
        "#;
        
        let result = sqlx::query(query)
            .bind(model_id)
            .bind(price_input)
            .bind(price_output)
            .bind(price_cache_write)
            .bind(price_cache_read)
            .bind(price_input_long_context)
            .bind(price_output_long_context)
            .bind(long_context_threshold)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to update model pricing for {}: {}", model_id, e)))?;
        
        let updated = result.rows_affected() > 0;
        if updated {
            info!("Successfully updated pricing for model: {}", model_id);
        } else {
            info!("No pricing update needed for model: {}", model_id);
        }
        
        Ok(updated)
    }

    /// Find provider model ID by internal model ID and provider code
    /// For now, returns the API model ID from the models table
    #[instrument(skip(self))]
    pub async fn find_provider_model_id(&self, internal_model_id: &str, provider_code: &str) -> AppResult<Option<String>> {
        info!("Finding provider model ID for internal model: {} with provider: {}", internal_model_id, provider_code);
        
        // Query the model_provider_mappings table to find the provider-specific model ID
        let result = sqlx::query!(
            "SELECT provider_model_id FROM model_provider_mappings WHERE internal_model_id = $1 AND provider_code = $2",
            internal_model_id,
            provider_code
        )
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to query model provider mappings for model {} with provider {}: {}", internal_model_id, provider_code, e)))?;
        
        if let Some(row) = result {
            info!("Found provider model ID: {} for internal model: {} with provider: {}", row.provider_model_id, internal_model_id, provider_code);
            Ok(Some(row.provider_model_id))
        } else {
            info!("No provider model ID found for internal model: {} with provider: {}", internal_model_id, provider_code);
            Ok(None)
        }
    }
}