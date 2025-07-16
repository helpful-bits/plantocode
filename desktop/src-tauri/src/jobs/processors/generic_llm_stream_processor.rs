use log::{info, error, debug};
use tauri::AppHandle;
use async_trait::async_trait;


use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData};
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
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::GenericLlmStream(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing
        let (repo, session_repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get session object using the session repository
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;
        
        // Get model settings using project-aware configuration
        let model_settings = job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;
        
        job_processor_utils::log_job_start(&job.id, "generic LLM stream");
        
        // Setup LLM task configuration for streaming
        let llm_config = LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
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
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        
        // Use the response from the task runner
        let response_content = llm_result.response.clone();
        let response_len = response_content.len() as i32;
        
        // Check if we got content
        if response_content.is_empty() {
            let error_msg = "No content received from LLM stream";
            error!("Generic stream job {} failed: {}", job.id, error_msg);
            return Ok(JobProcessResult::failure(job.id.clone(), error_msg.to_string()));
        }
        
        // Extract usage and system prompt template before moving it
        let usage_for_result = llm_result.usage.clone();
        let system_prompt_template = llm_result.system_prompt_template.clone();
        let actual_cost = llm_result.usage.as_ref().and_then(|u| u.cost).unwrap_or(0.0);
        
        // Create and return the result
        let mut result = JobProcessResult::success(job.id.to_string(), JobResultData::Text(response_content));
        
        // Add token information if usage is available
        if let Some(usage) = &usage_for_result {
            result = result.with_tokens(
                Some(usage.prompt_tokens as u32),
                Some(usage.completion_tokens as u32)
            )
            .with_cache_tokens(
                Some(usage.cache_write_tokens as i64),
                Some(usage.cache_read_tokens as i64)
            );
        }
        
        // Add system prompt template and actual cost
        result = result
            .with_system_prompt_template(system_prompt_template)
            .with_actual_cost(actual_cost);
        
        Ok(result)
    }
}