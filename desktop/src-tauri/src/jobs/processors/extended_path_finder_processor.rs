use log::{debug, error, info, warn};
use serde_json::json;
use std::path::Path;
use tauri::AppHandle;
use tokio::fs;

use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::processors::utils::path_resolution_utils::to_absolute_path;
use crate::jobs::processors::utils::{parsing_utils, prompt_utils};
use crate::jobs::processors::{LlmPromptContext, LlmTaskConfigBuilder, LlmTaskRunner};
use crate::jobs::types::{
    ExtendedPathFinderPayload, Job, JobPayload, JobProcessResult, JobResultData,
};
use crate::models::TaskType;
use crate::utils::directory_tree::get_directory_tree_with_defaults;
use crate::utils::path_utils::make_relative_to;
use std::path::PathBuf;

pub struct ExtendedPathFinderProcessor;

impl ExtendedPathFinderProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl JobProcessor for ExtendedPathFinderProcessor {
    fn name(&self) -> &'static str {
        "ExtendedPathFinder"
    }

    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::ExtendedPathFinder(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::ExtendedPathFinder(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };

        // Setup job processing using standardized utility
        let (repo, session_repo, settings_repo, db_job) =
            job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Get session using centralized repository
        let session = session_repo
            .get_session_by_id(&job.session_id)
            .await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        // Get model settings using project-aware configuration
        let model_settings =
            job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;

        job_processor_utils::log_job_start(&job.id, "Extended Path Finding");

        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(
                job.id.clone(),
                "Job was canceled by user".to_string(),
            ));
        }

        // Get project directory from session
        let project_directory = &session.project_directory;

        // Generate directory tree scoped to selected root directories if available
        let directory_tree = if !payload.selected_root_directories.is_empty() {
            debug!(
                "Generating scoped directory tree for {} selected root directories",
                payload.selected_root_directories.len()
            );

            // Generate combined directory tree for selected roots only
            match crate::utils::directory_tree::get_combined_directory_tree_for_roots(
                &payload.selected_root_directories,
            )
            .await
            {
                Ok(tree) => tree,
                Err(e) => {
                    warn!(
                        "Failed to generate scoped directory tree: {}. Falling back to full tree.",
                        e
                    );
                    // Fallback to full directory tree
                    match get_directory_tree_with_defaults(project_directory).await {
                        Ok(tree) => tree,
                        Err(e) => {
                            warn!(
                                "Failed to generate directory tree: {}. Using empty fallback.",
                                e
                            );
                            "No directory structure available".to_string()
                        }
                    }
                }
            }
        } else {
            // No selected roots, use full project directory tree
            debug!("No selected root directories, using full project tree");
            match get_directory_tree_with_defaults(project_directory).await {
                Ok(tree) => tree,
                Err(e) => {
                    warn!(
                        "Failed to generate directory tree: {}. Using empty fallback.",
                        e
                    );
                    "No directory structure available".to_string()
                }
            }
        };

        // Read file contents for all initial paths to provide complete context
        let mut file_contents = std::collections::HashMap::new();
        for path in &payload.initial_paths {
            let absolute_path = to_absolute_path(path, &session.project_directory);
            match fs::read_to_string(&absolute_path).await {
                Ok(content) => {
                    file_contents.insert(path.clone(), content);
                }
                Err(e) => {
                    warn!("Failed to read file content for {}: {}", path, e);
                    // Continue without this file's content - don't fail the whole process
                }
            }
        }

        // Setup LLM task configuration
        let llm_config =
            LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
                .stream(false)
                .build();

        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);

        // Create task description with initial paths context
        let task_with_context = if payload.initial_paths.is_empty() {
            payload.task_description.clone()
        } else {
            format!(
                "{}\n\nPreviously identified files:\n{}",
                payload.task_description,
                payload
                    .initial_paths
                    .iter()
                    .map(|p| format!("- {}", p))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        };

        // Create prompt context
        let prompt_context = LlmPromptContext {
            task_description: task_with_context,
            file_contents: Some(file_contents),
            directory_tree: Some(directory_tree.clone()),
        };

        // Check for cancellation before LLM call using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before LLM call", job.id);
            return Ok(JobProcessResult::canceled(
                job.id.clone(),
                "Job was canceled by user".to_string(),
            ));
        }

        // Execute LLM task using the task runner
        let llm_result = match task_runner
            .execute_llm_task(prompt_context, &settings_repo)
            .await
        {
            Ok(result) => result,
            Err(e) => {
                error!("Extended path finding LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        // Extract the response content
        let response_content = llm_result.response.clone();

        // Parse paths from the LLM response using standardized utility
        let extended_paths = match parsing_utils::parse_paths_from_text_response(
            &response_content,
            project_directory,
        ) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to parse paths from LLM response: {}", e);
                error!("{}", error_msg);

                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        // Validate extended paths found by LLM
        let mut validated_extended_paths = Vec::new();
        let mut unverified_extended_paths = Vec::new();
        let project_dir = PathBuf::from(&session.project_directory);

        for path_from_llm in &extended_paths {
            // Fix paths that might be missing leading slash
            let corrected_path = if !path_from_llm.starts_with('/') && !path_from_llm.starts_with("\\\\")
                && path_from_llm.starts_with("Users/") {
                // macOS path missing leading slash
                format!("/{}", path_from_llm)
            } else if !path_from_llm.starts_with('/') && !path_from_llm.starts_with("\\\\")
                && (path_from_llm.starts_with("home/") || path_from_llm.starts_with("var/") || path_from_llm.starts_with("tmp/")) {
                // Linux path missing leading slash
                format!("/{}", path_from_llm)
            } else {
                path_from_llm.clone()
            };

            let absolute_path = to_absolute_path(&corrected_path, &session.project_directory);
            match fs::metadata(&absolute_path).await {
                Ok(metadata) if metadata.is_file() => {
                    // Normalize the path: convert to relative if within project, keep absolute if external
                    let normalized_path = if absolute_path.starts_with(&project_dir) {
                        // File is within project directory - convert to relative path
                        match make_relative_to(&absolute_path, &project_dir) {
                            Ok(rel_path) => rel_path.to_string_lossy().to_string(),
                            Err(_) => {
                                // Fallback: use strip_prefix
                                absolute_path.strip_prefix(&project_dir)
                                    .map(|p| p.to_string_lossy().to_string())
                                    .unwrap_or_else(|_| path_from_llm.clone())
                            }
                        }
                    } else {
                        // File is external - keep as absolute path
                        absolute_path.to_string_lossy().to_string()
                    };

                    validated_extended_paths.push(normalized_path);
                }
                _ => {
                    unverified_extended_paths.push(path_from_llm.clone());
                }
            }
        }

        // Combine initial paths (already validated and filtered by AI relevance assessment) with validated extended paths
        let mut combined_validated_paths = payload.initial_paths.clone();
        for path in &validated_extended_paths {
            if !combined_validated_paths.contains(path) {
                combined_validated_paths.push(path.clone());
            }
        }

        // Check for cancellation after LLM processing using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after LLM processing", job.id);
            return Ok(JobProcessResult::canceled(
                job.id.clone(),
                "Job was canceled by user".to_string(),
            ));
        }

        // Store results in job metadata (supplementary info only)
        let result_metadata = json!({
            "initialPaths": payload.initial_paths.len(),
            "llmRawPaths": extended_paths.len(),
            "validatedLlmPaths": validated_extended_paths.len(),
            "unverifiedLlmPaths": unverified_extended_paths.len(),
            "finalVerifiedPaths": combined_validated_paths.len(),
            "initialPathsList": payload.initial_paths,
            "extendedPaths": extended_paths,
            "validatedExtendedPaths": validated_extended_paths,
            "unverifiedExtendedPaths": unverified_extended_paths,
            "llmResponse": response_content,
            "workflowId": job.id,
            "taskDescription": payload.task_description,
            "projectDirectory": project_directory.clone(),
            "modelUsed": model_used,
            "summary": if validated_extended_paths.len() > 0 {
                format!("Found {} additional files", validated_extended_paths.len())
            } else {
                "No additional files found".to_string()
            }
        });

        debug!("Extended path finding completed for workflow {}", job.id);

        // NOTE: No longer handling internal chaining - WorkflowOrchestrator manages transitions

        // Extract system prompt template and cost
        let system_prompt_template = llm_result.system_prompt_template.clone();
        let actual_cost = llm_result
            .usage
            .as_ref()
            .and_then(|u| u.cost)
            .unwrap_or(0.0);

        // Return success result with structured JSON data
        // Only return the new extended paths, not the initial paths which are already in the session
        Ok(JobProcessResult::success(
            job.id.clone(),
            JobResultData::Json(serde_json::json!({
                "files": validated_extended_paths,
                "count": validated_extended_paths.len(),
                "summary": if validated_extended_paths.len() > 0 {
                    format!("Found {} additional files", validated_extended_paths.len())
                } else {
                    "No additional files found".to_string()
                }
            })),
        )
        .with_tokens(
            llm_result.usage.as_ref().map(|u| u.prompt_tokens as u32),
            llm_result
                .usage
                .as_ref()
                .map(|u| u.completion_tokens as u32),
        )
        .with_system_prompt_template(system_prompt_template)
        .with_actual_cost(actual_cost))
    }
}
