use std::collections::HashMap;
use log::{debug, info, error};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, FileRelevanceAssessmentPayload};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::abstract_llm_processor::{LlmTaskRunner, LlmTaskConfig, LlmTaskConfigBuilder, LlmPromptContext};
use crate::jobs::processors::utils::fs_context_utils;
use crate::utils::token_estimator::estimate_tokens_for_file_batch;

pub struct FileRelevanceAssessmentProcessor;

impl FileRelevanceAssessmentProcessor {
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
impl JobProcessor for FileRelevanceAssessmentProcessor {
    fn name(&self) -> &'static str {
        "FileRelevanceAssessment"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::FileRelevanceAssessment(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::FileRelevanceAssessment(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing using standardized utility
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(
            &job.id,
            &app_handle,
        ).await?;
        
        // Get project directory from session
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        let project_directory = &session.project_directory;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job.id, "File Relevance Assessment");
        info!("Starting file relevance assessment with {} files to analyze", 
            payload.locally_filtered_files.len());
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Load content for locally_filtered_files using fs_context_utils
        let file_contents = fs_context_utils::load_file_contents(
            &payload.locally_filtered_files,
            project_directory,
        ).await;
        
        info!("Loaded content for {} files for relevance analysis", file_contents.len());
        
        // Use unified prompt system exclusively - no hardcoded prompts
        let prompt_context = LlmPromptContext {
            task_description: payload.task_description.clone(),
            file_contents: Some(file_contents),
            directory_tree: None,
            system_prompt_override: None,
        };
        
        // Initialize LlmTaskRunner with appropriate model settings
        let task_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
            
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), task_config);
        
        // Check for cancellation before LLM call using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before LLM call", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Execute LLM task using task_runner.execute_llm_task()
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                let error_msg = format!("Failed to execute LLM task for file relevance assessment: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using standardized utility
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // Parse the LLM response (expected to be a list of file paths)
        let relevant_paths = match Self::parse_paths_from_text_response(&llm_result.response, project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to parse relevant file paths from LLM response: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using standardized utility
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // Validate the parsed paths against the filesystem using centralized utility
        let (validated_relevant_paths, invalid_relevant_paths) = fs_context_utils::validate_paths_against_filesystem(
            &relevant_paths, 
            project_directory
        ).await;
        
        info!("File relevance assessment validation: {} valid, {} invalid paths", 
            validated_relevant_paths.len(), invalid_relevant_paths.len());
        
        // Calculate token count for validated relevant paths
        let token_count = match estimate_tokens_for_file_batch(&std::path::Path::new(project_directory), &validated_relevant_paths).await {
            Ok(count) => count,
            Err(e) => {
                error!("Failed to estimate tokens for file batch: {}", e);
                0
            }
        };
        
        // Check for cancellation after LLM processing using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after LLM processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Store results in job metadata (supplementary info only)
        let result_metadata = json!({
            "initialFiles": payload.locally_filtered_files.len(),
            "llmSuggestedFiles": relevant_paths.len(),
            "validatedRelevantFiles": validated_relevant_paths.len(),
            "invalidRelevantFiles": invalid_relevant_paths.len(),
            "initialFilesList": payload.locally_filtered_files,
            "llmSuggestedPaths": relevant_paths,
            "validatedRelevantPaths": validated_relevant_paths,
            "invalidRelevantPaths": invalid_relevant_paths,
            "llmResponse": llm_result.response,
            "taskDescription": payload.task_description,
            "projectDirectory": project_directory,
            "modelUsed": model_used,
            "summary": format!("File relevance assessment: {} initial files → {} validated relevant files", 
                payload.locally_filtered_files.len(), 
                validated_relevant_paths.len())
        });
        
        // Create a JSON response string like {"relevantFiles": ["path1", "path2"], "count": 2, "tokenCount": 1234}
        let response_json_content = serde_json::json!({
            "relevantFiles": validated_relevant_paths,
            "count": validated_relevant_paths.len(),
            "summary": format!("File relevance assessment: {} initial files → {} validated relevant files", 
                payload.locally_filtered_files.len(), 
                validated_relevant_paths.len()),
            "tokenCount": token_count
        }).to_string();
        
        // Call task_runner.finalize_success() with the JSON response, LLM usage, model name, and system prompt ID
        task_runner.finalize_success(
            &repo,
            &job.id,
            &llm_result,
            Some(result_metadata),
        ).await?;
        
        debug!("File relevance assessment completed for job {}", job.id);
        
        // Return JobProcessResult::success() with the JSON response string
        Ok(JobProcessResult::success(
            job.id.clone(), 
            response_json_content
        ))
    }
}