use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use log::{debug, info};

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::db_utils::SessionRepository;
use crate::models::TaskType;
use crate::jobs::job_processor_utils;

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
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&job.id, "regex summary generation");

        // Create task description for prompt
        let task_description = format!(
            "Title regex: {}\nContent regex: {}\nNegative title regex: {}\nNegative content regex: {}",
            payload.title_regex, payload.content_regex, payload.negative_title_regex, payload.negative_content_regex
        );
        
        // Build unified prompt
        let composed_prompt = job_processor_utils::build_unified_prompt(
            &job,
            &app_handle,
            task_description,
            None,
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

        // Extract system and user prompts from the composed result
        let (system_prompt, user_prompt, system_prompt_id) = job_processor_utils::extract_prompts_from_composed(&composed_prompt);

        debug!("Generated regex summary prompt for job {}: {}", job.id, user_prompt);

        // Create API options
        let request_options = job_processor_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            false,
        )?;

        // Store model name before moving request_options
        let model_name = request_options.model.clone();

        // Create messages and call LLM
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        let api_response = job_processor_utils::execute_llm_chat_completion(&app_handle, messages, request_options).await?;
        
        // Extract the response content
        let response = api_response.choices.first()
            .ok_or_else(|| AppError::InvalidResponse("No response choices received".to_string()))?
            .message.content.clone();

        debug!("Received regex summary response for job {}: {}", job.id, response);

        // Finalize job success
        job_processor_utils::finalize_job_success(
            &job.id,
            &repo,
            &response,
            api_response.usage,
            &model_name,
            &system_prompt_id,
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