use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::str::FromStr;
use log::{debug, info, warn, error};
use serde_json::json;
use tauri::AppHandle;

// Note: Truncation constants removed - full content is now sent to LLM
use crate::config;
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processors::path_finder_types::{PathFinderResult, PathFinderOptions};
use crate::models::{JobStatus, TaskType};
use crate::utils::path_utils;
use crate::utils::fs_utils;
use crate::utils::token_estimator::{estimate_tokens, estimate_structured_data_tokens, estimate_code_tokens};
use crate::utils::get_timestamp;
use crate::jobs::job_processor_utils;

pub struct PathFinderProcessor;

impl PathFinderProcessor {
    pub fn new() -> Self {
        Self {}
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
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&payload.background_job_id, &app_handle).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&payload.background_job_id, "path finding");

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
                job_processor_utils::generate_directory_tree_for_context(project_directory)
                    .await.unwrap_or_else(|| "Directory tree generation failed".to_string())
            }
        } else {
            info!("Generating directory tree for project");
            job_processor_utils::generate_directory_tree_for_context(project_directory)
                .await.unwrap_or_else(|| "Directory tree generation failed".to_string())
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
                
                for file_path in included_files {
                    // Validate the path before processing
                    let validated_path = match path_utils::validate_llm_path(file_path, project_dir_path) {
                        Ok(path) => path,
                        Err(e) => {
                            warn!("Skipping invalid file path from options: {}: {}", file_path, e);
                            continue;
                        }
                    };
                    
                    let abs_path = if validated_path.is_absolute() {
                        validated_path
                    } else {
                        project_dir_path.join(validated_path)
                    };
                    
                    // Ensure the final path is still within project bounds
                    if let Err(e) = fs_utils::ensure_path_within_project(project_dir_path, &abs_path) {
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
            let config_max_files = config::get_path_finder_max_files_with_content_async(&app_handle).await
                .map_err(|e| AppError::ConfigError(format!("Failed to get path_finder max_files_with_content setting: {}. Please ensure server database is properly configured.", e)))?;
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
        
        // We'll do token management and content reduction first, then call UnifiedPromptProcessor at the end
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
        
        // Use the model from BackgroundJob (already extracted above)
        let effective_model = model_used.clone();
        
        // Get max tokens from server config
        let max_allowed_model_tokens = config::get_model_context_window(&effective_model)?;
        
        // Calculate max input tokens for model (context window minus output tokens and buffer)
        // Use the max_output_tokens from BackgroundJob (already extracted above)
        let max_output_tokens_for_calc = max_output_tokens;
        
        // Get token_limit_buffer from config - server configuration is required
        let token_limit_buffer = config::get_path_finder_token_limit_buffer_async(&app_handle).await
            .map_err(|e| AppError::ConfigError(format!("Failed to get path finder token limit buffer from server config: {}", e)))?;
            
        let max_input_tokens_for_model = max_allowed_model_tokens as i32 - max_output_tokens_for_calc as i32 - token_limit_buffer as i32;
        
        // Check estimated token count to ensure we're not over limits
        if estimated_input_tokens > max_input_tokens_for_model as u32 {
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
        
        // Initialize with values from options or config/constants
        let max_files_with_content = options.max_files_with_content.unwrap_or(config_max_files);
        
        // Function to generate file contents XML (no truncation)
        let generate_file_contents_xml = |relevant_files: &HashMap<String, String>, max_files: usize| -> String {
            let mut xml_str = String::new();
            xml_str.push_str("<file_contents>\n");
            
            let mut file_count = 0;
            for (file_path, content) in relevant_files {
                if file_count >= max_files {
                    break;
                }
                
                // Use full content - no truncation
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
                max_files_with_content
            );
        }
        
        // We'll generate the final prompt after token reduction
        // For now, estimate tokens without the actual prompts
        let initial_estimated_tokens = estimated_input_tokens;
        
        // Use the max_input_tokens_for_model calculated earlier as our limit
        let max_allowable_tokens = max_input_tokens_for_model;
        
        info!("Initial token estimate: {} with max allowable tokens {} for model {}", 
            initial_estimated_tokens, max_allowable_tokens, effective_model);
        
        // Log warning if estimated tokens exceed limits but proceed with full content
        if initial_estimated_tokens > max_allowable_tokens as u32 {
            warn!("Estimated input tokens ({}) exceeds max allowed input tokens ({}) for model {} in job {}. Proceeding with full content - API provider will handle rejection if necessary", 
                initial_estimated_tokens, max_allowable_tokens, effective_model, payload.background_job_id);
        }
        
        // Get session name for complete context
        let session_name = job_processor_utils::get_session_name(&job.session_id, &app_handle).await?;
        
        // Now generate the final prompt using the standardized helper
        info!("Generating final prompt with full content (no truncation)");
        
        let composed_prompt = job_processor_utils::build_unified_prompt(
            &job,
            &app_handle,
            final_task_description,
            None,
            if final_file_contents.is_empty() { None } else { Some(final_file_contents) },
            Some(final_directory_tree),
            &settings_repo,
            &model_used,
        ).await?;

        info!("Enhanced Path Finder prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Final estimated tokens: {}", tokens);
        }

        // Extract system and user prompts from the composed result
        let (system_prompt, user_prompt, system_prompt_id) = job_processor_utils::extract_prompts_from_composed(&composed_prompt);
        
        // Create messages for the LLM
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Get the model from the payload or config
        let model = effective_model.clone();
        
        // Create API client options using standardized helper
        let api_options = job_processor_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            false,
        )?;
        
        // Check if job has been canceled before calling the LLM
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before processing", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Call LLM using standardized helper
        info!("Calling LLM for path finding with model {}", &api_options.model);
        let llm_response = job_processor_utils::execute_llm_chat_completion(&app_handle, messages, api_options).await?;
        
        // Extract the response content
        let response_content = llm_response.choices[0].message.content.clone();
        
        // Parse paths from the LLM response using standardized utility
        let raw_paths = match job_processor_utils::parse_paths_from_text_response(&response_content, project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                error!("Failed to parse paths from response: {}", e);
                let error_msg = format!("Failed to parse paths from response: {}", e);
                
                // Update job to failed using helper
                job_processor_utils::finalize_job_failure(&payload.background_job_id, &repo, &error_msg).await?;
                
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

        // Check if job has been canceled after LLM processing using helper
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled after LLM processing", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
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
        
        // Final check if job has been canceled using helper
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} was canceled before completion", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }

        // Store simplified PathFinderResult as metadata
        let metadata_json = json!({
            "pathFinderData": serde_json::to_value(&result).unwrap_or_default()
        });
        
        // Finalize job success using helper
        job_processor_utils::finalize_job_success(
            &payload.background_job_id,
            &repo,
            &response_string,
            llm_response.usage,
            &model,
            &system_prompt_id,
            Some(metadata_json),
        ).await?;
        
        // Return success result with human-readable display
        Ok(JobProcessResult::success(payload.background_job_id.clone(), paths_list_display))
    }
}