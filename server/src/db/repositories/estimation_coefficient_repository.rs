use crate::error::AppError;
use bigdecimal::{BigDecimal, ToPrimitive};
use sqlx::PgPool;
use std::sync::Arc;
use std::cmp;
use tracing::warn;

#[derive(Debug, Clone)]
pub struct EstimationCoefficient {
    pub model_id: String,
    pub input_multiplier: BigDecimal,
    pub input_offset: i32,
    pub output_multiplier: BigDecimal,
    pub output_offset: i32,
    pub avg_output_tokens: Option<i32>,
}

pub struct EstimationCoefficientRepository {
    pool: Arc<PgPool>,
}

impl EstimationCoefficientRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }

    /// Get estimation coefficients for a model
    pub async fn get_coefficients(&self, model_id: &str) -> Result<Option<EstimationCoefficient>, AppError> {
        let result = sqlx::query!(
            r#"
            SELECT 
                model_id,
                input_multiplier,
                input_offset,
                output_multiplier,
                output_offset,
                avg_output_tokens
            FROM model_estimation_coefficients
            WHERE model_id = $1
            "#,
            model_id
        )
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch estimation coefficients: {}", e)))?;

        Ok(result.map(|row| EstimationCoefficient {
            model_id: row.model_id,
            input_multiplier: row.input_multiplier,
            input_offset: row.input_offset as i32,
            output_multiplier: row.output_multiplier,
            output_offset: row.output_offset as i32,
            avg_output_tokens: row.avg_output_tokens.map(|v| v as i32),
        }))
    }

    /// Calculate estimated tokens for a model
    pub async fn calculate_estimated_tokens(
        &self,
        model_id: &str,
        input_tokens: i64,
        max_output_tokens: Option<i32>,
    ) -> Result<(i64, i64), AppError> {
        // Get coefficients for the model
        let coefficients = self.get_coefficients(model_id).await?;
        
        match coefficients {
            Some(coef) => {
                // Convert input_tokens to BigDecimal for calculation
                let input_bd = BigDecimal::from(input_tokens);
                
                // Calculate estimated input tokens
                let estimated_input_bd = &input_bd * &coef.input_multiplier + BigDecimal::from(coef.input_offset);
                let estimated_input = estimated_input_bd
                    .to_i64()
                    .unwrap_or(input_tokens)
                    .max(0); // Ensure non-negative
                
                // Determine base output tokens with precedence
                let base_output = max_output_tokens
                    .or(coef.avg_output_tokens)
                    .unwrap_or(2000) as i64;
                
                // Convert to BigDecimal for calculation
                let base_output_bd = BigDecimal::from(base_output);
                
                // Calculate estimated output tokens
                let estimated_output_bd = &base_output_bd * &coef.output_multiplier + BigDecimal::from(coef.output_offset);
                let estimated_output = estimated_output_bd
                    .to_i64()
                    .unwrap_or(base_output)
                    .max(0); // Ensure non-negative
                
                // Apply safety cap of 4000 tokens
                let capped_output = cmp::min(estimated_output, 4000);
                
                Ok((estimated_input, capped_output))
            }
            None => {
                // No coefficients found, use defaults
                warn!("No estimation coefficients found for model: {}", model_id);
                let output = max_output_tokens.unwrap_or(2000) as i64;
                let capped_output = cmp::min(output, 4000);
                Ok((input_tokens, capped_output))
            }
        }
    }
}