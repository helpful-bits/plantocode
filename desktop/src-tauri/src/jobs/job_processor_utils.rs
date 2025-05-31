use std::sync::Arc;
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use log::{debug, info, warn, error};
use serde_json::Value;
use std::str::FromStr;

use crate::error::{AppError, AppResult};
use crate::models::{
    TaskType, JobStatus, OpenRouterRequestMessage, OpenRouterContent, 
    OpenRouterResponse, OpenRouterUsage
};
use crate::db_utils::{BackgroundJobRepository, SettingsRepository, SessionRepository};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::BackgroundJob;
use crate::api_clients::{client_factory, client_trait::{ApiClient, ApiClientOptions}};
use crate::utils::unified_prompt_system::{
    UnifiedPromptProcessor, UnifiedPromptContextBuilder, ComposedPrompt
};
use crate::utils::get_timestamp;

/// Setup repositories from app state and fetch the job, marking it as running
/// Returns (background_job_repo, settings_repo, background_job)
pub async fn setup_job_processing(
    job_id: &str,
    app_handle: &AppHandle,
) -> AppResult<(Arc<BackgroundJobRepository>, Arc<SettingsRepository>, BackgroundJob)> {
    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    
    // Fetch the job from database
    let background_job = repo
        .get_job_by_id(job_id)
        .await?
        .ok_or_else(|| AppError::JobError(format!("Background job {} not found", job_id)))?;
    
    // Update job status to running
    repo.update_job_status_running(job_id, Some("Processing...")).await?;
    
    Ok((repo, settings_repo, background_job))
}

/// Setup repositories from app state - DUPLICATED IN EVERY PROCESSOR
/// This pattern appears identically in all processors
pub fn setup_repositories(
    app_handle: &AppHandle,
) -> AppResult<(Arc<BackgroundJobRepository>, Arc<SettingsRepository>)> {
    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
    
    Ok((repo, settings_repo))
}

/// Update job status to running - DUPLICATED IN EVERY PROCESSOR
/// This pattern appears identically in all processors
pub async fn update_status_running(
    repo: &BackgroundJobRepository,
    job_id: &str,
    message: &str,
) -> AppResult<()> {
    let timestamp = get_timestamp();
    
    let mut db_job = repo
        .get_job_by_id(job_id)
        .await?
        .ok_or_else(|| AppError::JobError(format!("Background job {} not found", job_id)))?;
    
    db_job.status = "running".to_string();
    db_job.updated_at = Some(timestamp);
    db_job.start_time = Some(timestamp);
    
    repo.update_job(&db_job).await?;
    info!("Job {} updated to running: {}", job_id, message);
    
    Ok(())
}

/// Create OpenRouter messages - DUPLICATED IN EVERY PROCESSOR 
/// This exact pattern appears in all processors that use OpenRouter
pub fn create_openrouter_messages(
    system_prompt: &str,
    user_prompt: &str,
) -> Vec<OpenRouterRequestMessage> {
    vec![
        OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: system_prompt.to_string(),
            }],
        },
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: user_prompt.to_string(),
            }],
        },
    ]
}

/// Get API client - DUPLICATED IN MANY PROCESSORS
pub fn get_api_client(
    app_handle: &AppHandle,
) -> AppResult<Arc<dyn ApiClient>> {
    client_factory::get_api_client(app_handle)
}

/// Extract system and user prompts from composed prompt - DUPLICATED PATTERN
/// This splitting logic appears in most processors
pub fn extract_prompts_from_composed(
    composed_prompt: &crate::utils::unified_prompt_system::ComposedPrompt,
) -> (String, String, String) {
    let system_prompt_text = composed_prompt
        .final_prompt
        .split("\n\n")
        .next()
        .unwrap_or("")
        .to_string();
    let user_prompt_text = composed_prompt
        .final_prompt
        .split("\n\n")
        .skip(1)
        .collect::<Vec<&str>>()
        .join("\n\n");
    let system_prompt_id = composed_prompt.system_prompt_id.clone();
    
    (system_prompt_text, user_prompt_text, system_prompt_id)
}

/// Log job processing start - COMMON PATTERN
pub fn log_job_start(job_id: &str, task_name: &str) {
    info!("Processing {} job {}", task_name, job_id);
}

/// Get session name by ID - NEEDED FOR CONTEXT BUILDING
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

/// Get model name for task - NEEDED FOR CONTEXT BUILDING  
pub async fn get_model_name_for_context(
    task_type: TaskType,
    project_directory: &str,
    model_override: Option<String>,
    app_handle: &AppHandle,
) -> AppResult<String> {
    if let Some(model) = model_override {
        Ok(model)
    } else {
        crate::config::get_model_for_task_with_project(task_type, project_directory, app_handle).await
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
) -> AppResult<ComposedPrompt> {
    // Get session name
    let session_name = get_session_name(&job.session_id, app_handle).await?;
    
    // Get model name for context
    let model_override = match &job.payload {
        JobPayload::PathFinder(payload) => payload.model_override.clone(),
        JobPayload::ImplementationPlan(payload) => Some(payload.model.clone()),
        JobPayload::GuidanceGeneration(payload) => payload.model_override.clone(),
        JobPayload::PathCorrection(payload) => payload.model_override.clone(),
        JobPayload::TextImprovement(payload) => payload.model_override.clone(),
        JobPayload::TaskEnhancement(payload) => payload.model_override.clone(),
        JobPayload::TextCorrection(payload) => payload.model_override.clone(),
        JobPayload::VoiceTranscription(payload) => Some(payload.model.clone()),
        JobPayload::GenericLlmStream(payload) => payload.model.clone(),
        JobPayload::RegexPatternGeneration(payload) => payload.model_override.clone(),
        _ => None,
    };
    
    let model_name = get_model_name_for_context(
        job.job_type,
        job.project_directory.as_deref().unwrap_or(""),
        model_override,
        app_handle,
    ).await?;
    
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
    .model_name(Some(model_name))
    .build();

    let prompt_processor = UnifiedPromptProcessor::new();
    prompt_processor.compose_prompt(&context, settings_repo).await
}

/// Creates API client options for LLM calls, extracting overrides from payload
/// and using config_resolver::resolve_model_settings for fallback defaults
pub async fn create_api_client_options(
    job_payload: &JobPayload,
    task_type: TaskType,
    project_directory: &str,
    stream: bool,
    app_handle: &AppHandle,
) -> AppResult<ApiClientOptions> {
    // Extract overrides from payload
    let (model_override, max_tokens_override, temperature_override) = match job_payload {
        JobPayload::PathFinder(payload) => {
            (payload.model_override.clone(), payload.max_output_tokens, Some(payload.temperature))
        },
        JobPayload::ImplementationPlan(payload) => {
            (Some(payload.model.clone()), Some(payload.max_tokens), Some(payload.temperature))
        },
        JobPayload::GuidanceGeneration(payload) => {
            (payload.model_override.clone(), payload.max_output_tokens, payload.temperature)
        },
        JobPayload::PathCorrection(payload) => {
            (payload.model_override.clone(), payload.max_output_tokens, payload.temperature)
        },
        JobPayload::TextImprovement(payload) => {
            (payload.model_override.clone(), None, None)
        },
        JobPayload::TaskEnhancement(payload) => {
            (payload.model_override.clone(), None, None)
        },
        JobPayload::TextCorrection(payload) => {
            (payload.model_override.clone(), None, None)
        },
        JobPayload::VoiceTranscription(payload) => {
            (Some(payload.model.clone()), None, None)
        },
        JobPayload::GenericLlmStream(payload) => {
            (payload.model.clone(), payload.max_output_tokens, payload.temperature)
        },
        JobPayload::RegexPatternGeneration(payload) => {
            (payload.model_override.clone(), payload.max_tokens_override, payload.temperature_override)
        },
        _ => (None, None, None),
    };
    
    // Use config_resolver to resolve all settings consistently
    let (model, temperature, max_tokens) = crate::utils::config_resolver::resolve_model_settings(
        app_handle,
        task_type,
        project_directory,
        model_override,
        temperature_override,
        max_tokens_override,
    ).await?;

    Ok(ApiClientOptions {
        model,
        max_tokens,
        temperature,
        stream,
    })
}

/// Executes non-streaming LLM chat completion
pub async fn execute_llm_chat_completion(
    app_handle: &AppHandle,
    messages: Vec<OpenRouterRequestMessage>,
    api_options: &ApiClientOptions,
) -> AppResult<OpenRouterResponse> {
    let llm_client = get_api_client(app_handle)?;
    llm_client.chat_completion(messages, api_options.clone()).await
}

/// Checks if job has been canceled
pub async fn check_job_canceled(
    repo: &BackgroundJobRepository,
    job_id: &str,
) -> AppResult<bool> {
    let job_status = match repo.get_job_by_id(job_id).await {
        Ok(Some(job)) => {
            JobStatus::from_str(&job.status)
                .unwrap_or(JobStatus::Created)
        }
        _ => JobStatus::Created,
    };
    
    Ok(job_status == JobStatus::Canceled)
}

/// Finalizes job success with response and usage information
pub async fn finalize_job_success(
    job_id: &str,
    repo: &BackgroundJobRepository,
    response_content: &str,
    llm_usage: Option<OpenRouterUsage>,
    model_used: &str,
    system_prompt_id: &str,
    metadata: Option<Value>,
) -> AppResult<()> {
    let timestamp = get_timestamp();
    let mut db_job = repo
        .get_job_by_id(job_id)
        .await?
        .ok_or_else(|| AppError::JobError(format!("Background job {} not found", job_id)))?;

    db_job.status = "completed".to_string();
    db_job.response = Some(response_content.to_string());
    db_job.updated_at = Some(timestamp);
    db_job.end_time = Some(timestamp);
    db_job.model_used = Some(model_used.to_string());
    db_job.system_prompt_id = Some(system_prompt_id.to_string());

    if let Some(usage) = llm_usage {
        db_job.tokens_sent = Some(usage.prompt_tokens as i32);
        db_job.tokens_received = Some(usage.completion_tokens as i32);
        db_job.total_tokens = Some(usage.total_tokens as i32);
    }

    if let Some(meta) = metadata {
        db_job.metadata = Some(meta.to_string());
    }

    repo.update_job(&db_job).await?;
    info!("Job {} completed successfully", job_id);
    
    Ok(())
}

/// Finalizes job failure with error message
pub async fn finalize_job_failure(
    job_id: &str,
    repo: &BackgroundJobRepository,
    error_message: &str,
) -> AppResult<()> {
    let timestamp = get_timestamp();
    let mut db_job = repo
        .get_job_by_id(job_id)
        .await?
        .ok_or_else(|| AppError::JobError(format!("Background job {} not found", job_id)))?;

    db_job.status = "failed".to_string();
    db_job.error_message = Some(error_message.to_string());
    db_job.updated_at = Some(timestamp);
    db_job.end_time = Some(timestamp);

    repo.update_job(&db_job).await?;
    error!("Job {} failed: {}", job_id, error_message);
    
    Ok(())
}

/// Loads file contents from provided paths
pub async fn load_file_contents(
    paths: &[String],
    project_directory: &str,
) -> std::collections::HashMap<String, String> {
    let mut file_contents_map = std::collections::HashMap::new();
    
    for relative_path_str in paths {
        let full_path = std::path::Path::new(project_directory).join(relative_path_str);
        match crate::utils::fs_utils::read_file_to_string(&*full_path.to_string_lossy()).await {
            Ok(content) => {
                file_contents_map.insert(relative_path_str.clone(), content);
            }
            Err(e) => {
                warn!("Failed to read file {}: {}", full_path.display(), e);
            }
        }
    }
    
    file_contents_map
}

/// Generates directory tree for context
pub async fn generate_directory_tree_for_context(
    project_directory: &str,
) -> Option<String> {
    match crate::utils::directory_tree::generate_directory_tree(
        std::path::Path::new(project_directory),
        crate::utils::directory_tree::DirectoryTreeOptions {
            max_depth: None,
            include_ignored: false,
            respect_gitignore: true,
            exclude_patterns: Some(
                crate::constants::EXCLUDED_DIRS_FOR_SCAN
                    .iter()
                    .map(|&s| s.to_string())
                    .collect(),
            ),
            include_files: true,
            include_dirs: true,
            include_hidden: false,
        },
    )
    .await
    {
        Ok(tree) => Some(tree),
        Err(e) => {
            warn!("Failed to generate directory tree: {}", e);
            None
        }
    }
}

/// Parses paths from LLM text response with robust format handling
/// Handles numbered lists, bullet points, quotes, and various line endings
pub fn parse_paths_from_text_response(
    response_text: &str,
    project_directory: &str,
) -> AppResult<Vec<String>> {
    debug!("Parsing paths from text response");
    let mut paths = Vec::new();
    
    // Normalize line endings (handle \r\n, \n, \r)
    let normalized_text = response_text.replace("\r\n", "\n").replace("\r", "\n");
    
    // Split by newlines and process each line
    for line in normalized_text.lines() {
        let line = line.trim();
        
        // Filter out empty lines or lines that are clearly not paths
        if line.is_empty()
            || line.starts_with("//")
            || line.starts_with("#")
            || line.starts_with("Note:")
            || line.starts_with("Analysis:")
            || line.starts_with("Here are")
            || line.starts_with("The following")
            || line.starts_with("Based on")
            || line.len() < 2
        {
            continue;
        }
        
        // Handle numbered lists (e.g., "1. path/to/file")
        let line_without_numbers = if line.chars().next().map_or(false, |c| c.is_ascii_digit()) {
            if let Some(dot_pos) = line.find('.') {
                line[dot_pos + 1..].trim()
            } else {
                line
            }
        } else {
            line
        };
        
        // Handle bullet points (e.g., "- path/to/file", "* path/to/file")
        let line_without_bullets = if line_without_numbers.starts_with("- ") || line_without_numbers.starts_with("* ") {
            &line_without_numbers[2..]
        } else {
            line_without_numbers
        };
        
        // Clean the line of potential prefixes/suffixes
        let cleaned_path = line_without_bullets
            .trim_matches(|c| {
                c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == ';'
            })
            .trim();
        
        if cleaned_path.is_empty() {
            continue;
        }
        
        // Validate and normalize the path using security-aware validation
        let project_path = std::path::Path::new(project_directory);
        let validated_path = match crate::utils::path_utils::validate_llm_path(cleaned_path, project_path) {
            Ok(path) => path,
            Err(e) => {
                debug!("Skipping invalid LLM path '{}': {}", cleaned_path, e);
                continue;
            }
        };
        
        // Convert to string for storage
        let path_string = validated_path.to_string_lossy().to_string();
        paths.push(path_string);
    }
    
    // Remove duplicates while preserving order
    let mut unique_paths = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in paths {
        if seen.insert(path.clone()) {
            unique_paths.push(path);
        }
    }
    
    Ok(unique_paths)
}