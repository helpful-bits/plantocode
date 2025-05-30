use actix_web::{web, HttpResponse};
use tracing::{info, instrument};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::db::repositories::{ModelRepository, ModelWithProvider};
use crate::models::runtime_config::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelResponse {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: String,  // BigDecimal as string for JSON
    pub price_output: String, // BigDecimal as string for JSON
    pub pricing_type: String,
    pub price_per_hour: Option<String>,
    pub minimum_billable_seconds: Option<i32>,
    pub billing_unit: String,
    pub model_type: String,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub description: Option<String>,
    pub provider: ProviderInfo,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub api_base_url: Option<String>,
    pub capabilities: serde_json::Value,
    pub status: String,
}

impl From<ModelWithProvider> for ModelResponse {
    fn from(model: ModelWithProvider) -> Self {
        Self {
            id: model.id,
            name: model.name,
            context_window: model.context_window,
            price_input: model.price_input.to_string(),
            price_output: model.price_output.to_string(),
            pricing_type: model.pricing_type,
            price_per_hour: model.price_per_hour.map(|p| p.to_string()),
            minimum_billable_seconds: model.minimum_billable_seconds,
            billing_unit: model.billing_unit,
            model_type: model.model_type,
            capabilities: model.capabilities,
            status: model.status,
            description: model.description,
            provider: ProviderInfo {
                id: model.provider_id,
                code: model.provider_code,
                name: model.provider_name,
                description: model.provider_description,
                website_url: model.provider_website,
                api_base_url: model.provider_api_base,
                capabilities: model.provider_capabilities,
                status: model.provider_status,
            },
        }
    }
}

/// Get all active models with provider information
#[instrument(skip(app_state))]
pub async fn get_all_models(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    info!("API request: Get all models with provider information");
    
    let models = app_state.model_repository.get_all_with_providers().await?;
    let response: Vec<ModelResponse> = models.into_iter().map(Into::into).collect();
    
    info!("Returning {} models with provider information", response.len());
    Ok(HttpResponse::Ok().json(response))
}

/// Get model by ID with provider information
#[instrument(skip(app_state))]
pub async fn get_model_by_id(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let model_id = path.into_inner();
    info!("API request: Get model by ID with provider: {}", model_id);
    
    let model = app_state.model_repository.find_by_id_with_provider(&model_id).await?;
    
    match model {
        Some(model) => {
            let response: ModelResponse = model.into();
            Ok(HttpResponse::Ok().json(response))
        }
        None => {
            info!("Model not found: {}", model_id);
            Err(AppError::NotFound(format!("Model '{}' not found", model_id)))
        }
    }
}

/// Get models by provider code
#[instrument(skip(app_state))]
pub async fn get_models_by_provider(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let provider_code = path.into_inner();
    info!("API request: Get models by provider: {}", provider_code);
    
    let models = app_state.model_repository.get_by_provider_code(&provider_code).await?;
    let response: Vec<ModelResponse> = models.into_iter().map(Into::into).collect();
    
    info!("Returning {} models for provider: {}", response.len(), provider_code);
    Ok(HttpResponse::Ok().json(response))
}

/// Get models by type (text, transcription, etc.)
#[instrument(skip(app_state))]
pub async fn get_models_by_type(
    app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let model_type = path.into_inner();
    info!("API request: Get models by type: {}", model_type);
    
    let models = app_state.model_repository.get_by_type(&model_type).await?;
    let response: Vec<ModelResponse> = models.into_iter().map(Into::into).collect();
    
    info!("Returning {} models of type: {}", response.len(), model_type);
    Ok(HttpResponse::Ok().json(response))
}