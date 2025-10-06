use chrono::{DateTime, Utc};
use log::{debug, error};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DefaultSystemPrompt {
    pub id: String,
    pub task_type: String,
    pub system_prompt: String,
    pub description: Option<String>,
    pub version: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct SystemPromptsRepository {
    pool: PgPool,
}

impl SystemPromptsRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Get all default system prompts
    pub async fn get_all_default_prompts(&self) -> AppResult<Vec<DefaultSystemPrompt>> {
        debug!("Fetching all default system prompts");

        let prompts = sqlx::query_as::<_, DefaultSystemPrompt>(
            "SELECT id, task_type, system_prompt, description, version, created_at, updated_at 
             FROM default_system_prompts 
             ORDER BY task_type",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            error!("Failed to fetch default system prompts: {}", e);
            AppError::Database(format!("Failed to fetch default system prompts: {}", e))
        })?;

        debug!(
            "Successfully fetched {} default system prompts",
            prompts.len()
        );
        Ok(prompts)
    }

    /// Get a specific default system prompt by task type
    pub async fn get_default_prompt_by_task_type(
        &self,
        task_type: &str,
    ) -> AppResult<Option<DefaultSystemPrompt>> {
        debug!(
            "Fetching default system prompt for task type: {}",
            task_type
        );

        let prompt = sqlx::query_as::<_, DefaultSystemPrompt>(
            "SELECT id, task_type, system_prompt, description, version, created_at, updated_at 
             FROM default_system_prompts 
             WHERE task_type = $1",
        )
        .bind(task_type)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            error!(
                "Failed to fetch default system prompt for task type {}: {}",
                task_type, e
            );
            AppError::Database(format!("Failed to fetch default system prompt: {}", e))
        })?;

        if prompt.is_some() {
            debug!(
                "Successfully fetched default system prompt for task type: {}",
                task_type
            );
        } else {
            debug!(
                "No default system prompt found for task type: {}",
                task_type
            );
        }

        Ok(prompt)
    }

    /// Get all available task types that have default prompts
    pub async fn get_available_task_types(&self) -> AppResult<Vec<String>> {
        debug!("Fetching all available task types");

        let task_types = sqlx::query_scalar::<_, String>(
            "SELECT task_type FROM default_system_prompts ORDER BY task_type",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            error!("Failed to fetch available task types: {}", e);
            AppError::Database(format!("Failed to fetch available task types: {}", e))
        })?;

        debug!(
            "Successfully fetched {} available task types",
            task_types.len()
        );
        Ok(task_types)
    }
}
