use crate::clients::usage_extractor::ProviderUsage;
use crate::error::AppError;
use crate::models::model_pricing::ModelPricing;
use crate::services::billing_service::BillingService;
use bigdecimal::{BigDecimal, FromPrimitive};
use log::debug;
use std::sync::Arc;

impl BillingService {
    /// Estimate streaming cost for UI display only - does not charge the user
    /// Uses model pricing to calculate cost based on estimated token usage
    pub async fn estimate_streaming_cost(
        &self,
        model_id: &str,
        tokens_input: i32,
        tokens_output: i32,
        cache_write_tokens: i32,
        cache_read_tokens: i32,
    ) -> Result<BigDecimal, AppError> {
        debug!(
            "Estimating streaming cost for model {} with input={}, output={}, cache_write={}, cache_read={}",
            model_id, tokens_input, tokens_output, cache_write_tokens, cache_read_tokens
        );

        // Get model with pricing information
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(Arc::new(
            self.db_pools.system_pool.clone(),
        )));

        let model = model_repository
            .find_by_id_with_provider(model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", model_id)))?;

        // Create usage for estimation
        let usage = ProviderUsage::new(
            tokens_input,
            tokens_output,
            cache_write_tokens,
            cache_read_tokens,
            model_id.to_string(),
        );

        // Validate usage data
        usage
            .validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;

        // Calculate total cost using server-side pricing logic
        let total_cost = model
            .calculate_total_cost(&usage)
            .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;

        Ok(total_cost)
    }

    /// Calculate cost for streaming tokens using server-side model pricing
    /// This function does NOT record any usage or charge the user - it only calculates cost
    /// Returns: (cost: BigDecimal)
    pub async fn calculate_streaming_cost(
        &self,
        model_id: &str,
        tokens_input: i32,
        tokens_output: i32,
        cache_write_tokens: i32,
        cache_read_tokens: i32,
    ) -> Result<BigDecimal, AppError> {
        debug!(
            "Calculating streaming cost for model {} with input={}, output={}, cache_write={}, cache_read={}",
            model_id, tokens_input, tokens_output, cache_write_tokens, cache_read_tokens
        );

        // Get model with pricing information
        let model_repository = Arc::new(crate::db::repositories::ModelRepository::new(Arc::new(
            self.db_pools.system_pool.clone(),
        )));

        let model = model_repository
            .find_by_id_with_provider(model_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", model_id)))?;

        // Create usage for cost calculation
        let usage = ProviderUsage::new(
            tokens_input,
            tokens_output,
            cache_write_tokens,
            cache_read_tokens,
            model_id.to_string(),
        );

        // Validate usage data
        usage
            .validate()
            .map_err(|e| AppError::InvalidArgument(format!("Usage validation failed: {}", e)))?;

        // Calculate total cost using server-side pricing logic
        let total_cost = model
            .calculate_total_cost(&usage)
            .map_err(|e| AppError::InvalidArgument(format!("Cost calculation failed: {}", e)))?;

        Ok(total_cost)
    }
}
