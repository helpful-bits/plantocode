use crate::error::{AppError, AppResult};
use crate::models::{DeviceSettings, ProjectSystemPrompt, Settings};
use crate::services::BackupConfig;
use crate::utils::get_timestamp;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool, sqlite::SqliteRow};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Debug)]
pub struct SettingsRepository {
    pool: Arc<SqlitePool>,
    app_handle: Option<AppHandle>,
}

impl SettingsRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self {
            pool,
            app_handle: None,
        }
    }

    pub fn with_app_handle(pool: Arc<SqlitePool>, app_handle: AppHandle) -> Self {
        Self {
            pool,
            app_handle: Some(app_handle),
        }
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
            }
            None => Ok(None),
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
            "#,
        )
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

    // Task settings functions removed - AI configuration now fetched exclusively from server

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
            let settings: Settings = serde_json::from_str(&json_str).map_err(|e| {
                AppError::SerializationError(format!("Failed to parse settings JSON: {}", e))
            })?;

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
        let settings_json = serde_json::to_string(&updated_settings).map_err(|e| {
            AppError::SerializationError(format!("Failed to serialize settings: {}", e))
        })?;

        // Save to key_value_store
        self.set_value("app_settings", &settings_json).await
    }

    /// Get global settings
    pub async fn get_global_settings(&self) -> AppResult<Option<crate::models::GlobalSettings>> {
        match self.get_value("global_settings").await? {
            Some(json_str) => {
                let settings: crate::models::GlobalSettings = serde_json::from_str(&json_str)
                    .map_err(|e| {
                        AppError::SerializationError(format!(
                            "Failed to deserialize global settings: {}",
                            e
                        ))
                    })?;
                Ok(Some(settings))
            }
            None => Ok(None),
        }
    }

    /// Save global settings
    pub async fn save_global_settings(
        &self,
        settings: &crate::models::GlobalSettings,
    ) -> AppResult<()> {
        let json_str = serde_json::to_string(settings).map_err(|e| {
            AppError::SerializationError(format!("Failed to serialize global settings: {}", e))
        })?;
        self.set_value("global_settings", &json_str).await
    }

    /// Get backup configuration
    pub async fn get_backup_config(&self) -> AppResult<BackupConfig> {
        match self.get_value("backup_config").await? {
            Some(json_str) => {
                let config: BackupConfig = serde_json::from_str(&json_str).map_err(|e| {
                    AppError::SerializationError(format!(
                        "Failed to deserialize backup config: {}",
                        e
                    ))
                })?;
                Ok(config)
            }
            None => Ok(BackupConfig::default()),
        }
    }

    /// Save backup configuration
    pub async fn save_backup_config(&self, config: &BackupConfig) -> AppResult<()> {
        let json_str = serde_json::to_string(config).map_err(|e| {
            AppError::SerializationError(format!("Failed to serialize backup config: {}", e))
        })?;
        self.set_value("backup_config", &json_str).await
    }

    /// Get workflow setting value
    pub async fn get_workflow_setting(
        &self,
        workflow_name: &str,
        setting_key: &str,
    ) -> AppResult<Option<String>> {
        let key = format!("workflow_settings:{}:{}", workflow_name, setting_key);
        self.get_value(&key).await
    }

    /// Set workflow setting value
    pub async fn set_workflow_setting(
        &self,
        workflow_name: &str,
        setting_key: &str,
        value: &str,
    ) -> AppResult<()> {
        let key = format!("workflow_settings:{}:{}", workflow_name, setting_key);
        self.set_value(&key, value).await
    }

    /// Delete workflow setting
    pub async fn delete_workflow_setting(
        &self,
        workflow_name: &str,
        setting_key: &str,
    ) -> AppResult<()> {
        let key = format!("workflow_settings:{}:{}", workflow_name, setting_key);
        self.delete_value(&key).await
    }

    /// Get all workflow settings for a specific workflow
    pub async fn get_all_workflow_settings(
        &self,
        workflow_name: &str,
    ) -> AppResult<std::collections::HashMap<String, String>> {
        let prefix = format!("workflow_settings:{}:", workflow_name);
        let rows = sqlx::query("SELECT key, value FROM key_value_store WHERE key LIKE $1")
            .bind(format!("{}%", prefix))
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to fetch workflow settings: {}", e))
            })?;

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

    /// Get all project task settings for a specific project
    pub async fn get_all_project_task_settings(
        &self,
        project_hash: &str,
    ) -> AppResult<std::collections::HashMap<String, String>> {
        let prefix = format!("project_task_settings:{}:", project_hash);
        let rows = sqlx::query("SELECT key, value FROM key_value_store WHERE key LIKE $1")
            .bind(format!("{}%", prefix))
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to fetch project task settings: {}", e))
            })?;

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

    /// Get system prompt for a specific project and task type
    pub async fn get_project_system_prompt(
        &self,
        project_hash: &str,
        task_type: &str,
    ) -> AppResult<Option<ProjectSystemPrompt>> {
        let row = sqlx::query(
            "SELECT * FROM project_system_prompts WHERE project_hash = $1 AND task_type = $2",
        )
        .bind(project_hash)
        .bind(task_type)
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch project system prompt: {}", e))
        })?;

        match row {
            Some(row) => {
                let project_hash: String = row.try_get("project_hash")?;
                let task_type: String = row.try_get("task_type")?;
                let system_prompt: String = row.try_get("system_prompt")?;
                let is_custom: i64 = row.try_get("is_custom")?;
                let created_at: i64 = row.try_get("created_at")?;
                let updated_at: i64 = row.try_get("updated_at")?;

                Ok(Some(ProjectSystemPrompt {
                    project_hash,
                    task_type,
                    system_prompt,
                    is_custom: is_custom == 1,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    /// Set system prompt for a specific project and task type
    pub async fn set_project_system_prompt(
        &self,
        project_hash: &str,
        task_type: &str,
        system_prompt: &str,
    ) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO project_system_prompts (project_hash, task_type, system_prompt, is_custom, created_at, updated_at)
            VALUES ($1, $2, $3, 1, strftime('%s', 'now'), strftime('%s', 'now'))
            ON CONFLICT (project_hash, task_type) DO UPDATE SET
                system_prompt = excluded.system_prompt,
                updated_at = strftime('%s', 'now')
            "#)
            .bind(project_hash)
            .bind(task_type)
            .bind(system_prompt)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to set project system prompt: {}", e)))?;

        Ok(())
    }

    /// Delete system prompt for a specific project and task type (reset to default)
    pub async fn delete_project_system_prompt(
        &self,
        project_hash: &str,
        task_type: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "DELETE FROM project_system_prompts WHERE project_hash = $1 AND task_type = $2",
        )
        .bind(project_hash)
        .bind(task_type)
        .execute(&*self.pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to delete project system prompt: {}", e))
        })?;

        Ok(())
    }

    /// Check if project has custom system prompt for task type
    pub async fn has_custom_system_prompt(
        &self,
        project_hash: &str,
        task_type: &str,
    ) -> AppResult<bool> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM project_system_prompts WHERE project_hash = $1 AND task_type = $2")
            .bind(project_hash)
            .bind(task_type)
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to check custom system prompt: {}", e)))?;

        Ok(count > 0)
    }

    /// Get a setting from the app_settings table
    pub async fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        let row = sqlx::query("SELECT value FROM app_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch app setting: {}", e)))?;

        match row {
            Some(row) => {
                let value: String = row.try_get::<'_, String, _>("value")?;
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    /// Set a setting in the app_settings table
    pub async fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        let now = get_timestamp();

        sqlx::query(
            r#"
            INSERT INTO app_settings (key, value, created_at, updated_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(key)
        .bind(value)
        .bind(now)
        .bind(now)
        .execute(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to set app setting: {}", e)))?;

        Ok(())
    }

    /// Get all settings from the app_settings table
    pub async fn get_all_settings(&self) -> AppResult<std::collections::HashMap<String, String>> {
        let rows = sqlx::query("SELECT key, value FROM app_settings")
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to fetch all app settings: {}", e))
            })?;

        let mut settings = std::collections::HashMap::new();
        for row in rows {
            let key: String = row.try_get("key")?;
            let value: String = row.try_get("value")?;
            settings.insert(key, value);
        }

        Ok(settings)
    }

    /// Delete a setting from the app_settings table
    pub async fn delete_setting(&self, key: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM app_settings WHERE key = $1")
            .bind(key)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete app setting: {}", e)))?;

        Ok(())
    }

    /// Helper method to get a boolean setting
    pub async fn get_bool_setting(&self, key: &str) -> AppResult<Option<bool>> {
        match self.get_setting(key).await? {
            Some(value) => match value.as_str() {
                "true" => Ok(Some(true)),
                "false" => Ok(Some(false)),
                _ => Ok(None),
            },
            None => Ok(None),
        }
    }

    /// Helper method to get an integer setting
    pub async fn get_int_setting(&self, key: &str) -> AppResult<Option<i32>> {
        match self.get_setting(key).await? {
            Some(value) => match value.parse::<i32>() {
                Ok(int_val) => Ok(Some(int_val)),
                Err(_) => Ok(None),
            },
            None => Ok(None),
        }
    }

    /// Helper method to get a string setting
    pub async fn get_string_setting(&self, key: &str) -> AppResult<Option<String>> {
        self.get_setting(key).await
    }

    /// Get device settings
    pub async fn get_device_settings(&self) -> AppResult<DeviceSettings> {
        let is_discoverable = self
            .get_bool_setting("device_is_discoverable")
            .await?
            .unwrap_or(false);
        let allow_remote_access = self
            .get_bool_setting("device_allow_remote_access")
            .await?
            .unwrap_or(false);
        let require_approval = self
            .get_bool_setting("device_require_approval")
            .await?
            .unwrap_or(true);
        let session_timeout_minutes = self
            .get_int_setting("device_session_timeout_minutes")
            .await?
            .unwrap_or(30);

        Ok(DeviceSettings {
            is_discoverable,
            allow_remote_access,
            require_approval,
            session_timeout_minutes,
        })
    }

    /// Update device settings
    pub async fn update_device_settings(&self, settings: &DeviceSettings) -> AppResult<()> {
        self.set_setting(
            "device_is_discoverable",
            &settings.is_discoverable.to_string(),
        )
        .await?;
        self.set_setting(
            "device_allow_remote_access",
            &settings.allow_remote_access.to_string(),
        )
        .await?;
        self.set_setting(
            "device_require_approval",
            &settings.require_approval.to_string(),
        )
        .await?;
        self.set_setting(
            "device_session_timeout_minutes",
            &settings.session_timeout_minutes.to_string(),
        )
        .await?;

        Ok(())
    }
}
