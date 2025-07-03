use std::sync::Arc;
use std::collections::HashMap;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Duration};
use uuid::Uuid;
use log::{info, warn, error, debug};

use crate::error::{AppError, AppResult};
use crate::db::repositories::model_repository::ModelRepository;
use crate::services::audit_service::{AuditService, AuditContext, AuditEvent};
use crate::db::connection::DatabasePools;

/// Price sync service that fetches official pricing from provider APIs
/// and updates the local models table with current prices
#[derive(Debug, Clone)]
pub struct PriceSyncService {
    db_pools: DatabasePools,
    model_repository: Arc<ModelRepository>,
    audit_service: Arc<AuditService>,
    http_client: reqwest::Client,
}

/// Pricing information for a specific model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub model_id: String,
    pub input_price: Option<BigDecimal>,
    pub output_price: Option<BigDecimal>,
    pub cache_write_price: Option<BigDecimal>,
    pub cache_read_price: Option<BigDecimal>,
    pub long_context_input_price: Option<BigDecimal>,
    pub long_context_output_price: Option<BigDecimal>,
    pub long_context_threshold: Option<i32>,
    pub last_updated: DateTime<Utc>,
}

/// OpenAI pricing API response structure
#[derive(Debug, Deserialize)]
struct OpenAIPricingResponse {
    pub data: Vec<OpenAIModelPricing>,
}

#[derive(Debug, Deserialize)]
struct OpenAIModelPricing {
    pub id: String,
    pub pricing: OpenAIPricingInfo,
}

#[derive(Debug, Deserialize)]
struct OpenAIPricingInfo {
    pub input: Option<f64>,
    pub output: Option<f64>,
    pub cache_write: Option<f64>,
    pub cache_read: Option<f64>,
}

/// Anthropic pricing data (hardcoded until they provide an API)
fn get_anthropic_pricing() -> HashMap<String, ModelPricing> {
    let mut pricing = HashMap::new();
    let now = Utc::now();
    
    // Claude 3.5 Sonnet (New)
    pricing.insert("anthropic/claude-3-5-sonnet-20241022".to_string(), ModelPricing {
        model_id: "anthropic/claude-3-5-sonnet-20241022".to_string(),
        input_price: Some(BigDecimal::from(3000u32)), // $3.00 per 1M tokens
        output_price: Some(BigDecimal::from(15000u32)), // $15.00 per 1M tokens
        cache_write_price: Some(BigDecimal::from(3750u32)), // $3.75 per 1M tokens
        cache_read_price: Some(BigDecimal::from(300u32)), // $0.30 per 1M tokens
        long_context_input_price: None,
        long_context_output_price: None,
        long_context_threshold: None,
        last_updated: now,
    });
    
    // Claude 3.5 Sonnet (Legacy)
    pricing.insert("anthropic/claude-3-5-sonnet-20240620".to_string(), ModelPricing {
        model_id: "anthropic/claude-3-5-sonnet-20240620".to_string(),
        input_price: Some(BigDecimal::from(3000u32)), // $3.00 per 1M tokens
        output_price: Some(BigDecimal::from(15000u32)), // $15.00 per 1M tokens
        cache_write_price: Some(BigDecimal::from(3750u32)), // $3.75 per 1M tokens
        cache_read_price: Some(BigDecimal::from(300u32)), // $0.30 per 1M tokens
        long_context_input_price: None,
        long_context_output_price: None,
        long_context_threshold: None,
        last_updated: now,
    });
    
    // Claude 3.5 Haiku
    pricing.insert("anthropic/claude-3-5-haiku-20241022".to_string(), ModelPricing {
        model_id: "anthropic/claude-3-5-haiku-20241022".to_string(),
        input_price: Some(BigDecimal::from(1000u32)), // $1.00 per 1M tokens
        output_price: Some(BigDecimal::from(5000u32)), // $5.00 per 1M tokens
        cache_write_price: Some(BigDecimal::from(1250u32)), // $1.25 per 1M tokens
        cache_read_price: Some(BigDecimal::from(100u32)), // $0.10 per 1M tokens
        long_context_input_price: None,
        long_context_output_price: None,
        long_context_threshold: None,
        last_updated: now,
    });
    
    // Claude 3 Opus
    pricing.insert("anthropic/claude-3-opus-20240229".to_string(), ModelPricing {
        model_id: "anthropic/claude-3-opus-20240229".to_string(),
        input_price: Some(BigDecimal::from(15000u32)), // $15.00 per 1M tokens
        output_price: Some(BigDecimal::from(75000u32)), // $75.00 per 1M tokens
        cache_write_price: Some(BigDecimal::from(18750u32)), // $18.75 per 1M tokens
        cache_read_price: Some(BigDecimal::from(1500u32)), // $1.50 per 1M tokens
        long_context_input_price: None,
        long_context_output_price: None,
        long_context_threshold: None,
        last_updated: now,
    });
    
    pricing
}

/// Google Gemini pricing data (hardcoded until they provide an API)
fn get_google_pricing() -> HashMap<String, ModelPricing> {
    let mut pricing = HashMap::new();
    let now = Utc::now();
    
    // Gemini 1.5 Pro
    pricing.insert("google/gemini-pro-1.5".to_string(), ModelPricing {
        model_id: "google/gemini-pro-1.5".to_string(),
        input_price: Some(BigDecimal::from(1250u32)), // $1.25 per 1M tokens
        output_price: Some(BigDecimal::from(5000u32)), // $5.00 per 1M tokens
        cache_write_price: None,
        cache_read_price: None,
        long_context_input_price: Some(BigDecimal::from(2500u32)), // $2.50 per 1M tokens for >128K
        long_context_output_price: Some(BigDecimal::from(10000u32)), // $10.00 per 1M tokens for >128K
        long_context_threshold: Some(128000),
        last_updated: now,
    });
    
    // Gemini 1.5 Flash
    pricing.insert("google/gemini-flash-1.5".to_string(), ModelPricing {
        model_id: "google/gemini-flash-1.5".to_string(),
        input_price: Some(BigDecimal::from(75u32)), // $0.075 per 1M tokens
        output_price: Some(BigDecimal::from(300u32)), // $0.30 per 1M tokens
        cache_write_price: None,
        cache_read_price: None,
        long_context_input_price: Some(BigDecimal::from(150u32)), // $0.15 per 1M tokens for >128K
        long_context_output_price: Some(BigDecimal::from(600u32)), // $0.60 per 1M tokens for >128K
        long_context_threshold: Some(128000),
        last_updated: now,
    });
    
    pricing
}

impl PriceSyncService {
    /// Create a new price sync service
    pub fn new(db_pools: DatabasePools) -> Self {
        let model_repository = Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool.clone())));
        let audit_service = Arc::new(AuditService::new(db_pools.clone()));
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("vibe-manager-price-sync/1.0")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        
        Self {
            db_pools,
            model_repository,
            audit_service,
            http_client,
        }
    }
    
    /// Start the price sync service as a background task
    pub async fn start_background_sync(&self) -> Result<(), String> {
        info!("Starting price sync background service");
        
        let service = self.clone();
        tokio::spawn(async move {
            loop {
                // Run sync every 24 hours at 3 AM UTC
                let now = Utc::now();
                let target_time = now
                    .date_naive()
                    .and_hms_opt(3, 0, 0)
                    .unwrap()
                    .and_utc();
                
                let next_run = if now < target_time {
                    target_time
                } else {
                    target_time + chrono::Duration::days(1)
                };
                
                let sleep_duration = (next_run - now).to_std().unwrap_or(Duration::from_secs(3600));
                
                info!("Next price sync scheduled for: {}", next_run);
                tokio::time::sleep(sleep_duration).await;
                
                if let Err(e) = service.sync_all_provider_prices().await {
                    error!("Price sync failed: {}", e);
                } else {
                    info!("Price sync completed successfully");
                }
            }
        });
        
        Ok(())
    }
    
    /// Sync prices from all providers
    pub async fn sync_all_provider_prices(&self) -> AppResult<()> {
        info!("Starting price sync from all providers");
        
        // Fetch prices from each provider
        let mut all_pricing = HashMap::new();
        
        // Fetch OpenAI pricing
        match self.fetch_openai_pricing().await {
            Ok(pricing) => {
                info!("Retrieved {} OpenAI model prices", pricing.len());
                all_pricing.extend(pricing);
            }
            Err(e) => {
                warn!("Failed to fetch OpenAI pricing: {}", e);
            }
        }
        
        // Get Anthropic pricing (hardcoded for now)
        let anthropic_pricing = get_anthropic_pricing();
        info!("Retrieved {} Anthropic model prices", anthropic_pricing.len());
        all_pricing.extend(anthropic_pricing);
        
        // Get Google pricing (hardcoded for now)
        let google_pricing = get_google_pricing();
        info!("Retrieved {} Google model prices", google_pricing.len());
        all_pricing.extend(google_pricing);
        
        // Update models with new pricing
        let mut updated_count = 0;
        let mut failed_count = 0;
        
        for (model_id, pricing) in all_pricing {
            match self.update_model_pricing(&model_id, &pricing).await {
                Ok(updated) => {
                    if updated {
                        updated_count += 1;
                        debug!("Updated pricing for model: {}", model_id);
                    }
                }
                Err(e) => {
                    warn!("Failed to update pricing for model {}: {}", model_id, e);
                    failed_count += 1;
                }
            }
        }
        
        info!(
            "Price sync completed: {} models updated, {} failed",
            updated_count, failed_count
        );
        
        Ok(())
    }
    
    /// Fetch pricing from OpenAI API
    async fn fetch_openai_pricing(&self) -> AppResult<HashMap<String, ModelPricing>> {
        let url = "https://api.openai.com/v1/models/pricing";
        
        let response = self.http_client
            .get(url)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Failed to fetch OpenAI pricing: {}", e)))?;
        
        if !response.status().is_success() {
            return Err(AppError::External(format!(
                "OpenAI pricing API returned status: {}",
                response.status()
            )));
        }
        
        let pricing_response: OpenAIPricingResponse = response
            .json()
            .await
            .map_err(|e| AppError::External(format!("Failed to parse OpenAI pricing response: {}", e)))?;
        
        let mut pricing_map = HashMap::new();
        let now = Utc::now();
        
        for model_pricing in pricing_response.data {
            let model_id = format!("openai/{}", model_pricing.id);
            
            let pricing = ModelPricing {
                model_id: model_id.clone(),
                input_price: model_pricing.pricing.input.map(|p| BigDecimal::from(p as u32)),
                output_price: model_pricing.pricing.output.map(|p| BigDecimal::from(p as u32)),
                cache_write_price: model_pricing.pricing.cache_write.map(|p| BigDecimal::from(p as u32)),
                cache_read_price: model_pricing.pricing.cache_read.map(|p| BigDecimal::from(p as u32)),
                long_context_input_price: None,
                long_context_output_price: None,
                long_context_threshold: None,
                last_updated: now,
            };
            
            pricing_map.insert(model_id, pricing);
        }
        
        Ok(pricing_map)
    }
    
    /// Update pricing for a specific model
    async fn update_model_pricing(&self, model_id: &str, pricing: &ModelPricing) -> AppResult<bool> {
        // Get current model data
        let current_model = self.model_repository.find_by_id(model_id).await?;
        
        let Some(current_model) = current_model else {
            debug!("Model {} not found in database, skipping price update", model_id);
            return Ok(false);
        };
        
        // Check if prices have changed
        let mut price_changed = false;
        let mut old_values = serde_json::Map::new();
        let mut new_values = serde_json::Map::new();
        
        if let Some(new_input_price) = &pricing.input_price {
            if current_model.price_input != *new_input_price {
                old_values.insert("price_input".to_string(), serde_json::Value::String(current_model.price_input.to_string()));
                new_values.insert("price_input".to_string(), serde_json::Value::String(new_input_price.to_string()));
                price_changed = true;
            }
        }
        
        if let Some(new_output_price) = &pricing.output_price {
            if current_model.price_output != *new_output_price {
                old_values.insert("price_output".to_string(), serde_json::Value::String(current_model.price_output.to_string()));
                new_values.insert("price_output".to_string(), serde_json::Value::String(new_output_price.to_string()));
                price_changed = true;
            }
        }
        
        if let Some(new_cache_write_price) = &pricing.cache_write_price {
            if current_model.price_cache_write.as_ref() != Some(new_cache_write_price) {
                old_values.insert("price_cache_write".to_string(), 
                    current_model.price_cache_write.as_ref()
                        .map(|p| serde_json::Value::String(p.to_string()))
                        .unwrap_or(serde_json::Value::Null));
                new_values.insert("price_cache_write".to_string(), serde_json::Value::String(new_cache_write_price.to_string()));
                price_changed = true;
            }
        }
        
        if let Some(new_cache_read_price) = &pricing.cache_read_price {
            if current_model.price_cache_read.as_ref() != Some(new_cache_read_price) {
                old_values.insert("price_cache_read".to_string(), 
                    current_model.price_cache_read.as_ref()
                        .map(|p| serde_json::Value::String(p.to_string()))
                        .unwrap_or(serde_json::Value::Null));
                new_values.insert("price_cache_read".to_string(), serde_json::Value::String(new_cache_read_price.to_string()));
                price_changed = true;
            }
        }
        
        if let Some(new_long_input_price) = &pricing.long_context_input_price {
            if current_model.price_input_long_context.as_ref() != Some(new_long_input_price) {
                old_values.insert("price_input_long_context".to_string(), 
                    current_model.price_input_long_context.as_ref()
                        .map(|p| serde_json::Value::String(p.to_string()))
                        .unwrap_or(serde_json::Value::Null));
                new_values.insert("price_input_long_context".to_string(), serde_json::Value::String(new_long_input_price.to_string()));
                price_changed = true;
            }
        }
        
        if let Some(new_long_output_price) = &pricing.long_context_output_price {
            if current_model.price_output_long_context.as_ref() != Some(new_long_output_price) {
                old_values.insert("price_output_long_context".to_string(), 
                    current_model.price_output_long_context.as_ref()
                        .map(|p| serde_json::Value::String(p.to_string()))
                        .unwrap_or(serde_json::Value::Null));
                new_values.insert("price_output_long_context".to_string(), serde_json::Value::String(new_long_output_price.to_string()));
                price_changed = true;
            }
        }
        
        if let Some(new_threshold) = pricing.long_context_threshold {
            if current_model.long_context_threshold != Some(new_threshold) {
                old_values.insert("long_context_threshold".to_string(), 
                    current_model.long_context_threshold
                        .map(|t| serde_json::Value::Number(t.into()))
                        .unwrap_or(serde_json::Value::Null));
                new_values.insert("long_context_threshold".to_string(), serde_json::Value::Number(new_threshold.into()));
                price_changed = true;
            }
        }
        
        if !price_changed {
            debug!("No price changes detected for model: {}", model_id);
            return Ok(false);
        }
        
        // Update the model pricing in the database using the repository
        self.model_repository.update_model_pricing(
            model_id,
            pricing.input_price.as_ref(),
            pricing.output_price.as_ref(),
            pricing.cache_write_price.as_ref(),
            pricing.cache_read_price.as_ref(),
            pricing.long_context_input_price.as_ref(),
            pricing.long_context_output_price.as_ref(),
            pricing.long_context_threshold,
        ).await?;
        
        // Create audit log for price change
        let audit_context = AuditContext::new(Uuid::nil()); // System user
        let audit_event = AuditEvent::new("model_pricing_updated", "model")
            .with_entity_id(model_id)
            .with_old_values(serde_json::Value::Object(old_values))
            .with_new_values(serde_json::Value::Object(new_values))
            .with_metadata(serde_json::json!({
                "updated_by": "price_sync_service",
                "last_updated": pricing.last_updated,
                "sync_timestamp": Utc::now()
            }))
            .with_performed_by("price_sync_service");
        
        self.audit_service.log_event(&audit_context, audit_event).await?;
        
        info!("Updated pricing for model: {}", model_id);
        Ok(true)
    }
    
    /// Manually trigger a price sync for testing/admin purposes
    pub async fn trigger_manual_sync(&self) -> AppResult<()> {
        info!("Manual price sync triggered");
        self.sync_all_provider_prices().await
    }
}