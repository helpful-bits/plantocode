use tauri::{AppHandle, Manager};
use serde::Deserialize;

use crate::error::AppResult;
use crate::models::{TaskType, JobCommandResponse};
use crate::db_utils::session_repository::SessionRepository;
use crate::jobs::processors::RegexSummaryGenerationPayload;
use crate::jobs::types::JobPayload;
use crate::utils::job_creation_utils::create_and_queue_background_job;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRegexSummaryArgs {
    pub session_id: String,
    pub model_override: Option<String>,
    pub temperature_override: Option<f32>,
    pub max_tokens_override: Option<u32>,
}

/// Generate a human-readable summary explanation of regex filters for a session
#[tauri::command]
pub async fn generate_regex_summary_command(
    app_handle: AppHandle,
    args: GenerateRegexSummaryArgs,
) -> AppResult<JobCommandResponse> {
    log::debug!("Generating regex summary for session: {}", args.session_id);

    // Get the session repository
    let session_repo_state = app_handle.state::<std::sync::Arc<SessionRepository>>();
    let session_repo = session_repo_state.inner().clone();

    // Fetch the session to get the regex patterns
    let session = session_repo.get_session_by_id(&args.session_id).await?
        .ok_or_else(|| crate::error::AppError::NotFoundError(format!("Session {} not found", args.session_id)))?;

    // Get model settings using centralized resolver
    let model_settings = crate::utils::resolve_model_settings(
        &app_handle,
        TaskType::RegexSummaryGeneration,
        &session.project_directory,
        args.model_override.clone(),
        args.temperature_override,
        args.max_tokens_override,
    ).await?;
    
    // Create the payload
    let payload = RegexSummaryGenerationPayload {
        background_job_id: String::new(), // Will be set by create_and_queue_background_job
        session_id: args.session_id.clone(),
        title_regex: session.title_regex.unwrap_or_default(),
        content_regex: session.content_regex.unwrap_or_default(),
        negative_title_regex: session.negative_title_regex.unwrap_or_default(),
        negative_content_regex: session.negative_content_regex.unwrap_or_default(),
        model_override: None, // Will be passed separately to create_and_queue_background_job
        temperature: model_settings.as_ref().map(|(_, temp, _)| *temp).unwrap_or(0.7),
        max_output_tokens: Some(model_settings.as_ref().map(|(_, _, tokens)| *tokens).unwrap_or(1000)),
    };

    // Create and queue the background job
    let job_id = create_and_queue_background_job(
        &args.session_id,
        &session.project_directory,
        "openrouter",
        TaskType::RegexSummaryGeneration,
        "REGEX_SUMMARY_GENERATION",
        "Generating regex filter summary explanation",
        model_settings,
        JobPayload::RegexSummaryGeneration(payload),
        1, // priority
        None, // No workflow_id
        None, // No workflow_stage
        None, // extra_metadata
        &app_handle,
    ).await?;

    log::info!("Created regex summary generation job: {}", job_id);
    Ok(JobCommandResponse { job_id })
}