use sqlx::PgPool;
use serde_json::Value as JsonValue;
use crate::error::AppError;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use tracing::{info, instrument};

/// Database-driven AI model settings (no JSON storage dependencies)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseAIModelSettings {
    pub default_llm_model_id: String,
    pub default_voice_model_id: String,
    pub default_transcription_model_id: String,
    pub task_specific_configs: HashMap<String, DatabaseTaskConfig>,
    pub path_finder_settings: DatabasePathFinderSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseTaskConfig {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabasePathFinderSettings {
    pub max_files_with_content: Option<u32>,
    pub include_file_contents: Option<bool>,
    pub max_content_size_per_file: Option<u32>,
    pub max_file_count: Option<u32>,
    pub file_content_truncation_chars: Option<u32>,
    pub token_limit_buffer: Option<u32>,
}

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

    pub async fn get_ai_model_settings(&self) -> Result<DatabaseAIModelSettings, AppError> {
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
        let task_specific_configs: HashMap<String, DatabaseTaskConfig> = serde_json::from_value(task_specific_configs_val)
            .map_err(|e| AppError::Configuration(format!("Failed to parse task_specific_configs: {}", e)))?;


        let path_finder_settings_val = self.get_config_value("ai_settings_path_finder_settings").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings_path_finder_settings".to_string()))?;
        let path_finder_settings: DatabasePathFinderSettings = serde_json::from_value(path_finder_settings_val)
            .map_err(|e| AppError::Configuration(format!("Failed to parse path_finder_settings: {}", e)))?;


        Ok(DatabaseAIModelSettings {
            default_llm_model_id,
            default_voice_model_id,
            default_transcription_model_id,
            task_specific_configs,
            path_finder_settings,
        })
    }

    pub async fn update_ai_model_settings(&self, settings: &DatabaseAIModelSettings) -> Result<(), AppError> {
        // Update each component of the AI model settings
        self.set_config_value("ai_settings_default_llm_model_id", &settings.default_llm_model_id, 
            Some("Default LLM model ID for general AI tasks")).await?;
        
        self.set_config_value("ai_settings_default_voice_model_id", &settings.default_voice_model_id, 
            Some("Default model ID for voice-related tasks")).await?;
        
        self.set_config_value("ai_settings_default_transcription_model_id", &settings.default_transcription_model_id, 
            Some("Default model ID for audio transcription")).await?;
        
        self.set_config_value("ai_settings_task_specific_configs", &settings.task_specific_configs, 
            Some("Task-specific model configurations including model, tokens, and temperature")).await?;
        
        self.set_config_value("ai_settings_path_finder_settings", &settings.path_finder_settings, 
            Some("Settings for the PathFinder agent functionality")).await?;
        
        info!("AI model settings updated in database");
        
        Ok(())
    }


    /// Fetches all application configurations from the database
    #[instrument(skip(self))]
    pub async fn get_all_application_configurations(&self) -> Result<HashMap<String, JsonValue>, AppError> {
        info!("Fetching all application configurations from database");
        
        let records = sqlx::query!(
            "SELECT config_key, config_value FROM application_configurations ORDER BY config_key"
        )
        .fetch_all(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch all application configurations: {}", e)))?;
        
        let configurations = records
            .into_iter()
            .map(|record| (record.config_key, record.config_value))
            .collect::<HashMap<String, JsonValue>>();
        
        info!("Retrieved {} application configurations", configurations.len());
        Ok(configurations)
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