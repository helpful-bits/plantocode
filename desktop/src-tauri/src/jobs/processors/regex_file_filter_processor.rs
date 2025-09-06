use futures::{StreamExt, stream};
use log::{debug, error, info};
use fancy_regex::Regex;
use tokio::time::timeout;
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

    /// Compile regex pattern with validation (now supports lookahead/lookbehind)
    fn compile_regex(&self, pattern: &str) -> AppResult<Regex> {
        match Regex::new(pattern) {
            Ok(regex) => {
                debug!("Successfully compiled regex pattern (with fancy features): {}", pattern);
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
        absolute_file_path: &str,
        content_regex: &Regex,
    ) -> bool {
        match tokio_fs::read(absolute_file_path).await {
            Ok(bytes) => {
                // If file is >50MB, treat as binary automatically
                if bytes.len() > 50 * 1024 * 1024 {
                    debug!(
                        "Skipping large file (>50MB) for pattern matching: {}",
                        absolute_file_path
                    );
                    return false;
                }

                // Check for binary files by looking for null bytes in first 8192 bytes
                let check_size = std::cmp::min(bytes.len(), 8192);
                if bytes[..check_size].contains(&0) {
                    debug!("Skipping binary file for pattern matching: {}", absolute_file_path);
                    return false;
                }

                // Additional check for UTF-8 validity
                match std::str::from_utf8(&bytes[..check_size]) {
                    Ok(_) => {
                        // Valid UTF-8, proceed with pattern matching
                        let content = String::from_utf8_lossy(&bytes);
                        // fancy-regex returns Result, handle potential errors
                        match content_regex.is_match(&content) {
                            Ok(matches) => matches,
                            Err(e) => {
                                debug!("Regex matching error for file {}: {}", absolute_file_path, e);
                                false
                            }
                        }
                    }
                    Err(_) => {
                        debug!(
                            "Skipping non-UTF-8 file for pattern matching: {}",
                            absolute_file_path
                        );
                        false
                    }
                }
            }
            Err(_) => {
                debug!(
                    "Could not read file content for pattern matching: {}",
                    absolute_file_path
                );
                false
            }
        }
    }

    /// Process a single pattern group and return matching files with timeout protection
    async fn process_pattern_group(
        &self,
        compiled_group: &CompiledPatternGroup,
        all_files: &[String],
    ) -> Vec<String> {
        // If neither path nor content pattern is available, skip this group
        if compiled_group.path_regex.is_none() && compiled_group.content_regex.is_none() {
            return Vec::new();
        }

        // Clone the regex patterns to avoid lifetime issues in async closures
        let path_regex = compiled_group.path_regex.clone();
        let content_regex = compiled_group.content_regex.clone();

        // Apply positive filtering (BOTH path AND content must match if both are specified)
        let file_check_futures = all_files.iter().cloned().map(|file_path| {
            let path_regex = path_regex.clone();
            let content_regex = content_regex.clone();
            async move {
                // Add rate limiting to prevent filesystem overload
                sleep(Duration::from_millis(1)).await;

                let mut path_matches = true;
                let mut content_matches = true;

                // Check path pattern (if specified) - works with absolute paths
                if let Some(ref path_regex) = path_regex {
                    // fancy-regex returns Result, handle potential errors
                    path_matches = match path_regex.is_match(&file_path) {
                        Ok(matches) => matches,
                        Err(e) => {
                            debug!("Path regex matching error for {}: {}", file_path, e);
                            false
                        }
                    };
                }

                // Check content pattern (if specified) - file_path is already absolute
                if let Some(ref content_regex) = content_regex {
                    content_matches = Self::file_content_matches_pattern_static(
                        &file_path,
                        content_regex,
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
                .filter(|file_path| neg_path_regex.is_match(file_path).unwrap_or(false))
                .count();
            let filtered: Vec<String> = positive_matches
                .into_iter()
                .filter(|file_path| !neg_path_regex.is_match(file_path).unwrap_or(false))
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
        // Extract task description and root directories from workflow payload
        let (task_description_for_prompt, roots) = match &job.payload {
            JobPayload::RegexFileFilter(p) => (p.task_description.clone(), p.root_directories.clone()),
            _ => {
                return Err(AppError::JobError(
                    "Invalid payload type for RegexFileFilterProcessor".to_string(),
                ));
            }
        };

        // Guard: if payload.roots is empty, return success with empty matches
        if roots.is_empty() {
            info!("RegexFileFilter received empty roots - returning empty result");
            let result = JobProcessResult::success(
                job.id.clone(),
                JobResultData::Json(json!({
                    "files": Vec::<String>::new(),
                    "count": 0,
                    "summary": "No root directories provided",
                    "message": "No root directories were provided to search in. Please select root directories first.",
                    "isEmptyResult": true
                })),
            );
            return Ok(result);
        }

        // Setup job processing
        let (repo, session_repo, settings_repo, db_job) =
            job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Get session to access project_hash
        let session = session_repo
            .get_session_by_id(&job.session_id)
            .await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        // Generate combined directory tree for all roots
        let directory_tree_for_prompt =
            match crate::utils::directory_tree::get_combined_directory_tree_for_roots(&roots).await {
                Ok(tree) => Some(tree),
                Err(e) => {
                    error!(
                        "Failed to generate combined directory tree for roots: {}",
                        e
                    );
                    return Err(AppError::JobError(format!(
                        "Failed to generate combined directory tree: {}",
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

                // Enumerate files from all roots using absolute paths
                use crate::utils::git_utils;
                use std::collections::HashSet;
                use std::path::PathBuf;

                let mut all_absolute_files: HashSet<String> = HashSet::new();
                
                // Find the git repository root (usually the project root)
                let git_root = {
                    let mut current = std::path::Path::new(&session.project_directory);
                    loop {
                        if git_utils::is_git_repository(current) {
                            break current;
                        }
                        if let Some(parent) = current.parent() {
                            current = parent;
                        } else {
                            // Fallback to project directory if no git root found
                            break std::path::Path::new(&session.project_directory);
                        }
                    }
                };
                
                // Get ALL files from the git repository
                let all_git_files = git_utils::get_all_non_ignored_files(git_root)?;
                
                // Filter to only include files under the selected root directories
                for root in &roots {
                    let root_path = std::path::Path::new(root);
                    if !root_path.is_dir() { continue; }
                    
                    // For each file in the git repo, check if it's under this root directory
                    for rel_path in &all_git_files.0 {
                        let abs_path = git_root.join(rel_path);
                        
                        // Check if this file is under the current root directory
                        if abs_path.starts_with(root_path) && abs_path.is_file() {
                            all_absolute_files.insert(abs_path.to_string_lossy().to_string());
                        }
                    }
                }
                
                // ADDITIONALLY, always include root-level files from the project directory
                // This ensures files like package.json, Cargo.toml, README.md are always available
                let project_root = std::path::Path::new(&session.project_directory);
                let mut root_level_files_added = Vec::new();
                if project_root.is_dir() {
                    // Get all non-ignored files from the project root using git
                    if let Ok((all_git_files, _is_git)) = git_utils::get_all_non_ignored_files(project_root) {
                        // Filter to only root-level files (no path separators)
                        for rel_path in all_git_files {
                            // Check if it's a root-level file (no directory separators in path)
                            if !rel_path.to_string_lossy().contains('/') && !rel_path.to_string_lossy().contains('\\') {
                                let abs_path = project_root.join(&rel_path);
                                if abs_path.is_file() {
                                    let abs_path_str = abs_path.to_string_lossy().to_string();
                                    if all_absolute_files.insert(abs_path_str.clone()) {
                                        root_level_files_added.push(rel_path.to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                    }
                }
                
                let all_files: Vec<String> = all_absolute_files.into_iter().collect();
                
                // Debug: Print ALL collected files (newline separated)
                debug!("All files collected for regex filtering:\n{}", all_files.join("\n"));

                // Use HashSet to collect unique files across all groups (OR logic between groups)
                let mut all_matching_files = HashSet::new();

                // Process each pattern group for all files with 10-second timeout per group
                for compiled_group in &compiled_groups {
                    // Apply 10-second timeout to prevent runaway regex execution
                    let timeout_duration = Duration::from_secs(10);
                    match timeout(
                        timeout_duration,
                        self.process_pattern_group(
                            &compiled_group,
                            &all_files,
                        ),
                    )
                    .await
                    {
                        Ok(group_matches) => {
                            // Add all matches from this group to the overall set
                            for file in group_matches {
                                all_matching_files.insert(file);
                            }
                        }
                        Err(_) => {
                            error!(
                                "Pattern group '{}' timed out after 10 seconds - skipping",
                                compiled_group.title
                            );
                            // Continue with other pattern groups instead of failing entirely
                        }
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

        // Check if no files were found - this is a valid result, not an error
        if filtered_files.is_empty() {
            let message = "No files found matching the task description. The task description may be too vague or doesn't match any files in the codebase. Please provide more specific information about what you're looking for, such as:\n\n• Specific file names, directories, or patterns\n• Technology stack or programming languages involved\n• Functionality or features you want to modify\n• Error messages or specific code snippets you're working with";
            
            info!("No files found matching task description - returning empty result");
            
            // Return success with empty files array and informative message
            // This allows the workflow to handle it appropriately without treating it as a hard failure
            let result = JobProcessResult::success(
                job.id.clone(),
                JobResultData::Json(json!({
                    "files": Vec::<String>::new(),
                    "count": 0,
                    "summary": "No matching files found",
                    "message": message,
                    "isEmptyResult": true
                })),
            )
            .with_tokens(
                llm_result.usage.as_ref().map(|u| u.prompt_tokens as u32),
                llm_result
                    .usage
                    .as_ref()
                    .map(|u| u.completion_tokens as u32),
            )
            .with_system_prompt_template(system_prompt_template.clone())
            .with_actual_cost(actual_cost);
            
            return Ok(result);
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
