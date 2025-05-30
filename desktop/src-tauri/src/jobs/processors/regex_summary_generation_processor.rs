use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use log::{debug, info};

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::db_utils::{SessionRepository, BackgroundJobRepository, SettingsRepository};
use crate::models::{JobStatus, TaskType};
use crate::utils::{get_timestamp, PromptComposer, CompositionContextBuilder};

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

        // Get dependencies from app state
        let repo_state = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>();
        let repo = repo_state.inner().clone();
        
        let session_repo_state = app_handle.state::<std::sync::Arc<SessionRepository>>();
        let session_repo = session_repo_state.inner().clone();
        
        let settings_repo = app_handle.state::<std::sync::Arc<SettingsRepository>>().inner().clone();

        let llm_client = crate::jobs::job_processor_utils::get_api_client(&app_handle)?;
        
        // Update job status to running
        let timestamp = get_timestamp();
        let mut db_job = repo.get_job_by_id(&job.id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job.id)))?;
        db_job.status = "running".to_string();
        db_job.updated_at = Some(timestamp);
        db_job.start_time = Some(timestamp);
        repo.update_job(&db_job).await?;

        // Create enhanced composition context for sophisticated prompt generation
        let task_description = format!(
            "Title regex: {}\nContent regex: {}\nNegative title regex: {}\nNegative content regex: {}",
            payload.title_regex, payload.content_regex, payload.negative_title_regex, payload.negative_content_regex
        );
        
        let composition_context = CompositionContextBuilder::new(
            job.session_id.clone(),
            TaskType::RegexSummaryGeneration,
            task_description.clone(),
        )
        .build();

        // Use the enhanced prompt composer to generate sophisticated prompts
        let prompt_composer = PromptComposer::new();
        let composed_prompt = prompt_composer
            .compose_prompt(&composition_context, &settings_repo)
            .await?;

        info!("Enhanced Regex Summary Generation prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        let prompt = composed_prompt.final_prompt;
        let system_prompt_id = composed_prompt.system_prompt_id;

        debug!("Generated regex summary prompt for job {}: {}", job.id, prompt);

        // Get the model to use from config - check project settings first, then server defaults
        let project_dir = job.project_directory.as_deref().unwrap_or("");
        let model = if let Some(model_override) = payload.model_override.clone() {
            model_override
        } else {
            crate::config::get_model_for_task_with_project(TaskType::RegexSummaryGeneration, project_dir, &app_handle).await
                .map_err(|e| AppError::ConfigError(format!("Failed to get model for RegexSummaryGeneration task: {}. Please ensure server database is properly configured.", e)))?
        };

        // Make the API request
        let request_options = crate::api_clients::client_trait::ApiClientOptions {
            model: model.clone(),
            max_tokens: payload.max_output_tokens,
            temperature: Some(payload.temperature),
            stream: false,
        };

        let api_response = llm_client.complete(&prompt, request_options).await
            .map_err(|e| AppError::OpenRouterError(format!("Failed to complete text: {}", e)))?;
        
        // Extract the response content
        let response = api_response.choices.first()
            .ok_or_else(|| AppError::InvalidResponse("No response choices received".to_string()))?
            .message.content.clone();

        debug!("Received regex summary response for job {}: {}", job.id, response);

        // Update the background job with the response
        let end_timestamp = get_timestamp();
        db_job.response = Some(response.clone());
        db_job.status = "completed".to_string();
        db_job.end_time = Some(end_timestamp);
        db_job.updated_at = Some(end_timestamp);
        db_job.system_prompt_id = Some(system_prompt_id);
        repo.update_job(&db_job).await?;

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