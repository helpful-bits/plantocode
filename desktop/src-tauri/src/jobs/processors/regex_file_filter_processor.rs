use futures::{StreamExt, stream};
use log::{debug, error, info};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tokio::fs as tokio_fs;
use tokio::task;
use tokio::time::{Duration, sleep};

use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::processors::{LlmPromptContext, LlmTaskConfigBuilder, LlmTaskRunner};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData, PatternGroup};
use crate::utils::directory_tree::get_directory_tree_with_defaults;
use crate::utils::git_utils;

#[derive(Debug)]
struct CompiledPatternGroup {
    title: String,
    path_regex: Option<Regex>,
    content_regex: Option<Regex>,
    negative_path_regex: Option<Regex>,
}

pub struct RegexFileFilterProcessor;

impl RegexFileFilterProcessor {
    pub fn new() -> Self {
        Self {}
    }

    /// Compile regex pattern with validation
    fn compile_regex(&self, pattern: &str) -> AppResult<Regex> {
        match Regex::new(pattern) {
            Ok(regex) => {
                debug!("Successfully compiled regex pattern: {}", pattern);
                Ok(regex)
            }
            Err(e) => {
                error!("Invalid regex pattern '{}': {}", pattern, e);
                Err(AppError::JobError(format!(
                    "Invalid regex pattern '{}': {}",
                    pattern, e
                )))
            }
        }
    }

    /// Compile a pattern group into a CompiledPatternGroup - fail fast on any error
    fn compile_pattern_group(&self, group: &PatternGroup) -> AppResult<CompiledPatternGroup> {
        let path_regex = if let Some(ref pattern) = group.path_pattern {
            Some(self.compile_regex(pattern)?)
        } else {
            None
        };

        let content_regex = if let Some(ref pattern) = group.content_pattern {
            Some(self.compile_regex(pattern)?)
        } else {
            None
        };

        let negative_path_regex = if let Some(ref pattern) = group.negative_path_pattern {
            Some(self.compile_regex(pattern)?)
        } else {
            None
        };

        Ok(CompiledPatternGroup {
            title: group.title.clone(),
            path_regex,
            content_regex,
            negative_path_regex,
        })
    }

    /// Static version of file content matching for use in async closures
    async fn file_content_matches_pattern_static(
        file_path: &str,
        content_regex: &Regex,
        project_directory: &str,
    ) -> bool {
        let full_path = std::path::Path::new(project_directory).join(file_path);
        match tokio_fs::read(&full_path).await {
            Ok(bytes) => {
                // If file is >50MB, treat as binary automatically
                if bytes.len() > 50 * 1024 * 1024 {
                    debug!(
                        "Skipping large file (>50MB) for pattern matching: {}",
                        file_path
                    );
                    return false;
                }

                // Check for binary files by looking for null bytes in first 8192 bytes
                let check_size = std::cmp::min(bytes.len(), 8192);
                if bytes[..check_size].contains(&0) {
                    debug!("Skipping binary file for pattern matching: {}", file_path);
                    return false;
                }

                // Additional check for UTF-8 validity
                match std::str::from_utf8(&bytes[..check_size]) {
                    Ok(_) => {
                        // Valid UTF-8, proceed with pattern matching
                        let content = String::from_utf8_lossy(&bytes);
                        content_regex.is_match(&content)
                    }
                    Err(_) => {
                        debug!(
                            "Skipping non-UTF-8 file for pattern matching: {}",
                            file_path
                        );
                        false
                    }
                }
            }
            Err(_) => {
                debug!(
                    "Could not read file content for pattern matching: {}",
                    file_path
                );
                false
            }
        }
    }

    /// Process a single pattern group and return matching files
    async fn process_pattern_group(
        &self,
        compiled_group: &CompiledPatternGroup,
        all_files: &[String],
        project_directory: &str,
    ) -> Vec<String> {
        // If neither path nor content pattern is available, skip this group
        if compiled_group.path_regex.is_none() && compiled_group.content_regex.is_none() {
            return Vec::new();
        }

        // Clone the regex patterns to avoid lifetime issues in async closures
        let path_regex = compiled_group.path_regex.clone();
        let content_regex = compiled_group.content_regex.clone();
        let project_dir = project_directory.to_string();

        // Apply positive filtering (BOTH path AND content must match if both are specified)
        let file_check_futures = all_files.iter().cloned().map(|file_path| {
            let path_regex = path_regex.clone();
            let content_regex = content_regex.clone();
            let project_dir = project_dir.clone();
            async move {
                // Add rate limiting to prevent filesystem overload
                sleep(Duration::from_millis(1)).await;

                let mut path_matches = true;
                let mut content_matches = true;

                // Check path pattern (if specified)
                if let Some(ref path_regex) = path_regex {
                    path_matches = path_regex.is_match(&file_path);
                }

                // Check content pattern (if specified)
                if let Some(ref content_regex) = content_regex {
                    content_matches = Self::file_content_matches_pattern_static(
                        &file_path,
                        content_regex,
                        &project_dir,
                    )
                    .await;
                }

                // Both conditions must be true (AND logic within group)
                if path_matches && content_matches {
                    Some(file_path)
                } else {
                    None
                }
            }
        });

        let positive_results: Vec<Option<String>> = stream::iter(file_check_futures)
            .buffer_unordered(3)
            .collect()
            .await;

        let positive_matches: Vec<String> =
            positive_results.into_iter().filter_map(|x| x).collect();

        // Apply negative path filtering
        let negative_filtered = if let Some(ref neg_path_regex) = compiled_group.negative_path_regex
        {
            let excluded_count = positive_matches
                .iter()
                .filter(|file_path| neg_path_regex.is_match(file_path))
                .count();
            let filtered: Vec<String> = positive_matches
                .into_iter()
                .filter(|file_path| !neg_path_regex.is_match(file_path))
                .collect();
            if excluded_count > 0 {}
            filtered
        } else {
            positive_matches
        };

        negative_filtered
    }
}

#[async_trait::async_trait]
impl JobProcessor for RegexFileFilterProcessor {
    fn name(&self) -> &'static str {
        "RegexFileFilterProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::RegexFileFilter(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Extract task description from workflow payload
        let task_description_for_prompt = match &job.payload {
            JobPayload::RegexFileFilter(p) => p.task_description.clone(),
            _ => {
                return Err(AppError::JobError(
                    "Invalid payload type for RegexFileFilterProcessor".to_string(),
                ));
            }
        };

        // Setup job processing
        let (repo, session_repo, settings_repo, db_job) =
            job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Get session to access project_hash
        let session = session_repo
            .get_session_by_id(&job.session_id)
            .await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        // Generate directory tree using session-based utility (avoids duplicate session lookup)
        let directory_tree_for_prompt =
            match get_directory_tree_with_defaults(&session.project_directory).await {
                Ok(tree) => Some(tree),
                Err(e) => {
                    error!(
                        "Failed to generate directory tree using session-based utility: {}",
                        e
                    );
                    return Err(AppError::JobError(format!(
                        "Failed to generate directory tree: {}",
                        e
                    )));
                }
            };

        // Get model settings using project-aware configuration
        let model_settings =
            job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;

        job_processor_utils::log_job_start(&job.id, "regex pattern generation");

        // Setup LLM task configuration
        let llm_config =
            LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
                .stream(false)
                .build();

        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);

        // Create LLM prompt context for task runner
        let llm_context = LlmPromptContext {
            task_description: task_description_for_prompt.clone(),
            file_contents: None,
            directory_tree: directory_tree_for_prompt.clone(),
        };

        // Execute LLM call using task runner to avoid lifetime issues
        let llm_result = match task_runner
            .execute_llm_task(llm_context, &settings_repo)
            .await
        {
            Ok(result) => result,
            Err(e) => {
                error!("Regex Pattern Generation LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        // Extract the response content
        let response_content = llm_result.response.clone();
        debug!("LLM response content: {}", response_content);

        // Attempt to parse the content as JSON
        let json_validation_result =
            match serde_json::from_str::<serde_json::Value>(&response_content) {
                Ok(parsed_json) => {
                    debug!("Successfully parsed JSON response");
                    (true, Some(parsed_json))
                }
                Err(e) => {
                    error!("Failed to parse LLM response as JSON: {}", e);
                    return Err(AppError::JobError(format!(
                        "Failed to parse LLM response as JSON: {}",
                        e
                    )));
                }
            };

        // Parse pattern groups and apply file filtering
        let filtered_files = if let Some(ref parsed_json) = json_validation_result.1 {
            // Extract pattern groups from JSON
            let pattern_groups: Vec<PatternGroup> = if let Some(groups_array) =
                parsed_json.get("patternGroups").and_then(|v| v.as_array())
            {
                groups_array
                    .iter()
                    .filter_map(|group_json| {
                        serde_json::from_value::<PatternGroup>(group_json.clone()).ok()
                    })
                    .collect()
            } else {
                return Err(AppError::JobError(
                    "No patternGroups array found in generated response".to_string(),
                ));
            };

            if pattern_groups.is_empty() {
                return Err(AppError::JobError(
                    "No valid pattern groups found in generated response".to_string(),
                ));
            } else {
                // Compile all pattern groups - fail fast on any error
                let compiled_groups: Vec<CompiledPatternGroup> = pattern_groups
                    .iter()
                    .map(|group| self.compile_pattern_group(group))
                    .collect::<AppResult<Vec<_>>>()?;

                // Normalize the project directory path - fail if canonicalization fails
                let project_path = Path::new(&session.project_directory);
                let normalized_project_dir = fs::canonicalize(project_path).map_err(|e| {
                    AppError::JobError(format!(
                        "Failed to canonicalize project directory {}: {}",
                        session.project_directory, e
                    ))
                })?;

                // Use proven git utilities for file discovery (same as directory_tree.rs)
                let normalized_project_dir_clone = normalized_project_dir.clone();
                let git_files = task::spawn_blocking(move || {
                    git_utils::get_all_non_ignored_files(&normalized_project_dir_clone)
                })
                .await
                .map_err(|e| {
                    AppError::JobError(format!("Failed to spawn blocking task for git: {}", e))
                })?
                .map_err(|e| AppError::JobError(format!("Failed to get git files: {}", e)))?;

                let all_files: Vec<String> = git_files
                    .0
                    .iter()
                    .filter_map(|path| {
                        let full_path = normalized_project_dir.join(path);
                        // Check if file actually exists on filesystem
                        if full_path.exists() {
                            Some(path.to_string_lossy().to_string())
                        } else {
                            // Skip files that don't exist (deleted but still in git index)
                            None
                        }
                    })
                    .collect();

                // Convert normalized directory to string for pattern matching
                let normalized_project_dir_str =
                    normalized_project_dir.to_string_lossy().to_string();

                // Use HashSet to collect unique files across all groups (OR logic between groups)
                let mut all_matching_files = HashSet::new();

                // Process each pattern group for all files (git handles efficiency)
                for compiled_group in &compiled_groups {
                    let group_matches = self
                        .process_pattern_group(
                            &compiled_group,
                            &all_files,
                            &normalized_project_dir_str,
                        )
                        .await;

                    // Add all matches from this group to the overall set
                    for file in group_matches {
                        all_matching_files.insert(file);
                    }
                }

                let final_matches: Vec<String> = all_matching_files.into_iter().collect();
                final_matches
            }
        } else {
            return Err(AppError::JobError(
                "Cannot apply file filtering - JSON parsing failed".to_string(),
            ));
        };

        // Extract system prompt template and cost
        let system_prompt_template = llm_result.system_prompt_template.clone();
        let actual_cost = llm_result
            .usage
            .as_ref()
            .and_then(|u| u.cost)
            .unwrap_or(0.0);

        // Check if no files were found and terminate workflow early
        if filtered_files.is_empty() {
            let error_msg = "No files found matching the task description. The task description may be too vague or doesn't match any files in the codebase. Please provide more specific information about what you're looking for, such as:\n\n• Specific file names, directories, or patterns\n• Technology stack or programming languages involved\n• Functionality or features you want to modify\n• Error messages or specific code snippets you're working with";
            
            info!("Terminating workflow early: {}", error_msg);
            return Ok(JobProcessResult::failure(job.id.clone(), error_msg.to_string()));
        }

        // Return success result with filtered files as JSON, including token usage
        let summary = format!("Found {} files", filtered_files.len());

        let result = JobProcessResult::success(
            job.id.clone(),
            JobResultData::Json(json!({
                "files": filtered_files,
                "count": filtered_files.len(),
                "summary": summary
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
        .with_actual_cost(actual_cost);

        Ok(result)
    }
}
