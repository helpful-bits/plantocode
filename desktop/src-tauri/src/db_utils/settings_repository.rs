use std::sync::Arc;
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use crate::error::{AppError, AppResult};
use crate::models::{TaskSettings, Settings};
use crate::utils::get_timestamp;
use crate::services::BackupConfig;
use tauri::{AppHandle, Manager};

#[derive(Debug)]
pub struct SettingsRepository {
    pool: Arc<SqlitePool>,
    app_handle: Option<AppHandle>,
}

impl SettingsRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool, app_handle: None }
    }
    
    pub fn with_app_handle(pool: Arc<SqlitePool>, app_handle: AppHandle) -> Self {
        Self { pool, app_handle: Some(app_handle) }
    }
    
    /// Get a value from the key_value_store table
    pub async fn get_value(&self, key: &str) -> AppResult<Option<String>> {
        let row = sqlx::query("SELECT value FROM key_value_store WHERE key = $1")
            .bind(key)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch setting: {}", e)))?;
            
        match row {
            Some(row) => {
                let value: String = row.try_get::<'_, String, _>("value")?;
                Ok(Some(value))
            },
            None => Ok(None)
        }
    }
    
    /// Set a value in the key_value_store table
    pub async fn set_value(&self, key: &str, value: &str) -> AppResult<()> {
        let now = get_timestamp();
        
        sqlx::query(
            r#"
            INSERT INTO key_value_store (key, value, updated_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            "#)
            .bind(key)
            .bind(value)
            .bind(now)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to set value: {}", e)))?;
            
        Ok(())
    }
    
    /// Delete a value from the key_value_store table
    pub async fn delete_value(&self, key: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM key_value_store WHERE key = $1")
            .bind(key)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete value: {}", e)))?;
            
        Ok(())
    }
    
    /// Get task settings for a specific session and task type
    pub async fn get_task_settings(&self, session_id: &str, task_type: &str) -> AppResult<Option<TaskSettings>> {
        let row = sqlx::query("SELECT * FROM task_settings WHERE session_id = $1 AND task_type = $2")
            .bind(session_id)
            .bind(task_type)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch task settings: {}", e)))?;
            
        match row {
            Some(row) => {
                let session_id: String = row.try_get::<'_, String, _>("session_id")?;
                let task_type: String = row.try_get::<'_, String, _>("task_type")?;
                let model: String = row.try_get::<'_, String, _>("model")?;
                let max_tokens: i64 = row.try_get::<'_, i64, _>("max_tokens")?;
                let temperature: Option<f64> = row.try_get::<'_, Option<f64>, _>("temperature").unwrap_or(None);
                
                let settings = TaskSettings {
                    session_id,
                    task_type,
                    model,
                    max_tokens: max_tokens as i32,
                    temperature: temperature.map(|t| t as f32),
                };
                
                Ok(Some(settings))
            },
            None => Ok(None)
        }
    }
    
    /// Set task settings for a specific session and task type
    pub async fn set_task_settings(&self, settings: &TaskSettings) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO task_settings (session_id, task_type, model, max_tokens, temperature)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id, task_type) DO UPDATE SET
                model = excluded.model,
                max_tokens = excluded.max_tokens,
                temperature = excluded.temperature
            "#)
            .bind(&settings.session_id)
            .bind(&settings.task_type)
            .bind(&settings.model)
            .bind(settings.max_tokens as i64)
            .bind(settings.temperature.map(|t| t as f64))
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to set task settings: {}", e)))?;
            
        Ok(())
    }
    
    /// Delete task settings for a specific session and task type
    pub async fn delete_task_settings(&self, session_id: &str, task_type: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM task_settings WHERE session_id = $1 AND task_type = $2")
            .bind(session_id)
            .bind(task_type)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete task settings: {}", e)))?;
            
        Ok(())
    }
    
    /// Get the active session ID
    pub async fn get_active_session_id(&self) -> AppResult<Option<String>> {
        self.get_value("active_session_id").await
    }
    
    /// Set the active session ID
    pub async fn set_active_session_id(&self, session_id: &str) -> AppResult<()> {
        self.set_value("active_session_id", session_id).await
    }
    
    /// Get the project directory
    pub async fn get_project_directory(&self) -> AppResult<Option<String>> {
        self.get_value("project_directory").await
    }
    
    /// Set the project directory
    pub async fn set_project_directory(&self, directory: &str) -> AppResult<()> {
        self.set_value("project_directory", directory).await
    }
    
    /// Get application settings
    pub async fn get_settings(&self) -> AppResult<Settings> {
        // Retrieve settings from key_value_store
        let settings_json = self.get_value("app_settings").await?;
        
        if let Some(json_str) = settings_json {
            // Try to parse the JSON string into Settings
            let settings: Settings = serde_json::from_str(&json_str)
                .map_err(|e| AppError::SerializationError(format!("Failed to parse settings JSON: {}", e)))?;
            
            Ok(settings)
        } else {
            // Return default settings if none exist
            Ok(Settings {
                theme: Some("system".to_string()),
                default_project_directory: None,
                recent_directories: Some(Vec::new()),
                api_options: None,
                sidebar_width: Some(300),
                editor_font_size: Some(14),
                code_view_theme: Some("vs-dark".to_string()),
                hide_file_extensions: Some(false),
                show_hidden_files: Some(false),
                max_concurrent_jobs: Some(3),
                clear_job_history_after_days: Some(7),
                last_updated: Some(get_timestamp()),
            })
        }
    }
    
    /// Save application settings
    pub async fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        // Create a copy with updated timestamp
        let mut updated_settings = settings.clone();
        updated_settings.last_updated = Some(get_timestamp());
        
        // Serialize settings to JSON
        let settings_json = serde_json::to_string(&updated_settings)
            .map_err(|e| AppError::SerializationError(format!("Failed to serialize settings: {}", e)))?;
        
        // Save to key_value_store
        self.set_value("app_settings", &settings_json).await
    }
    
    /// Get global settings
    pub async fn get_global_settings(&self) -> AppResult<Option<crate::models::GlobalSettings>> {
        match self.get_value("global_settings").await? {
            Some(json_str) => {
                let settings: crate::models::GlobalSettings = serde_json::from_str(&json_str)
                    .map_err(|e| AppError::SerializationError(format!("Failed to deserialize global settings: {}", e)))?;
                Ok(Some(settings))
            }
            None => Ok(None),
        }
    }

    /// Save global settings
    pub async fn save_global_settings(&self, settings: &crate::models::GlobalSettings) -> AppResult<()> {
        let json_str = serde_json::to_string(settings)
            .map_err(|e| AppError::SerializationError(format!("Failed to serialize global settings: {}", e)))?;
        self.set_value("global_settings", &json_str).await
    }

    /// Get backup configuration
    pub async fn get_backup_config(&self) -> AppResult<BackupConfig> {
        match self.get_value("backup_config").await? {
            Some(json_str) => {
                let config: BackupConfig = serde_json::from_str(&json_str)
                    .map_err(|e| AppError::SerializationError(format!("Failed to deserialize backup config: {}", e)))?;
                Ok(config)
            }
            None => Ok(BackupConfig::default()),
        }
    }

    /// Save backup configuration
    pub async fn save_backup_config(&self, config: &BackupConfig) -> AppResult<()> {
        let json_str = serde_json::to_string(config)
            .map_err(|e| AppError::SerializationError(format!("Failed to serialize backup config: {}", e)))?;
        self.set_value("backup_config", &json_str).await
    }
    

    
    
    
    
    
    

    
    

    /// Get workflow setting value
    pub async fn get_workflow_setting(&self, workflow_name: &str, setting_key: &str) -> AppResult<Option<String>> {
        let key = format!("workflow_settings:{}:{}", workflow_name, setting_key);
        self.get_value(&key).await
    }

    /// Set workflow setting value
    pub async fn set_workflow_setting(&self, workflow_name: &str, setting_key: &str, value: &str) -> AppResult<()> {
        let key = format!("workflow_settings:{}:{}", workflow_name, setting_key);
        self.set_value(&key, value).await
    }

    /// Delete workflow setting
    pub async fn delete_workflow_setting(&self, workflow_name: &str, setting_key: &str) -> AppResult<()> {
        let key = format!("workflow_settings:{}:{}", workflow_name, setting_key);
        self.delete_value(&key).await
    }

    /// Get all workflow settings for a specific workflow
    pub async fn get_all_workflow_settings(&self, workflow_name: &str) -> AppResult<std::collections::HashMap<String, String>> {
        let prefix = format!("workflow_settings:{}:", workflow_name);
        let rows = sqlx::query("SELECT key, value FROM key_value_store WHERE key LIKE $1")
            .bind(format!("{}%", prefix))
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch workflow settings: {}", e)))?;

        let mut settings = std::collections::HashMap::new();
        for row in rows {
            let full_key: String = row.try_get("key")?;
            let value: String = row.try_get("value")?;
            
            // Extract the setting key by removing the prefix
            if let Some(setting_key) = full_key.strip_prefix(&prefix) {
                settings.insert(setting_key.to_string(), value);
            }
        }

        Ok(settings)
    }
    
}