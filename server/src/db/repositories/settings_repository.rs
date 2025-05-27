use sqlx::{PgPool, query_as};
use serde_json::Value as JsonValue;
use crate::error::AppError;
use crate::config::settings::{AIModelSettings, TaskSpecificModelConfigEntry, ModelInfoEntry, PathFinderSettingsEntry}; // Ensure these are pub
use std::collections::HashMap;
use serde::Serialize;
use std::sync::Arc;
use tracing::{info, error, instrument};

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

    async fn set_config_value<T: Serialize>(&self, key: &str, value: &T, description: Option<&str>) -> Result<(), AppError> {
        // Convert the value to JSON
        let json_value = serde_json::to_value(value)
            .map_err(|e| AppError::Serialization(format!("Failed to serialize config value for {}: {}", key, e)))?;
        
        // Insert or update the configuration
        sqlx::query!(
            r#"
            INSERT INTO application_configurations (config_key, config_value, description, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (config_key) DO UPDATE SET
            config_value = EXCLUDED.config_value,
            description = EXCLUDED.description,
            updated_at = NOW()
            "#,
            key,
            json_value,
            description
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to upsert config for {}: {}", key, e)))?;
        
        Ok(())
    }

    pub async fn get_ai_model_settings(&self) -> Result<AIModelSettings, AppError> {
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

        let available_models_val = self.get_config_value("ai_settings_available_models").await?;
        let available_models: Vec<ModelInfoEntry> = match available_models_val {
            Some(val) => {
                serde_json::from_value(val)
                    .map_err(|e| {
                        log::warn!("Failed to parse available_models from database, using empty list: {}", e);
                        Vec::new()
                    })
                    .unwrap_or_else(|v| v)
            }
            None => {
                log::warn!("ai_settings_available_models key missing from database, using empty list. Will be populated from models table.");
                Vec::new()
            }
        };

        let path_finder_settings_val = self.get_config_value("ai_settings_path_finder_settings").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings_path_finder_settings".to_string()))?;
        let path_finder_settings: PathFinderSettingsEntry = serde_json::from_value(path_finder_settings_val)
            .map_err(|e| AppError::Configuration(format!("Failed to parse path_finder_settings: {}", e)))?;


        Ok(AIModelSettings {
            default_llm_model_id,
            default_voice_model_id,
            default_transcription_model_id,
            task_specific_configs,
            available_models,
            path_finder_settings,
        })
    }

    pub async fn update_ai_model_settings(&self, settings: &AIModelSettings) -> Result<(), AppError> {
        // Update each component of the AI model settings
        self.set_config_value("ai_settings_default_llm_model_id", &settings.default_llm_model_id, 
            Some("Default LLM model ID for general AI tasks")).await?;
        
        self.set_config_value("ai_settings_default_voice_model_id", &settings.default_voice_model_id, 
            Some("Default model ID for voice-related tasks")).await?;
        
        self.set_config_value("ai_settings_default_transcription_model_id", &settings.default_transcription_model_id, 
            Some("Default model ID for audio transcription")).await?;
        
        self.set_config_value("ai_settings_task_specific_configs", &settings.task_specific_configs, 
            Some("Task-specific model configurations including model, tokens, and temperature")).await?;
        
        self.set_config_value("ai_settings_available_models", &settings.available_models, 
            Some("List of available AI models with their properties")).await?;
        
        self.set_config_value("ai_settings_path_finder_settings", &settings.path_finder_settings, 
            Some("Settings for the PathFinder agent functionality")).await?;
        
        info!("AI model settings updated in database");
        
        Ok(())
    }


    // Ensure AI settings exist in database (should be populated by migrations)
    #[instrument(skip(self))]
    pub async fn ensure_ai_settings_exist(&self) -> Result<(), AppError> {
        info!("Checking if AI settings exist in database");
        
        // Check if critical AI settings exist
        let default_llm_exists = self.get_config_value("ai_settings_default_llm_model_id").await?.is_some();
        let task_configs_exist = self.get_config_value("ai_settings_task_specific_configs").await?.is_some();
        
        if !default_llm_exists || !task_configs_exist {
            return Err(AppError::Configuration(
                "AI settings not found in database. Please ensure database migrations have been run.".to_string()
            ));
        }
        
        info!("AI settings exist in database");
        Ok(())
    }

}