use log::{debug, info};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};
use crate::models::TaskType;

pub struct WebSearchExecutorProcessor;

impl WebSearchExecutorProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl JobProcessor for WebSearchExecutorProcessor {
    fn name(&self) -> &'static str {
        "WebSearchExecutorProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::WebSearchExecution(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing WebSearchExecution job: {}", job.id);

        let (repo, session_repo, settings_repo, background_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Get session
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        // Extract payload data
        let prompt = match &job.payload {
            JobPayload::WebSearchExecution(payload) => {
                payload.prompt.clone()
            }
            _ => {
                return Err(AppError::JobError(
                    "Invalid payload type for WebSearchExecutor".to_string(),
                ));
            }
        };

        // Get model settings using project-aware configuration
        let model_settings = job_processor_utils::get_llm_task_config(&background_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;

        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();

        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);

        // Create prompt context - use simple task description, system prompt will handle formatting
        let prompt_context = LlmPromptContext {
            task_description: prompt,
            file_contents: None,
            directory_tree: None,
        };

        // Execute LLM task
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                let error_msg = format!("WebSearchExecution LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        info!("WebSearchExecution LLM task completed successfully for job {}", job.id);

        // Store result metadata
        let result_metadata = json!({
            "modelUsed": model_used,
            "summary": "Executed web search and synthesized results"
        });

        // Finalize job success using task runner
        task_runner.finalize_success(
            &repo,
            &job.id,
            &llm_result,
            Some(result_metadata),
        ).await?;

        debug!("WebSearchExecution completed for job {}", job.id);

        // Return success result
        Ok(JobProcessResult::success(
            job.id.clone(), 
            llm_result.response
        ))
    }
}