use std::path::Path;
use std::collections::HashMap;
use log::{debug, info, warn, error};
use serde_json::json;
use tauri::AppHandle;

// Config module removed - now using utils::config_helpers
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processors::path_finder_types::PathFinderOptions;
use crate::utils::path_utils;
use crate::utils::fs_utils;
use crate::utils::git_utils;
use crate::utils::token_estimator::{estimate_tokens, estimate_structured_data_tokens, estimate_code_tokens};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::fs_context_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};

pub struct PathFinderProcessor;

impl PathFinderProcessor {
    pub fn new() -> Self {
        Self {}
    }

    /// Parse paths from LLM text response with robust format handling
    fn parse_paths_from_text_response(response_text: &str, project_directory: &str) -> AppResult<Vec<String>> {
        let mut paths = Vec::new();
        
        // Normalize line endings
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
                || line.starts_with("```")
                || line == "json"
                || line == "JSON"
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
            
            if !cleaned_path.is_empty() {
                paths.push(cleaned_path.to_string());
            }
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
}

#[async_trait::async_trait]
impl JobProcessor for PathFinderProcessor {
    fn name(&self) -> &'static str {
        "PathFinder"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::PathFinder(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::PathFinder(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get project directory from session
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&session.project_hash, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for project {} and task type {}", session.project_hash, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job.id, "path finding");
        let project_directory = &session.project_directory;
        
        // Check if directory tree is provided, otherwise generate it
        let directory_tree = if let Some(tree) = &payload.directory_tree {
            if !tree.is_empty() {
                info!("Using provided directory tree for PathFinder");
                tree.clone()
            } else {
                info!("Generating directory tree for project");
                fs_context_utils::generate_directory_tree_for_context(project_directory)
                    .await.unwrap_or_else(|| "Directory tree generation failed".to_string())
            }
        } else {
            info!("Generating directory tree for project");
            fs_context_utils::generate_directory_tree_for_context(project_directory)
                .await.unwrap_or_else(|| "Directory tree generation failed".to_string())
        };
        
        // Use PathFinderOptions directly from payload
        let options = &payload.options;
        
        // Read file contents if specified
        let mut relevant_file_contents = HashMap::new();
        
        // Get include_file_contents from config, use constant if not found
        let include_file_contents = crate::utils::config_helpers::get_path_finder_include_file_contents(&app_handle).await
            .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder include_file_contents setting: {}. Please ensure server database is properly configured.", e)))?;
        
        // Use the value from options if specified, otherwise use the config/constant value
        if options.include_file_contents.unwrap_or(include_file_contents) {
            // Process explicitly included files
            if let Some(included_files) = &options.included_files {
                info!("Processing explicitly included files for content extraction");
                
                for file_path in included_files {
                    // Validate the path before processing
                    let validated_path = match path_utils::validate_llm_path(file_path, Path::new(project_directory)) {
                        Ok(path) => path,
                        Err(e) => {
                            warn!("Skipping invalid file path from options: {}: {}", file_path, e);
                            continue;
                        }
                    };
                    
                    let abs_path = if validated_path.is_absolute() {
                        validated_path
                    } else {
                        Path::new(project_directory).join(validated_path)
                    };
                    
                    // Ensure the final path is still within project bounds
                    if let Err(e) = fs_utils::ensure_path_within_project(Path::new(project_directory), &abs_path) {
                        warn!("File path outside project bounds: {}: {}", abs_path.display(), e);
                        continue;
                    }
                    
                    // Try to read the file
                    match fs_utils::read_file_to_string(&abs_path).await {
                        Ok(content) => {
                            // Use full content - no truncation based on size limits
                            relevant_file_contents.insert(file_path.clone(), content);
                        },
                        Err(e) => {
                            warn!("Failed to read file {}: {}", abs_path.display(), e);
                        }
                    }
                }
            }
            
            // Process priority file types if still under max files limit
            // Get max_files_with_content from config
            let config_max_files = crate::utils::config_helpers::get_path_finder_max_files_with_content(&app_handle).await
                .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder max_files_with_content setting: {}. Please ensure server database is properly configured.", e)))?;
            // Use the value from options if specified, otherwise use the config/constant value
            let max_files_with_content = options.max_files_with_content.unwrap_or(config_max_files);
            if relevant_file_contents.len() < max_files_with_content {
                if let Some(priority_file_types) = &options.priority_file_types {
                    info!("Processing priority file types for content extraction");
                    let remaining_slots = max_files_with_content - relevant_file_contents.len();
                    
                    // Find files matching the priority types using git-aware discovery
                    let (git_files, is_git_repo) = git_utils::get_all_non_ignored_files(Path::new(project_directory))?;
                    if !is_git_repo {
                        return Err(AppError::JobError("Project directory is not a git repository. Only git repositories are supported.".to_string()));
                    }
                    
                    // Filter for files with matching extensions and get file metadata for sorting
                    let mut matching_files_with_metadata = Vec::new();
                    for relative_path in git_files {
                        let file_path = path_utils::join_paths(Path::new(project_directory), &relative_path);
                        
                        // Check if file matches any priority file type
                        if let Some(extension) = relative_path.extension() {
                            let ext_str = extension.to_string_lossy().to_lowercase();
                            if priority_file_types.iter().any(|pft| pft.to_lowercase() == ext_str) {
                                // Get file metadata for sorting by modification time
                                if let Ok(metadata) = std::fs::metadata(&file_path) {
                                    if let Ok(modified) = metadata.modified() {
                                        matching_files_with_metadata.push((file_path, modified));
                                    }
                                }
                            }
                        }
                    }
                    
                    // Sort by modification time (most recent first) and take the requested amount
                    matching_files_with_metadata.sort_by(|a, b| b.1.cmp(&a.1));
                    let matching_files: Vec<_> = matching_files_with_metadata
                        .into_iter()
                        .take(remaining_slots * 2)
                        .map(|(path, _)| path)
                        .collect();
                    
                    // Take only the most recently modified files up to the limit (already sorted by the function)
                    for file_path in matching_files.into_iter().take(remaining_slots) {
                        // Skip files that are already included
                        let rel_path = path_utils::make_relative_to(&*file_path.to_string_lossy(), project_directory)?;
                        let rel_path_str = rel_path.to_string_lossy().into_owned();
                        if relevant_file_contents.contains_key(&rel_path_str) {
                            continue;
                        }
                        
                        // Read file content
                        match fs_utils::read_file_to_string(&file_path).await {
                            Ok(content) => {
                                // Use full content - no truncation based on size limits
                                relevant_file_contents.insert(rel_path_str, content);
                                
                                // Check if we've reached the limit
                                if relevant_file_contents.len() >= max_files_with_content {
                                    break;
                                }
                            },
                            Err(e) => {
                                warn!("Failed to read file {}: {}", file_path.display(), e);
                            }
                        }
                    }
                }
            }
        }
        
        // Store final prompt composition variables
        let final_task_description = payload.task_description.clone();
        let final_directory_tree = directory_tree.clone();
        let final_file_contents = relevant_file_contents.clone();
        
        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context
        let prompt_context = LlmPromptContext {
            task_description: final_task_description,
            file_contents: if final_file_contents.is_empty() { None } else { Some(final_file_contents) },
            directory_tree: Some(final_directory_tree),
            system_prompt_override: None,
        };
        
        // Check if job has been canceled before calling the LLM
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Execute LLM task using the task runner
        info!("Calling LLM for path finding with model {}", model_used);
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                error!("LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        info!("LLM task completed successfully for job {}", job.id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // Parse paths from the LLM response using standardized utility
        let raw_paths = match Self::parse_paths_from_text_response(&llm_result.response, project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                error!("Failed to parse paths from response: {}", e);
                let error_msg = format!("Failed to parse paths from response: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        // Validate paths against the file system using centralized utility
        info!("Validating {} parsed paths against filesystem...", raw_paths.len());
        let (validated_paths, unverified_paths_raw) = fs_context_utils::validate_paths_against_filesystem(&raw_paths, project_directory).await;

        info!("Path validation: {} valid, {} invalid paths", validated_paths.len(), unverified_paths_raw.len());

        // Check if job has been canceled after LLM processing using helper
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after LLM processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Create standardized JSON response with verifiedPaths and unverifiedPaths structure
        let response_json_content = serde_json::json!({
            "verifiedPaths": validated_paths,
            "unverifiedPaths": unverified_paths_raw,
            "count": validated_paths.len(),
            "summary": format!("Path finding: {} verified paths found", validated_paths.len())
        });
        
        // Create a modified LLM result with our JSON response
        let mut modified_llm_result = llm_result.clone();
        modified_llm_result.response = response_json_content.to_string();
        
        // Finalize job success using task runner with structured response
        task_runner.finalize_success(
            &repo,
            &job.id,
            &modified_llm_result,
            Some(response_json_content.clone()),
        ).await?;
        
        // Return success result with JSON response
        Ok(JobProcessResult::success(job.id.clone(), response_json_content.to_string()))
    }
}