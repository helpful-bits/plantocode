use std::path::Path;
use log::{debug, info, error, warn};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, ExtendedPathFinderPayload};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{llm_api_utils, prompt_utils, fs_context_utils};
use crate::models::TaskType;
use crate::utils::directory_tree::get_directory_tree_with_defaults;

pub struct ExtendedPathFinderProcessor;

impl ExtendedPathFinderProcessor {
    pub fn new() -> Self {
        Self
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
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(
            &job.id,
            &app_handle,
        ).await?;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job.id, "Extended Path Finding");
        info!("Starting extended path finding with {} AI-filtered initial paths", 
            payload.initial_paths.len());
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Get project directory and directory tree using session-based utilities
        let project_directory = crate::utils::get_project_directory_from_session(&job.session_id, &app_handle).await?;
        let directory_tree = match crate::utils::get_directory_tree_from_session(&job.session_id, &app_handle).await {
            Ok(tree) => {
                info!("Generated directory tree using session-based utility for extended path finder ({} lines)", tree.lines().count());
                tree
            }
            Err(e) => {
                warn!("Failed to generate directory tree using session-based utility: {}. Using empty fallback.", e);
                "No directory structure available".to_string()
            }
        };
        
        // Read file contents for all initial paths to provide complete context
        let mut file_contents = std::collections::HashMap::new();
        for path in &payload.initial_paths {
            let absolute_path = Path::new(&project_directory).join(path);
            match tokio::fs::read_to_string(&absolute_path).await {
                Ok(content) => {
                    info!("Read file content for AI context: {} ({} bytes)", path, content.len());
                    file_contents.insert(path.clone(), content);
                },
                Err(e) => {
                    warn!("Failed to read file content for {}: {}", path, e);
                    // Continue without this file's content - don't fail the whole process
                }
            }
        }
        
        info!("Sending {} file contents to AI for better path finding", file_contents.len());
        
        // Build unified prompt using standardized utility
        let composed_prompt = prompt_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.task_description.clone(),
            Some(file_contents),
            Some(directory_tree.clone()),
            &settings_repo,
            &model_used,
        ).await?;

        info!("Enhanced Extended Path Finder prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        
        // Extract prompts using direct field access
        let system_prompt = composed_prompt.system_prompt.clone();
        let user_prompt = composed_prompt.user_prompt.clone();
        let system_prompt_id = composed_prompt.system_prompt_id.clone();
        
        // Add initial paths context to the user prompt
        let initial_paths_text = if payload.initial_paths.is_empty() {
            "No initial paths were found through AI relevance assessment.".to_string()
        } else {
            format!("Initial paths found through AI relevance assessment:\n{}", 
                payload.initial_paths.iter().map(|p| format!("- {}", p)).collect::<Vec<_>>().join("\n"))
        };
        
        let enhanced_user_prompt = format!(
            "The primary task is: '{}'.\nBased on prior analysis, the following files are considered highly relevant: \n{}.\n\nYour specific goal is to identify any OTHER CRITICALLY IMPORTANT files that were missed AND are directly related to or utilized by the files listed above, or are essential auxiliary files (e.g. test files, configuration for these specific files). Do NOT re-list files from the list above. Be conservative; only add files if they are truly necessary additions. Provide the additions as a JSON list like [\"path/to/new_file1.ext\"]. If no additional files are critical, return an empty list.", 
            payload.task_description, 
            initial_paths_text
        );

        // Create messages using standardized utility
        let messages = llm_api_utils::create_openrouter_messages(&system_prompt, &enhanced_user_prompt);
        
        // Create API client options using standardized utility
        let api_options = llm_api_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            false,
        )?;
        
        // Check for cancellation before LLM call using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before LLM call", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Call LLM using standardized utility
        info!("Calling LLM for extended path finding with model {}", &api_options.model);
        let api_options_clone = api_options.clone();
        let llm_response = llm_api_utils::execute_llm_chat_completion(&app_handle, messages, api_options).await?;
        
        // Extract the response content
        let response_content = llm_response.choices[0].message.content.clone();
        
        // Parse paths from the LLM response using standardized utility
        let extended_paths = match Self::parse_paths_from_text_response(&response_content, &project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to parse paths from LLM response: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using standardized utility - LLM succeeded but parsing failed
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg, None, llm_response.usage, Some(api_options_clone.model)).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // Validate extended paths found by LLM using centralized utility
        let (validated_extended_paths, unverified_extended_paths) = fs_context_utils::validate_paths_against_filesystem(
            &extended_paths, 
            &project_directory
        ).await;
        
        info!("Extended paths validation: {} valid, {} invalid paths", 
            validated_extended_paths.len(), unverified_extended_paths.len());
        
        // Combine initial paths (already validated and filtered by AI relevance assessment) with validated extended paths
        let mut combined_validated_paths = payload.initial_paths.clone();
        for path in &validated_extended_paths {
            if !combined_validated_paths.contains(path) {
                combined_validated_paths.push(path.clone());
            }
        }
        
        info!("Extended path finding completed for workflow {}: {} AI-filtered initial + {} validated = {} total verified paths", 
            job.id, payload.initial_paths.len(), validated_extended_paths.len(), combined_validated_paths.len());
        
        // Check for cancellation after LLM processing using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after LLM processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
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
            "projectDirectory": project_directory,
            "modelUsed": api_options_clone.model,
            "summary": format!("Extended path finding: {} AI-filtered initial + {} validated = {} total verified paths", 
                payload.initial_paths.len(), 
                validated_extended_paths.len(),
                combined_validated_paths.len())
        });
        
        // Create standardized JSON response with verifiedPaths and unverifiedPaths structure
        let response_json_content = serde_json::json!({
            "verifiedPaths": combined_validated_paths,
            "unverifiedPaths": unverified_extended_paths,
            "count": combined_validated_paths.len(),
            "summary": format!("Extended path finding: {} AI-filtered initial + {} validated = {} total verified paths", 
                payload.initial_paths.len(), 
                validated_extended_paths.len(),
                combined_validated_paths.len())
        }).to_string();
        
        // Finalize job success using standardized utility
        job_processor_utils::finalize_job_success(
            &job.id,
            &repo,
            &response_json_content,
            llm_response.usage,
            &api_options_clone.model,
            &system_prompt_id,
            Some(result_metadata),
        ).await?;
        
        debug!("Extended path finding completed for workflow {}", job.id);
        
        // NOTE: No longer handling internal chaining - WorkflowOrchestrator manages transitions
        
        // Return success result
        Ok(JobProcessResult::success(
            job.id.clone(), 
            response_json_content
        ))
    }
}