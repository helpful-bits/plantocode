use log::{info, error, debug};
use tauri::AppHandle;
use async_trait::async_trait;

use crate::utils::config_resolver;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};

/// Processor for generic LLM streaming tasks
pub struct GenericLlmStreamProcessor;

impl GenericLlmStreamProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl JobProcessor for GenericLlmStreamProcessor {
    fn name(&self) -> &'static str {
        "GenericLlmStreamProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::GenericLlmStream(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing generic LLM stream job {}", job.id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::GenericLlmStream(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get session to access project_hash
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        
        // Get model settings using centralized config resolution
        let model_settings = config_resolver::resolve_model_settings(
            &app_handle,
            job.job_type,
            None, // model_override
            None, // temperature_override  
            None, // max_tokens_override
        ).await?
        .ok_or_else(|| AppError::ConfigError(format!("Task {:?} requires LLM configuration", job.job_type)))?;

        let (model_used, temperature, max_output_tokens) = model_settings;
        
        job_processor_utils::log_job_start(&job.id, "generic LLM stream");
        
        // Setup LLM task configuration for streaming
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(true) // Enable streaming for this processor
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context for generic streams
        let prompt_context = LlmPromptContext {
            task_description: payload.prompt_text.clone(),
            file_contents: None,
            directory_tree: None,
        };
        
        // Execute streaming LLM task using the task runner
        info!("Calling LLM for generic stream with model {} (streaming enabled)", model_used);
        let llm_result = match task_runner.execute_streaming_llm_task(
            prompt_context,
            &settings_repo,
            &repo,
            &job.id,
        ).await {
            Ok(result) => result,
            Err(e) => {
                error!("Generic LLM Stream task execution failed: {}", e);
                let error_msg = format!("Streaming LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        info!("Generic LLM Stream task completed successfully for job {}", job.id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // Use the response from the task runner
        let response_content = llm_result.response.clone();
        let response_len = response_content.len() as i32;
        
        // Check if we got content
        if response_content.is_empty() {
            let error_msg = "No content received from LLM stream";
            error!("Generic stream job {} failed: {}", job.id, error_msg);
            task_runner.finalize_failure(&repo, &job.id, &error_msg, None, llm_result.usage).await?;
            return Ok(JobProcessResult::failure(job.id.clone(), error_msg.to_string()));
        }
        
        // Extract usage before moving it
        let usage_for_result = llm_result.usage.clone();
        
        // Use task runner's finalize_success method to ensure consistent template handling
        task_runner.finalize_success(
            &repo,
            &job.id,
            &llm_result,
            None,
        ).await?;
        
        // Create and return the result
        let mut result = JobProcessResult::success(job.id.to_string(), response_content);
        
        // Add token information if usage is available
        if let Some(usage) = &usage_for_result {
            result = result.with_tokens(
                Some(usage.prompt_tokens as i32),
                Some(usage.completion_tokens as i32),
                Some(usage.total_tokens as i32),
                Some(response_len)
            );
        }
        
        info!("Completed generic LLM stream job {}", job.id);
        Ok(result)
    }
}