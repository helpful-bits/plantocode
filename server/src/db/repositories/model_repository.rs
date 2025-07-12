use sqlx::{Pool, Postgres, query_as};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tracing::{info, instrument};
use bigdecimal::BigDecimal;
use std::str::FromStr;
use crate::models::model_pricing::ModelPricing;
use once_cell::sync::Lazy;
use crate::services::model_mapping_service::{ModelMappingService, ModelWithMapping};

use crate::error::{AppResult, AppError};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub pricing_info: Option<serde_json::Value>,
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
    pub resolved_model_id: String, // Model ID for API calls (resolved from mappings)
    pub name: String,
    pub context_window: i32,
    pub pricing_info: Option<serde_json::Value>,
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

// Default empty pricing JSON for fallback
static DEFAULT_PRICING: Lazy<serde_json::Value> = Lazy::new(|| {
    serde_json::json!({})
});

impl ModelPricing for ModelWithProvider {
    fn get_pricing_info(&self) -> &serde_json::Value {
        self.pricing_info.as_ref().unwrap_or(&DEFAULT_PRICING)
    }
    
    fn get_provider_code(&self) -> String {
        self.provider_code.clone()
    }
}


impl ModelPricing for Model {
    fn get_pricing_info(&self) -> &serde_json::Value {
        self.pricing_info.as_ref().unwrap_or(&DEFAULT_PRICING)
    }
    
    fn get_provider_code(&self) -> String {
        // For the Model struct, we need to infer provider from the ID
        // Format is typically "provider/model-name"
        self.id.split('/').next().unwrap_or("unknown").to_string()
    }
}

/// Repository for managing AI models with provider relationships
#[derive(Debug, Clone)]
pub struct ModelRepository {
    pool: Arc<Pool<Postgres>>,
    mapping_service: ModelMappingService,
}

impl ModelRepository {
    /// Create a new model repository
    pub fn new(pool: Arc<Pool<Postgres>>) -> Self {
        let mapping_service = ModelMappingService::new(pool.clone());
        Self { pool, mapping_service }
    }


    /// Get a reference to the database pool
    pub fn get_pool(&self) -> Arc<Pool<Postgres>> {
        self.pool.clone()
    }

    /// Get all active models with provider information using mapping service
    #[instrument(skip(self))]
    pub async fn get_all_with_providers(&self) -> AppResult<Vec<ModelWithProvider>> {
        info!("Fetching all active models with provider information");
        
        let mappings = self.mapping_service.get_all_models_with_mappings_all_providers().await
            .map_err(|e| AppError::Database(format!("Failed to fetch models with mappings: {}", e)))?;

        let result: Vec<ModelWithProvider> = mappings.into_iter().map(|mapping| ModelWithProvider {
            resolved_model_id: mapping.resolved_model_id,
            id: mapping.id,
            name: mapping.name,
            context_window: mapping.context_window,
            pricing_info: mapping.pricing_info,
            model_type: mapping.model_type,
            capabilities: mapping.capabilities,
            status: mapping.status,
            description: mapping.description,
            created_at: mapping.created_at,
            provider_id: mapping.provider_id,
            provider_code: mapping.provider_code,
            provider_name: mapping.provider_name,
            provider_description: mapping.provider_description,
            provider_website: mapping.provider_website,
            provider_api_base: mapping.provider_api_base,
            provider_capabilities: mapping.provider_capabilities,
            provider_status: mapping.provider_status,
        }).collect();

        info!("Retrieved {} active models with provider information", result.len());
        Ok(result)
    }


    /// Find a model by ID with provider information using mapping service
    #[instrument(skip(self))]
    pub async fn find_by_id_with_provider(&self, id: &str) -> AppResult<Option<ModelWithProvider>> {
        info!("Fetching model by ID with provider: {}", id);
        
        // First get the model's provider to find the appropriate mapping
        let model_info = sqlx::query!(
            r#"
            SELECT p.code as provider_code
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
        .map_err(|e| AppError::Database(format!("Failed to fetch model info for ID {}: {}", id, e)))?;

        match model_info {
            Some(info) => {
                // Use the mapping service to get the model with resolved ID
                match self.mapping_service.get_model_with_mapping(id, &info.provider_code).await {
                    Ok(mapping) => {
                        let result = ModelWithProvider {
                            resolved_model_id: mapping.resolved_model_id,
                            id: mapping.id,
                            name: mapping.name,
                            context_window: mapping.context_window,
                            pricing_info: mapping.pricing_info,
                            model_type: mapping.model_type,
                            capabilities: mapping.capabilities,
                            status: mapping.status,
                            description: mapping.description,
                            created_at: mapping.created_at,
                            provider_id: mapping.provider_id,
                            provider_code: mapping.provider_code,
                            provider_name: mapping.provider_name,
                            provider_description: mapping.provider_description,
                            provider_website: mapping.provider_website,
                            provider_api_base: mapping.provider_api_base,
                            provider_capabilities: mapping.provider_capabilities,
                            provider_status: mapping.provider_status,
                        };
                        info!("Found model: {} from provider {}", result.name, result.provider_name);
                        Ok(Some(result))
                    }
                    Err(_) => {
                        info!("No mapping found for model ID: {}", id);
                        Ok(None)
                    }
                }
            }
            None => {
                info!("No model found with ID: {}", id);
                Ok(None)
            }
        }
    }

    /// Find a model by ID (for cost calculations and basic lookups)
    #[instrument(skip(self))]
    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<Model>> {
        let model = query_as::<_, Model>(
            "SELECT id, name, context_window, pricing_info, provider_id, model_type, capabilities, status, description, created_at FROM models WHERE id = $1 AND status = 'active'"
        )
            .bind(id)
            .fetch_optional(&*self.pool)
            .await?;

        Ok(model)
    }

    /// Get models by provider code using mapping service
    #[instrument(skip(self))]
    pub async fn get_by_provider_code(&self, provider_code: &str) -> AppResult<Vec<ModelWithProvider>> {
        info!("Fetching models for provider: {}", provider_code);
        
        let mappings = self.mapping_service.get_all_models_with_mappings(provider_code).await
            .map_err(|e| AppError::Database(format!("Failed to fetch models with mappings for provider {}: {}", provider_code, e)))?;

        let result: Vec<ModelWithProvider> = mappings.into_iter().map(|mapping| ModelWithProvider {
            resolved_model_id: mapping.resolved_model_id,
            id: mapping.id,
            name: mapping.name,
            context_window: mapping.context_window,
            pricing_info: mapping.pricing_info,
            model_type: mapping.model_type,
            capabilities: mapping.capabilities,
            status: mapping.status,
            description: mapping.description,
            created_at: mapping.created_at,
            provider_id: mapping.provider_id,
            provider_code: mapping.provider_code,
            provider_name: mapping.provider_name,
            provider_description: mapping.provider_description,
            provider_website: mapping.provider_website,
            provider_api_base: mapping.provider_api_base,
            provider_capabilities: mapping.provider_capabilities,
            provider_status: mapping.provider_status,
        }).collect();

        info!("Retrieved {} models for provider {}", result.len(), provider_code);
        Ok(result)
    }

    /// Get models by type (text, transcription, etc.) using mapping service
    #[instrument(skip(self))]
    pub async fn get_by_type(&self, model_type: &str) -> AppResult<Vec<ModelWithProvider>> {
        info!("Fetching models of type: {}", model_type);
        
        let mappings = self.mapping_service.get_models_by_type_with_mappings(model_type).await
            .map_err(|e| AppError::Database(format!("Failed to fetch models of type {} with mappings: {}", model_type, e)))?;

        let result: Vec<ModelWithProvider> = mappings.into_iter().map(|mapping| ModelWithProvider {
            resolved_model_id: mapping.resolved_model_id,
            id: mapping.id,
            name: mapping.name,
            context_window: mapping.context_window,
            pricing_info: mapping.pricing_info,
            model_type: mapping.model_type,
            capabilities: mapping.capabilities,
            status: mapping.status,
            description: mapping.description,
            created_at: mapping.created_at,
            provider_id: mapping.provider_id,
            provider_code: mapping.provider_code,
            provider_name: mapping.provider_name,
            provider_description: mapping.provider_description,
            provider_website: mapping.provider_website,
            provider_api_base: mapping.provider_api_base,
            provider_capabilities: mapping.provider_capabilities,
            provider_status: mapping.provider_status,
        }).collect();

        info!("Retrieved {} models of type {}", result.len(), model_type);
        Ok(result)
    }

    /// Update model pricing information
    #[instrument(skip(self))]
    pub async fn update_model_pricing(
        &self,
        model_id: &str,
        pricing_info: &serde_json::Value,
    ) -> AppResult<bool> {
        info!("Updating pricing for model: {}", model_id);
        
        let query = r#"
            UPDATE models 
            SET pricing_info = $2
            WHERE id = $1 AND status = 'active'
        "#;
        
        let result = sqlx::query(query)
            .bind(model_id)
            .bind(pricing_info)
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

    /// Find a model by ID with mapping information for API clients
    #[instrument(skip(self))]
    pub async fn find_by_id_with_mapping(&self, id: &str, provider_code: &str) -> AppResult<Option<ModelWithMapping>> {
        info!("Fetching model by ID with mapping: {} for provider: {}", id, provider_code);
        
        match self.mapping_service.get_model_with_mapping(id, provider_code).await {
            Ok(mapping) => {
                info!("Found model with mapping: {} -> {}", id, mapping.resolved_model_id);
                Ok(Some(mapping))
            }
            Err(_) => {
                info!("No model found with mapping for ID: {} with provider: {}", id, provider_code);
                Ok(None)
            }
        }
    }

    /// Find provider model ID by internal model ID and provider code using mapping service
    #[instrument(skip(self))]
    pub async fn find_provider_model_id(&self, internal_model_id: &str, provider_code: &str) -> AppResult<Option<String>> {
        info!("Finding provider model ID for internal model: {} with provider: {}", internal_model_id, provider_code);
        
        match self.mapping_service.resolve_model_id(internal_model_id, provider_code).await {
            Ok(resolved_id) => {
                info!("Found provider model ID: {} for internal model: {} with provider: {}", resolved_id, internal_model_id, provider_code);
                Ok(Some(resolved_id))
            }
            Err(_) => {
                info!("No provider model ID found for internal model: {} with provider: {}", internal_model_id, provider_code);
                Ok(None)
            }
        }
    }
}