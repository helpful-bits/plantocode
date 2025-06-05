use std::collections::HashMap;
use log::{debug, info, error};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, FileRelevanceAssessmentPayload};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::abstract_llm_processor::{LlmTaskRunner, LlmTaskConfig, LlmTaskConfigBuilder, LlmPromptContext};
use crate::jobs::processors::utils::{fs_context_utils, response_parser_utils};

pub struct FileRelevanceAssessmentProcessor;

impl FileRelevanceAssessmentProcessor {
    pub fn new() -> Self {
        Self
    }
    
    /// Validate paths against the file system (similar to ExtendedPathFinderProcessor)
    async fn validate_paths_against_filesystem(&self, paths: &[String], project_directory: &str) -> (Vec<String>, Vec<String>) {
        let mut validated_paths = Vec::new();
        let mut invalid_paths = Vec::new();
        
        for relative_path in paths {
            // Construct absolute path
            let absolute_path = std::path::Path::new(project_directory).join(relative_path);
            
            // Check if file exists and is a file
            match tokio::fs::metadata(&absolute_path).await {
                Ok(metadata) if metadata.is_file() => {
                    validated_paths.push(relative_path.clone());
                },
                _ => {
                    debug!("Path doesn't exist or isn't a regular file: {}", absolute_path.display());
                    invalid_paths.push(relative_path.clone());
                }
            }
        }
        
        (validated_paths, invalid_paths)
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
            &payload.background_job_id,
            &app_handle,
        ).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&payload.background_job_id, "File Relevance Assessment");
        info!("Starting file relevance assessment for workflow {} with {} files to analyze", 
            payload.workflow_id, payload.locally_filtered_files.len());
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before processing", payload.background_job_id);
            return Ok(JobProcessResult::canceled(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Load content for locally_filtered_files using fs_context_utils
        let file_contents = fs_context_utils::load_file_contents(
            &payload.locally_filtered_files,
            &payload.project_directory,
        ).await;
        
        info!("Loaded content for {} files for relevance analysis", file_contents.len());
        
        // Prepare LlmPromptContext with minimal context - demonstrates robustness
        // The LlmTaskRunner and UnifiedPromptProcessor handle None/empty values gracefully
        let prompt_context = LlmPromptContext {
            task_description: format!("Analyze the following files and determine which ones are most relevant for this task: {}\n\nReturn a JSON list of file paths that are highly relevant to completing this task. Only include files that would actually be needed to understand, modify, or implement the requested functionality.", payload.task_description),
            file_contents: Some(file_contents), // Could be empty HashMap if no files loaded
            directory_tree: None, // Intentionally omitted - system will handle gracefully
            codebase_structure: None, // Intentionally omitted - system will handle gracefully  
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
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before LLM call", payload.background_job_id);
            return Ok(JobProcessResult::canceled(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Execute LLM task using task_runner.execute_llm_task()
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                let error_msg = format!("Failed to execute LLM task for file relevance assessment: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using standardized utility
                task_runner.finalize_failure(&repo, &payload.background_job_id, &error_msg).await?;
                
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        // Parse the LLM response (expected to be a list of file paths) using response_parser_utils
        let relevant_paths = match response_parser_utils::parse_paths_from_text_response(&llm_result.response, &payload.project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to parse relevant file paths from LLM response: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using standardized utility
                task_runner.finalize_failure(&repo, &payload.background_job_id, &error_msg).await?;
                
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        // Validate the parsed paths against the filesystem (similar to ExtendedPathFinderProcessor::validate_paths_against_filesystem)
        let (validated_relevant_paths, invalid_relevant_paths) = self.validate_paths_against_filesystem(
            &relevant_paths, 
            &payload.project_directory
        ).await;
        
        info!("File relevance assessment validation: {} valid, {} invalid paths", 
            validated_relevant_paths.len(), invalid_relevant_paths.len());
        
        // Check for cancellation after LLM processing using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled after LLM processing", payload.background_job_id);
            return Ok(JobProcessResult::canceled(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
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
            "workflowId": payload.workflow_id,
            "taskDescription": payload.task_description,
            "projectDirectory": payload.project_directory,
            "modelUsed": model_used,
            "summary": format!("File relevance assessment: {} initial files → {} validated relevant files", 
                payload.locally_filtered_files.len(), 
                validated_relevant_paths.len())
        });
        
        // Create a JSON response string like {"relevantFiles": ["path1", "path2"], "count": 2}
        let response_json_content = serde_json::json!({
            "relevantFiles": validated_relevant_paths,
            "count": validated_relevant_paths.len(),
            "summary": format!("File relevance assessment: {} initial files → {} validated relevant files", 
                payload.locally_filtered_files.len(), 
                validated_relevant_paths.len())
        }).to_string();
        
        // Call task_runner.finalize_success() with the JSON response, LLM usage, model name, and system prompt ID
        task_runner.finalize_success(
            &repo,
            &payload.background_job_id,
            &llm_result,
            Some(result_metadata),
        ).await?;
        
        debug!("File relevance assessment completed for workflow {}", payload.workflow_id);
        
        // Return JobProcessResult::success() with the JSON response string
        Ok(JobProcessResult::success(
            payload.background_job_id.clone(), 
            response_json_content
        ))
    }
}