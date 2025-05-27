use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::AppResult;
use crate::models::{TaskType, JobCommandResponse};
use crate::db_utils::session_repository::SessionRepository;
use crate::jobs::processors::RegexSummaryGenerationPayload;
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

    // Create the payload
    let job_id = uuid::Uuid::new_v4().to_string();
    let payload = RegexSummaryGenerationPayload {
        background_job_id: job_id.clone(),
        session_id: args.session_id.clone(),
        title_regex: session.title_regex.unwrap_or_default(),
        content_regex: session.content_regex.unwrap_or_default(),
        negative_title_regex: session.negative_title_regex.unwrap_or_default(),
        negative_content_regex: session.negative_content_regex.unwrap_or_default(),
        model_override: args.model_override.clone(),
        temperature: args.temperature_override.unwrap_or(0.3),
        max_output_tokens: args.max_tokens_override,
    };

    // Create and queue the background job
    let job_id = create_and_queue_background_job(
        &args.session_id,
        &session.project_directory,
        "openrouter",
        TaskType::RegexSummaryGeneration,
        "REGEX_SUMMARY_GENERATION",
        "Generating regex filter summary explanation",
        (
            args.model_override.unwrap_or_else(|| "gpt-4o-mini".to_string()),
            args.temperature_override.unwrap_or(0.3),
            args.max_tokens_override.unwrap_or(1000),
        ),
        json!(payload),
        1, // priority
        None, // extra_metadata
        &app_handle,
    ).await?;

    log::info!("Created regex summary generation job: {}", job_id);
    Ok(JobCommandResponse { job_id })
}