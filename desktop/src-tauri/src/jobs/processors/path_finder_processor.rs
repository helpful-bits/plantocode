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
    DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS,
    DEFAULT_PATH_FINDER_MAX_FILES_WITH_CONTENT,
    PATH_FINDER_MAX_CONTENT_SIZE_PER_FILE,
    PATH_FINDER_FILE_CONTENT_TRUNCATION_CHARS,
    EXCLUDED_DIRS_FOR_SCAN
};
use crate::config;
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, PathFinderPayload};
use crate::jobs::processors::path_finder_types::{PathFinderResult, PathFinderOptions};
use crate::models::{BackgroundJob, JobStatus, OpenRouterRequestMessage, OpenRouterContent};
use crate::prompts::path_finder::{
    generate_path_finder_prompt, 
    generate_path_finder_system_prompt,
    generate_path_finder_prompt_with_contents
};
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
            .unwrap_or(crate::constants::DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS);
        
        // Use the value from options if specified, otherwise use the config/constant value
        if options.include_file_contents.unwrap_or(include_file_contents) {
            // Process explicitly included files
            if let Some(included_files) = &options.included_files {
                info!("Processing explicitly included files for content extraction");
                // Get max_content_size from config, use constant if not found
                let max_content_size = config::get_path_finder_max_content_size_per_file_async(&app_handle).await
                    .unwrap_or(crate::constants::PATH_FINDER_MAX_CONTENT_SIZE_PER_FILE);
                
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
            // Get max_files_with_content from config, use constant if not found
            let config_max_files = config::get_path_finder_max_files_with_content_async(&app_handle).await
                .unwrap_or(crate::constants::DEFAULT_PATH_FINDER_MAX_FILES_WITH_CONTENT);
            // Use the value from options if specified, otherwise use the config/constant value
            let max_files_with_content = options.max_files_with_content.unwrap_or(config_max_files);
            if relevant_file_contents.len() < max_files_with_content {
                if let Some(priority_file_types) = &options.priority_file_types {
                    info!("Processing priority file types for content extraction");
                    let remaining_slots = max_files_with_content - relevant_file_contents.len();
                    
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
                                let truncated_content = if content.len() > PATH_FINDER_MAX_CONTENT_SIZE_PER_FILE {
                                    format!("{} {}", 
                                        &content[0..PATH_FINDER_MAX_CONTENT_SIZE_PER_FILE], 
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
        
        // Generate system prompt
        let system_prompt = generate_path_finder_system_prompt();
        
        // Estimate tokens for the request
        let estimated_input_tokens = crate::utils::token_estimator::estimate_path_finder_tokens(
            &payload.task_description,
            &system_prompt,
            &directory_tree,
            &relevant_file_contents
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
        
        // Get values from config, use constants if not found
        let config_max_files = config::get_path_finder_max_files_with_content_async(&app_handle).await
            .unwrap_or(crate::constants::DEFAULT_PATH_FINDER_MAX_FILES_WITH_CONTENT);
        let config_truncation_chars = config::get_path_finder_file_content_truncation_chars_async(&app_handle).await
            .unwrap_or(crate::constants::PATH_FINDER_FILE_CONTENT_TRUNCATION_CHARS);
        
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
        
        // Get include_file_contents setting from config, use constant if not found
        let include_file_contents = config::get_path_finder_include_file_contents()
            .unwrap_or(crate::constants::DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS);
        
        // Create initial file contents XML if needed
        if options.include_file_contents.unwrap_or(include_file_contents) && !relevant_file_contents.is_empty() {
            info!("Including file contents in the prompt");
            file_contents_xml_str = generate_file_contents_xml(
                &relevant_file_contents, 
                max_files_with_content, 
                content_truncation_chars
            );
        }
        
        // Generate initial user prompt
        let mut user_prompt = if options.include_file_contents.unwrap_or(include_file_contents) && 
                              !relevant_file_contents.is_empty() && 
                              file_contents_xml_str != "<file_contents>\n</file_contents>" {
            generate_path_finder_prompt_with_contents(
                &task_description,
                Some(&directory_tree_content),
                Some(&file_contents_xml_str)
            )
        } else {
            generate_path_finder_prompt(&task_description, Some(&directory_tree_content))
        };
        
        // Calculate token estimates
        let system_prompt_tokens = estimate_tokens(&system_prompt);
        let mut user_prompt_tokens = estimate_tokens(&user_prompt);
        let total_estimated_tokens = system_prompt_tokens + user_prompt_tokens;
        
        // Use the max_input_tokens_for_model calculated earlier as our limit
        let max_allowable_tokens = max_input_tokens_for_model;
        
        info!("Initial token estimate: {} (system: {}, user: {}) with max allowable tokens {} for model {}", 
            total_estimated_tokens, system_prompt_tokens, user_prompt_tokens, max_allowable_tokens, effective_model);
        
        // Implement token reduction strategies if needed
        if total_estimated_tokens > max_allowable_tokens {
            warn!("Estimated token count ({}) exceeds maximum allowable tokens ({}) for model {}, applying reduction strategies", 
                total_estimated_tokens, max_allowable_tokens, effective_model);
            
            // Strategy 1: Reduce number of files with content
            // Get include_file_contents setting from config or constant
            let include_file_contents = config::get_path_finder_include_file_contents()
                .unwrap_or(DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS);
                
            if options.include_file_contents.unwrap_or(include_file_contents) && 
               !relevant_file_contents.is_empty() && max_files_with_content > 1 {
                let original_max_files = max_files_with_content;
                max_files_with_content = max_files_with_content.max(2) / 2; // Reduce by half, but minimum 1
                
                warn!("Job {}: Reducing max files with content from {} to {} to fit token limit", 
                    payload.background_job_id, original_max_files, max_files_with_content);
                
                file_contents_xml_str = generate_file_contents_xml(
                    &relevant_file_contents, 
                    max_files_with_content, 
                    content_truncation_chars
                );
                
                // Get include_file_contents setting from config or constant
                let include_file_contents = config::get_path_finder_include_file_contents()
                    .unwrap_or(DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS);
                    
                user_prompt = if options.include_file_contents.unwrap_or(include_file_contents) && 
                                  file_contents_xml_str != "<file_contents>\n</file_contents>" {
                    generate_path_finder_prompt_with_contents(
                        &task_description,
                        Some(&directory_tree_content),
                        Some(&file_contents_xml_str)
                    )
                } else {
                    generate_path_finder_prompt(&task_description, Some(&directory_tree_content))
                };
                
                user_prompt_tokens = estimate_tokens(&user_prompt);
                let new_total_tokens = system_prompt_tokens + user_prompt_tokens;
                
                info!("After reducing max files: {} tokens", new_total_tokens);
                
                // If still too large, proceed to next strategy
                if new_total_tokens <= max_allowable_tokens {
                    // Successfully reduced within limits
                    info!("Successfully reduced tokens by limiting files with content");
                } else {
                    // Strategy 2: Reduce individual file content length
                    let original_char_limit = content_truncation_chars;
                    content_truncation_chars = content_truncation_chars / 2;
                    
                    warn!("Job {}: Reducing file content truncation from {} to {} chars to fit token limit", 
                        payload.background_job_id, original_char_limit, content_truncation_chars);
                    
                    file_contents_xml_str = generate_file_contents_xml(
                        &relevant_file_contents, 
                        max_files_with_content, 
                        content_truncation_chars
                    );
                    
                    // Get include_file_contents setting from config or constant
                    let include_file_contents = config::get_path_finder_include_file_contents()
                        .unwrap_or(DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS);
                        
                    user_prompt = if options.include_file_contents.unwrap_or(include_file_contents) && 
                                      file_contents_xml_str != "<file_contents>\n</file_contents>" {
                        generate_path_finder_prompt_with_contents(
                            &task_description,
                            Some(&directory_tree_content),
                            Some(&file_contents_xml_str)
                        )
                    } else {
                        generate_path_finder_prompt(&task_description, Some(&directory_tree_content))
                    };
                    
                    user_prompt_tokens = estimate_tokens(&user_prompt);
                    let new_total_tokens = system_prompt_tokens + user_prompt_tokens;
                    
                    info!("After reducing file content length: {} tokens", new_total_tokens);
                    
                    // If still too large, proceed to next strategy
                    if new_total_tokens <= max_allowable_tokens {
                        // Successfully reduced within limits
                        info!("Successfully reduced tokens by truncating file contents");
                    } else {
                        // Strategy 3: Truncate directory tree
                        warn!("Job {}: Truncating directory tree to max {} lines to fit token limit", 
                            payload.background_job_id, PATH_FINDER_MAX_DIR_TREE_LINES);
                        
                        let dir_tree_lines: Vec<&str> = directory_tree_content.lines().collect();
                        let truncated_line_count = dir_tree_lines.len().min(PATH_FINDER_MAX_DIR_TREE_LINES);
                        directory_tree_content = dir_tree_lines.into_iter()
                            .take(truncated_line_count)
                            .collect::<Vec<_>>()
                            .join("\n");
                        
                        user_prompt = if file_contents_xml_str != "<file_contents>\n</file_contents>" {
                            generate_path_finder_prompt_with_contents(
                                &task_description,
                                Some(&directory_tree_content),
                                Some(&file_contents_xml_str)
                            )
                        } else {
                            generate_path_finder_prompt(&task_description, Some(&directory_tree_content))
                        };
                        
                        user_prompt_tokens = estimate_tokens(&user_prompt);
                        let new_total_tokens = system_prompt_tokens + user_prompt_tokens;
                        
                        info!("After truncating directory tree: {} tokens", new_total_tokens);
                        
                        // Last resort: Truncate task description
                        if new_total_tokens > max_allowable_tokens {
                            warn!("Job {}: Last resort - Truncating task description to fit token limit", 
                                payload.background_job_id);
                            
                            // Calculate how many tokens we need to remove
                            let excess_tokens = new_total_tokens - max_allowable_tokens;
                            // Rough estimate of chars to remove based on CHARS_PER_TOKEN
                            let chars_to_remove = (excess_tokens as f32 * 4.0).ceil() as usize;
                            
                            if chars_to_remove < task_description.len() {
                                task_description = task_description[..task_description.len() - chars_to_remove].to_string();
                                task_description.push_str("\n... [Task description truncated due to token limits]");
                                
                                // Get include_file_contents setting from config or constant
                                let include_file_contents = config::get_path_finder_include_file_contents()
                                    .unwrap_or(DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS);
                                    
                                user_prompt = if options.include_file_contents.unwrap_or(include_file_contents) && 
                                                  file_contents_xml_str != "<file_contents>\n</file_contents>" {
                                    generate_path_finder_prompt_with_contents(
                                        &task_description,
                                        Some(&directory_tree_content),
                                        Some(&file_contents_xml_str)
                                    )
                                } else {
                                    generate_path_finder_prompt(&task_description, Some(&directory_tree_content))
                                };
                                
                                user_prompt_tokens = estimate_tokens(&user_prompt);
                                let final_total_tokens = system_prompt_tokens + user_prompt_tokens;
                                
                                info!("After truncating task description: {} tokens", final_total_tokens);
                                if final_total_tokens > max_allowable_tokens {
                                    warn!("Job {}: Even after all reduction strategies, token count ({}) exceeds maximum ({})",
                                        payload.background_job_id, final_total_tokens, max_allowable_tokens);
                                }
                            }
                        }
                    }
                }
            } else {
                // Skip to directory tree truncation if no file contents to reduce
                warn!("Job {}: Truncating directory tree to max {} lines (no file contents to reduce)", 
                    payload.background_job_id, PATH_FINDER_MAX_DIR_TREE_LINES);
                
                let dir_tree_lines: Vec<&str> = directory_tree_content.lines().collect();
                let truncated_line_count = dir_tree_lines.len().min(PATH_FINDER_MAX_DIR_TREE_LINES);
                directory_tree_content = dir_tree_lines.into_iter()
                    .take(truncated_line_count)
                    .collect::<Vec<_>>()
                    .join("\n");
                
                user_prompt = generate_path_finder_prompt(&task_description, Some(&directory_tree_content));
                user_prompt_tokens = estimate_tokens(&user_prompt);
                
                let new_total_tokens = system_prompt_tokens + user_prompt_tokens;
                info!("After truncating directory tree: {} tokens", new_total_tokens);
                
                // Last resort: Truncate task description
                if new_total_tokens > max_allowable_tokens {
                    warn!("Job {}: Last resort - Truncating task description (no file contents to reduce)", 
                        payload.background_job_id);
                    
                    // Calculate how many tokens we need to remove
                    let excess_tokens = new_total_tokens - max_allowable_tokens;
                    // Rough estimate of chars to remove based on CHARS_PER_TOKEN
                    let chars_to_remove = (excess_tokens as f32 * 4.0).ceil() as usize;
                    
                    if chars_to_remove < task_description.len() {
                        task_description = task_description[..task_description.len() - chars_to_remove].to_string();
                        task_description.push_str("\n... [Task description truncated due to token limits]");
                        
                        user_prompt = generate_path_finder_prompt(&task_description, Some(&directory_tree_content));
                        user_prompt_tokens = estimate_tokens(&user_prompt);
                        let final_total_tokens = system_prompt_tokens + user_prompt_tokens;
                        
                        info!("After truncating task description: {} tokens", final_total_tokens);
                        if final_total_tokens > max_allowable_tokens {
                            warn!("Job {}: Even after all reduction strategies, token count ({}) exceeds maximum ({})",
                                payload.background_job_id, final_total_tokens, max_allowable_tokens);
                        }
                    }
                }
            }
        }
        
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
        
        // Update the job
        repo.update_job(&db_job).await?;
        
        // Return success result with human-readable display
        Ok(JobProcessResult::success(payload.background_job_id.clone(), paths_list_display))
    }
}