use crate::db_utils::{BackgroundJobRepository, SessionRepository, SettingsRepository};
use crate::error::{AppError, AppResult};
use crate::jobs::types::{ImplementationPlanMergePayload, JobPayload};
use crate::models::BackgroundJob;
use crate::models::JobCommandResponse;
use crate::models::JobStatus;
use crate::models::TaskType;
use crate::utils::get_timestamp;
use crate::utils::unified_prompt_system::{
    ComposedPrompt as UnifiedComposedPrompt, UnifiedPromptContextBuilder, UnifiedPromptProcessor,
};
use futures::future::join_all;
use log::info;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, command};
use uuid::Uuid;

/// Request payload for the implementation plan generation command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateImplementationPlanArgs {
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub relevant_files: Vec<String>,
    pub selected_root_directories: Option<Vec<String>>,
    pub project_structure: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub enable_web_search: Option<bool>,
    pub include_project_structure: Option<bool>,
}

/// Creates an implementation plan for a development task
#[command]
pub async fn create_implementation_plan_command(
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    selected_root_directories: Option<Vec<String>>,
    project_structure: Option<String>,
    model: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    enable_web_search: Option<bool>,
    include_project_structure: Option<bool>,
    app_handle: AppHandle,
) -> AppResult<JobCommandResponse> {
    let args = CreateImplementationPlanArgs {
        session_id,
        task_description,
        project_directory,
        relevant_files,
        selected_root_directories,
        project_structure,
        model,
        temperature,
        max_tokens,
        enable_web_search,
        include_project_structure,
    };
    info!(
        "Creating implementation plan job for task: {}",
        args.task_description
    );

    // Validate required fields
    if args.session_id.is_empty() {
        return Err(AppError::ValidationError(
            "Session ID is required".to_string(),
        ));
    }

    if args.task_description.is_empty() {
        return Err(AppError::ValidationError(
            "Task description is required".to_string(),
        ));
    }

    if args.project_directory.is_empty() {
        return Err(AppError::ValidationError(
            "Project directory is required".to_string(),
        ));
    }

    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::config_resolver::resolve_model_settings(
        &app_handle,
        TaskType::ImplementationPlan,
        &args.project_directory,
        args.model,
        args.temperature,
        args.max_tokens,
    )
    .await?;

    // Use the job creation utility to create and queue the job
    let payload = crate::jobs::types::ImplementationPlanPayload {
        task_description: args.task_description.clone(),
        relevant_files: args.relevant_files,
        selected_root_directories: args.selected_root_directories,
        enable_web_search: args.enable_web_search.unwrap_or(false),
        include_project_structure: args.include_project_structure.unwrap_or(true),
    };

    // Create and queue the job
    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &args.session_id,
        &args.project_directory,
        "openrouter",
        TaskType::ImplementationPlan,
        "IMPLEMENTATION_PLAN",
        &args.task_description.clone(),
        model_settings,
        JobPayload::ImplementationPlan(payload),
        2,    // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No extra metadata
        &app_handle,
    )
    .await?;

    app_handle.emit(
        "device-link-event",
        serde_json::json!({
            "type": "PlanCreated",
            "payload": {
                "jobId": job_id,
                "sessionId": args.session_id,
                "projectDirectory": args.project_directory
            }
        })
    ).ok();

    info!("Created implementation plan job: {}", job_id);

    // Return the job ID
    Ok(JobCommandResponse { job_id })
}

/// Arguments for reading an implementation plan
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadImplementationPlanArgs {
    pub job_id: String,
}

/// Response for the read implementation plan command
#[derive(Debug, Clone, Serialize)]
pub struct ImplementationPlanDataResponse {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
    pub content_format: Option<String>,
    pub created_at: String,
    pub status: String,
}

/// Response for the get prompt command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptResponse {
    pub system_prompt: String,
    pub user_prompt: String,
    pub combined_prompt: String,
}

/// Response for the estimate prompt tokens command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTokenEstimateResponse {
    pub estimated_tokens: u32,
    pub system_prompt_tokens: u32,
    pub user_prompt_tokens: u32,
    pub total_tokens: u32,
}

/// Estimates the number of tokens a prompt would use
#[command]
pub async fn estimate_prompt_tokens_command(
    task_type: String,
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    selected_root_directories: Option<Vec<String>>,
    model: Option<String>,
    include_project_structure: Option<bool>,
    app_handle: AppHandle,
) -> AppResult<PromptTokenEstimateResponse> {
    info!("Estimating tokens for {} prompt", task_type);

    // Validate required fields
    if session_id.is_empty() {
        return Err(AppError::ValidationError(
            "Session ID is required".to_string(),
        ));
    }

    if task_description.is_empty() {
        return Err(AppError::ValidationError(
            "Task description is required".to_string(),
        ));
    }

    if project_directory.is_empty() {
        return Err(AppError::ValidationError(
            "Project directory is required".to_string(),
        ));
    }

    // Parse task_type string into TaskType enum using the FromStr implementation
    let parsed_task_type = task_type
        .parse::<TaskType>()
        .map_err(|_| AppError::ValidationError(format!("Unsupported task type: {}", task_type)))?;

    // Get session to access actual project directory
    // If session doesn't exist (e.g., mobile app created locally), use the provided project_directory
    let background_job_repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();
    let session_repo = crate::db_utils::SessionRepository::new(background_job_repo.get_pool());
    let actual_project_directory = match session_repo
        .get_session_by_id(&session_id)
        .await? {
        Some(session) => session.project_directory,
        None => {
            log::warn!("Session {} not found in database, using provided project_directory", session_id);
            project_directory.clone()
        }
    };

    // Read file contents for relevant files - using parallel direct file reading to avoid lock contention
    let file_futures: Vec<_> = relevant_files
        .iter()
        .map(|relative_path_str| {
            let full_path = std::path::Path::new(&actual_project_directory).join(relative_path_str);
            let relative_path_clone = relative_path_str.clone();
            async move {
                let content_result = tokio::fs::read_to_string(&full_path).await;
                match content_result {
                    Ok(content) => Some((relative_path_clone, content)),
                    Err(e) => {
                        log::warn!("Failed to read file {}: {}", full_path.display(), e);
                        None
                    }
                }
            }
        })
        .collect();

    let results = join_all(file_futures).await;
    let file_contents_map: std::collections::HashMap<String, String> =
        results.into_iter().filter_map(|result| result).collect();

    // Generate directory tree only if include_project_structure is true (default to true if not specified)
    let should_include_structure = include_project_structure.unwrap_or(true);
    let directory_tree = if !should_include_structure {
        log::debug!(
            "Skipping directory tree generation for token estimation as include_project_structure is false"
        );
        None
    } else if let Some(ref root_dirs) = selected_root_directories {
        if !root_dirs.is_empty() {
            log::debug!(
                "Using scoped directory tree for {} root directories",
                root_dirs.len()
            );
            match crate::utils::directory_tree::get_combined_directory_tree_for_roots(root_dirs)
                .await
            {
                Ok(tree) => Some(tree),
                Err(e) => {
                    log::warn!(
                        "Failed to generate scoped directory tree: {}, falling back to full tree",
                        e
                    );
                    // Fallback to full directory tree
                    match crate::utils::directory_tree::get_directory_tree_with_defaults(
                        &actual_project_directory,
                    )
                    .await
                    {
                        Ok(tree) => Some(tree),
                        Err(e) => {
                            log::warn!("Failed to generate fallback directory tree: {}", e);
                            None
                        }
                    }
                }
            }
        } else {
            // Empty root directories - use full tree
            match crate::utils::directory_tree::get_directory_tree_with_defaults(
                &actual_project_directory,
            )
            .await
            {
                Ok(tree) => Some(tree),
                Err(e) => {
                    log::warn!(
                        "Failed to generate directory tree for prompt context: {}",
                        e
                    );
                    None
                }
            }
        }
    } else {
        // No root directories specified - use full tree
        match crate::utils::directory_tree::get_directory_tree_with_defaults(
            &actual_project_directory,
        )
        .await
        {
            Ok(tree) => Some(tree),
            Err(e) => {
                log::warn!(
                    "Failed to generate directory tree for prompt context: {}",
                    e
                );
                None
            }
        }
    };

    let model_settings = crate::utils::config_resolver::resolve_model_settings(
        &app_handle,
        parsed_task_type,
        &actual_project_directory,
        model,
        None,
        None,
    )
    .await?;

    // Get settings repository for UnifiedPromptProcessor
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();

    // Create unified prompt context
    let context = UnifiedPromptContextBuilder::new(
        actual_project_directory.clone(),
        parsed_task_type,
        task_description.clone(),
    )
    .directory_tree(directory_tree)
    .file_contents(if file_contents_map.is_empty() {
        None
    } else {
        Some(file_contents_map.clone())
    })
    .model_name(model_settings.map(|settings| settings.0))
    .build();

    // Use UnifiedPromptProcessor to generate the complete prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &app_handle)
        .await?;

    Ok(PromptTokenEstimateResponse {
        estimated_tokens: composed_prompt.estimated_total_tokens.unwrap_or(0) as u32,
        system_prompt_tokens: composed_prompt.estimated_system_tokens.unwrap_or(0) as u32,
        user_prompt_tokens: composed_prompt.estimated_user_tokens.unwrap_or(0) as u32,
        total_tokens: composed_prompt.estimated_total_tokens.unwrap_or(0) as u32,
    })
}

/// Gets the prompt that would be used to generate a task
#[command]
pub async fn get_prompt_command(
    task_type: String,
    session_id: String,
    task_description: String,
    project_directory: String,
    relevant_files: Vec<String>,
    selected_root_directories: Option<Vec<String>>,
    app_handle: AppHandle,
) -> AppResult<PromptResponse> {
    // Validate required fields
    if session_id.is_empty() {
        return Err(AppError::ValidationError(
            "Session ID is required".to_string(),
        ));
    }

    if task_description.is_empty() {
        return Err(AppError::ValidationError(
            "Task description is required".to_string(),
        ));
    }

    if project_directory.is_empty() {
        return Err(AppError::ValidationError(
            "Project directory is required".to_string(),
        ));
    }

    // Get session to access actual project directory
    // If session doesn't exist (e.g., mobile app created locally), use the provided project_directory
    let background_job_repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();
    let session_repo = SessionRepository::new(background_job_repo.get_pool());
    let actual_project_directory = match session_repo
        .get_session_by_id(&session_id)
        .await? {
        Some(session) => session.project_directory,
        None => {
            log::warn!("Session {} not found in database, using provided project_directory", session_id);
            project_directory.clone()
        }
    };

    // Parse task_type string into TaskType enum using the FromStr implementation
    let parsed_task_type = task_type
        .parse::<TaskType>()
        .map_err(|_| AppError::ValidationError(format!("Unsupported task type: {}", task_type)))?;

    // Read file contents for relevant files - using parallel direct file reading to avoid lock contention
    let file_futures: Vec<_> = relevant_files
        .iter()
        .map(|relative_path_str| {
            let full_path = std::path::Path::new(&actual_project_directory).join(relative_path_str);
            let relative_path_clone = relative_path_str.clone();
            async move {
                let content_result = tokio::fs::read_to_string(&full_path).await;
                match content_result {
                    Ok(content) => Some((relative_path_clone, content)),
                    Err(e) => {
                        log::warn!("Failed to read file {}: {}", full_path.display(), e);
                        None
                    }
                }
            }
        })
        .collect();

    let results = join_all(file_futures).await;
    let file_contents_map: std::collections::HashMap<String, String> =
        results.into_iter().filter_map(|result| result).collect();

    // Generate directory tree - use scoped tree if root directories are provided
    let directory_tree = if let Some(ref root_dirs) = selected_root_directories {
        if !root_dirs.is_empty() {
            log::debug!(
                "Using scoped directory tree for {} root directories",
                root_dirs.len()
            );
            match crate::utils::directory_tree::get_combined_directory_tree_for_roots(root_dirs)
                .await
            {
                Ok(tree) => Some(tree),
                Err(e) => {
                    log::warn!(
                        "Failed to generate scoped directory tree: {}, falling back to full tree",
                        e
                    );
                    // Fallback to full directory tree
                    match crate::utils::directory_tree::get_directory_tree_with_defaults(
                        &actual_project_directory,
                    )
                    .await
                    {
                        Ok(tree) => Some(tree),
                        Err(e) => {
                            log::warn!("Failed to generate fallback directory tree: {}", e);
                            None
                        }
                    }
                }
            }
        } else {
            // Empty root directories - use full tree
            match crate::utils::directory_tree::get_directory_tree_with_defaults(
                &actual_project_directory,
            )
            .await
            {
                Ok(tree) => Some(tree),
                Err(e) => {
                    log::warn!(
                        "Failed to generate directory tree for prompt context: {}",
                        e
                    );
                    None
                }
            }
        }
    } else {
        // No root directories specified - use full tree
        match crate::utils::directory_tree::get_directory_tree_with_defaults(
            &actual_project_directory,
        )
        .await
        {
            Ok(tree) => Some(tree),
            Err(e) => {
                log::warn!(
                    "Failed to generate directory tree for prompt context: {}",
                    e
                );
                None
            }
        }
    };

    // Get settings repository for UnifiedPromptProcessor
    let settings_repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();

    // Create unified prompt context
    let context = UnifiedPromptContextBuilder::new(
        actual_project_directory.clone(),
        parsed_task_type,
        task_description.clone(),
    )
    .directory_tree(directory_tree)
    .file_contents(if file_contents_map.is_empty() {
        None
    } else {
        Some(file_contents_map.clone())
    })
    .build();

    // Use UnifiedPromptProcessor to generate the complete prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &app_handle)
        .await?;

    // Use the clean separated prompts from the unified system
    let system_prompt = composed_prompt.system_prompt;
    let user_prompt = composed_prompt.user_prompt;
    let combined_prompt = format!("{}\n\n{}", system_prompt, user_prompt);

    Ok(PromptResponse {
        system_prompt,
        user_prompt,
        combined_prompt,
    })
}

/// Reads an implementation plan from the file system
#[command]
pub async fn read_implementation_plan_command(
    job_id: String,
    app_handle: AppHandle,
) -> AppResult<ImplementationPlanDataResponse> {
    let args = ReadImplementationPlanArgs { job_id };
    info!("Reading implementation plan for job: {}", args.job_id);

    // Get the background job repository
    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();

    // Get the job from the database
    let job = repo
        .get_job_by_id(&args.job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get job: {}", e)))?
        .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", args.job_id)))?;

    // Verify job type
    if job.task_type != "implementation_plan" && job.task_type != "implementation_plan_merge" {
        return Err(AppError::ValidationError(format!(
            "Job is not an implementation plan: {}",
            args.job_id
        )));
    }

    let content = job.response.unwrap_or_default();

    // Extract job details
    let created_at = job.created_at;

    // Try to parse the title from metadata
    let title = if let Some(metadata) = job.metadata.as_ref() {
        if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata) {
            metadata_json["planTitle"].as_str()
                .or(metadata_json["generated_title"].as_str())
                .or(metadata_json["title"].as_str())
                .map(|s| s.to_string())
        } else {
            None
        }
    } else {
        None
    };

    Ok(ImplementationPlanDataResponse {
        id: job.id,
        title,
        description: Some(job.prompt),
        content: Some(content),
        content_format: Some("xml".to_string()),
        created_at: created_at.to_string(),
        status: job.status,
    })
}

/// Arguments for updating implementation plan content
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateImplementationPlanContentArgs {
    pub job_id: String,
    pub new_content: String,
}

/// Updates the content of an implementation plan
#[command]
pub async fn update_implementation_plan_content_command(
    job_id: String,
    new_content: String,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Updating implementation plan content for job: {}", job_id);

    // Validate required fields
    if job_id.is_empty() {
        return Err(AppError::ValidationError("Job ID is required".to_string()));
    }

    // Get the background job repository
    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();

    // Get the job from the database
    let job = repo
        .get_job_by_id(&job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get job: {}", e)))?
        .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;

    // Verify job type
    if job.task_type != "implementation_plan" && job.task_type != "implementation_plan_merge" {
        return Err(AppError::ValidationError(format!(
            "Job is not an implementation plan: {}",
            job_id
        )));
    }

    // Update the job response with the new content
    // Keep the status, metadata, and token counts unchanged, only update the response content
    repo.update_job_response(&job_id, &new_content, None, None, None, None, None)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to update job response: {}", e)))?;

    app_handle.emit(
        "device-link-event",
        serde_json::json!({
            "type": "PlanModified",
            "payload": { "jobId": job_id }
        })
    ).ok();

    info!(
        "Successfully updated implementation plan content for job: {}",
        job_id
    );
    Ok(())
}

/// Marks an implementation plan as signed off by the user
#[command]
pub async fn mark_implementation_plan_signed_off_command(
    app_handle: AppHandle,
    job_id: String,
    state: Option<String>,
) -> AppResult<()> {
    use chrono::Utc;

    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();

    let job = repo
        .get_job_by_id(&job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get job: {}", e)))?
        .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;

    let mut meta: serde_json::Value = if let Some(metadata_str) = job.metadata.as_ref() {
        serde_json::from_str(metadata_str).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let state_value = state.unwrap_or_else(|| "accepted".to_string());

    let sign = serde_json::json!({
        "state": state_value,
        "timestamp": Utc::now().to_rfc3339(),
    });
    meta["user_signoff"] = sign;

    let metadata_str = serde_json::to_string(&meta)
        .map_err(|e| AppError::ValidationError(format!("Failed to serialize metadata: {}", e)))?;

    repo.update_job_status_with_metadata(&job_id, &JobStatus::from_str(&job.status).unwrap_or(JobStatus::Completed), None, metadata_str)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to update job metadata: {}", e)))?;

    info!("Marked implementation plan {} as signed off with state: {}", job_id, state_value);

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanMarkdownResponse {
    pub job_id: String,
    pub xml_content: String,
    pub markdown: String,
}

#[command]
pub async fn generate_plan_markdown_command(
    app_handle: AppHandle,
    job_id: String,
) -> AppResult<PlanMarkdownResponse> {
    info!("Generating Markdown for plan: {}", job_id);

    let repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();

    let job = repo
        .get_job_by_id(&job_id)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get job: {}", e)))?
        .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;

    if job.task_type != "implementation_plan" && job.task_type != "implementation_plan_merge" {
        return Err(AppError::ValidationError(format!(
            "Job is not an implementation plan: {}",
            job_id
        )));
    }

    let xml_content = job.response.clone().unwrap_or_default();
    if xml_content.is_empty() {
        return Err(AppError::ValidationError(
            "Implementation plan has no content".to_string(),
        ));
    }

    repo.update_job_metadata(
        &job_id,
        &serde_json::json!({"markdownConversionStatus": "pending"}),
    )
    .await?;

    let markdown =
        crate::utils::xml_markdown_converter::convert_xml_plan_to_markdown(
            &app_handle,
            &xml_content,
        )
        .await?;

    repo.update_job_metadata(
        &job_id,
        &serde_json::json!({
            "markdownResponse": markdown.clone(),
            "markdownConversionStatus": "completed"
        }),
    )
    .await?;

    info!("Successfully generated Markdown for plan: {}", job_id);

    Ok(PlanMarkdownResponse {
        job_id: job_id.clone(),
        xml_content,
        markdown,
    })
}

/// Creates a merged implementation plan from multiple source plans
#[command]
pub async fn create_merged_implementation_plan_command(
    app_handle: tauri::AppHandle,
    session_id: String,
    source_job_ids: Vec<String>,
    merge_instructions: Option<String>,
) -> AppResult<JobCommandResponse> {
    info!(
        "Creating merged implementation plan for {} source plans",
        source_job_ids.len()
    );

    // Validate required fields
    if session_id.is_empty() {
        return Err(AppError::ValidationError(
            "Session ID is required".to_string(),
        ));
    }

    if source_job_ids.is_empty() {
        return Err(AppError::ValidationError(
            "At least one source job ID is required".to_string(),
        ));
    }

    // Get session to find the project directory
    let background_job_repo = app_handle
        .state::<Arc<BackgroundJobRepository>>()
        .inner()
        .clone();
    let session_repo = SessionRepository::new(background_job_repo.get_pool());
    let session = session_repo
        .get_session_by_id(&session_id)
        .await?
        .ok_or_else(|| AppError::JobError(format!("Session {} not found", session_id)))?;

    // Get model configuration for this task using centralized resolver
    let model_settings = crate::utils::config_resolver::resolve_model_settings(
        &app_handle,
        TaskType::ImplementationPlanMerge,
        &session.project_directory,
        None, // No model override
        None, // No temperature override
        None, // No max_tokens override
    )
    .await?;

    // Create the prompt description including the task description from session
    let prompt_description = if let Some(ref task_desc) = session.task_description {
        if let Some(ref instructions) = merge_instructions {
            format!(
                "{} - Merge {} plans with instructions: {}",
                task_desc,
                source_job_ids.len(),
                instructions
            )
        } else {
            format!(
                "{} - Merged from {} implementation plans",
                task_desc,
                source_job_ids.len()
            )
        }
    } else {
        // Fallback if no task description in session
        if let Some(ref instructions) = merge_instructions {
            format!("Merge {} plans: {}", source_job_ids.len(), instructions)
        } else {
            format!("Merged from {} implementation plans", source_job_ids.len())
        }
    };

    let payload = JobPayload::ImplementationPlanMerge(ImplementationPlanMergePayload {
        source_job_ids,
        merge_instructions,
    });

    let job_id = crate::utils::job_creation_utils::create_and_queue_background_job(
        &session_id,
        &session.project_directory,
        "openrouter",
        TaskType::ImplementationPlanMerge,
        "IMPLEMENTATION_PLAN_MERGE",
        &prompt_description,
        model_settings,
        payload,
        2,    // Priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // No extra metadata
        &app_handle,
    )
    .await?;

    app_handle.emit(
        "device-link-event",
        serde_json::json!({
            "type": "PlanCreated",
            "payload": {
                "jobId": job_id,
                "sessionId": session_id,
                "projectDirectory": session.project_directory
            }
        })
    ).ok();

    info!("Created merged implementation plan job: {}", job_id);

    Ok(JobCommandResponse { job_id })
}
