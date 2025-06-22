use async_trait::async_trait;
use log::{info, error, debug};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::models::TaskType;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};
use crate::jobs::processors::utils::fs_context_utils;

pub struct TaskRefinementProcessor;

impl TaskRefinementProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl JobProcessor for TaskRefinementProcessor {
    fn name(&self) -> &str {
        "TaskRefinementProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.task_type_str() == TaskType::TaskRefinement.to_string() &&
        matches!(job.payload, JobPayload::TaskRefinement(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id().to_string();
        info!("Processing Task Refinement job {}", job_id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::TaskRefinement(payload) => payload,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for Task Refinement job {}",
                    job_id
                )));
            }
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job_id, &app_handle).await?;
        
        // Get project directory from session
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&session.project_hash, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for project {} and task type {}", session.project_hash, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job_id, "task refinement");
        let project_directory = &session.project_directory;
        
        // Load content of files in payload.relevant_files
        let file_contents = fs_context_utils::load_file_contents(&payload.relevant_files, project_directory).await;
        
        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context with file contents
        let prompt_context = LlmPromptContext {
            task_description: payload.task_description.clone(),
            file_contents: Some(file_contents),
            directory_tree: None,
            system_prompt_override: None,
        };
        
        debug!("Using model: {} for Task Refinement", model_used);
        
        // Execute LLM task using the task runner
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                error!("Task Refinement LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job_id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job_id, error_msg));
            }
        };
        
        info!("Task Refinement LLM task completed successfully for job {}", job_id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // Clone the response to avoid borrow checker issues
        let refined_description = llm_result.response.clone();
        
        // Extract usage before moving it
        let usage_for_result = llm_result.usage.clone();
        
        // Use task runner's finalize_success method to ensure consistent template handling
        task_runner.finalize_success(
            &repo,
            &job_id,
            &llm_result,
            None,
        ).await?;
        
        info!("Completed Task Refinement job {}", job_id);
        
        let task_len = refined_description.len() as i32;
        
        Ok(JobProcessResult::success(job_id, refined_description)
            .with_tokens(
                usage_for_result.as_ref().map(|u| u.prompt_tokens as i32),
                usage_for_result.as_ref().map(|u| u.completion_tokens as i32),
                usage_for_result.as_ref().map(|u| u.total_tokens as i32),
                Some(task_len),
            ))
    }
}