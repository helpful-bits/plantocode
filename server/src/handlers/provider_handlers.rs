use actix_web::{web, HttpResponse};
use tracing::{info, instrument};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::db::repositories::{ProviderRepository, Provider, ProviderWithModelCount};
use crate::models::runtime_config::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderResponse {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub api_base_url: Option<String>,
    pub capabilities: serde_json::Value,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderWithCountResponse {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub api_base_url: Option<String>,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub model_count: i64,
}

impl From<Provider> for ProviderResponse {
    fn from(provider: Provider) -> Self {
        Self {
            id: provider.id,
            code: provider.code,
            name: provider.name,
            description: provider.description,
            website_url: provider.website_url,
            api_base_url: provider.api_base_url,
            capabilities: provider.capabilities,
            status: provider.status,
        }
    }
}

impl From<ProviderWithModelCount> for ProviderWithCountResponse {
    fn from(provider: ProviderWithModelCount) -> Self {
        Self {
            id: provider.id,
            code: provider.code,
            name: provider.name,
            description: provider.description,
            website_url: provider.website_url,
            api_base_url: provider.api_base_url,
            capabilities: provider.capabilities,
            status: provider.status,
            model_count: provider.model_count,
        }
    }
}

/// Get all active providers
#[instrument(skip(app_state))]
pub async fn get_all_providers(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    info!("API request: Get all providers");
    
    let provider_repo = ProviderRepository::new(app_state.model_repository.get_pool());
    let providers = provider_repo.get_all_active().await?;
    
    let response: Vec<ProviderResponse> = providers.into_iter().map(Into::into).collect();
    
    info!("Returning {} providers", response.len());
    Ok(HttpResponse::Ok().json(response))
}

/// Get all providers with model counts
#[instrument(skip(app_state))]
pub async fn get_providers_with_counts(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    info!("API request: Get all providers with model counts");
    
    let provider_repo = ProviderRepository::new(app_state.model_repository.get_pool());
    let providers = provider_repo.get_all_with_model_counts().await?;
    
    let response: Vec<ProviderWithCountResponse> = providers.into_iter().map(Into::into).collect();
    
    info!("Returning {} providers with model counts", response.len());
    Ok(HttpResponse::Ok().json(response))
}

/// Get provider by code
#[instrument(skip(app_state))]
pub async fn get_provider_by_code(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let provider_code = path.into_inner();
    info!("API request: Get provider by code: {}", provider_code);
    
    let provider_repo = ProviderRepository::new(app_state.model_repository.get_pool());
    let provider = provider_repo.get_by_code(&provider_code).await?;
    
    match provider {
        Some(provider) => {
            let response: ProviderResponse = provider.into();
            Ok(HttpResponse::Ok().json(response))
        }
        None => {
            info!("Provider not found: {}", provider_code);
            Err(AppError::NotFound(format!("Provider '{}' not found", provider_code)))
        }
    }
}

/// Get providers by capability
#[instrument(skip(app_state))]
pub async fn get_providers_by_capability(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let capability = path.into_inner();
    info!("API request: Get providers by capability: {}", capability);
    
    let provider_repo = ProviderRepository::new(app_state.model_repository.get_pool());
    let providers = provider_repo.get_by_capability(&capability).await?;
    
    let response: Vec<ProviderResponse> = providers.into_iter().map(Into::into).collect();
    
    info!("Returning {} providers with capability: {}", response.len(), capability);
    Ok(HttpResponse::Ok().json(response))
}