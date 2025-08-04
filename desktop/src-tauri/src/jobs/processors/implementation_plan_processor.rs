use log::{debug, error, info, warn};
use serde_json::json;
use std::path::Path;
use std::str::FromStr;
use tauri::AppHandle;
use tokio::fs;

use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::processors::utils::parsing_utils;
use crate::jobs::processors::utils::prompt_utils;
use crate::jobs::processors::{
    LlmPromptContext, LlmTaskConfigBuilder, LlmTaskResult, LlmTaskRunner,
};
use crate::jobs::types::{
    Job, JobPayload, JobProcessResult, JobResultData, StructuredImplementationPlan,
    StructuredImplementationPlanStep,
};
use crate::models::{JobStatus, OpenRouterContent, OpenRouterRequestMessage, TaskType};
use crate::utils::job_metadata_builder::JobMetadataBuilder;
use crate::utils::{get_timestamp, path_utils};

pub struct ImplementationPlanProcessor;

impl ImplementationPlanProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait::async_trait]
impl JobProcessor for ImplementationPlanProcessor {
    fn name(&self) -> &'static str {
        "ImplementationPlanProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::ImplementationPlan(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::ImplementationPlan(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };

        // Setup job processing
        let (repo, session_repo, settings_repo, mut db_job) =
            job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Get session object using the session repository
        let session = session_repo
            .get_session_by_id(&job.session_id)
            .await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        // Get model settings using project-aware configuration
        let model_settings =
            job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;
        let llm_client =
            crate::jobs::processors::utils::llm_api_utils::get_api_client(&app_handle).await?;
        let job_id = job.id.clone();

        job_processor_utils::log_job_start(&job_id, "implementation plan");
        let project_directory = &session.project_directory;

        // Load file contents and generate directory tree - FULL CONTENT WITHOUT TRUNCATION
        let mut file_contents_map = std::collections::HashMap::new();
        for relative_path_str in &payload.relevant_files {
            let full_path = std::path::Path::new(project_directory).join(relative_path_str);
            match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    file_contents_map.insert(relative_path_str.clone(), content);
                }
                Err(e) => {
                    warn!("Failed to read file {}: {}", full_path.display(), e);
                }
            }
        }
        let file_contents = Some(file_contents_map);
        let directory_tree =
            match crate::utils::directory_tree::get_directory_tree_with_defaults(project_directory)
                .await
            {
                Ok(tree) => Some(tree),
                Err(e) => {
                    warn!("Failed to generate directory tree: {}", e);
                    None
                }
            };

        // Build unified prompt using full content without preemptive truncation
        let composed_prompt = prompt_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.task_description.clone(),
            file_contents,
            directory_tree,
            &model_used,
        )
        .await?;

        if let Some(tokens) = composed_prompt.estimated_total_tokens {
            // Log warning if estimated tokens exceed typical model limits
            if tokens > 100000 {
                warn!(
                    "Implementation plan job {} estimated tokens ({}) exceeds typical model limits but proceeding with full content",
                    job.id, tokens
                );

                // Store warning in job metadata for visibility
                if let Ok(mut job_for_metadata) = repo.get_job_by_id(&job.id).await {
                    if let Some(existing_job) = job_for_metadata {
                        let metadata = match existing_job.metadata {
                            Some(ref metadata_str) => {
                                match serde_json::from_str::<serde_json::Value>(&metadata_str) {
                                    Ok(mut json) => {
                                        json["token_warning"] = serde_json::json!({
                                            "estimated_tokens": tokens,
                                            "warning": "Content exceeds typical model limits but proceeding with full content"
                                        });
                                        json
                                    }
                                    Err(_) => serde_json::json!({
                                        "token_warning": {
                                            "estimated_tokens": tokens,
                                            "warning": "Content exceeds typical model limits but proceeding with full content"
                                        }
                                    }),
                                }
                            }
                            None => serde_json::json!({
                                "token_warning": {
                                    "estimated_tokens": tokens,
                                    "warning": "Content exceeds typical model limits but proceeding with full content"
                                }
                            }),
                        };

                        let mut updated_job = existing_job;
                        updated_job.metadata = Some(metadata.to_string());
                        if let Err(e) = repo.update_job(&updated_job).await {
                            warn!("Failed to update job metadata with token warning: {}", e);
                        }
                    }
                }
            }
        }

        let system_prompt_id = composed_prompt.system_prompt_id;

        // Setup LLM task configuration for streaming
        let llm_config =
            LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
                .stream(true) // Enable streaming for implementation plans
                .build();

        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);

        // Create prompt context
        let mut file_contents_map = std::collections::HashMap::new();
        for relative_path_str in &payload.relevant_files {
            let full_path = std::path::Path::new(project_directory).join(relative_path_str);
            match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    file_contents_map.insert(relative_path_str.clone(), content);
                }
                Err(e) => {
                    warn!("Failed to read file {}: {}", full_path.display(), e);
                }
            }
        }
        let prompt_context = LlmPromptContext {
            task_description: payload.task_description.clone(),
            file_contents: Some(file_contents_map),
            directory_tree: match crate::utils::directory_tree::get_directory_tree_with_defaults(
                project_directory,
            )
            .await
            {
                Ok(tree) => Some(tree),
                Err(e) => {
                    warn!("Failed to generate directory tree: {}", e);
                    None
                }
            },
        };

        // Check if job has been canceled before calling the LLM
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            return Ok(JobProcessResult::canceled(
                job.id.clone(),
                "Job was canceled by user".to_string(),
            ));
        }

        // Execute streaming LLM task using the task runner
        let llm_result = match task_runner
            .execute_streaming_llm_task(prompt_context, &settings_repo, &repo, &job.id)
            .await
        {
            Ok(result) => result,
            Err(e) => {
                error!("Streaming LLM task execution failed: {}", e);
                let error_msg = format!("Streaming LLM task execution failed: {}", e);
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        // Use the response from the task runner
        let response_content = llm_result.response.clone();

        // Continue with regular processing using the collected response
        if response_content.is_empty() {
            let error_msg = "No content received from LLM stream";
            error!("Implementation plan job {} failed: {}", job.id, error_msg);
            return Ok(JobProcessResult::failure(
                job.id.clone(),
                error_msg.to_string(),
            ));
        }

        // Check if job has been canceled after LLM call but before further processing using helper
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            return Ok(JobProcessResult::canceled(
                job.id.clone(),
                "Job was canceled by user".to_string(),
            ));
        }

        // Use the raw LLM response directly
        
        // Create a simple structured plan for UI compatibility
        let structured_plan = StructuredImplementationPlan {
            agent_instructions: None,
            steps: vec![],
        };
        let human_readable_summary = "Implementation plan generated".to_string();

        // The raw response content will be stored directly in job.response
        // The structured plan data is stored in metadata (additional_params)

        // Extract the generated title from job metadata, if it exists
        let metadata: Option<serde_json::Value> = match &db_job.metadata {
            Some(metadata_str) => match serde_json::from_str(metadata_str) {
                Ok(json) => Some(json),
                Err(_) => None,
            },
            None => None,
        };

        let generated_title = match metadata {
            Some(json) => {
                if let Some(title) = json.get("generated_title").and_then(|v| v.as_str()) {
                    // Sanitize the title since it may come from LLM response
                    crate::utils::path_utils::sanitize_filename(title)
                } else {
                    "Implementation Plan".to_string()
                }
            }
            None => "Implementation Plan".to_string(),
        };

        // Update the job with the results
        let timestamp = get_timestamp();

        // Get the job and update it with all results at once
        let mut job = repo
            .get_job_by_id(&job.id)
            .await?
            .ok_or_else(|| AppError::JobError(format!("Job not found: {}", job.id)))?;

        // Get session name for better UI display
        let session_name = session.name;

        // Construct the additional_params specific to the implementation plan
        let mut impl_plan_additional_params = json!({
            "planData": serde_json::to_value(structured_plan.clone()).unwrap_or_default(),
            "planTitle": generated_title.clone(),
            "summary": human_readable_summary.clone(),
            "isStructured": true,
            "sessionName": session_name
        });

        // Ensure streaming flags are cleared for completed jobs
        if let Some(obj) = impl_plan_additional_params.as_object_mut() {
            obj.insert("isStreaming".to_string(), json!(false));
            // Remove streaming-specific fields that should not persist for completed jobs
            obj.remove("streamProgress");
            obj.remove("responseLength");
            obj.remove("estimatedTotalLength");
            obj.remove("lastStreamUpdateTime");
            obj.remove("streamStartTime");
        }

        // Create updated job with raw response content for finalization
        let mut finalized_job = job.clone();
        finalized_job.response = Some(response_content.clone());

        // Extract system prompt template, usage and cost
        let system_prompt_template = llm_result.system_prompt_template.clone();
        let usage_for_result = llm_result.usage.clone();
        let actual_cost = llm_result
            .usage
            .as_ref()
            .and_then(|u| u.cost)
            .unwrap_or(0.0);

        // Return success result with the raw response content as Text data
        let success_message = format!(
            "Implementation plan '{}' generated successfully",
            generated_title
        );
        Ok(
            JobProcessResult::success(job.id.clone(), JobResultData::Text(response_content))
                .with_tokens(
                    usage_for_result.as_ref().map(|u| u.prompt_tokens as u32),
                    usage_for_result
                        .as_ref()
                        .map(|u| u.completion_tokens as u32),
                )
                .with_cache_tokens(
                    usage_for_result
                        .as_ref()
                        .map(|u| u.cache_write_tokens as i64),
                    usage_for_result
                        .as_ref()
                        .map(|u| u.cache_read_tokens as i64),
                )
                .with_system_prompt_template(system_prompt_template)
                .with_actual_cost(actual_cost),
        )
    }
}
