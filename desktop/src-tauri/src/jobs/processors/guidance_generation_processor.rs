use async_trait::async_trait;
use tauri::AppHandle;
use log::{debug, info, error};

use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::TaskType;
use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{fs_context_utils};
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};

/// Processor for guidance generation jobs
pub struct GuidanceGenerationProcessor;

impl GuidanceGenerationProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl JobProcessor for GuidanceGenerationProcessor {
    fn name(&self) -> &str {
        "GuidanceGenerationProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::GuidanceGeneration(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let payload = match &job.payload {
            JobPayload::GuidanceGeneration(p) => p,
            _ => {
                return Err(AppError::JobError(format!(
                    "Cannot process job with payload type {:?} in GuidanceGenerationProcessor",
                    job.task_type_str()
                )));
            }
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Extract model settings from BackgroundJob
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        // Get project directory from session
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        let project_directory = &session.project_directory;
        
        job_processor_utils::log_job_start(&job.id, "guidance generation");
        debug!("Task description: {}", payload.task_description);
        
        // Load file contents if paths are provided
        let file_contents = if let Some(paths) = &payload.paths {
            Some(fs_context_utils::load_file_contents(paths, project_directory).await)
        } else {
            None
        };
        
        // Generate directory tree for enhanced context
        let directory_tree = fs_context_utils::generate_directory_tree_for_context(
            project_directory
        ).await;
        
        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context
        let prompt_context = LlmPromptContext {
            task_description: payload.task_description.clone(),
            file_contents,
            directory_tree,
            system_prompt_override: None,
        };
        
        debug!("Sending guidance generation request with model: {}", model_used);
        
        // Execute LLM task using the task runner
        match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(llm_result) => {
                debug!("Received guidance response");
                info!("System prompt ID: {}", llm_result.system_prompt_id);
                
                // Finalize job success using task runner
                task_runner.finalize_success(
                    &repo,
                    &job.id,
                    &llm_result,
                    None,
                ).await?;
                
                Ok(JobProcessResult::success(job.id.clone(), llm_result.response.clone())
                    .with_tokens(
                        llm_result.usage.as_ref().map(|u| u.prompt_tokens as i32),
                        llm_result.usage.as_ref().map(|u| u.completion_tokens as i32),
                        llm_result.usage.as_ref().map(|u| u.total_tokens as i32),
                        Some(llm_result.response.len() as i32)
                    ))
            },
            Err(e) => {
                let error_msg = format!("LLM task execution failed: {}", e);
                error!("{}", error_msg);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_msg))
            }
        }
    }
}