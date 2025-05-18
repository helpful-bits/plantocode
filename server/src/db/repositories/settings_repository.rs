use sqlx::{PgPool, query_as};
use serde_json::Value as JsonValue;
use crate::error::AppError;
use crate::config::settings::{AiModelSettings, TaskSpecificModelConfigEntry, ModelInfoEntry, PathFinderSettingsEntry}; // Ensure these are pub
use std::collections::HashMap;

pub struct SettingsRepository {
    db_pool: PgPool,
}

impl SettingsRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    async fn get_config_value(&self, key: &str) -> Result<Option<JsonValue>, AppError> {
        let record = sqlx::query!(
            "SELECT config_value FROM application_configurations WHERE config_key = $1",
            key
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch config for key {}: {}", key, e)))?;
        Ok(record.map(|r| r.config_value))
    }

    pub async fn get_ai_model_settings(&self) -> Result<AiModelSettings, AppError> {
        let default_llm_model_id_val = self.get_config_value("ai_settings_default_llm_model_id").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings_default_llm_model_id".to_string()))?;
        let default_llm_model_id = default_llm_model_id_val.as_str().ok_or_else(|| AppError::Configuration("Invalid format for default_llm_model_id".to_string()))?.to_string();

        let default_voice_model_id_val = self.get_config_value("ai_settings_default_voice_model_id").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings_default_voice_model_id".to_string()))?;
        let default_voice_model_id = default_voice_model_id_val.as_str().ok_or_else(|| AppError::Configuration("Invalid format for default_voice_model_id".to_string()))?.to_string();

        let default_transcription_model_id_val = self.get_config_value("ai_settings_default_transcription_model_id").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings_default_transcription_model_id".to_string()))?;
        let default_transcription_model_id = default_transcription_model_id_val.as_str().ok_or_else(|| AppError::Configuration("Invalid format for default_transcription_model_id".to_string()))?.to_string();

        let task_specific_configs_val = self.get_config_value("ai_settings_task_specific_configs").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings_task_specific_configs".to_string()))?;
        let task_specific_configs: HashMap<String, TaskSpecificModelConfigEntry> = serde_json::from_value(task_specific_configs_val)
            .map_err(|e| AppError::Configuration(format!("Failed to parse task_specific_configs: {}", e)))?;

        let available_models_val = self.get_config_value("ai_settings_available_models").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings_available_models".to_string()))?;
        let available_models: Vec<ModelInfoEntry> = serde_json::from_value(available_models_val)
            .map_err(|e| AppError::Configuration(format!("Failed to parse available_models: {}", e)))?;

        let path_finder_settings_val = self.get_config_value("ai_settings_path_finder_settings").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings_path_finder_settings".to_string()))?;
        let path_finder_settings: PathFinderSettingsEntry = serde_json::from_value(path_finder_settings_val)
            .map_err(|e| AppError::Configuration(format!("Failed to parse path_finder_settings: {}", e)))?;

        // After fetching available_models, populate/update the service_pricing table
        self.update_service_pricing_table(&available_models).await?;

        Ok(AiModelSettings {
            default_llm_model_id,
            default_voice_model_id,
            default_transcription_model_id,
            task_specific_configs,
            available_models,
            path_finder_settings,
        })
    }

    async fn update_service_pricing_table(&self, models: &[ModelInfoEntry]) -> Result<(), AppError> {
        let mut tx = self.db_pool.begin().await.map_err(|e| AppError::Database(format!("Failed to begin transaction for service_pricing update: {}", e)))?;
        for model_info in models {
            if let (Some(input_price), Some(output_price)) = (model_info.price_input_per_1k_tokens, model_info.price_output_per_1k_tokens) {
                let input_price_decimal = bigdecimal::BigDecimal::try_from(input_price).map_err(|e| AppError::Internal(format!("Invalid input price format for {}: {}", model_info.id, e)))?;
                let output_price_decimal = bigdecimal::BigDecimal::try_from(output_price).map_err(|e| AppError::Internal(format!("Invalid output price format for {}: {}", model_info.id, e)))?;

                sqlx::query!(
                    r#"
                    INSERT INTO service_pricing (service_name, input_token_price, output_token_price, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (service_name) DO UPDATE SET
                    input_token_price = EXCLUDED.input_token_price,
                    output_token_price = EXCLUDED.output_token_price,
                    updated_at = NOW();
                    "#,
                    model_info.id,
                    input_price_decimal,
                    output_price_decimal
                )
                .execute(&mut *tx) // Use &mut *tx for the executor
                .await
                .map_err(|e| AppError::Database(format!("Failed to upsert service_pricing for {}: {}", model_info.id, e)))?;
            }
        }
        tx.commit().await.map_err(|e| AppError::Database(format!("Failed to commit transaction for service_pricing update: {}", e)))?;
        Ok(())
    }
}