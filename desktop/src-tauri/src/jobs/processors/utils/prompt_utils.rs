//! Prompt Building Utilities
//! 
//! This module provides utilities for building and composing prompts using the unified prompt system.

use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::db_utils::{SettingsRepository, SessionRepository};
use crate::jobs::types::Job;
use crate::utils::unified_prompt_system::{
    UnifiedPromptProcessor, UnifiedPromptContextBuilder, ComposedPrompt
};

/// Get session name by ID for context building
pub async fn get_session_name(
    session_id: &str,
    app_handle: &AppHandle,
) -> AppResult<Option<String>> {
    let session_repo = app_handle
        .state::<Arc<SessionRepository>>()
        .inner()
        .clone();
    
    if let Some(session) = session_repo.get_session_by_id(session_id).await? {
        Ok(Some(session.name))
    } else {
        Ok(None)
    }
}

/// Builds unified prompt context and composes prompt using Job and AppHandle for context
pub async fn build_unified_prompt(
    job: &Job,
    app_handle: &AppHandle,
    task_description: String,
    codebase_structure: Option<String>,
    file_contents: Option<std::collections::HashMap<String, String>>,
    directory_tree: Option<String>,
    settings_repo: &SettingsRepository,
    model_name: &str,
) -> AppResult<ComposedPrompt> {
    // Get session name
    let session_name = get_session_name(&job.session_id, app_handle).await?;
    
    let context = UnifiedPromptContextBuilder::new(
        job.session_id.clone(),
        job.job_type,
        task_description,
    )
    .project_directory(job.project_directory.clone())
    .codebase_structure(codebase_structure)
    .file_contents(file_contents)
    .directory_tree(directory_tree)
    .session_name(session_name)
    .model_name(Some(model_name.to_string()))
    .build();

    let prompt_processor = UnifiedPromptProcessor::new();
    prompt_processor.compose_prompt(&context, settings_repo).await
}