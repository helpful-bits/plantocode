use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use log::{debug, info, warn, error};
use serde_json::json;
use tauri::{AppHandle, Manager};
use quick_xml::Reader;
use quick_xml::events::Event;

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
use crate::jobs::processors::path_finder_types::{PathFinderResult, PathFinderOptions, PathFinderResultFile};
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
    
    // Ensure job is visible to the user
    async fn ensure_job_visible(&self, repo: &BackgroundJobRepository, job_id: &str) -> AppResult<()> {
        // Get the current job
        if let Some(mut job) = repo.get_job_by_id(job_id).await? {
            // Set visibility flags
            job.visible = Some(true);
            job.cleared = Some(false);
            
            // Update the job
            repo.update_job(&job).await?;
        }
        
        Ok(())
    }
    
    // Parse file paths from XML response
    fn parse_path_finder_xml_response(&self, response_xml: &str, project_directory: &str) -> AppResult<PathFinderResult> {
        debug!("Parsing file paths from XML response");
        let project_dir = Path::new(project_directory);
        
        // Initialize result structure
        let mut result = PathFinderResult::new();
        
        // Parse XML response
        let mut reader = Reader::from_str(response_xml);
        reader.trim_text(true);
        
        let mut buf = Vec::new();
        let mut current_element = String::new();
        let mut in_file_element = false;
        let mut current_file_path = String::new();
        let mut current_file_relevance = String::new();
        let mut current_file_content = String::new();
        
        // Stack to track XML element hierarchy
        let mut tag_stack: Vec<String> = Vec::new();
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    
                    // Push tag to stack to track hierarchy
                    tag_stack.push(tag_name.clone());
                    
                    match tag_name.as_str() {
                        "path_finder_results" => {
                            // Root element, no special handling needed
                        },
                        "analysis" | "overview" => {
                            current_element = tag_name;
                        },
                        "primary_files" | "secondary_files" | "potential_files" => {
                            // Section start, no special handling needed
                        },
                        "file" => {
                            in_file_element = true;
                            current_file_content = String::new();
                            
                            // Extract path and relevance attributes
                            for attr in e.attributes() {
                                if let Ok(attr) = attr {
                                    let attr_name = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                                    let attr_value = String::from_utf8_lossy(&attr.value).to_string();
                                    
                                    if attr_name == "path" {
                                        current_file_path = attr_value;
                                    } else if attr_name == "relevance" {
                                        current_file_relevance = attr_value;
                                    }
                                }
                            }
                        },
                        _ => {
                            // Unknown element, ignore
                        }
                    }
                },
                Ok(Event::Text(e)) => {
                    let text = e.unescape().unwrap_or_default().to_string();
                    
                    if in_file_element {
                        current_file_content.push_str(&text);
                    } else if current_element == "analysis" {
                        result.analysis = Some(text);
                        current_element = String::new();
                    } else if current_element == "overview" {
                        result.overview = Some(text);
                        current_element = String::new();
                    }
                },
                Ok(Event::End(ref e)) => {
                    let ended_tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    
                    match ended_tag_name.as_str() {
                        "file" => {
                            in_file_element = false;
                            
                            // Normalize path - ensure all paths are relative to project_directory
                            let normalized_path = if Path::new(&current_file_path).is_absolute() {
                                // Convert absolute path to relative
                                match path_utils::make_relative_to(&current_file_path, project_directory) {
                                    Ok(rel_path) => rel_path,
                                    Err(e) => {
                                        // Log the error but continue with the normalized path
                                        // This isn't ideal but better than failing entirely
                                        log::warn!("Failed to make path relative: {}", e);
                                        // For consistency, we'll skip paths outside the project
                                        continue;
                                    }
                                }
                            } else {
                                // Path is already relative, keep it as is
                                PathBuf::from(&current_file_path)
                            };
                            
                            let file_result = PathFinderResultFile {
                                path: normalized_path.to_string_lossy().to_string(),
                                relevance: if current_file_relevance.is_empty() { None } else { Some(current_file_relevance.clone()) },
                                explanation: if current_file_content.is_empty() { None } else { Some(current_file_content.clone()) },
                            };
                            
                            // Determine parent category from tag stack
                            // The parent tag will be the second-to-last element in the stack
                            // (last element is the "file" tag that's being closed)
                            if tag_stack.len() >= 2 {
                                let parent_tag = &tag_stack[tag_stack.len() - 2];
                                
                                match parent_tag.as_str() {
                                    "primary_files" => {
                                        result.primary_files.push(file_result);
                                        result.paths.push(normalized_path.to_string_lossy().to_string());
                                    },
                                    "secondary_files" => {
                                        result.secondary_files.push(file_result);
                                        result.paths.push(normalized_path.to_string_lossy().to_string());
                                    },
                                    "potential_files" => {
                                        result.potential_files.push(file_result);
                                        result.paths.push(normalized_path.to_string_lossy().to_string());
                                    },
                                    _ => {
                                        // If we're not in a known file list, default to potential_files
                                        debug!("Unknown parent tag '{}' for file, defaulting to potential_files", parent_tag);
                                        result.potential_files.push(file_result);
                                        result.paths.push(normalized_path.to_string_lossy().to_string());
                                    }
                                }
                            } else {
                                // Something went wrong with our tag stack tracking
                                // Default to potential_files
                                debug!("Tag stack depth insufficient ({}) for determining file parent, defaulting to potential_files", tag_stack.len());
                                result.potential_files.push(file_result);
                                result.paths.push(normalized_path.to_string_lossy().to_string());
                            }
                            
                            current_file_path = String::new();
                            current_file_relevance = String::new();
                            current_file_content = String::new();
                        },
                        _ => {
                            // Other end tags, ignore
                        }
                    }
                    
                    // Pop the tag stack when any tag ends
                    if !tag_stack.is_empty() && tag_stack.last().map_or(false, |tag| tag == &ended_tag_name) {
                        tag_stack.pop();
                    }
                },
                Ok(Event::Eof) => break,
                Err(e) => {
                    warn!("Error parsing XML: {}", e);
                    // XML parsing failed, try fallback
                    return self.extract_paths_from_text_fallback(response_xml, project_directory);
                },
                _ => {}
            }
            buf.clear();
        }
        
        // If XML parsing failed to find any paths, try a fallback approach
        if result.paths.is_empty() {
            debug!("XML parsing found no files, trying fallback approach");
            return self.extract_paths_from_text_fallback(response_xml, project_directory);
        }
        
        // Organize files by directory
        for file in &result.paths {
            let path = Path::new(file);
            if let Some(parent) = path.parent() {
                let parent_str = parent.to_string_lossy().to_string();
                let entry = result.files_by_directory.entry(parent_str).or_insert_with(Vec::new);
                if let Some(file_name) = path.file_name() {
                    entry.push(file_name.to_string_lossy().to_string());
                }
            }
        }
        
        // Compile all_files list from unique paths across all categories
        let mut unique_paths = std::collections::HashSet::new();
        
        for file in &result.primary_files {
            unique_paths.insert(file.path.clone());
        }
        
        for file in &result.secondary_files {
            unique_paths.insert(file.path.clone());
        }
        
        for file in &result.potential_files {
            unique_paths.insert(file.path.clone());
        }
        
        result.all_files = unique_paths.into_iter().collect();
        result.count = result.paths.len();
        
        Ok(result)
    }
    
    // Extract paths from text as a fallback method
    fn extract_paths_from_text_fallback(&self, text: &str, project_directory: &str) -> AppResult<PathFinderResult> {
        debug!("Using text-based fallback for path extraction");
        let project_dir = Path::new(project_directory);
        
        let mut result = PathFinderResult::new();
        result.analysis = Some("Note: Structured XML parsing failed. Files were extracted using fallback text parsing.".to_string());
        
        // Extract paths from text
        let paths = self.extract_paths_from_text(text, project_dir);
        
        // Add paths to result
        for path in &paths {
            result.potential_files.push(PathFinderResultFile {
                path: path.clone(),
                relevance: Some("unknown".to_string()),
                explanation: None,
            });
        }
        
        result.paths = paths.clone();
        result.all_files = paths;
        result.count = result.paths.len();
        
        // Organize files by directory
        for file in &result.paths {
            let path = Path::new(file);
            if let Some(parent) = path.parent() {
                let parent_str = parent.to_string_lossy().to_string();
                let entry = result.files_by_directory.entry(parent_str).or_insert_with(Vec::new);
                if let Some(file_name) = path.file_name() {
                    entry.push(file_name.to_string_lossy().to_string());
                }
            }
        }
        
        Ok(result)
    }
    
    // Extract paths from a text block
    // Returns paths relative to the project directory
    fn extract_paths_from_text(&self, text: &str, project_dir: &Path) -> Vec<String> {
        let mut paths = Vec::new();
        
        // Split text into lines and process each line
        for line in text.lines() {
            let line = line.trim();
            
            // Skip empty lines and lines that don't look like file paths
            if line.is_empty() || line.starts_with("//") || line.starts_with("#") {
                continue;
            }
            
            // Check if line contains a path
            let potential_path = line.split_whitespace()
                .next()
                .unwrap_or("")
                .trim_matches(|c| c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == '-' || c == '*' || c == '.');
            
            if !potential_path.is_empty() {
                let path_to_process = if Path::new(potential_path).is_absolute() {
                    // For absolute paths, ensure they're relative to project_dir
                    match path_utils::make_relative_to(potential_path, project_dir) {
                        Ok(rel_path) => rel_path.to_string_lossy().to_string(),
                        Err(_) => {
                            // Skip paths outside project directory for consistency
                            continue;
                        }
                    }
                } else {
                    // For relative paths, keep them as is
                    potential_path.to_string()
                };
                
                paths.push(path_to_process);
            }
        }
        
        // Remove duplicates
        paths.sort();
        paths.dedup();
        
        paths
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
        
        // Ensure job is visible
        self.ensure_job_visible(&repo, &payload.background_job_id).await?;
        
        // Get the background job from the repository
        let mut db_job = repo.get_job_by_id(&payload.background_job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Background job {} not found", payload.background_job_id)))?;
        
        // Update job status to running
        let timestamp = get_timestamp();
        db_job.status = "running".to_string();
        db_job.updated_at = Some(timestamp);
        db_job.start_time = Some(timestamp);
        repo.update_job(&db_job).await?;

        // Now do pre-processing that was previously done in the command
        info!("Generating directory tree for project");
        let project_dir_path = Path::new(&payload.project_directory);
        
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
        let directory_tree = generate_directory_tree(project_dir_path, tree_options).await?;
        
        // Use PathFinderOptions directly from payload
        let options = &payload.options;
        
        // Read file contents if specified
        let mut relevant_file_contents = HashMap::new();
        
        // Get include_file_contents from config, use constant if not found
        let include_file_contents = config::get_path_finder_include_file_contents()
            .unwrap_or(crate::constants::DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS);
        
        // Use the value from options if specified, otherwise use the config/constant value
        if options.include_file_contents.unwrap_or(include_file_contents) {
            // Process explicitly included files
            if let Some(included_files) = &options.included_files {
                info!("Processing explicitly included files for content extraction");
                // Get max_content_size from config, use constant if not found
                let max_content_size = config::get_path_finder_max_content_size_per_file()
                    .unwrap_or(crate::constants::PATH_FINDER_MAX_CONTENT_SIZE_PER_FILE);
                
                for file_path in included_files {
                    let abs_path = if Path::new(file_path).is_absolute() {
                        file_path.clone()
                    } else {
                        Path::new(&payload.project_directory).join(file_path).to_string_lossy().to_string()
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
            let config_max_files = config::get_path_finder_max_files_with_content()
                .unwrap_or(crate::constants::DEFAULT_PATH_FINDER_MAX_FILES_WITH_CONTENT);
            // Use the value from options if specified, otherwise use the config/constant value
            let max_files_with_content = options.max_files_with_content.unwrap_or(config_max_files);
            if relevant_file_contents.len() < max_files_with_content {
                if let Some(priority_file_types) = &options.priority_file_types {
                    info!("Processing priority file types for content extraction");
                    let remaining_slots = max_files_with_content - relevant_file_contents.len();
                    
                    // Find files matching the priority types
                    let mut matching_files = Vec::new();
                    for extension in priority_file_types {
                        let pattern = format!("**/*.{}", extension);
                        let found_files = path_utils::find_files(project_dir_path, &pattern, Some(&EXCLUDED_DIRS_FOR_SCAN))?;
                        matching_files.extend(found_files);
                    }
                    
                    // Sort by modification time (most recent first) and take the remaining slots
                    // Note: This could be made async with a helper function if needed
                    let mut file_with_stats = Vec::new();
                    for file_path in matching_files {
                        if let Ok(metadata) = std::fs::metadata(&file_path) {
                            if let Ok(modified) = metadata.modified() {
                                file_with_stats.push((file_path, modified));
                            }
                        }
                    }
                    
                    file_with_stats.sort_by(|a, b| b.1.cmp(&a.1)); // Sort by modified time, most recent first
                    
                    // Take only the most recently modified files up to the limit
                    for (file_path, _) in file_with_stats.into_iter().take(remaining_slots) {
                        // Skip files that are already included
                        let rel_path = path_utils::make_relative_to(&*file_path.to_string_lossy(), &payload.project_directory)?;
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
            None => match config::get_model_for_task(crate::models::TaskType::PathFinder) {
                Ok(model) => model,
                Err(e) => {
                    error!("Failed to get model for PathFinder task: {}", e);
                    return Err(e);
                }
            }
        };
        
        // Get max tokens from server config
        let max_allowed_model_tokens = config::get_model_context_window(&effective_model)?;
        
        // Calculate max input tokens for model (context window minus output tokens and buffer)
        // Get max tokens from payload override or from config
        let max_output_tokens = match payload.max_output_tokens {
            Some(tokens) => tokens,
            None => match config::get_default_max_tokens_for_task(Some(crate::models::TaskType::PathFinder)) {
                Ok(tokens) => tokens,
                Err(e) => {
                    error!("Failed to get max tokens for PathFinder task: {}", e);
                    // When config fails, use a reasonable default
                    1000
                }
            }
        };
        
        // Get token_limit_buffer from config, use constant if not found
        let token_limit_buffer = config::get_path_finder_token_limit_buffer()
            .unwrap_or(crate::constants::PATH_FINDER_TOKEN_LIMIT_BUFFER);
            
        let max_input_tokens_for_model = max_allowed_model_tokens - max_output_tokens - token_limit_buffer;
        
        // Check estimated token count to ensure we're not over limits
        if estimated_input_tokens > max_input_tokens_for_model {
            warn!("Estimated input tokens ({}) exceeds max allowed input tokens ({}) for model {}, will apply reduction strategies", 
                  estimated_input_tokens, max_input_tokens_for_model, effective_model);
        }
        
        // Start generating user prompt with file contents
        let mut task_description = payload.task_description.clone();
        let mut directory_tree_content = directory_tree.clone();
        let mut file_contents_xml_str = String::new();
        
        // Get values from config, use constants if not found
        let config_max_files = config::get_path_finder_max_files_with_content()
            .unwrap_or(crate::constants::DEFAULT_PATH_FINDER_MAX_FILES_WITH_CONTENT);
        let config_truncation_chars = config::get_path_finder_file_content_truncation_chars()
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
                
                warn!("Reducing max files with content from {} to {}", original_max_files, max_files_with_content);
                
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
                    
                    warn!("Reducing file content truncation from {} to {} chars", 
                        original_char_limit, content_truncation_chars);
                    
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
                        warn!("Truncating directory tree to max {} lines", PATH_FINDER_MAX_DIR_TREE_LINES);
                        
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
                            warn!("Last resort: Truncating task description");
                            
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
                                    warn!("Even after all reduction strategies, token count ({}) exceeds maximum ({})",
                                        final_total_tokens, max_allowable_tokens);
                                }
                            }
                        }
                    }
                }
            } else {
                // Skip to directory tree truncation if no file contents to reduce
                warn!("Truncating directory tree to max {} lines", PATH_FINDER_MAX_DIR_TREE_LINES);
                
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
                    warn!("Last resort: Truncating task description");
                    
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
                            warn!("Even after all reduction strategies, token count ({}) exceeds maximum ({})",
                                final_total_tokens, max_allowable_tokens);
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
        
        // Parse response to extract file paths and structured results
        let mut result = match self.parse_path_finder_xml_response(
            &response_content,
            &payload.project_directory,
        ) {
            Ok(result_data) => result_data,
            Err(e) => {
                error!("Failed to parse file paths from response: {}", e);
                let error_msg = format!("Failed to parse file paths from response: {}", e);
                
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

        // Validate the paths against the file system
        info!("Validating suggested paths against filesystem...");
        
        // Extract valid and invalid paths from primary files
        let mut valid_primary_files = Vec::new();
        let mut unverified_paths = Vec::new();
        
        for file in result.primary_files.drain(..) {
            // Construct absolute path
            let absolute_path = if Path::new(&file.path).is_absolute() {
                file.path.clone()
            } else {
                Path::new(&payload.project_directory).join(&file.path).to_string_lossy().to_string()
            };
            
            // Check if file exists
            match tokio::fs::metadata(&absolute_path).await {
                Ok(metadata) if metadata.is_file() => {
                    // File exists and is a regular file
                    valid_primary_files.push(file);
                },
                _ => {
                    // File doesn't exist or isn't a regular file
                    debug!("Primary file doesn't exist or isn't a regular file: {}", absolute_path);
                    unverified_paths.push(file);
                }
            }
        }
        
        // Extract valid and invalid paths from secondary files
        let mut valid_secondary_files = Vec::new();
        
        for file in result.secondary_files.drain(..) {
            // Construct absolute path
            let absolute_path = if Path::new(&file.path).is_absolute() {
                file.path.clone()
            } else {
                Path::new(&payload.project_directory).join(&file.path).to_string_lossy().to_string()
            };
            
            // Check if file exists
            match tokio::fs::metadata(&absolute_path).await {
                Ok(metadata) if metadata.is_file() => {
                    // File exists and is a regular file
                    valid_secondary_files.push(file);
                },
                _ => {
                    // File doesn't exist or isn't a regular file
                    debug!("Secondary file doesn't exist or isn't a regular file: {}", absolute_path);
                    unverified_paths.push(file);
                }
            }
        }
        
        // Extract valid and invalid paths from potential files
        let mut valid_potential_files = Vec::new();
        
        for file in result.potential_files.drain(..) {
            // Construct absolute path
            let absolute_path = if Path::new(&file.path).is_absolute() {
                file.path.clone()
            } else {
                Path::new(&payload.project_directory).join(&file.path).to_string_lossy().to_string()
            };
            
            // Check if file exists
            match tokio::fs::metadata(&absolute_path).await {
                Ok(metadata) if metadata.is_file() => {
                    // File exists and is a regular file
                    valid_potential_files.push(file);
                },
                _ => {
                    // File doesn't exist or isn't a regular file
                    debug!("Potential file doesn't exist or isn't a regular file: {}", absolute_path);
                    unverified_paths.push(file);
                }
            }
        }
        
        // Update result with validated paths
        result.primary_files = valid_primary_files;
        result.secondary_files = valid_secondary_files;
        result.potential_files = valid_potential_files;
        result.unverified_paths = unverified_paths;
        
        // Rebuild paths and all_files based on validated paths
        // All paths should consistently be relative to project_directory
        let mut unique_paths = std::collections::HashSet::new();
        result.paths.clear();
        
        for file in &result.primary_files {
            // Ensure path is relative to project_directory
            result.paths.push(file.path.clone());
            unique_paths.insert(file.path.clone());
        }
        
        for file in &result.secondary_files {
            result.paths.push(file.path.clone());
            unique_paths.insert(file.path.clone());
        }
        
        for file in &result.potential_files {
            result.paths.push(file.path.clone());
            unique_paths.insert(file.path.clone());
        }
        
        result.all_files = unique_paths.into_iter().collect();
        result.count = result.paths.len();
        
        // Rebuild files_by_directory map with relative directory paths
        result.files_by_directory.clear();
        for file in &result.paths {
            let path = Path::new(file);
            if let Some(parent) = path.parent() {
                // Use the relative parent path
                let parent_str = parent.to_string_lossy().to_string();
                let entry = result.files_by_directory.entry(parent_str).or_insert_with(Vec::new);
                if let Some(file_name) = path.file_name() {
                    entry.push(file_name.to_string_lossy().to_string());
                }
            } else {
                // File is in the root directory, use empty string as parent
                let entry = result.files_by_directory.entry("".to_string()).or_insert_with(Vec::new);
                entry.push(file.clone());
            }
        }
        
        // Create a human-readable display of the results
        let mut paths_list_display = String::new();
        
        // Add analysis section if available
        if let Some(analysis) = &result.analysis {
            paths_list_display.push_str("Path Finding Analysis:\n");
            paths_list_display.push_str(analysis);
            paths_list_display.push_str("\n\n");
        }
        
        // Add primary files section
        if !result.primary_files.is_empty() {
            paths_list_display.push_str("Primary Files:\n");
            for file in &result.primary_files {
                let relevance_str = file.relevance.as_ref().map_or("", |r| r.as_str());
                let relevance_display = if !relevance_str.is_empty() {
                    format!(" (relevance: {})", relevance_str)
                } else {
                    String::new()
                };
                
                let explanation = file.explanation.as_ref().map_or("", |e| e.as_str());
                paths_list_display.push_str(&format!("- {}{}: {}\n", file.path, relevance_display, explanation));
            }
            paths_list_display.push_str("\n");
        }
        
        // Add secondary files section
        if !result.secondary_files.is_empty() {
            paths_list_display.push_str("Secondary Files:\n");
            for file in &result.secondary_files {
                let relevance_str = file.relevance.as_ref().map_or("", |r| r.as_str());
                let relevance_display = if !relevance_str.is_empty() {
                    format!(" (relevance: {})", relevance_str)
                } else {
                    String::new()
                };
                
                let explanation = file.explanation.as_ref().map_or("", |e| e.as_str());
                paths_list_display.push_str(&format!("- {}{}: {}\n", file.path, relevance_display, explanation));
            }
            paths_list_display.push_str("\n");
        }
        
        // Add potential files section
        if !result.potential_files.is_empty() {
            paths_list_display.push_str("Potential Files:\n");
            for file in &result.potential_files {
                let relevance_str = file.relevance.as_ref().map_or("", |r| r.as_str());
                let relevance_display = if !relevance_str.is_empty() {
                    format!(" (relevance: {})", relevance_str)
                } else {
                    String::new()
                };
                
                let explanation = file.explanation.as_ref().map_or("", |e| e.as_str());
                paths_list_display.push_str(&format!("- {}{}: {}\n", file.path, relevance_display, explanation));
            }
            paths_list_display.push_str("\n");
        }
        
        // Add unverified paths section
        if !result.unverified_paths.is_empty() {
            paths_list_display.push_str("Unverified or Non-existent Files Suggested by AI:\n");
            for file in &result.unverified_paths {
                let relevance_str = file.relevance.as_ref().map_or("", |r| r.as_str());
                let relevance_display = if !relevance_str.is_empty() {
                    format!(" (relevance: {})", relevance_str)
                } else {
                    String::new()
                };
                
                let explanation = file.explanation.as_ref().map_or("", |e| e.as_str());
                paths_list_display.push_str(&format!("- {}{}: {}\n", file.path, relevance_display, explanation));
            }
            paths_list_display.push_str("\n");
        }
        
        // Add overview section if available
        if let Some(overview) = &result.overview {
            paths_list_display.push_str("Overview:\n");
            paths_list_display.push_str(overview);
        }
        
        // If no structured results were found, show fallback message
        if result.all_files.is_empty() {
            paths_list_display = "No relevant files found for this task.".to_string();
        }
        
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
        db_job.response = Some(paths_list_display.clone());
        db_job.updated_at = Some(timestamp);
        db_job.end_time = Some(timestamp);
        db_job.model_used = Some(model);
        
        // Add token usage if available
        if let Some(usage) = llm_response.usage {
            db_job.tokens_sent = Some(usage.prompt_tokens as i32);
            db_job.tokens_received = Some(usage.completion_tokens as i32);
            db_job.total_tokens = Some(usage.total_tokens as i32);
        }
        
        // Merge with path finder result data
        let metadata_json = json!({
            "pathFinderData": serde_json::to_value(&result).unwrap_or_default()
        }).to_string();
        
        db_job.metadata = Some(metadata_json);
        
        // Update the job
        repo.update_job(&db_job).await?;
        
        // Return success result
        Ok(JobProcessResult::success(payload.background_job_id.clone(), paths_list_display))
    }
}