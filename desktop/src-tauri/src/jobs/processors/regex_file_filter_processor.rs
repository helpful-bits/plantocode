use fancy_regex::Regex;
use futures::{StreamExt, stream};
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tokio::fs as tokio_fs;
use tokio::task::{self, spawn_blocking};
use tokio::time::timeout;
use tokio::time::{Duration, Instant, sleep};

use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::processors::{LlmPromptContext, LlmTaskConfigBuilder, LlmTaskRunner};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData, PatternGroup};
use crate::utils::directory_tree::get_directory_tree_with_defaults;
use crate::utils::git_utils;
use crate::utils::markdown_utils::extract_json_from_markdown;
use crate::utils::path_utils::to_forward_slashes;

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

    /// Sanitize and fix common regex issues before compilation
    fn sanitize_regex_pattern(&self, pattern: &str) -> String {
        let mut sanitized = pattern.to_string();

        // Fix common invalid escape sequences
        // Replace invalid escapes like \s, \d when they appear as literal strings from LLM
        sanitized = sanitized.replace(r"\\s", r"\s");
        sanitized = sanitized.replace(r"\\d", r"\d");
        sanitized = sanitized.replace(r"\\w", r"\w");
        sanitized = sanitized.replace(r"\\b", r"\b");
        sanitized = sanitized.replace(r"\\n", r"\n");
        sanitized = sanitized.replace(r"\\t", r"\t");
        sanitized = sanitized.replace(r"\\r", r"\r");

        // Fix double-escaped special characters
        sanitized = sanitized.replace(r"\\\\", r"\\");

        // Fix invalid escapes at specific positions (e.g., line 7 column 64 from error)
        // Check for unescaped special characters that should be escaped
        sanitized = self.escape_special_chars(&sanitized);

        sanitized
    }

    /// Escape special regex characters that might be intended as literals
    fn escape_special_chars(&self, pattern: &str) -> String {
        let mut result = String::new();
        let chars: Vec<char> = pattern.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            let ch = chars[i];

            // If we encounter a backslash, check what follows
            if ch == '\\' && i + 1 < chars.len() {
                let next = chars[i + 1];

                // Valid escape sequences we want to preserve
                if "sdwbSntrfvxuAZzGBDWS.*+?()[]{}^$|\\nrt".contains(next) {
                    result.push(ch);
                    result.push(next);
                    i += 2;
                } else {
                    // Invalid escape sequence, escape the backslash itself
                    result.push_str("\\\\");
                    i += 1;
                }
            } else {
                result.push(ch);
                i += 1;
            }
        }

        result
    }

    /// Compile regex pattern with validation (now supports lookahead/lookbehind)
    fn compile_regex(&self, pattern: &str) -> AppResult<Regex> {
        // First sanitize the pattern
        let sanitized = self.sanitize_regex_pattern(pattern);

        // Try to compile the sanitized pattern
        match Regex::new(&sanitized) {
            Ok(regex) => {
                if sanitized != pattern {
                    debug!(
                        "Successfully compiled sanitized regex pattern. Original: '{}', Sanitized: '{}'",
                        pattern, sanitized
                    );
                } else {
                    debug!(
                        "Successfully compiled regex pattern (with fancy features): {}",
                        pattern
                    );
                }
                Ok(regex)
            }
            Err(e) => {
                error!("Invalid regex pattern '{}': {}", sanitized, e);
                Err(AppError::JobError(format!(
                    "Invalid regex pattern '{}': {}",
                    sanitized, e
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
                    debug!(
                        "Skipping binary file for pattern matching: {}",
                        absolute_file_path
                    );
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
                                debug!(
                                    "Regex matching error for file {}: {}",
                                    absolute_file_path, e
                                );
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
                // Normalize path separators to forward slashes for cross-platform regex matching
                if let Some(ref path_regex) = path_regex {
                    let normalized_path = to_forward_slashes(&file_path);
                    // fancy-regex returns Result, handle potential errors
                    path_matches = match path_regex.is_match(&normalized_path) {
                        Ok(matches) => matches,
                        Err(e) => {
                            debug!("Path regex matching error for {}: {}", file_path, e);
                            false
                        }
                    };
                }

                // Check content pattern (if specified) - file_path is already absolute
                if let Some(ref content_regex) = content_regex {
                    content_matches =
                        Self::file_content_matches_pattern_static(&file_path, content_regex).await;
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

        // Apply negative path filtering (normalize separators for cross-platform matching)
        let negative_filtered = if let Some(ref neg_path_regex) = compiled_group.negative_path_regex
        {
            let excluded_count = positive_matches
                .iter()
                .filter(|file_path| {
                    let normalized = to_forward_slashes(file_path);
                    neg_path_regex.is_match(&normalized).unwrap_or(false)
                })
                .count();
            let filtered: Vec<String> = positive_matches
                .into_iter()
                .filter(|file_path| {
                    let normalized = to_forward_slashes(&file_path);
                    !neg_path_regex.is_match(&normalized).unwrap_or(false)
                })
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
            JobPayload::RegexFileFilter(p) => {
                (p.task_description.clone(), p.root_directories.clone())
            }
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

        // Get model settings using project-aware configuration
        let model_settings =
            job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;

        job_processor_utils::log_job_start(&job.id, "parallel regex pattern generation");

        let root_concurrency: usize = 3;
        info!(
            "RegexFileFilter: per-root concurrency limit={}",
            root_concurrency
        );

        let project_dir = session.project_directory.clone();
        let selected_roots = roots.clone();

        let root_results = stream::iter(selected_roots.into_iter().enumerate())
            .map(|(index, root_dir)| {
                let task_description_clone = task_description_for_prompt.clone();
                let model_used_clone = model_used.clone();
                let app_handle_clone = app_handle.clone();
                let job_clone = job.clone();
                let settings_repo_clone = settings_repo.clone();
                let project_dir_clone = project_dir.clone();
                let total_roots = roots.len();

                async move {
                    let start_time = Instant::now();
                    info!("Processing root {} of {}: {}", index + 1, total_roots, root_dir);

                    // Generate directory tree for this specific root
                    let directory_tree = match crate::utils::directory_tree::get_directory_tree_with_defaults(&root_dir).await {
                        Ok(tree) => tree,
                        Err(e) => {
                            error!("Failed to generate directory tree for root {}: {}", root_dir, e);
                            return Err(AppError::JobError(format!("Failed to generate directory tree for {}: {}", root_dir, e)));
                        }
                    };

                    // Setup LLM task configuration for this root
                    let llm_config = LlmTaskConfigBuilder::new(model_used_clone, temperature, max_output_tokens)
                        .stream(false)
                        .build();

                    // Create LLM task runner for this root
                    let task_runner = LlmTaskRunner::new(app_handle_clone, job_clone, llm_config);

                    // Create LLM prompt context with THIS root's directory tree
                    let llm_context = LlmPromptContext {
                        task_description: task_description_clone,
                        file_contents: None,
                        directory_tree: Some(directory_tree),
                    };

                    // Execute LLM call for this specific root
                    let llm_result = task_runner
                        .execute_llm_task(llm_context, &settings_repo_clone)
                        .await
                        .map_err(|e| {
                            error!("LLM task failed for root {}: {}", root_dir, e);
                            AppError::JobError(format!("LLM task failed for {}: {}", root_dir, e))
                        })?;

                    // Extract JSON from markdown code blocks (Claude Sonnet 4.5 wraps JSON in ```json...```)
                    let cleaned_response = extract_json_from_markdown(&llm_result.response);

                    // Parse the response with better error handling
                    let parsed_json: serde_json::Value = match serde_json::from_str(&cleaned_response) {
                        Ok(json) => json,
                        Err(e) => {
                            error!("Failed to parse LLM response for root {}: {}. Response: {}", root_dir, e, llm_result.response);
                            warn!("Returning empty pattern groups for root {} due to parse error", root_dir);
                            return Ok((root_dir, vec![], llm_result.usage, Vec::new()));
                        }
                    };

                    // Extract pattern groups with robust error handling
                    let pattern_groups: Vec<PatternGroup> = if let Some(groups_array) = parsed_json.get("patternGroups").and_then(|v| v.as_array()) {
                        groups_array
                            .iter()
                            .filter_map(|group_json| {
                                match serde_json::from_value::<PatternGroup>(group_json.clone()) {
                                    Ok(pattern) => Some(pattern),
                                    Err(e) => {
                                        warn!("Failed to parse pattern group for root {}: {}. JSON: {:?}", root_dir, e, group_json);
                                        None
                                    }
                                }
                            })
                            .collect()
                    } else {
                        warn!("No 'patternGroups' field found in LLM response for root: {}", root_dir);
                        vec![]
                    };

                    if pattern_groups.is_empty() {
                        warn!("No pattern groups generated for root: {}. This may be due to parsing errors or empty LLM response.", root_dir);
                        let elapsed = start_time.elapsed();
                        info!("Completed root {} in {:?}", root_dir, elapsed);
                        return Ok((root_dir, pattern_groups, llm_result.usage, Vec::new()));
                    }

                    // Compile pattern groups for this root with detailed error logging
                    let compiled_groups: Vec<CompiledPatternGroup> = pattern_groups
                        .iter()
                        .filter_map(|group| {
                            match self.compile_pattern_group(group) {
                                Ok(compiled) => Some(compiled),
                                Err(e) => {
                                    warn!("Failed to compile pattern group '{}' for root {}: {}. Skipping this group.", group.title, root_dir, e);
                                    if let Some(ref pattern) = group.path_pattern {
                                        debug!("  Problematic path_pattern: {}", pattern);
                                    }
                                    if let Some(ref pattern) = group.content_pattern {
                                        debug!("  Problematic content_pattern: {}", pattern);
                                    }
                                    if let Some(ref pattern) = group.negative_path_pattern {
                                        debug!("  Problematic negative_path_pattern: {}", pattern);
                                    }
                                    None
                                }
                            }
                        })
                        .collect();

                    if compiled_groups.is_empty() && !pattern_groups.is_empty() {
                        warn!("All pattern groups failed to compile for root: {}", root_dir);
                        let elapsed = start_time.elapsed();
                        info!("Completed root {} in {:?}", root_dir, elapsed);
                        return Ok((root_dir, pattern_groups, llm_result.usage, Vec::new()));
                    }

                    // Get files for THIS specific root directory using spawn_blocking
                    let root_dir_for_blocking = root_dir.clone();
                    let all_files_result = spawn_blocking(move || {
                        let root_path = std::path::Path::new(&root_dir_for_blocking);
                        if !root_path.is_dir() {
                            warn!("Root directory does not exist: {}", root_dir_for_blocking);
                            return Ok::<Vec<String>, AppError>(vec![]);
                        }

                        // Find the git repository root for this directory
                        let git_root = {
                            let mut current = root_path;
                            loop {
                                if git_utils::is_git_repository(current) {
                                    break current;
                                }
                                if let Some(parent) = current.parent() {
                                    current = parent;
                                } else {
                                    break root_path;
                                }
                            }
                        };

                        // Get all non-ignored files from the git repository
                        let all_git_files = match git_utils::get_all_non_ignored_files(git_root) {
                            Ok((files, _)) => files,
                            Err(e) => {
                                warn!("Failed to get git files for root {}: {}", root_dir_for_blocking, e);
                                return Ok(vec![]);
                            }
                        };

                        // Filter to only files under this specific root directory
                        let mut root_files: Vec<String> = Vec::new();
                        for rel_path in &all_git_files {
                            let abs_path = git_root.join(rel_path);
                            if abs_path.starts_with(root_path) && abs_path.is_file() {
                                root_files.push(abs_path.to_string_lossy().to_string());
                            }
                        }

                        Ok(root_files)
                    }).await;

                    let all_files = match all_files_result {
                        Ok(Ok(files)) => files,
                        Ok(Err(e)) => {
                            error!("Failed to get files for root {}: {}", root_dir, e);
                            let elapsed = start_time.elapsed();
                            info!("Completed root {} in {:?}", root_dir, elapsed);
                            return Err(e);
                        }
                        Err(e) => {
                            error!("spawn_blocking failed for root {}: {}", root_dir, e);
                            let elapsed = start_time.elapsed();
                            info!("Completed root {} in {:?}", root_dir, elapsed);
                            return Err(AppError::JobError(format!("spawn_blocking failed: {}", e)));
                        }
                    };

                    debug!("Enumerated {} files in root {}", all_files.len(), root_dir);

                    // Apply patterns to files from this root
                    let mut root_matches = Vec::new();
                    for compiled_group in &compiled_groups {
                        let matches = match timeout(Duration::from_secs(10), self.process_pattern_group(&compiled_group, &all_files)).await {
                            Ok(group_matches) => group_matches,
                            Err(_) => {
                                warn!("Pattern group '{}' timed out for root {}", compiled_group.title, root_dir);
                                vec![]
                            }
                        };
                        root_matches.extend(matches);
                    }

                    // Normalize paths relative to project directory (always use forward slashes for consistency)
                    let mut normalized_matches = Vec::new();
                    let mut absolute_paths_kept = 0;

                    for file_path in root_matches {
                        let normalized = if let (Ok(project_path), Ok(file_path_buf)) = (
                            std::path::Path::new(&project_dir_clone).canonicalize(),
                            std::path::Path::new(&file_path).canonicalize()
                        ) {
                            if let Ok(relative) = file_path_buf.strip_prefix(&project_path) {
                                to_forward_slashes(&relative.to_string_lossy())
                            } else {
                                absolute_paths_kept += 1;
                                to_forward_slashes(&file_path)
                            }
                        } else {
                            absolute_paths_kept += 1;
                            to_forward_slashes(&file_path)
                        };
                        normalized_matches.push(normalized);
                    }

                    info!("Root {} matched {} files, absolute paths kept: {}", root_dir, normalized_matches.len(), absolute_paths_kept);

                    let elapsed = start_time.elapsed();
                    info!("Completed root {} in {:?}", root_dir, elapsed);

                    Ok((root_dir, pattern_groups, llm_result.usage, normalized_matches))
                }
            })
            .buffer_unordered(root_concurrency)
            .collect::<Vec<_>>()
            .await;

        // Process results and combine files from all roots
        let mut all_filtered_files = HashSet::new();
        let mut total_prompt_tokens = 0u32;
        let mut total_completion_tokens = 0u32;
        let mut total_cost = 0.0f64;
        let mut all_pattern_groups: Vec<PatternGroup> = Vec::new();

        for result in root_results {
            match result {
                Ok((root_dir, pattern_groups, usage, normalized_matches)) => {
                    info!(
                        "Root {} returned {} pattern groups",
                        root_dir,
                        pattern_groups.len()
                    );

                    // Collect pattern groups for inclusion in result
                    all_pattern_groups.extend(pattern_groups);

                    // Update token usage
                    if let Some(usage) = usage {
                        total_prompt_tokens += usage.prompt_tokens as u32;
                        total_completion_tokens += usage.completion_tokens as u32;
                        if let Some(cost) = usage.cost {
                            total_cost += cost;
                        }
                    }

                    // Add normalized matches to the overall set
                    for file in normalized_matches {
                        all_filtered_files.insert(file);
                    }
                }
                Err(e) => {
                    error!(
                        "Task failed for root: {:?}. Continuing with other roots.",
                        e
                    );
                }
            }
        }

        let filtered_files: Vec<String> = all_filtered_files.into_iter().collect();

        info!("Total normalized matches: {}", filtered_files.len());

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
                    "isEmptyResult": true,
                    "patternGroups": all_pattern_groups
                })),
            )
            .with_tokens(Some(total_prompt_tokens), Some(total_completion_tokens))
            .with_actual_cost(total_cost);

            return Ok(result);
        }

        // Return success result with filtered files as JSON, including token usage and pattern groups
        let summary = format!("Found {} files", filtered_files.len());

        let result = JobProcessResult::success(
            job.id.clone(),
            JobResultData::Json(json!({
                "files": filtered_files,
                "count": filtered_files.len(),
                "summary": summary,
                "patternGroups": all_pattern_groups
            })),
        )
        .with_tokens(Some(total_prompt_tokens), Some(total_completion_tokens))
        .with_actual_cost(total_cost);

        Ok(result)
    }
}
