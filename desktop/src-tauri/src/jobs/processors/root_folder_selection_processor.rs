use log::{debug, info};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::processors::{LlmPromptContext, LlmTaskConfigBuilder, LlmTaskRunner};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData};
use crate::models::{JobStatus, TaskType};

pub struct RootFolderSelectionProcessor;

impl RootFolderSelectionProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl JobProcessor for RootFolderSelectionProcessor {
    fn name(&self) -> &'static str {
        "RootFolderSelection"
    }

    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::RootFolderSelection(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let payload = match &job.payload {
            JobPayload::RootFolderSelection(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };

        let (repo, session_repo, _settings_repo, db_job) =
            job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        info!("Starting RootFolderSelection for job: {}", job.id);
        debug!("Task description: {}", payload.task_description);
        debug!("Candidate roots: {:?}", payload.candidate_roots);

        // Get session using centralized repository
        let session = session_repo
            .get_session_by_id(&job.session_id)
            .await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        let llm_config =
            job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = llm_config;

        let task_config_builder =
            LlmTaskConfigBuilder::new(model_used, temperature, max_output_tokens);
        let task_runner =
            LlmTaskRunner::new(app_handle.clone(), job.clone(), task_config_builder.build());

        // Sort paths for better presentation - group by root and show hierarchy
        let mut sorted_paths = payload.candidate_roots.clone();
        sorted_paths.sort();

        // Present as a clear directory listing
        let directory_tree = sorted_paths.join("\n");

        info!(
            "Providing {} directory paths to LLM for selection (max depth: 2)",
            sorted_paths.len()
        );
        debug!(
            "Directory tree sample (first 10):\n{}",
            sorted_paths
                .iter()
                .take(10)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );

        // Add critical context about the primary project directory
        let enhanced_task_description = format!(
            "PRIMARY PROJECT DIRECTORY: {}\n\nTASK: {}",
            session.project_directory, payload.task_description
        );

        let prompt_context = LlmPromptContext {
            task_description: enhanced_task_description,
            directory_tree: Some(directory_tree),
            file_contents: None,
        };

        let llm_response = task_runner
            .execute_llm_task(prompt_context, &_settings_repo)
            .await?;

        // Extract JSON from markdown code blocks (Claude Sonnet 4.5 wraps JSON in ```json...```)
        let cleaned_response =
            crate::utils::markdown_utils::extract_json_from_markdown(&llm_response.response);

        let parsed_paths: Vec<String> =
            if let Ok(json_array) = serde_json::from_str::<Vec<String>>(&cleaned_response) {
                json_array
            } else {
                llm_response
                    .response
                    .lines()
                    .map(|line| line.trim().to_string())
                    .filter(|line| !line.is_empty())
                    .collect()
            };

        let filtered_paths: Vec<String> = parsed_paths
            .into_iter()
            .filter(|path| {
                payload.candidate_roots.contains(path) && std::path::Path::new(path).exists()
            })
            .collect();

        let result_json = json!({
            "rootDirectories": filtered_paths
        });

        debug!("Filtered root directories: {:?}", result_json);

        // Extract token usage and cost from LLM response
        let actual_cost = llm_response
            .usage
            .as_ref()
            .and_then(|u| u.cost)
            .unwrap_or(0.0);

        let job_result =
            JobProcessResult::success(job.id.clone(), JobResultData::Json(result_json))
                .with_tokens(
                    llm_response.usage.as_ref().map(|u| u.prompt_tokens as u32),
                    llm_response
                        .usage
                        .as_ref()
                        .map(|u| u.completion_tokens as u32),
                )
                .with_system_prompt_template(llm_response.system_prompt_template.clone())
                .with_actual_cost(actual_cost);

        repo.update_job_status(&db_job.id, &JobStatus::Completed, None)
            .await?;

        info!("RootFolderSelection completed successfully");
        Ok(job_result)
    }
}
