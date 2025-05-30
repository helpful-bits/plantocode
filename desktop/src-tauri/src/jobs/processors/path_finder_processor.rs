use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use log::{debug, info, warn, error};
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::api_clients::{ApiClient, client_trait::ApiClientOptions};
use crate::constants::{
    PATH_FINDER_MAX_DIR_TREE_LINES,
    PATH_FINDER_TOKEN_LIMIT_BUFFER,
    PATH_FINDER_FILE_CONTENT_TRUNCATION_MESSAGE,
    PATH_FINDER_FILE_CONTENT_TRUNCATION_CHARS,
    EXCLUDED_DIRS_FOR_SCAN
};
use crate::config;
use crate::db_utils::{BackgroundJobRepository, SettingsRepository};
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, PathFinderPayload};
use crate::jobs::processors::path_finder_types::{PathFinderResult, PathFinderOptions};
use crate::models::{BackgroundJob, JobStatus, OpenRouterRequestMessage, OpenRouterContent, TaskType};
use crate::utils::{PromptComposer, CompositionContextBuilder};
use crate::utils::directory_tree::{generate_directory_tree, DirectoryTreeOptions};
use crate::utils::path_utils;
use crate::utils::fs_utils;
use crate::utils::token_estimator::{estimate_tokens, estimate_structured_data_tokens, estimate_code_tokens};
use crate::utils::get_timestamp;

pub struct PathFinderProcessor;

impl PathFinderProcessor {
    pub fn new() -> Self {
        Self {}
    }
    
    
    // Parse paths from simple text response (one path per line)
    fn parse_paths_from_text_response(&self, response_text: &str, project_directory: &str) -> AppResult<Vec<String>> {
        debug!("Parsing paths from text response");
        let mut paths = Vec::new();
        
        // Split by newlines and process each line
        for line in response_text.lines() {
            let line = line.trim();
            
            // Filter out empty lines or lines that are clearly not paths
            if line.is_empty() || 
               line.starts_with("//") || 
               line.starts_with("#") ||
               line.starts_with("Note:") ||
               line.starts_with("Analysis:") ||
               line.len() < 2 {
                continue;
            }
            
            // Clean the line of potential prefixes/suffixes
            let cleaned_path = line
                .trim_matches(|c| c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == '-' || c == '*')
                .trim();
            
            if cleaned_path.is_empty() {
                continue;
            }
            
            // Normalize the path and make it relative to project directory
            let normalized_path = if Path::new(cleaned_path).is_absolute() {
                match path_utils::make_relative_to(cleaned_path, project_directory) {
                    Ok(rel_path) => rel_path.to_string_lossy().to_string(),
                    Err(e) => {
                        debug!("Failed to make path relative, skipping: {} - {}", cleaned_path, e);
                        continue;
                    }
                }
            } else {
                // Normalize relative path
                let normalized = path_utils::normalize_path(cleaned_path);
                normalized.to_string_lossy().to_string()
            };
            
            paths.push(normalized_path);
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
        
        // Get dependencies from app state
        let repo_state = app_handle.state::<Arc<BackgroundJobRepository>>();
        let repo = repo_state.inner().clone();
        let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
        
        // Get the API client from factory
        let llm_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        
        // Get the background job from the repository
        let mut db_job = repo.get_job_by_id(&payload.background_job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Background job {} not found", payload.background_job_id)))?;
        
        // Update job status to running
        let timestamp = get_timestamp();
        db_job.status = "running".to_string();
        db_job.updated_at = Some(timestamp);
        db_job.start_time = Some(timestamp);
        repo.update_job(&db_job).await?;

        // Check if directory tree is provided, otherwise generate it
        let project_directory = job.project_directory.as_ref()
            .ok_or_else(|| AppError::JobError("Project directory not found in job".to_string()))?;
        let project_dir_path = Path::new(project_directory);
        
        let directory_tree = if let Some(tree) = &payload.directory_tree {
            if !tree.is_empty() {
                info!("Using provided directory tree for PathFinder");
                tree.clone()
            } else {
                info!("Generating directory tree for project");
                
                // Create tree generation options
                let tree_options = DirectoryTreeOptions {
                    max_depth: None,
                    include_ignored: false,
                    respect_gitignore: true,
                    exclude_patterns: Some(EXCLUDED_DIRS_FOR_SCAN.iter().map(|&s| s.to_string()).collect()),
                    include_files: true,
                    include_dirs: true,
                    include_hidden: false,
                };
                
                // Generate the directory tree asynchronously
                generate_directory_tree(project_dir_path, tree_options).await?
            }
        } else {
            info!("Generating directory tree for project");
            
            // Create tree generation options
            let tree_options = DirectoryTreeOptions {
                max_depth: None,
                include_ignored: false,
                respect_gitignore: true,
                exclude_patterns: Some(EXCLUDED_DIRS_FOR_SCAN.iter().map(|&s| s.to_string()).collect()),
                include_files: true,
                include_dirs: true,
                include_hidden: false,
            };
            
            // Generate the directory tree asynchronously
            generate_directory_tree(project_dir_path, tree_options).await?
        };
        
        // Use PathFinderOptions directly from payload
        let options = &payload.options;
        
        // Read file contents if specified
        let mut relevant_file_contents = HashMap::new();
        
        // Get include_file_contents from config, use constant if not found
        let include_file_contents = config::get_path_finder_include_file_contents_async(&app_handle).await
            .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder include_file_contents setting: {}. Please ensure server database is properly configured.", e)))?;
        
        // Use the value from options if specified, otherwise use the config/constant value
        if options.include_file_contents.unwrap_or(include_file_contents) {
            // Process explicitly included files
            if let Some(included_files) = &options.included_files {
                info!("Processing explicitly included files for content extraction");
                // Get max_content_size from config
                let max_content_size = config::get_path_finder_max_content_size_per_file_async(&app_handle).await
                    .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder max_content_size_per_file setting: {}. Please ensure server database is properly configured.", e)))?;
                
                for file_path in included_files {
                    let abs_path = if Path::new(file_path).is_absolute() {
                        file_path.clone()
                    } else {
                        Path::new(project_directory).join(file_path).to_string_lossy().to_string()
                    };
                    
                    // Try to read the file
                    match fs_utils::read_file_to_string(&abs_path).await {
                        Ok(content) => {
                            let truncated_content = if content.len() > max_content_size {
                                format!("{} {}", 
                                    &content[0..max_content_size], 
                                    PATH_FINDER_FILE_CONTENT_TRUNCATION_MESSAGE
                                )
                            } else {
                                content
                            };
                            relevant_file_contents.insert(file_path.clone(), truncated_content);
                        },
                        Err(e) => {
                            warn!("Failed to read file {}: {}", abs_path, e);
                        }
                    }
                }
            }
            
            // Process priority file types if still under max files limit
            // Get max_files_with_content from config
            let config_max_files = config::get_path_finder_max_files_with_content_async(&app_handle).await
                .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder max_files_with_content setting: {}. Please ensure server database is properly configured.", e)))?;
            // Use the value from options if specified, otherwise use the config/constant value
            let max_files_with_content = options.max_files_with_content.unwrap_or(config_max_files);
            if relevant_file_contents.len() < max_files_with_content {
                if let Some(priority_file_types) = &options.priority_file_types {
                    info!("Processing priority file types for content extraction");
                    let remaining_slots = max_files_with_content - relevant_file_contents.len();
                    
                    // Get max_content_size from config
                    let max_content_size_per_file = config::get_path_finder_max_content_size_per_file_async(&app_handle).await
                        .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder max_content_size_per_file setting: {}. Please ensure server database is properly configured.", e)))?;
                    
                    // Find files matching the priority types using safe project-scoped discovery
                    let matching_files = path_utils::find_project_files_by_extension(
                        project_dir_path,
                        priority_file_types,
                        remaining_slots * 2 // Get more files to sort by modification time
                    ).await?;
                    
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
                                let truncated_content = if content.len() > max_content_size_per_file {
                                    format!("{} {}", 
                                        &content[0..max_content_size_per_file], 
                                        PATH_FINDER_FILE_CONTENT_TRUNCATION_MESSAGE
                                    )
                                } else {
                                    content
                                };
                                relevant_file_contents.insert(rel_path_str, truncated_content);
                                
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
        
        // We'll do token management and content reduction first, then call PromptComposer at the end
        // Store variables for final prompt composition
        let mut final_task_description = payload.task_description.clone();
        let mut final_directory_tree = directory_tree.clone();
        let mut final_file_contents = relevant_file_contents.clone();
        
        // Estimate tokens for the request (using placeholder for system prompt)
        let estimated_input_tokens = crate::utils::token_estimator::estimate_path_finder_tokens(
            &final_task_description,
            "", // We'll get the real system prompt later
            &final_directory_tree,
            &final_file_contents
        );
        
        info!("Estimated input tokens: {}", estimated_input_tokens);
        
        // Determine the effective model to use
        // Get model for this task - get from payload override or from config
        let effective_model = match payload.model_override.as_deref() {
            Some(model) => model.to_string(),
            None => {
                let project_dir = job.project_directory.as_deref().unwrap_or("");
                match config::get_model_for_task_with_project(crate::models::TaskType::PathFinder, project_dir, &app_handle).await {
                    Ok(model) => model,
                    Err(e) => {
                        error!("Failed to get model for PathFinder task: {}", e);
                        return Err(e);
                    }
                }
            }
        };
        
        // Get max tokens from server config
        let max_allowed_model_tokens = config::get_model_context_window(&effective_model)?;
        
        // Calculate max input tokens for model (context window minus output tokens and buffer)
        // Get max tokens from payload override or from config
        let max_output_tokens = match payload.max_output_tokens {
            Some(tokens) => tokens,
            None => {
                let project_dir = job.project_directory.as_deref().unwrap_or("");
                match config::get_max_tokens_for_task_with_project(crate::models::TaskType::PathFinder, project_dir, &app_handle).await {
                    Ok(tokens) => tokens,
                    Err(e) => {
                        error!("Failed to get max tokens for PathFinder task: {}", e);
                        // When config fails, use a reasonable default
                        1000
                    }
                }
            }
        };
        
        // Get token_limit_buffer from config, use constant if not found
        let token_limit_buffer = config::get_path_finder_token_limit_buffer_async(&app_handle).await
            .unwrap_or(crate::constants::PATH_FINDER_TOKEN_LIMIT_BUFFER);
            
        let max_input_tokens_for_model = max_allowed_model_tokens - max_output_tokens - token_limit_buffer;
        
        // Check estimated token count to ensure we're not over limits
        if estimated_input_tokens > max_input_tokens_for_model {
            warn!("Estimated input tokens ({}) exceeds max allowed input tokens ({}) for model {} in job {}. Will apply reduction strategies", 
                  estimated_input_tokens, max_input_tokens_for_model, effective_model, payload.background_job_id);
        }
        
        // Start generating user prompt with file contents
        let mut task_description = payload.task_description.clone();
        let mut directory_tree_content = directory_tree.clone();
        let mut file_contents_xml_str = String::new();
        
        // Get values from config
        let config_max_files = config::get_path_finder_max_files_with_content_async(&app_handle).await
            .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder max_files_with_content setting: {}. Please ensure server database is properly configured.", e)))?;
        let config_truncation_chars = config::get_path_finder_file_content_truncation_chars_async(&app_handle).await
            .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder file_content_truncation_chars setting: {}. Please ensure server database is properly configured.", e)))?;
        
        // Initialize with values from options or config/constants
        let mut max_files_with_content = options.max_files_with_content.unwrap_or(config_max_files);
        let mut content_truncation_chars = config_truncation_chars;
        
        // Function to generate file contents XML
        let generate_file_contents_xml = |relevant_files: &HashMap<String, String>, max_files: usize, char_limit: usize| -> String {
            let mut xml_str = String::new();
            xml_str.push_str("<file_contents>\n");
            
            let mut file_count = 0;
            for (file_path, content) in relevant_files {
                if file_count >= max_files {
                    break;
                }
                
                // Truncate content if needed
                let content = if content.len() > char_limit {
                    format!("{} {}", 
                        &content[0..char_limit], 
                        crate::constants::PATH_FINDER_FILE_CONTENT_TRUNCATION_MESSAGE
                    )
                } else {
                    content.clone()
                };
                
                // Add file element with CDATA section
                xml_str.push_str(&format!(
                    "  <file path=\"{}\"><![CDATA[{}]]></file>\n", 
                    file_path, 
                    content
                ));
                
                file_count += 1;
            }
            
            xml_str.push_str("</file_contents>");
            xml_str
        };
        
        // Get include_file_contents setting from config
        let include_file_contents = config::get_path_finder_include_file_contents()
            .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder include_file_contents setting: {}. Please ensure server database is properly configured.", e)))?;
        
        // Create initial file contents XML if needed
        if options.include_file_contents.unwrap_or(include_file_contents) && !relevant_file_contents.is_empty() {
            info!("Including file contents in the prompt");
            file_contents_xml_str = generate_file_contents_xml(
                &relevant_file_contents, 
                max_files_with_content, 
                content_truncation_chars
            );
        }
        
        // We'll generate the final prompt after token reduction
        // For now, estimate tokens without the actual prompts
        let initial_estimated_tokens = estimated_input_tokens;
        
        // Use the max_input_tokens_for_model calculated earlier as our limit
        let max_allowable_tokens = max_input_tokens_for_model;
        
        info!("Initial token estimate: {} with max allowable tokens {} for model {}", 
            initial_estimated_tokens, max_allowable_tokens, effective_model);
        
        // Implement token reduction strategies if needed
        if initial_estimated_tokens > max_allowable_tokens {
            warn!("Estimated token count ({}) exceeds maximum allowable tokens ({}) for model {}, applying reduction strategies", 
                initial_estimated_tokens, max_allowable_tokens, effective_model);
            
            // Strategy 1: Reduce number of files with content
            // Get include_file_contents setting from config
            let include_file_contents = config::get_path_finder_include_file_contents()
                .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder include_file_contents setting: {}. Please ensure server database is properly configured.", e)))?;
                
            if options.include_file_contents.unwrap_or(include_file_contents) && 
               !final_file_contents.is_empty() && max_files_with_content > 1 {
                let original_max_files = max_files_with_content;
                max_files_with_content = max_files_with_content.max(2) / 2; // Reduce by half, but minimum 1
                
                warn!("Job {}: Reducing max files with content from {} to {} to fit token limit", 
                    payload.background_job_id, original_max_files, max_files_with_content);
                
                // Reduce final_file_contents to the reduced number of files
                let reduced_file_contents: std::collections::HashMap<String, String> = final_file_contents
                    .into_iter()
                    .take(max_files_with_content)
                    .collect();
                final_file_contents = reduced_file_contents;
                
                info!("Reduced file contents to {} files", final_file_contents.len());
                
                // Strategy 2: Reduce individual file content length
                let original_char_limit = content_truncation_chars;
                content_truncation_chars = content_truncation_chars / 2;
                
                warn!("Job {}: Reducing file content truncation from {} to {} chars to fit token limit", 
                    payload.background_job_id, original_char_limit, content_truncation_chars);
                
                // Truncate content in final_file_contents
                let truncated_file_contents: std::collections::HashMap<String, String> = final_file_contents
                    .into_iter()
                    .map(|(path, content)| {
                        let truncated_content = if content.len() > content_truncation_chars {
                            format!("{} {}", 
                                &content[0..content_truncation_chars], 
                                crate::constants::PATH_FINDER_FILE_CONTENT_TRUNCATION_MESSAGE
                            )
                        } else {
                            content
                        };
                        (path, truncated_content)
                    })
                    .collect();
                final_file_contents = truncated_file_contents;
                
                info!("Truncated file contents to {} chars per file", content_truncation_chars);
                
                // Strategy 3: Truncate directory tree
                warn!("Job {}: Truncating directory tree to max {} lines to fit token limit", 
                    payload.background_job_id, PATH_FINDER_MAX_DIR_TREE_LINES);
                
                let dir_tree_lines: Vec<&str> = final_directory_tree.lines().collect();
                let truncated_line_count = dir_tree_lines.len().min(PATH_FINDER_MAX_DIR_TREE_LINES);
                final_directory_tree = dir_tree_lines.into_iter()
                    .take(truncated_line_count)
                    .collect::<Vec<_>>()
                    .join("\n");
                
                info!("Truncated directory tree to {} lines", truncated_line_count);
                
                // Strategy 4: Last resort - Truncate task description
                let estimated_reduction_needed = 1000; // Rough estimate for tokens that need to be reduced
                let chars_to_remove = (estimated_reduction_needed as f32 * 4.0).ceil() as usize;
                
                if chars_to_remove < final_task_description.len() {
                    warn!("Job {}: Last resort - Truncating task description to fit token limit", 
                        payload.background_job_id);
                    
                    final_task_description = final_task_description[..final_task_description.len() - chars_to_remove].to_string();
                    final_task_description.push_str("\n... [Task description truncated due to token limits]");
                    
                    info!("Truncated task description by {} chars", chars_to_remove);
                }
            }
        } else {
            // No file contents to reduce, apply directory tree and task description reduction
            warn!("Job {}: Truncating directory tree to max {} lines (no file contents to reduce)", 
                payload.background_job_id, PATH_FINDER_MAX_DIR_TREE_LINES);
            
            let dir_tree_lines: Vec<&str> = final_directory_tree.lines().collect();
            let truncated_line_count = dir_tree_lines.len().min(PATH_FINDER_MAX_DIR_TREE_LINES);
            final_directory_tree = dir_tree_lines.into_iter()
                .take(truncated_line_count)
                .collect::<Vec<_>>()
                .join("\n");
            
            info!("Truncated directory tree to {} lines", truncated_line_count);
            
            // Also apply task description truncation as fallback
            let chars_to_remove = 1000; // Rough estimate for token reduction
            if chars_to_remove < final_task_description.len() {
                warn!("Job {}: Truncating task description (no file contents to reduce)", 
                    payload.background_job_id);
                
                final_task_description = final_task_description[..final_task_description.len() - chars_to_remove].to_string();
                final_task_description.push_str("\n... [Task description truncated due to token limits]");
                
                info!("Truncated task description by {} chars", chars_to_remove);
            }
        }
        
        // Now generate the final prompt using PromptComposer with all reductions applied
        info!("Generating final prompt with reduced content");
        
        let final_composition_context = CompositionContextBuilder::new(
            job.session_id.clone(),
            TaskType::PathFinder,
            final_task_description.clone(),
        )
        .project_directory(job.project_directory.clone())
        .codebase_structure(Some(final_directory_tree.clone()))
        .file_contents(if final_file_contents.is_empty() { None } else { Some(final_file_contents.clone()) })
        .build();

        let prompt_composer = PromptComposer::new();
        let composed_prompt = prompt_composer
            .compose_prompt(&final_composition_context, &settings_repo)
            .await?;

        info!("Enhanced Path Finder prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Final estimated tokens: {}", tokens);
        }

        // Extract system and user prompts from the composed result
        let parts: Vec<&str> = composed_prompt.final_prompt.splitn(2, "\n\n").collect();
        let system_prompt = parts.get(0).unwrap_or(&"").to_string();
        let user_prompt = parts.get(1).unwrap_or(&"").to_string();
        let system_prompt_id = composed_prompt.system_prompt_id;
        
        // All token reduction strategies have been applied to final_* variables
        
        // Create messages for the LLM
        let messages = vec![
            OpenRouterRequestMessage {
                role: "system".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: system_prompt,
                }],
            },
            OpenRouterRequestMessage {
                role: "user".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: user_prompt,
                }],
            },
        ];
        
        // Get the model from the payload or config
        let model = effective_model.clone();
        
        // Create API client options
        let api_options = ApiClientOptions {
            model: model.clone(),
            max_tokens: payload.max_output_tokens,
            temperature: Some(payload.temperature),
            stream: false,
        };
        
        // Check if job has been canceled before calling the LLM
        let job_id = &payload.background_job_id;
        let job_status = match repo.get_job_by_id(job_id).await {
            Ok(Some(job)) => crate::models::JobStatus::from_str(&job.status).unwrap_or(crate::models::JobStatus::Created),
            _ => crate::models::JobStatus::Created,
        };
        
        if job_status == crate::models::JobStatus::Canceled {
            info!("Job {} has been canceled before processing", job_id);
            return Ok(JobProcessResult::failure(job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Call LLM
        info!("Calling LLM for path finding with model {}", &model);
        let llm_response = llm_client.chat_completion(messages, api_options).await?;
        
        // Extract the response content
        let response_content = llm_response.choices[0].message.content.clone();
        
        // Parse paths from the LLM response
        let raw_paths = match self.parse_paths_from_text_response(&response_content, project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                error!("Failed to parse paths from response: {}", e);
                let error_msg = format!("Failed to parse paths from response: {}", e);
                
                // Update job to failed
                let timestamp = get_timestamp();
                let mut db_job = repo.get_job_by_id(&payload.background_job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("Background job {} not found", payload.background_job_id)))?;
                db_job.status = "failed".to_string();
                db_job.error_message = Some(error_msg.clone());
                db_job.updated_at = Some(timestamp);
                db_job.end_time = Some(timestamp);
                repo.update_job(&db_job).await?;
                
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };

        // Validate paths against the file system
        info!("Validating {} parsed paths against filesystem...", raw_paths.len());
        let mut validated_paths = Vec::new();
        let mut unverified_paths_raw = Vec::new();

        for relative_path in raw_paths {
            // Construct absolute path
            let absolute_path = Path::new(project_directory).join(&relative_path);
            
            // Check if file exists and is a file
            match tokio::fs::metadata(&absolute_path).await {
                Ok(metadata) if metadata.is_file() => {
                    validated_paths.push(relative_path);
                },
                _ => {
                    debug!("Path doesn't exist or isn't a regular file: {}", absolute_path.display());
                    unverified_paths_raw.push(relative_path);
                }
            }
        }

        // Create simplified PathFinderResult
        let mut result = PathFinderResult::new();
        result.paths = validated_paths.clone();
        result.all_files = validated_paths.clone();
        result.count = validated_paths.len();
        result.unverified_paths = unverified_paths_raw;
        
        // Build files_by_directory from validated paths
        for file_path in &validated_paths {
            let path = Path::new(file_path);
            if let Some(parent) = path.parent() {
                let parent_str = parent.to_string_lossy().to_string();
                let entry = result.files_by_directory.entry(parent_str).or_insert_with(Vec::new);
                if let Some(file_name) = path.file_name() {
                    entry.push(file_name.to_string_lossy().to_string());
                }
            } else {
                // File is in the root directory, use empty string as parent
                let entry = result.files_by_directory.entry("".to_string()).or_insert_with(Vec::new);
                entry.push(file_path.clone());
            }
        }

        // Check if job has been canceled after LLM processing
        let job_id = &payload.background_job_id;
        let job_status = match repo.get_job_by_id(job_id).await {
            Ok(Some(job)) => crate::models::JobStatus::from_str(&job.status).unwrap_or(crate::models::JobStatus::Created),
            _ => crate::models::JobStatus::Created,
        };
        
        if job_status == crate::models::JobStatus::Canceled {
            info!("Job {} has been canceled after LLM processing", job_id);
            return Ok(JobProcessResult::failure(job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Create a human-readable display of the results
        let mut paths_list_display = String::new();
        
        // Add validated files section
        if !validated_paths.is_empty() {
            paths_list_display.push_str("Validated Files:\n");
            for path in &validated_paths {
                paths_list_display.push_str(&format!("- {}\n", path));
            }
            paths_list_display.push_str("\n");
        }
        
        // Add unverified paths section
        if !result.unverified_paths.is_empty() {
            paths_list_display.push_str("Unverified or Non-existent Files Suggested by AI:\n");
            for path in &result.unverified_paths {
                paths_list_display.push_str(&format!("- {}\n", path));
            }
            paths_list_display.push_str("\n");
        }
        
        // If no results were found, show fallback message
        if validated_paths.is_empty() && result.unverified_paths.is_empty() {
            paths_list_display = "No relevant files found for this task.".to_string();
        }
        
        // Create response string with validated paths (one per line)
        let response_string = validated_paths.join("\n");
        
        // Final check if job has been canceled
        let job_id = &payload.background_job_id;
        let job_status = match repo.get_job_by_id(job_id).await {
            Ok(Some(job)) => crate::models::JobStatus::from_str(&job.status).unwrap_or(crate::models::JobStatus::Created),
            _ => crate::models::JobStatus::Created,
        };
        
        if job_status == crate::models::JobStatus::Canceled {
            info!("Job {} was canceled before completion", job_id);
            return Ok(JobProcessResult::failure(job_id.clone(), "Job was canceled by user".to_string()));
        }

        // Update the job with the results
        let timestamp = get_timestamp();
        // Re-fetch the db_job to get the latest state
        let mut db_job = repo.get_job_by_id(&payload.background_job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Background job {} not found", payload.background_job_id)))?;
        db_job.status = "completed".to_string();
        db_job.response = Some(response_string); // Store validated paths as newline-separated string
        db_job.updated_at = Some(timestamp);
        db_job.end_time = Some(timestamp);
        db_job.model_used = Some(model);
        
        // Add token usage if available
        if let Some(usage) = llm_response.usage {
            db_job.tokens_sent = Some(usage.prompt_tokens as i32);
            db_job.tokens_received = Some(usage.completion_tokens as i32);
            db_job.total_tokens = Some(usage.total_tokens as i32);
        }
        
        // Store simplified PathFinderResult as metadata
        let metadata_json = json!({
            "pathFinderData": serde_json::to_value(&result).unwrap_or_default()
        }).to_string();
        
        db_job.metadata = Some(metadata_json);
        db_job.system_prompt_id = Some(system_prompt_id);
        
        // Update the job
        repo.update_job(&db_job).await?;
        
        // Return success result with human-readable display
        Ok(JobProcessResult::success(payload.background_job_id.clone(), paths_list_display))
    }
}