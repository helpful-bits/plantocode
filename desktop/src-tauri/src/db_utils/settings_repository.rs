use std::sync::Arc;
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use crate::error::{AppError, AppResult};
use crate::models::{TaskSettings, Settings, SystemPrompt, DefaultSystemPrompt};
use crate::utils::{get_timestamp, PromptPlaceholders, substitute_placeholders};

#[derive(Debug)]
pub struct SettingsRepository {
    pool: Arc<SqlitePool>,
}

impl SettingsRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
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
    
    /// Get system prompt for a specific session and task type
    pub async fn get_system_prompt(&self, session_id: &str, task_type: &str) -> AppResult<Option<SystemPrompt>> {
        let row = sqlx::query("SELECT * FROM system_prompts WHERE session_id = $1 AND task_type = $2")
            .bind(session_id)
            .bind(task_type)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch system prompt: {}", e)))?;
            
        match row {
            Some(row) => {
                let id: String = row.try_get("id")?;
                let session_id: String = row.try_get("session_id")?;
                let task_type: String = row.try_get("task_type")?;
                let system_prompt: String = row.try_get("system_prompt")?;
                let is_default: i64 = row.try_get("is_default")?;
                let created_at: i64 = row.try_get("created_at")?;
                let updated_at: i64 = row.try_get("updated_at")?;
                
                Ok(Some(SystemPrompt {
                    id,
                    session_id,
                    task_type,
                    system_prompt,
                    is_default: is_default != 0,
                    created_at,
                    updated_at,
                }))
            },
            None => Ok(None)
        }
    }
    
    /// Set system prompt for a specific session and task type
    pub async fn set_system_prompt(&self, prompt: &SystemPrompt) -> AppResult<()> {
        let now = get_timestamp();
        
        sqlx::query(
            r#"
            INSERT INTO system_prompts (id, session_id, task_type, system_prompt, is_default, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (session_id, task_type) DO UPDATE SET
                system_prompt = excluded.system_prompt,
                is_default = excluded.is_default,
                updated_at = excluded.updated_at
            "#)
            .bind(&prompt.id)
            .bind(&prompt.session_id)
            .bind(&prompt.task_type)
            .bind(&prompt.system_prompt)
            .bind(if prompt.is_default { 1 } else { 0 })
            .bind(prompt.created_at)
            .bind(now)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to set system prompt: {}", e)))?;
            
        Ok(())
    }
    
    /// Delete system prompt for a specific session and task type
    pub async fn delete_system_prompt(&self, session_id: &str, task_type: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM system_prompts WHERE session_id = $1 AND task_type = $2")
            .bind(session_id)
            .bind(task_type)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete system prompt: {}", e)))?;
            
        Ok(())
    }
    
    /// Get default system prompt for a task type
    pub async fn get_default_system_prompt(&self, task_type: &str) -> AppResult<Option<DefaultSystemPrompt>> {
        let row = sqlx::query("SELECT * FROM default_system_prompts WHERE task_type = $1")
            .bind(task_type)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch default system prompt: {}", e)))?;
            
        match row {
            Some(row) => {
                let id: String = row.try_get("id")?;
                let task_type: String = row.try_get("task_type")?;
                let system_prompt: String = row.try_get("system_prompt")?;
                let description: Option<String> = row.try_get("description")?;
                let version: String = row.try_get("version")?;
                let created_at: i64 = row.try_get("created_at")?;
                let updated_at: i64 = row.try_get("updated_at")?;
                
                Ok(Some(DefaultSystemPrompt {
                    id,
                    task_type,
                    system_prompt,
                    description,
                    version,
                    created_at,
                    updated_at,
                }))
            },
            None => Ok(None)
        }
    }
    
    /// Get effective system prompt for a task type (custom first, then default)
    pub async fn get_effective_system_prompt(&self, session_id: &str, task_type: &str) -> AppResult<Option<String>> {
        // First try to get custom system prompt
        if let Some(custom_prompt) = self.get_system_prompt(session_id, task_type).await? {
            return Ok(Some(custom_prompt.system_prompt));
        }
        
        // Fall back to default system prompt
        if let Some(default_prompt) = self.get_default_system_prompt(task_type).await? {
            return Ok(Some(default_prompt.system_prompt));
        }
        
        Ok(None)
    }
    
    /// Get all default system prompts
    pub async fn get_all_default_system_prompts(&self) -> AppResult<Vec<DefaultSystemPrompt>> {
        let rows = sqlx::query("SELECT * FROM default_system_prompts ORDER BY task_type")
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch default system prompts: {}", e)))?;
            
        let mut prompts = Vec::new();
        for row in rows {
            let id: String = row.try_get("id")?;
            let task_type: String = row.try_get("task_type")?;
            let system_prompt: String = row.try_get("system_prompt")?;
            let description: Option<String> = row.try_get("description")?;
            let version: String = row.try_get("version")?;
            let created_at: i64 = row.try_get("created_at")?;
            let updated_at: i64 = row.try_get("updated_at")?;
            
            prompts.push(DefaultSystemPrompt {
                id,
                task_type,
                system_prompt,
                description,
                version,
                created_at,
                updated_at,
            });
        }
        
        Ok(prompts)
    }
    
    /// Reset system prompt to default for a session and task type
    pub async fn reset_system_prompt_to_default(&self, session_id: &str, task_type: &str) -> AppResult<()> {
        // Delete custom prompt to fall back to default
        self.delete_system_prompt(session_id, task_type).await
    }
    
    /// Get effective system prompt with placeholder substitution
    /// This is the main method that processors should use to get system prompts
    pub async fn get_effective_system_prompt_with_substitution(
        &self, 
        session_id: &str, 
        task_type: &str,
        placeholders: &PromptPlaceholders
    ) -> AppResult<Option<(String, String)>> {
        // Get the prompt record (custom first, then default) and its ID
        let (template, system_prompt_id) = if let Some(custom_prompt) = self.get_system_prompt(session_id, task_type).await? {
            (custom_prompt.system_prompt, custom_prompt.id)
        } else if let Some(default_prompt) = self.get_default_system_prompt(task_type).await? {
            (default_prompt.system_prompt, default_prompt.id)
        } else {
            return Ok(None);
        };
        
        // Apply placeholder substitution
        let substituted_prompt = substitute_placeholders(&template, placeholders)?;
        
        Ok(Some((substituted_prompt, system_prompt_id)))
    }
    
    /// Get system prompt template for display in UI (with placeholders intact)
    pub async fn get_system_prompt_template_for_display(
        &self, 
        session_id: &str, 
        task_type: &str
    ) -> AppResult<Option<String>> {
        // Get the template (custom first, then default)
        if let Some(custom_prompt) = self.get_system_prompt(session_id, task_type).await? {
            Ok(Some(crate::utils::prompt_template_utils::get_template_for_display(&custom_prompt.system_prompt)))
        } else if let Some(default_prompt) = self.get_default_system_prompt(task_type).await? {
            Ok(Some(crate::utils::prompt_template_utils::get_template_for_display(&default_prompt.system_prompt)))
        } else {
            Ok(None)
        }
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
    
    /// Update a default system prompt, incrementing its version and setting updated_at
    pub async fn update_default_system_prompt(
        &self, 
        task_type: &str, 
        new_prompt_content: &str, 
        new_description: Option<&str>
    ) -> AppResult<()> {
        let now = get_timestamp();
        
        // First, get the current prompt to increment the version
        let current_prompt = self.get_default_system_prompt(task_type).await?;
        
        let new_version = if let Some(current) = current_prompt {
            // Parse current version and increment
            let current_version_num: u32 = current.version.parse()
                .unwrap_or(1); // Default to 1 if parsing fails
            (current_version_num + 1).to_string()
        } else {
            // If no current prompt exists, start with version 1
            "1".to_string()
        };
        
        sqlx::query(
            r#"
            INSERT INTO default_system_prompts (id, task_type, system_prompt, description, version, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (task_type) DO UPDATE SET
                system_prompt = excluded.system_prompt,
                description = excluded.description,
                version = excluded.version,
                updated_at = excluded.updated_at
            "#)
            .bind(format!("default_{}", task_type))
            .bind(task_type)
            .bind(new_prompt_content)
            .bind(new_description)
            .bind(&new_version)
            .bind(now)
            .bind(now)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update default system prompt: {}", e)))?;
            
        Ok(())
    }
}