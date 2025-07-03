use log::{debug, info, warn};
use serde_json::json;
use tauri::AppHandle;
use tokio::fs;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};
use crate::models::TaskType;

pub struct WebSearchQueryGeneratorProcessor;

impl WebSearchQueryGeneratorProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl JobProcessor for WebSearchQueryGeneratorProcessor {
    fn name(&self) -> &'static str {
        "WebSearchQueryGeneratorProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::WebSearchQueryGeneration(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing WebSearchQueryGeneration job: {}", job.id);

        let (repo, session_repo, settings_repo, background_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Get session
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        // Extract payload data
        let task_description = match &job.payload {
            JobPayload::WebSearchQueryGeneration(payload) => {
                payload.task_description.clone()
            }
            _ => {
                return Err(AppError::JobError(
                    "Invalid payload type for WebSearchQueryGenerator".to_string(),
                ));
            }
        };

        // Use included_files from session (UI selection) instead of payload files
        let relevant_files = session.included_files.clone();

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

        // Use simple task description - let the system prompt handle formatting and file contents

        // Load content of files in relevant_files
        let mut file_contents = std::collections::HashMap::new();
        for relative_path_str in &relevant_files {
            let full_path = std::path::Path::new(&session.project_directory).join(relative_path_str);
            match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    file_contents.insert(relative_path_str.clone(), content);
                }
                Err(e) => {
                    warn!("Failed to read file {}: {}", full_path.display(), e);
                }
            }
        }

        // Create prompt context - use original task description, system prompt will handle formatting
        let prompt_context = LlmPromptContext {
            task_description: task_description.clone(),
            file_contents: Some(file_contents),
            directory_tree: None,
        };

        // Execute LLM task
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                let error_msg = format!("WebSearchQueryGeneration LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        info!("WebSearchQueryGeneration LLM task completed successfully for job {}", job.id);

        // Store result metadata
        let result_metadata = json!({
            "taskDescription": task_description,
            "selectedFilesCount": relevant_files.len(),
            "modelUsed": model_used,
            "summary": "Generated detailed prompt for web search"
        });

        // Finalize job success using task runner
        task_runner.finalize_success(
            &repo,
            &job.id,
            &llm_result,
            Some(result_metadata),
        ).await?;

        debug!("WebSearchQueryGeneration completed for job {}", job.id);

        // Return success result
        Ok(JobProcessResult::success(
            job.id.clone(), 
            llm_result.response
        ))
    }
}