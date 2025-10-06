use actix_web::{HttpResponse, web};
use bigdecimal::{BigDecimal, ToPrimitive};
use std::collections::{BTreeMap, HashMap};
use tracing::{info, instrument};

use crate::db::{ModelRepository, SettingsRepository};
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::models::runtime_config::{AppState, TaskSpecificModelConfig};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderWithModels {
    pub provider: ProviderInfo,
    pub models: Vec<DesktopModelInfo>,
}

// Runtime config response format that matches the Tauri backend expectations
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeAIConfig {
    pub tasks: BTreeMap<String, TaskSpecificModelConfig>,
    pub providers: Vec<ProviderWithModels>,
    pub max_concurrent_jobs: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopModelInfo {
    /// Unique model identifier
    pub id: String,
    /// Human-readable model name
    pub name: String,
    /// Model provider
    pub provider: String,
    /// Provider name
    pub provider_name: String,
    /// Model description
    pub description: Option<String>,
    /// Context window size in tokens
    pub context_window: Option<u32>,
    /// Price input per million tokens in USD
    pub price_input_per_million: String,
    /// Price output per million tokens in USD
    pub price_output_per_million: String,
    /// Price cache read per million tokens in USD
    pub price_cache_read: Option<String>,
    /// Price cache write per million tokens in USD
    pub price_cache_write: Option<String>,
}

/// Load the complete DesktopRuntimeAIConfig from database for caching
/// This function is used during server startup to load the config once
pub async fn load_desktop_runtime_ai_config(
    settings_repository: &SettingsRepository,
    model_repository: &ModelRepository,
) -> Result<DesktopRuntimeAIConfig, AppError> {
    info!("Loading desktop runtime AI configuration from database for caching");

    // Get models with provider info directly from database
    let models_with_providers = model_repository
        .get_all_with_providers()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch models from database: {}", e)))?;

    // Group models by provider, prioritizing direct provider mappings over OpenRouter fallback mappings
    let mut provider_models: HashMap<String, ProviderWithModels> = HashMap::new();
    let mut model_assignments: HashMap<String, String> = HashMap::new(); // model_id -> preferred_provider_name

    // First pass: identify preferred providers for each model (prioritize non-OpenRouter)
    for model in models_with_providers.iter() {
        let model_id = &model.id;
        let provider_name = &model.provider_name;

        match model_assignments.get(model_id) {
            Some(existing_provider) => {
                // If model is already assigned to a non-OpenRouter provider, keep it there
                if existing_provider != "OpenRouter" {
                    continue;
                }
                // If existing is OpenRouter but current is not, prefer the non-OpenRouter provider
                if provider_name != "OpenRouter" {
                    model_assignments.insert(model_id.clone(), provider_name.clone());
                }
            }
            None => {
                // First time seeing this model, assign it to this provider
                model_assignments.insert(model_id.clone(), provider_name.clone());
            }
        }
    }

    // Second pass: create models only for their preferred providers
    for model in models_with_providers.iter() {
        let model_id = &model.id;
        let provider_name = &model.provider_name;

        // Only include this model if it's assigned to this provider
        if model_assignments.get(model_id) != Some(provider_name) {
            continue;
        }

        let default_pricing = serde_json::Value::Object(serde_json::Map::new());
        let pricing_info = model.pricing_info.as_ref().unwrap_or(&default_pricing);

        let desktop_model = DesktopModelInfo {
            id: model.id.clone(),
            name: model.name.clone(),
            provider: model.provider_code.clone(),
            provider_name: model.provider_name.clone(),
            description: model.description.clone(),
            context_window: Some(model.context_window as u32),
            price_input_per_million: pricing_info
                .get("input_per_million")
                .and_then(|v| v.as_f64())
                .map(|v| v.to_string())
                .unwrap_or_else(|| "0".to_string()),
            price_output_per_million: pricing_info
                .get("output_per_million")
                .and_then(|v| v.as_f64())
                .map(|v| v.to_string())
                .unwrap_or_else(|| "0".to_string()),
            price_cache_read: pricing_info
                .get("cache_read_per_million")
                .and_then(|v| v.as_f64())
                .map(|v| v.to_string()),
            price_cache_write: pricing_info
                .get("cache_write_per_million")
                .and_then(|v| v.as_f64())
                .map(|v| v.to_string()),
        };

        provider_models
            .entry(model.provider_name.clone())
            .or_insert_with(|| ProviderWithModels {
                provider: ProviderInfo {
                    code: model.provider_code.clone(),
                    name: model.provider_name.clone(),
                },
                models: Vec::new(),
            })
            .models
            .push(desktop_model);
    }

    let mut providers: Vec<ProviderWithModels> = provider_models.into_values().collect();

    // Sort providers by name to ensure consistent ordering in API responses
    providers.sort_by(|a, b| a.provider.name.cmp(&b.provider.name));

    // Sort models within each provider for complete determinism
    for provider in &mut providers {
        provider.models.sort_by(|a, b| a.name.cmp(&b.name));
    }

    // Get consolidated AI model settings directly from database
    let task_configs = settings_repository
        .get_ai_model_settings()
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to get AI settings from database: {}", e))
        })?;

    // Convert database types to response types
    let tasks: BTreeMap<String, TaskSpecificModelConfig> = task_configs
        .tasks
        .into_iter()
        .map(|(key, db_config)| {
            (
                key,
                TaskSpecificModelConfig {
                    model: db_config.model,
                    max_tokens: db_config.max_tokens,
                    temperature: db_config.temperature,
                    copy_buttons: db_config.copy_buttons,
                    allowed_models: db_config.allowed_models,
                },
            )
        })
        .collect();

    let config = DesktopRuntimeAIConfig {
        tasks,
        providers,
        max_concurrent_jobs: task_configs.max_concurrent_jobs,
    };

    info!(
        "Loaded desktop runtime AI configuration with {} providers for caching",
        config.providers.len()
    );
    Ok(config)
}

/// Handler for GET /api/config/desktop-runtime-config endpoint for desktop app
///
/// **PERFORMANCE OPTIMIZED**: Uses cached config from AppState instead of database queries
#[instrument(skip(app_state))]
pub async fn get_desktop_runtime_ai_config(
    _user: web::ReqData<AuthenticatedUser>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    // Use cached configuration from AppState instead of database queries
    let response = app_state.runtime_ai_config.as_ref().clone();
    Ok(HttpResponse::Ok().json(response))
}

/// Handler for GET /api/config/all-configurations endpoint
///
/// Retrieves all application configurations from the database
#[instrument(skip(app_state))]
pub async fn get_all_application_configurations_handler(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    info!("Fetching all application configurations");

    // Use the settings repository from app state
    let settings_repo = &app_state.settings_repository;

    // Fetch all configurations
    let configurations = settings_repo.get_all_application_configurations().await?;

    info!(
        "Returning {} application configurations",
        configurations.len()
    );

    Ok(HttpResponse::Ok().json(configurations))
}

// =============================================================================
// BILLING CONFIGURATION HANDLERS
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingConfigResponse {
    pub free_credits_amount: String,
    pub free_credits_expiry_days: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBillingConfigRequest {
    pub free_credits_amount: Option<String>,
    pub free_credits_expiry_days: Option<i64>,
}

/// Get current billing configuration
pub async fn get_billing_config(
    _user: web::ReqData<AuthenticatedUser>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    info!("Getting billing configuration");

    let settings_repo = &app_state.settings_repository;

    let free_credits_amount = settings_repo.get_free_credits_amount().await?;
    let free_credits_expiry_days = settings_repo.get_free_credits_expiry_days().await?;

    let response = BillingConfigResponse {
        free_credits_amount: free_credits_amount.to_string(),
        free_credits_expiry_days,
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Update billing configuration (admin only)
pub async fn update_billing_config(
    _user: web::ReqData<AuthenticatedUser>,
    app_state: web::Data<AppState>,
    request: web::Json<UpdateBillingConfigRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Updating billing configuration");

    let settings_repo = &app_state.settings_repository;

    // Update free credits amount if provided
    if let Some(amount_str) = &request.free_credits_amount {
        let amount = BigDecimal::try_from(amount_str.parse::<f64>().map_err(|_| {
            AppError::InvalidArgument("Invalid free credits amount format".to_string())
        })?)
        .map_err(|_| AppError::InvalidArgument("Invalid free credits amount".to_string()))?;

        settings_repo.set_free_credits_amount(&amount).await?;
    }

    // Update free credits expiry days if provided
    if let Some(days) = request.free_credits_expiry_days {
        if days < 1 || days > 365 {
            return Err(AppError::InvalidArgument(
                "Free credits expiry days must be between 1 and 365".to_string(),
            ));
        }
        settings_repo.set_free_credits_expiry_days(days).await?;
    }

    // Return updated configuration
    let free_credits_amount = settings_repo.get_free_credits_amount().await?;
    let free_credits_expiry_days = settings_repo.get_free_credits_expiry_days().await?;

    let response = BillingConfigResponse {
        free_credits_amount: free_credits_amount.to_string(),
        free_credits_expiry_days,
    };

    info!("Billing configuration updated successfully");
    Ok(HttpResponse::Ok().json(response))
}
