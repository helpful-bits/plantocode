use actix_web::{web, HttpResponse};
use tracing::{info, instrument};
use serde::{Deserialize, Serialize};
use bigdecimal::BigDecimal;
use std::str::FromStr;

use crate::error::AppError;
use crate::db::repositories::{ModelRepository, ModelWithProvider};
use crate::models::runtime_config::AppState;
use crate::models::model_pricing::ModelPricing;
use crate::clients::usage_extractor::ProviderUsage;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelResponse {
    pub id: String,
    pub name: String,
    pub context_window: i32,
    pub price_input: String,  // BigDecimal as string for JSON
    pub price_output: String, // BigDecimal as string for JSON
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
        let default_pricing = serde_json::Value::Object(serde_json::Map::new());
        let pricing_info = model.pricing_info.as_ref().unwrap_or(&default_pricing);
        
        Self {
            id: model.id,
            name: model.name,
            context_window: model.context_window,
            price_input: pricing_info.get("input_per_million")
                .and_then(|v| v.as_f64())
                .map(|v| v.to_string())
                .unwrap_or_else(|| "0".to_string()),
            price_output: pricing_info.get("output_per_million")
                .and_then(|v| v.as_f64())
                .map(|v| v.to_string())
                .unwrap_or_else(|| "0".to_string()),
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostEstimationRequest {
    pub model_id: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_write_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CostEstimationResponse {
    pub model_id: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_write_tokens: i64,
    pub cache_read_tokens: i64,
    pub estimated_cost: String, // BigDecimal as string
    pub cost_breakdown: CostBreakdown,
    pub pricing_model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CostBreakdown {
    pub input_cost: String,
    pub output_cost: String,
    pub cache_write_cost: Option<String>,
    pub cache_read_cost: Option<String>,
}

/// Estimate cost for a given model and token usage
#[instrument(skip(app_state))]
pub async fn estimate_cost(
    app_state: web::Data<AppState>,
    request: web::Json<CostEstimationRequest>,
) -> Result<HttpResponse, AppError> {
    let req = request.into_inner();
    info!("API request: Estimate cost for model {} with {} input tokens, {} output tokens", 
          req.model_id, req.input_tokens, req.output_tokens);
    
    // Get model with provider information
    let model = app_state.model_repository
        .find_by_id_with_provider(&req.model_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", req.model_id)))?;
    
    // Create ProviderUsage for cost calculation
    let cache_write_tokens = req.cache_write_tokens.unwrap_or(0);
    let cache_read_tokens = req.cache_read_tokens.unwrap_or(0);
    
    let usage = ProviderUsage::with_total_input(
        req.input_tokens as i32,
        req.output_tokens as i32,
        cache_write_tokens as i32,
        cache_read_tokens as i32,
        req.model_id.clone()
    );
    
    // Calculate total cost using the new method
    let total_cost = model.calculate_total_cost(&usage)
        .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;
    
    // Extract pricing info for breakdown
    let pricing_info = model.get_pricing_info();
    let million = BigDecimal::from(1_000_000);
    
    // Calculate breakdown components
    let input_rate = pricing_info.get("input_per_million")
        .and_then(|v| v.as_f64())
        .and_then(|f| BigDecimal::from_str(&f.to_string()).ok())
        .unwrap_or_else(|| BigDecimal::from(0));
    
    let output_rate = pricing_info.get("output_per_million")
        .and_then(|v| v.as_f64())
        .and_then(|f| BigDecimal::from_str(&f.to_string()).ok())
        .unwrap_or_else(|| BigDecimal::from(0));
    
    // Calculate input cost (excluding cache tokens for breakdown)
    let pure_input_tokens = req.input_tokens - cache_write_tokens - cache_read_tokens;
    let input_cost = if pure_input_tokens > 0 {
        (&input_rate * &BigDecimal::from(pure_input_tokens)) / &million
    } else {
        BigDecimal::from(0)
    };
    
    let output_cost = (&output_rate * &BigDecimal::from(req.output_tokens)) / &million;
    
    // Prepare cache cost breakdown
    let cache_write_cost = if cache_write_tokens > 0 {
        pricing_info.get("cache_write_per_million")
            .and_then(|v| v.as_f64())
            .and_then(|rate| {
                let rate_bd = BigDecimal::from_str(&rate.to_string()).ok()?;
                let tokens_bd = BigDecimal::from(cache_write_tokens);
                Some(((&rate_bd * &tokens_bd) / &million).to_string())
            })
    } else {
        None
    };
    
    let cache_read_cost = if cache_read_tokens > 0 {
        pricing_info.get("cache_read_per_million")
            .and_then(|v| v.as_f64())
            .and_then(|rate| {
                let rate_bd = BigDecimal::from_str(&rate.to_string()).ok()?;
                let tokens_bd = BigDecimal::from(cache_read_tokens);
                Some(((&rate_bd * &tokens_bd) / &million).to_string())
            })
    } else {
        None
    };
    
    let model_id = req.model_id.clone();
    let response = CostEstimationResponse {
        model_id: req.model_id,
        input_tokens: req.input_tokens,
        output_tokens: req.output_tokens,
        cache_write_tokens,
        cache_read_tokens,
        estimated_cost: total_cost.to_string(),
        cost_breakdown: CostBreakdown {
            input_cost: input_cost.to_string(),
            output_cost: output_cost.to_string(),
            cache_write_cost,
            cache_read_cost,
        },
        pricing_model: model.pricing_model_description(),
    };
    
    info!("Estimated cost for model {}: {}", model_id, total_cost);
    Ok(HttpResponse::Ok().json(response))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCostEstimationRequest {
    pub requests: Vec<CostEstimationRequest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCostEstimationResponse {
    pub estimates: Vec<CostEstimationResponse>,
    pub total_estimated_cost: String,
}

/// Estimate costs for multiple models/requests in batch
#[instrument(skip(app_state))]
pub async fn estimate_batch_cost(
    app_state: web::Data<AppState>,
    request: web::Json<BatchCostEstimationRequest>,
) -> Result<HttpResponse, AppError> {
    let req = request.into_inner();
    info!("API request: Batch cost estimation for {} requests", req.requests.len());
    
    let mut estimates = Vec::new();
    let mut total_cost = BigDecimal::from(0);
    
    for cost_req in req.requests {
        // Get model with provider information
        let model = app_state.model_repository
            .find_by_id_with_provider(&cost_req.model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", cost_req.model_id)))?;
        
        // Create ProviderUsage for cost calculation
        let cache_write_tokens = cost_req.cache_write_tokens.unwrap_or(0);
        let cache_read_tokens = cost_req.cache_read_tokens.unwrap_or(0);
        
        let usage = ProviderUsage::with_total_input(
            cost_req.input_tokens as i32,
            cost_req.output_tokens as i32,
            cache_write_tokens as i32,
            cache_read_tokens as i32,
            cost_req.model_id.clone()
        );
        
        // Calculate total cost using the new method
        let request_total_cost = model.calculate_total_cost(&usage)
            .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;
        
        total_cost = total_cost + &request_total_cost;
        
        // Extract pricing info for breakdown
        let pricing_info = model.get_pricing_info();
        let million = BigDecimal::from(1_000_000);
        
        // Calculate breakdown components
        let input_rate = pricing_info.get("input_per_million")
            .and_then(|v| v.as_f64())
            .and_then(|f| BigDecimal::from_str(&f.to_string()).ok())
            .unwrap_or_else(|| BigDecimal::from(0));
        
        let output_rate = pricing_info.get("output_per_million")
            .and_then(|v| v.as_f64())
            .and_then(|f| BigDecimal::from_str(&f.to_string()).ok())
            .unwrap_or_else(|| BigDecimal::from(0));
        
        // Calculate input cost (excluding cache tokens for breakdown)
        let pure_input_tokens = cost_req.input_tokens - cache_write_tokens - cache_read_tokens;
        let input_cost = if pure_input_tokens > 0 {
            (&input_rate * &BigDecimal::from(pure_input_tokens)) / &million
        } else {
            BigDecimal::from(0)
        };
        
        let output_cost = (&output_rate * &BigDecimal::from(cost_req.output_tokens)) / &million;
        
        // Prepare cache cost breakdown
        let cache_write_cost = if cache_write_tokens > 0 {
            pricing_info.get("cache_write_per_million")
                .and_then(|v| v.as_f64())
                .and_then(|rate| {
                    let rate_bd = BigDecimal::from_str(&rate.to_string()).ok()?;
                    let tokens_bd = BigDecimal::from(cache_write_tokens);
                    Some(((&rate_bd * &tokens_bd) / &million).to_string())
                })
        } else {
            None
        };
        
        let cache_read_cost = if cache_read_tokens > 0 {
            pricing_info.get("cache_read_per_million")
                .and_then(|v| v.as_f64())
                .and_then(|rate| {
                    let rate_bd = BigDecimal::from_str(&rate.to_string()).ok()?;
                    let tokens_bd = BigDecimal::from(cache_read_tokens);
                    Some(((&rate_bd * &tokens_bd) / &million).to_string())
                })
        } else {
            None
        };
        
        estimates.push(CostEstimationResponse {
            model_id: cost_req.model_id,
            input_tokens: cost_req.input_tokens,
            output_tokens: cost_req.output_tokens,
            cache_write_tokens,
            cache_read_tokens,
            estimated_cost: request_total_cost.to_string(),
            cost_breakdown: CostBreakdown {
                input_cost: input_cost.to_string(),
                output_cost: output_cost.to_string(),
                cache_write_cost,
                cache_read_cost,
            },
            pricing_model: model.pricing_model_description(),
        });
    }
    
    let response = BatchCostEstimationResponse {
        estimates,
        total_estimated_cost: total_cost.to_string(),
    };
    
    info!("Batch cost estimation completed. Total estimated cost: {}", total_cost);
    Ok(HttpResponse::Ok().json(response))
}