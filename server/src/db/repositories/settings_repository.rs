use sqlx::PgPool;
use serde_json::Value as JsonValue;
use crate::error::AppError;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use tracing::{info, instrument};

/// Database-driven AI model settings (pure task-driven configuration)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseAIModelSettings {
    pub tasks: HashMap<String, TaskConfig>,
    pub max_concurrent_jobs: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskConfig {
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub copy_buttons: Option<Vec<serde_json::Value>>,
    pub allowed_models: Option<Vec<String>>,
}


impl DatabaseAIModelSettings {
    pub fn get_model_for_task(&self, task_name: &str) -> Result<&str, AppError> {
        self.tasks.get(task_name)
            .map(|config| config.model.as_str())
            .ok_or_else(|| AppError::Configuration(
                format!("No model configured for task: {}", task_name)
            ))
    }
    
}

pub struct SettingsRepository {
    db_pool: PgPool,
}

impl SettingsRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    pub async fn get_config_value(&self, key: &str) -> Result<Option<JsonValue>, AppError> {
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
        let ai_settings_val = self.get_config_value("ai_settings").await?
            .ok_or_else(|| AppError::Configuration("Missing ai_settings".to_string()))?;
        
        let settings: DatabaseAIModelSettings = serde_json::from_value(ai_settings_val)
            .map_err(|e| AppError::Configuration(format!("Failed to parse ai_settings: {}", e)))?;
        
        Ok(settings)
    }

    pub async fn update_ai_model_settings(&self, settings: &DatabaseAIModelSettings) -> Result<(), AppError> {
        self.set_config_value("ai_settings", settings, 
            Some("Consolidated AI model settings including task configurations and PathFinder settings")).await?;
        
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
        
        let ai_settings_exist = self.get_config_value("ai_settings").await?.is_some();
        
        if !ai_settings_exist {
            return Err(AppError::Configuration(
                "AI settings not found in database. Please ensure database migrations have been run.".to_string()
            ));
        }
        
        info!("AI settings exist in database");
        Ok(())
    }

}