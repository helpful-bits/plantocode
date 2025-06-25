//! Prompt Building Utilities
//! 
//! This module provides utilities for building and composing prompts using the unified prompt system.

use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::error::{AppResult, AppError};
use crate::db_utils::SessionRepository;
use crate::jobs::types::Job;
use crate::utils::unified_prompt_system::{
    UnifiedPromptProcessor, UnifiedPromptContextBuilder, ComposedPrompt
};

/// Get session name by ID for context building
pub async fn get_session_name(
    session_id: &str,
    app_handle: &AppHandle,
) -> AppResult<Option<String>> {
    let session_repo = match app_handle.try_state::<Arc<SessionRepository>>() {
        Some(repo) => repo.inner().clone(),
        None => {
            return Err(AppError::InitializationError(
                "SessionRepository not available in app state. App initialization may be incomplete.".to_string()
            ));
        }
    };
    
    if let Some(session) = session_repo.get_session_by_id(session_id).await? {
        Ok(Some(session.name))
    } else {
        Ok(None)
    }
}

/// Get project directory from session ID for context building
pub async fn get_project_directory_from_session(
    session_id: &str,
    app_handle: &AppHandle,
) -> AppResult<String> {
    let session_repo = match app_handle.try_state::<Arc<SessionRepository>>() {
        Some(repo) => repo.inner().clone(),
        None => {
            return Err(AppError::InitializationError(
                "SessionRepository not available in app state. App initialization may be incomplete.".to_string()
            ));
        }
    };
    
    if let Some(session) = session_repo.get_session_by_id(session_id).await? {
        Ok(session.project_directory)
    } else {
        Err(AppError::ConfigError(format!("Session not found: {}", session_id)))
    }
}

/// Builds unified prompt context and composes prompt using Job and AppHandle for context
pub async fn build_unified_prompt(
    job: &Job,
    app_handle: &AppHandle,
    task_description: String,
    file_contents: Option<std::collections::HashMap<String, String>>,
    directory_tree: Option<String>,
    model_name: &str,
) -> AppResult<ComposedPrompt> {
    // Check if cache service is available and refresh if needed
    refresh_system_prompts_if_needed(app_handle).await;
    
    // Get session name and project directory
    let session_name = get_session_name(&job.session_id, app_handle).await?;
    let project_directory = get_project_directory_from_session(&job.session_id, app_handle).await?;
    
    let context = UnifiedPromptContextBuilder::new(
        project_directory,
        job.job_type,
        task_description,
    )
    .file_contents(file_contents)
    .directory_tree(directory_tree)
    .session_name(session_name)
    .model_name(Some(model_name.to_string()))
    .build();

    let prompt_processor = UnifiedPromptProcessor::new();
    prompt_processor.compose_prompt(&context, app_handle).await
}

/// Refresh system prompts using cache service if available and needed
async fn refresh_system_prompts_if_needed(app_handle: &AppHandle) {
    use tauri::Manager;
    
    // Try to get the cache service from app state
    if let Some(cache_service) = app_handle.try_state::<Arc<crate::services::SystemPromptCacheService>>() {
        // Perform cache refresh check in background - don't block prompt generation
        if let Err(e) = cache_service.refresh_if_expired().await {
            log::debug!("Background system prompt cache refresh failed: {}", e);
        }
    } else {
        log::debug!("System prompt cache service not available - using direct database access");
    }
}