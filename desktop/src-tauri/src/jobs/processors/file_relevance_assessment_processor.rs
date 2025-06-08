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
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e)).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // Parse the LLM response (expected to be a list of file paths) using response_parser_utils
        let relevant_paths = match response_parser_utils::parse_paths_from_text_response(&llm_result.response, project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to parse relevant file paths from LLM response: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using standardized utility
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e)).await?;
                
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