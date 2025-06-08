use actix_web::{web, HttpResponse, Result};
use log::{info, error};
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

/// Get all default system prompts
pub async fn get_default_system_prompts(
    prompts_repo: web::Data<Arc<SystemPromptsRepository>>,
) -> Result<HttpResponse, AppError> {
    info!("Fetching all default system prompts");

    match prompts_repo.get_all_default_prompts().await {
        Ok(prompts) => {
            info!("Successfully retrieved {} default system prompts", prompts.len());
            Ok(HttpResponse::Ok().json(prompts))
        }
        Err(e) => {
            error!("Failed to fetch default system prompts: {}", e);
            Err(AppError::Database(format!("Failed to fetch default system prompts: {}", e)))
        }
    }
}

/// Get a specific default system prompt by task type
pub async fn get_default_system_prompt_by_task_type(
    path: web::Path<String>,
    prompts_repo: web::Data<Arc<SystemPromptsRepository>>,
) -> Result<HttpResponse, AppError> {
    let task_type = path.into_inner();
    info!("Fetching default system prompt for task type: {}", task_type);

    match prompts_repo.get_default_prompt_by_task_type(&task_type).await {
        Ok(Some(prompt)) => {
            info!("Successfully retrieved default system prompt for task type: {}", task_type);
            Ok(HttpResponse::Ok().json(prompt))
        }
        Ok(None) => {
            info!("No default system prompt found for task type: {}", task_type);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "not_found",
                "message": format!("No default system prompt found for task type: {}", task_type)
            })))
        }
        Err(e) => {
            error!("Failed to fetch default system prompt for task type {}: {}", task_type, e);
            Err(AppError::Database(format!("Failed to fetch default system prompt: {}", e)))
        }
    }
}