use actix_web::{HttpResponse, Result, web};
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db::repositories::system_prompts_repository::SystemPromptsRepository;
use crate::error::{AppError, AppResult};

#[derive(Serialize, Deserialize, Debug)]
pub struct DefaultSystemPrompt {
    pub id: String,
    pub task_type: String,
    pub system_prompt: String,
    pub description: Option<String>,
    pub version: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// camelCase response struct for frontend compatibility
#[derive(Serialize, Debug)]
struct DefaultSystemPromptResponse {
    pub id: String,
    #[serde(rename = "taskType")]
    pub task_type: String,
    #[serde(rename = "systemPrompt")]
    pub system_prompt: String,
    pub description: Option<String>,
    pub version: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

impl From<crate::db::repositories::system_prompts_repository::DefaultSystemPrompt>
    for DefaultSystemPromptResponse
{
    fn from(
        prompt: crate::db::repositories::system_prompts_repository::DefaultSystemPrompt,
    ) -> Self {
        Self {
            id: prompt.id,
            task_type: prompt.task_type,
            system_prompt: prompt.system_prompt,
            description: prompt.description,
            version: prompt.version,
            created_at: prompt.created_at.timestamp(),
            updated_at: prompt.updated_at.timestamp(),
        }
    }
}

/// Get all default system prompts
pub async fn get_default_system_prompts(
    prompts_repo: web::Data<Arc<SystemPromptsRepository>>,
) -> Result<HttpResponse, AppError> {
    info!("Fetching all default system prompts");

    match prompts_repo.get_all_default_prompts().await {
        Ok(prompts) => {
            info!(
                "Successfully retrieved {} default system prompts",
                prompts.len()
            );
            // Transform to camelCase format for frontend compatibility
            let response_prompts: Vec<DefaultSystemPromptResponse> = prompts
                .into_iter()
                .map(DefaultSystemPromptResponse::from)
                .collect();
            Ok(HttpResponse::Ok().json(response_prompts))
        }
        Err(e) => {
            error!("Failed to fetch default system prompts: {}", e);
            Err(AppError::Database(format!(
                "Failed to fetch default system prompts: {}",
                e
            )))
        }
    }
}

/// Get a specific default system prompt by task type
pub async fn get_default_system_prompt_by_task_type(
    path: web::Path<String>,
    prompts_repo: web::Data<Arc<SystemPromptsRepository>>,
) -> Result<HttpResponse, AppError> {
    let task_type = path.into_inner();
    info!(
        "Fetching default system prompt for task type: {}",
        task_type
    );

    match prompts_repo
        .get_default_prompt_by_task_type(&task_type)
        .await
    {
        Ok(Some(prompt)) => {
            info!(
                "Successfully retrieved default system prompt for task type: {}",
                task_type
            );
            // Transform to camelCase format for frontend compatibility
            let response_prompt = DefaultSystemPromptResponse::from(prompt);
            Ok(HttpResponse::Ok().json(response_prompt))
        }
        Ok(None) => {
            info!(
                "No default system prompt found for task type: {}",
                task_type
            );
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "not_found",
                "message": format!("No default system prompt found for task type: {}", task_type)
            })))
        }
        Err(e) => {
            error!(
                "Failed to fetch default system prompt for task type {}: {}",
                task_type, e
            );
            Err(AppError::Database(format!(
                "Failed to fetch default system prompt: {}",
                e
            )))
        }
    }
}
