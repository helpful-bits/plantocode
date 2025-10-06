use crate::error::AppError;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{info, instrument};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub api_base_url: Option<String>,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderWithModelCount {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub api_base_url: Option<String>,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub model_count: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub struct ProviderRepository {
    db_pool: Arc<PgPool>,
}

impl ProviderRepository {
    pub fn new(db_pool: Arc<PgPool>) -> Self {
        Self { db_pool }
    }

    /// Get all active providers
    #[instrument(skip(self))]
    pub async fn get_all_active(&self) -> Result<Vec<Provider>, AppError> {
        info!("Fetching all active providers");

        let providers = sqlx::query_as!(
            Provider,
            r#"
            SELECT id, code, name, description, website_url, api_base_url, 
                   capabilities, status, created_at, updated_at
            FROM providers 
            WHERE status = 'active'
            ORDER BY name
            "#
        )
        .fetch_all(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch providers: {}", e)))?;

        info!("Retrieved {} active providers", providers.len());
        Ok(providers)
    }

    /// Get all providers with model counts
    #[instrument(skip(self))]
    pub async fn get_all_with_model_counts(&self) -> Result<Vec<ProviderWithModelCount>, AppError> {
        info!("Fetching all providers with model counts");

        let providers = sqlx::query!(
            r#"
            SELECT p.id, p.code, p.name, p.description, p.website_url, p.api_base_url,
                   p.capabilities, p.status, p.created_at, p.updated_at,
                   COUNT(m.id) as model_count
            FROM providers p
            LEFT JOIN models m ON p.id = m.provider_id AND m.status = 'active'
            WHERE p.status = 'active'
            GROUP BY p.id, p.code, p.name, p.description, p.website_url, p.api_base_url,
                     p.capabilities, p.status, p.created_at, p.updated_at
            ORDER BY p.name
            "#
        )
        .fetch_all(&*self.db_pool)
        .await
        .map_err(|e| {
            AppError::Database(format!(
                "Failed to fetch providers with model counts: {}",
                e
            ))
        })?;

        let result: Vec<ProviderWithModelCount> = providers
            .into_iter()
            .map(|row| ProviderWithModelCount {
                id: row.id,
                code: row.code,
                name: row.name,
                description: row.description,
                website_url: row.website_url,
                api_base_url: row.api_base_url,
                capabilities: row.capabilities,
                status: row.status,
                model_count: row.model_count.unwrap_or(0),
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        info!("Retrieved {} providers with model counts", result.len());
        Ok(result)
    }

    /// Get provider by code
    #[instrument(skip(self))]
    pub async fn get_by_code(&self, code: &str) -> Result<Option<Provider>, AppError> {
        info!("Fetching provider by code: {}", code);

        let provider = sqlx::query_as!(
            Provider,
            r#"
            SELECT id, code, name, description, website_url, api_base_url,
                   capabilities, status, created_at, updated_at
            FROM providers 
            WHERE code = $1 AND status = 'active'
            "#,
            code
        )
        .fetch_optional(&*self.db_pool)
        .await
        .map_err(|e| {
            AppError::Database(format!("Failed to fetch provider by code {}: {}", code, e))
        })?;

        match &provider {
            Some(_) => info!("Found provider with code: {}", code),
            None => info!("No provider found with code: {}", code),
        }

        Ok(provider)
    }

    /// Get provider by ID
    #[instrument(skip(self))]
    pub async fn get_by_id(&self, id: i32) -> Result<Option<Provider>, AppError> {
        info!("Fetching provider by ID: {}", id);

        let provider = sqlx::query_as!(
            Provider,
            r#"
            SELECT id, code, name, description, website_url, api_base_url,
                   capabilities, status, created_at, updated_at
            FROM providers 
            WHERE id = $1 AND status = 'active'
            "#,
            id
        )
        .fetch_optional(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch provider by ID {}: {}", id, e)))?;

        match &provider {
            Some(p) => info!("Found provider: {} ({})", p.name, p.code),
            None => info!("No provider found with ID: {}", id),
        }

        Ok(provider)
    }

    /// Get providers by capability
    #[instrument(skip(self))]
    pub async fn get_by_capability(&self, capability: &str) -> Result<Vec<Provider>, AppError> {
        info!("Fetching providers with capability: {}", capability);

        let providers = sqlx::query_as!(
            Provider,
            r#"
            SELECT id, code, name, description, website_url, api_base_url,
                   capabilities, status, created_at, updated_at
            FROM providers 
            WHERE status = 'active' 
            AND capabilities ? $1
            ORDER BY name
            "#,
            capability
        )
        .fetch_all(&*self.db_pool)
        .await
        .map_err(|e| {
            AppError::Database(format!(
                "Failed to fetch providers by capability {}: {}",
                capability, e
            ))
        })?;

        info!(
            "Retrieved {} providers with capability: {}",
            providers.len(),
            capability
        );
        Ok(providers)
    }
}
