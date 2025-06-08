use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use log::{debug, info, error};

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::db_utils::SessionRepository;
use crate::models::TaskType;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{prompt_utils};
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};

// Payload for Regex Summary Generation job
// Includes background_job_id for internal job tracking and UI updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexSummaryGenerationPayload {
    pub background_job_id: String,
    pub session_id: String,
    pub title_regex: String,
    pub content_regex: String,
    pub negative_title_regex: String,
    pub negative_content_regex: String,
    pub model_override: Option<String>,
    pub temperature: f32,
    pub max_output_tokens: Option<u32>,
}

pub struct RegexSummaryGenerationProcessor;

impl RegexSummaryGenerationProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl JobProcessor for RegexSummaryGenerationProcessor {
    fn name(&self) -> &'static str {
        "RegexSummaryGenerationProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::RegexSummaryGeneration(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        debug!("Starting regex summary generation processor for job: {}", job.id);

        // Get payload
        let payload = match &job.payload {
            JobPayload::RegexSummaryGeneration(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };

        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job.id, "regex summary generation");

        // Create task description for prompt
        let task_description = format!(
            "Title regex: {}\nContent regex: {}\nNegative title regex: {}\nNegative content regex: {}",
            payload.title_regex, payload.content_regex, payload.negative_title_regex, payload.negative_content_regex
        );
        
        // Build unified prompt
        let composed_prompt = prompt_utils::build_unified_prompt(
            &job,
            &app_handle,
            task_description,
            None,
            None,
            &settings_repo,
            &model_used,
        ).await?;

        info!("Enhanced Regex Summary Generation prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create task description for prompt
        let task_description = format!(
            "Title regex: {}\nContent regex: {}\nNegative title regex: {}\nNegative content regex: {}",
            payload.title_regex, payload.content_regex, payload.negative_title_regex, payload.negative_content_regex
        );
        
        // Create prompt context
        let prompt_context = LlmPromptContext {
            task_description,
            file_contents: None,
            directory_tree: None,
            system_prompt_override: None,
        };

        debug!("Generated regex summary prompt for job {}", job.id);

        // Execute LLM task using the task runner
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                error!("Regex Summary Generation LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e)).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        info!("Regex Summary Generation LLM task completed successfully for job {}", job.id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // Extract the response content
        let response = llm_result.response.clone();

        debug!("Received regex summary response for job {}: {}", job.id, response);

        // Finalize job success using task runner
        task_runner.finalize_success(
            &repo,
            &job.id,
            &llm_result,
            None,
        ).await?;

        // Get session repository for session update
        let session_repo = app_handle.state::<std::sync::Arc<SessionRepository>>().inner().clone();

        // Update the session's regex_summary_explanation field
        let session = session_repo.get_session_by_id(&payload.session_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Session {} not found", payload.session_id)))?;

        // Update the session with the summary explanation
        let mut updated_session = session;
        updated_session.regex_summary_explanation = Some(response.clone());
        updated_session.updated_at = chrono::Utc::now().timestamp_millis();

        session_repo.update_session(&updated_session).await?;

        info!("Successfully completed regex summary generation for job {} and updated session {}", job.id, payload.session_id);

        Ok(JobProcessResult::success(job.id, response))
    }
}