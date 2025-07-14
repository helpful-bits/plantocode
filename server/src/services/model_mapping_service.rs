use sqlx::{Pool, Postgres};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tracing::{info, instrument};
use crate::error::{AppResult, AppError};
use crate::models::model_pricing::ModelPricing;
use once_cell::sync::Lazy;

// Default empty pricing JSON for fallback
static DEFAULT_PRICING: Lazy<serde_json::Value> = Lazy::new(|| {
    serde_json::json!({})
});

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelWithMapping {
    pub id: String,
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
    // Resolved model ID for API calls
    pub resolved_model_id: String,
}

impl ModelPricing for ModelWithMapping {
    fn get_pricing_info(&self) -> &serde_json::Value {
        self.pricing_info.as_ref().unwrap_or(&DEFAULT_PRICING)
    }
    
    fn get_provider_code(&self) -> String {
        self.provider_code.clone()
    }
}

/// Service for handling model ID mapping via the model_provider_mappings table
#[derive(Debug, Clone)]
pub struct ModelMappingService {
    pool: Arc<Pool<Postgres>>,
}

impl ModelMappingService {
    /// Create a new model mapping service
    pub fn new(pool: Arc<Pool<Postgres>>) -> Self {
        Self { pool }
    }

    /// Resolve a model ID to its provider-specific format
    #[instrument(skip(self))]
    pub async fn resolve_model_id(&self, internal_id: &str, provider_code: &str) -> Result<String, String> {
        info!("Resolving model ID {} for provider {}", internal_id, provider_code);
        
        let result = sqlx::query!(
            "SELECT provider_model_id FROM model_provider_mappings WHERE internal_model_id = $1 AND provider_code = $2",
            internal_id,
            provider_code
        )
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| format!("Failed to query model provider mappings for model {} with provider {}: {}", internal_id, provider_code, e))?;
        
        match result {
            Some(row) => {
                info!("Resolved model ID: {} -> {}", internal_id, row.provider_model_id);
                Ok(row.provider_model_id)
            }
            None => {
                let error_msg = format!("No mapping found for model {} with provider {}", internal_id, provider_code);
                info!("{}", error_msg);
                Err(error_msg)
            }
        }
    }

    /// Get a model with its provider information and resolved model ID
    #[instrument(skip(self))]
    pub async fn get_model_with_mapping(&self, internal_id: &str, provider_code: &str) -> Result<ModelWithMapping, String> {
        info!("Getting model with mapping for {} from provider {}", internal_id, provider_code);
        
        let result = sqlx::query!(
            r#"
            SELECT 
                m.id, m.name, m.context_window, m.pricing_info,
                m.model_type, m.capabilities, m.status,
                m.description, m.created_at,
                p.id as provider_id, p.code as provider_code, p.name as provider_name,
                p.description as provider_description, p.website_url as provider_website,
                p.api_base_url as provider_api_base, p.capabilities as provider_capabilities,
                p.status as provider_status,
                mpm.provider_model_id as resolved_model_id
            FROM models m
            JOIN model_provider_mappings mpm ON m.id = mpm.internal_model_id
            JOIN providers p ON p.code = mpm.provider_code
            WHERE m.id = $1 AND p.code = $2
            AND m.status = 'active' AND p.status = 'active'
            "#,
            internal_id,
            provider_code
        )
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| format!("Failed to fetch model with mapping for {} from provider {}: {}", internal_id, provider_code, e))?;

        match result {
            Some(row) => {
                let model = ModelWithMapping {
                    id: row.id,
                    name: row.name,
                    context_window: row.context_window,
                    pricing_info: Some(row.pricing_info),
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
                    resolved_model_id: row.resolved_model_id,
                };
                
                info!("Found model with mapping: {} -> {}", internal_id, model.resolved_model_id);
                Ok(model)
            }
            None => {
                let error_msg = format!("No model found with mapping for {} from provider {}", internal_id, provider_code);
                info!("{}", error_msg);
                Err(error_msg)
            }
        }
    }

    /// Get all models with their resolved provider-specific IDs for a given provider
    #[instrument(skip(self))]
    pub async fn get_all_models_with_mappings(&self, provider_code: &str) -> Result<Vec<ModelWithMapping>, String> {
        info!("Getting all models with mappings for provider {}", provider_code);
        
        let results = sqlx::query!(
            r#"
            SELECT 
                m.id, m.name, m.context_window, m.pricing_info,
                m.model_type, m.capabilities, m.status,
                m.description, m.created_at,
                p.id as provider_id, p.code as provider_code, p.name as provider_name,
                p.description as provider_description, p.website_url as provider_website,
                p.api_base_url as provider_api_base, p.capabilities as provider_capabilities,
                p.status as provider_status,
                mpm.provider_model_id as resolved_model_id
            FROM models m
            JOIN providers p ON m.provider_id = p.id
            JOIN model_provider_mappings mpm ON m.id = mpm.internal_model_id AND p.code = mpm.provider_code
            WHERE p.code = $1
            AND m.status = 'active' AND p.status = 'active'
            ORDER BY m.name
            "#,
            provider_code
        )
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| format!("Failed to fetch models with mappings for provider {}: {}", provider_code, e))?;

        let models: Vec<ModelWithMapping> = results.into_iter().map(|row| ModelWithMapping {
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            pricing_info: Some(row.pricing_info),
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
            resolved_model_id: row.resolved_model_id,
        }).collect();

        info!("Retrieved {} models with mappings for provider {}", models.len(), provider_code);
        Ok(models)
    }

    /// Get all models with their resolved provider-specific IDs for all providers
    #[instrument(skip(self))]
    pub async fn get_all_models_with_mappings_all_providers(&self) -> Result<Vec<ModelWithMapping>, String> {
        info!("Getting all models with mappings for all providers");
        
        let results = sqlx::query!(
            r#"
            SELECT 
                m.id, m.name, m.context_window, m.pricing_info,
                m.model_type, m.capabilities, m.status,
                m.description, m.created_at,
                p.id as provider_id, p.code as provider_code, p.name as provider_name,
                p.description as provider_description, p.website_url as provider_website,
                p.api_base_url as provider_api_base, p.capabilities as provider_capabilities,
                p.status as provider_status,
                mpm.provider_model_id as resolved_model_id
            FROM models m
            JOIN providers p ON m.provider_id = p.id
            JOIN model_provider_mappings mpm ON m.id = mpm.internal_model_id AND p.code = mpm.provider_code
            WHERE m.status = 'active' AND p.status = 'active'
            ORDER BY p.name, m.name
            "#
        )
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| format!("Failed to fetch all models with mappings: {}", e))?;

        let models: Vec<ModelWithMapping> = results.into_iter().map(|row| ModelWithMapping {
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            pricing_info: Some(row.pricing_info),
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
            resolved_model_id: row.resolved_model_id,
        }).collect();

        info!("Retrieved {} models with mappings for all providers", models.len());
        Ok(models)
    }

    /// Get models by type with their resolved provider-specific IDs
    #[instrument(skip(self))]
    pub async fn get_models_by_type_with_mappings(&self, model_type: &str) -> Result<Vec<ModelWithMapping>, String> {
        info!("Getting models of type {} with mappings", model_type);
        
        let results = sqlx::query!(
            r#"
            SELECT 
                m.id, m.name, m.context_window, m.pricing_info,
                m.model_type, m.capabilities, m.status,
                m.description, m.created_at,
                p.id as provider_id, p.code as provider_code, p.name as provider_name,
                p.description as provider_description, p.website_url as provider_website,
                p.api_base_url as provider_api_base, p.capabilities as provider_capabilities,
                p.status as provider_status,
                mpm.provider_model_id as resolved_model_id
            FROM models m
            JOIN providers p ON m.provider_id = p.id
            JOIN model_provider_mappings mpm ON m.id = mpm.internal_model_id AND p.code = mpm.provider_code
            WHERE m.model_type = $1
            AND m.status = 'active' AND p.status = 'active'
            ORDER BY p.name, m.name
            "#,
            model_type
        )
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| format!("Failed to fetch models of type {} with mappings: {}", model_type, e))?;

        let models: Vec<ModelWithMapping> = results.into_iter().map(|row| ModelWithMapping {
            id: row.id,
            name: row.name,
            context_window: row.context_window,
            pricing_info: Some(row.pricing_info),
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
            resolved_model_id: row.resolved_model_id,
        }).collect();

        info!("Retrieved {} models of type {} with mappings", models.len(), model_type);
        Ok(models)
    }
}