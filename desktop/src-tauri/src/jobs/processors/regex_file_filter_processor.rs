use log::{debug, info, warn, error};
use serde_json::json;
use tauri::AppHandle;
use std::path::Path;
use std::fs;
use regex::Regex;
use futures::{stream, StreamExt};


use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::TaskType;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{prompt_utils, llm_api_utils};
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext, LlmTaskResult};
use crate::utils::directory_tree::get_directory_tree_with_defaults;
use crate::utils::{path_utils, git_utils};

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
            },
            Err(e) => {
                error!("Invalid regex pattern '{}': {}", pattern, e);
                Err(AppError::JobError(format!("Invalid regex pattern '{}': {}", pattern, e)))
            }
        }
    }
    
    /// Static version of file content matching for use in async closures
    async fn file_content_matches_pattern_static(file_path: &str, content_regex: &Regex, project_directory: &str) -> bool {
        let full_path = std::path::Path::new(project_directory).join(file_path);
        match crate::utils::fs_utils::read_file_to_bytes(&full_path).await {
            Ok(bytes) => {
                // Check for binary files by looking for null bytes in first 1024 bytes
                let check_size = std::cmp::min(bytes.len(), 1024);
                if bytes[..check_size].contains(&0) {
                    debug!("Skipping binary file for pattern matching: {}", file_path);
                    return false;
                }
                
                // Convert bytes to string using lossy conversion
                let content = String::from_utf8_lossy(&bytes);
                content_regex.is_match(&content)
            },
            Err(_) => {
                debug!("Could not read file content for pattern matching: {}", file_path);
                false
            }
        }
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
            JobPayload::RegexFileFilter(p) => {
                p.task_description.clone()
            }
            _ => return Err(AppError::JobError("Invalid payload type for RegexFileFilterProcessor".to_string())),
        };
        
        // Setup job processing
        let (repo, session_repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get session to access project_hash
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;
        
        // Generate directory tree using session-based utility (avoids duplicate session lookup)
        let directory_tree_for_prompt = match get_directory_tree_with_defaults(&session.project_directory).await {
            Ok(tree) => {
                info!("Generated directory tree using session-based utility for regex pattern generation ({} lines)", tree.lines().count());
                Some(tree)
            }
            Err(e) => {
                warn!("Failed to generate directory tree using session-based utility: {}. Continuing without directory context.", e);
                None
            }
        };
        
        // Get model settings using project-aware configuration
        let model_settings = job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;
        
        job_processor_utils::log_job_start(&job.id, "regex pattern generation");
        
        // Build unified prompt using standardized helper
        let composed_prompt = prompt_utils::build_unified_prompt(
            &job,
            &app_handle,
            task_description_for_prompt.clone(),
            None,
            directory_tree_for_prompt.clone(),
            &model_used,
        ).await?;

        info!("Enhanced Regex Pattern Generation prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_total_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        info!("Generating regex patterns for task: {}", &task_description_for_prompt);
        info!("Calling LLM for regex pattern generation with model {}", &model_used);
        
        // Extract system and user prompts from the already built composed_prompt
        let system_prompt = composed_prompt.system_prompt.clone();
        let user_prompt = composed_prompt.user_prompt.clone();
        let system_prompt_id = composed_prompt.system_prompt_id.clone();
        let system_prompt_template = composed_prompt.system_prompt_template.clone();
        
        // Create messages using llm_api_utils
        let messages = llm_api_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Create API options using llm_api_utils
        let api_options = llm_api_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            false,
        )?;
        
        // Execute LLM call directly using llm_api_utils
        let response = match llm_api_utils::execute_llm_chat_completion(
            &app_handle,
            messages,
            api_options,
        ).await {
            Ok(response) => response,
            Err(e) => {
                error!("Regex Pattern Generation LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        let response_text = response.choices
            .first()
            .map(|choice| choice.message.content.clone())
            .unwrap_or_default();
        
        // Create LlmTaskResult for compatibility with existing code
        let llm_result = LlmTaskResult {
            response: response_text,
            usage: response.usage,
            system_prompt_id,
            system_prompt_template,
        };
        
        info!("Regex Pattern Generation LLM task completed successfully for job {}", job.id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // Extract the response content
        let response_content = llm_result.response.clone();
        debug!("LLM response content: {}", response_content);
        
        // Attempt to parse the content as JSON
        let json_validation_result = match serde_json::from_str::<serde_json::Value>(&response_content) {
            Ok(parsed_json) => {
                debug!("Successfully parsed JSON response");
                (true, Some(parsed_json))
            },
            Err(e) => {
                warn!("Failed to parse LLM response as JSON: {}. Storing raw content.", e);
                (false, None)
            }
        };
        
        // Parse regex patterns and apply file filtering directly
        let filtered_files = if let Some(ref parsed_json) = json_validation_result.1 {
            info!("Applying generated regex patterns to filter files");
            
            // Extract patterns from JSON
            let path_pattern = parsed_json.get("pathPattern").and_then(|v| v.as_str());
            let content_pattern = parsed_json.get("contentPattern").and_then(|v| v.as_str());
            let negative_path_pattern = parsed_json.get("negativePathPattern").and_then(|v| v.as_str());
            let negative_content_pattern = parsed_json.get("negativeContentPattern").and_then(|v| v.as_str());
            
            // Validate that at least one positive pattern is provided
            if path_pattern.is_none() && content_pattern.is_none() {
                warn!("No positive patterns found in generated response. Continuing with empty file list.");
                Vec::new()
            } else {
                // Compile regex patterns
                let compiled_path_regex = if let Some(pattern) = path_pattern {
                    match self.compile_regex(pattern) {
                        Ok(regex) => Some(regex),
                        Err(e) => {
                            warn!("Failed to compile path regex pattern '{}': {}. Skipping path filtering.", pattern, e);
                            None
                        }
                    }
                } else {
                    None
                };
                
                let compiled_content_regex = if let Some(pattern) = content_pattern {
                    match self.compile_regex(pattern) {
                        Ok(regex) => Some(regex),
                        Err(e) => {
                            warn!("Failed to compile content regex pattern '{}': {}. Skipping content filtering.", pattern, e);
                            None
                        }
                    }
                } else {
                    None
                };
                
                let compiled_negative_path_regex = if let Some(pattern) = negative_path_pattern {
                    match self.compile_regex(pattern) {
                        Ok(regex) => Some(regex),
                        Err(e) => {
                            warn!("Failed to compile negative path regex pattern '{}': {}. Skipping negative path filtering.", pattern, e);
                            None
                        }
                    }
                } else {
                    None
                };
                
                let compiled_negative_content_regex = if let Some(pattern) = negative_content_pattern {
                    match self.compile_regex(pattern) {
                        Ok(regex) => Some(regex),
                        Err(e) => {
                            warn!("Failed to compile negative content regex pattern '{}': {}. Skipping negative content filtering.", pattern, e);
                            None
                        }
                    }
                } else {
                    None
                };
                
                // Get excluded paths from workflow settings
                let excluded_paths = vec![
                    ".git".to_string(),
                    "node_modules".to_string(), 
                    "target".to_string(),
                    "dist".to_string(),
                    "build".to_string()
                ];
                
                // Normalize the project directory path
                let project_path = Path::new(&session.project_directory);
                let normalized_project_dir = match fs::canonicalize(project_path) {
                    Ok(path) => path,
                    Err(e) => {
                        warn!("Failed to canonicalize project directory {}: {}. Using original path.", session.project_directory, e);
                        project_path.to_path_buf()
                    }
                };
                
                // Discover all files
                match path_utils::discover_files(&normalized_project_dir.to_string_lossy().to_string(), &excluded_paths) {
                    Ok(all_files) => {
                        info!("Discovered {} files, applying regex filters", all_files.len());
                        
                        // Apply positive filtering (path_pattern OR content_pattern)
                        let file_check_futures = all_files.into_iter().map(|file_path| {
                            let path_regex = compiled_path_regex.clone();
                            let content_regex = compiled_content_regex.clone();
                            let project_dir = session.project_directory.clone();
                            async move {
                                let mut matches_positive = false;
                                
                                // Check path pattern
                                if let Some(ref path_regex) = path_regex {
                                    if path_regex.is_match(&file_path) {
                                        matches_positive = true;
                                    }
                                }
                                
                                // Check content pattern (if no path match yet)
                                if !matches_positive {
                                    if let Some(ref content_regex) = content_regex {
                                        if Self::file_content_matches_pattern_static(&file_path, content_regex, &project_dir).await {
                                            matches_positive = true;
                                        }
                                    }
                                }
                                
                                if matches_positive {
                                    Some(file_path)
                                } else {
                                    None
                                }
                            }
                        });
                        
                        let positive_results: Vec<Option<String>> = stream::iter(file_check_futures)
                            .buffer_unordered(10)
                            .collect()
                            .await;
                        
                        let positive_matches: Vec<String> = positive_results.into_iter().filter_map(|x| x).collect();
                        
                        info!("Found {} files matching positive patterns", positive_matches.len());
                        
                        // Apply negative filtering
                        let negative_check_futures = positive_matches.into_iter().map(|file_path| {
                            let neg_path_regex = compiled_negative_path_regex.clone();
                            let neg_content_regex = compiled_negative_content_regex.clone();
                            let project_dir = session.project_directory.clone();
                            async move {
                                let mut excluded_by_negative = false;
                                
                                // Check negative path pattern
                                if let Some(ref neg_path_regex) = neg_path_regex {
                                    if neg_path_regex.is_match(&file_path) {
                                        excluded_by_negative = true;
                                    }
                                }
                                
                                // Check negative content pattern
                                if !excluded_by_negative {
                                    if let Some(ref neg_content_regex) = neg_content_regex {
                                        if Self::file_content_matches_pattern_static(&file_path, neg_content_regex, &project_dir).await {
                                            excluded_by_negative = true;
                                        }
                                    }
                                }
                                
                                if !excluded_by_negative {
                                    Some(file_path)
                                } else {
                                    None
                                }
                            }
                        });
                        
                        let negative_results: Vec<Option<String>> = stream::iter(negative_check_futures)
                            .buffer_unordered(10)
                            .collect()
                            .await;
                        
                        let final_matches: Vec<String> = negative_results.into_iter().filter_map(|x| x).collect();
                        
                        info!("Final filtered result: {} files after applying negative patterns", final_matches.len());
                        final_matches
                    },
                    Err(e) => {
                        warn!("Failed to discover files for filtering: {}. Continuing with empty file list.", e);
                        Vec::new()
                    }
                }
            }
        } else {
            warn!("Cannot apply file filtering - JSON parsing failed. Continuing with empty file list.");
            Vec::new()
        };
        
        // Create minimal metadata
        let metadata = serde_json::json!({
            "job_type": "REGEX_FILE_FILTER", 
            "workflow_stage": "RegexFileFilter",
            "fileCount": filtered_files.len()
        });
        
        // Finalize job success using task runner
        task_runner.finalize_success(
            &repo,
            &job.id,
            &llm_result,
            Some(metadata),
        ).await?;
        
        info!("RegexFileFilter completed: Generated patterns and filtered {} files", filtered_files.len());
        
        // Return success result with filtered files as JSON
        let response_json = json!({
            "filteredFiles": filtered_files
        });
        
        Ok(JobProcessResult::success(job.id.clone(), response_json.to_string()))
    }
}