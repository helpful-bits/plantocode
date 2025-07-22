use futures::future;
use log::{debug, info, warn};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::processors::{
    LlmPromptContext, LlmTaskConfigBuilder, LlmTaskResult, LlmTaskRunner,
};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData};
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
        let (repo, session_repo, settings_repo, background_job) =
            job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Get session
        let session = session_repo
            .get_session_by_id(&job.session_id)
            .await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        // Generate directory tree for context
        let directory_tree = match crate::utils::directory_tree::get_directory_tree_with_defaults(
            &session.project_directory,
        )
        .await
        {
            Ok(tree) => Some(tree),
            Err(e) => {
                warn!("Failed to generate directory tree: {}", e);
                None
            }
        };

        // Extract payload data - expect Vec<String> of sophisticated research prompts
        let prompts = match &job.payload {
            JobPayload::WebSearchExecution(payload) => payload.prompts.clone(),
            _ => {
                return Err(AppError::JobError(
                    "Invalid payload type for WebSearchExecutor - expected WebSearchExecution"
                        .to_string(),
                ));
            }
        };

        // Validate that prompts are properly formatted (extracted from sophisticated XML)
        let prompts_to_execute = prompts.clone();

        // Handle edge case of empty prompts from sophisticated research task
        if prompts_to_execute.is_empty() {
            let error_msg = "No research prompts extracted from sophisticated XML research task";
            return Ok(JobProcessResult::failure(
                job.id.clone(),
                error_msg.to_string(),
            ));
        }

        // Get model settings using project-aware configuration
        let model_settings =
            job_processor_utils::get_llm_task_config(&background_job, &app_handle, &session)
                .await?;
        let (model_used, temperature, max_output_tokens) = model_settings;

        // Setup LLM task configuration
        let llm_config =
            LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
                .stream(false)
                .build();

        // Add aggregation variables
        let mut total_prompt_tokens = 0u32;
        let mut total_completion_tokens = 0u32;
        let mut total_cost = 0.0f64;
        let mut system_prompt_template: Option<String> = None;
        let mut executed_prompts: Vec<String> = Vec::new();

        // Execute prompts in parallel and extract titles
        let prompt_tasks = prompts_to_execute
            .into_iter()
            .enumerate()
            .map(|(index, prompt)| {
                let app_handle = app_handle.clone();
                let job = job.clone();
                let llm_config = llm_config.clone();
                let settings_repo = settings_repo.clone();
                let prompt_clone = prompt.clone();
                let directory_tree_clone = directory_tree.clone();

                async move {
                    // Extract title from the research task XML
                    use crate::utils::xml_utils::extract_task_title;
                    let title = extract_task_title(&prompt)
                        .unwrap_or_else(|| format!("Research Task {}", index + 1));

                    // Create task runner for this sophisticated research prompt
                    let task_runner = LlmTaskRunner::new(app_handle, job, llm_config);

                    let prompt_context = LlmPromptContext {
                        task_description: prompt_clone,
                        file_contents: None,
                        directory_tree: directory_tree_clone,
                    };

                    task_runner
                        .execute_llm_task(prompt_context, &settings_repo)
                        .await
                        .map(|result| (title, result))
                        .map_err(|e| format!("Prompt '{}' failed: {}", prompt, e))
                }
            })
            .collect::<Vec<_>>();

        // Execute all prompts in parallel
        let results = future::join_all(prompt_tasks).await;

        // Process results and handle partial failures
        let mut successful_results = Vec::new();
        let mut failed_prompts = Vec::new();

        for (i, result) in results.into_iter().enumerate() {
            match result {
                Ok((title, llm_result)) => {
                    // Capture system prompt from first result
                    if system_prompt_template.is_none() {
                        system_prompt_template = Some(llm_result.system_prompt_template);
                    }

                    // Aggregate usage data
                    if let Some(usage) = &llm_result.usage {
                        total_prompt_tokens += usage.prompt_tokens as u32;
                        total_completion_tokens += usage.completion_tokens as u32;
                        total_cost += usage.cost.unwrap_or(0.0);
                    }

                    // Store the executed prompt
                    if i < prompts.len() {
                        executed_prompts.push(prompts[i].clone());
                    }

                    successful_results.push((title, llm_result.response));
                }
                Err(error) => {
                    failed_prompts.push(format!("Prompt {}: {}", i + 1, error));
                }
            }
        }

        // Check if we have any successful results from sophisticated research
        if successful_results.is_empty() {
            let error_msg = format!(
                "All sophisticated research prompts failed. Failures: {}",
                failed_prompts.join("; ")
            );
            return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
        }

        // Create JSON array of search results for data extraction compatibility
        let mut search_results = Vec::new();

        for (title, result) in successful_results.iter() {
            search_results.push(json!({
                "title": title,
                "findings": result.trim()
            }));
        }

        // Create standardized summary
        let summary = if search_results.len() > 0 {
            format!("Found {} research findings", search_results.len())
        } else {
            "No research findings".to_string()
        };

        // Store result metadata for sophisticated research task
        let result_metadata = json!({
            "modelUsed": model_used,
            "summary": summary,
            "totalPrompts": successful_results.len() + failed_prompts.len(),
            "successfulPrompts": successful_results.len(),
            "failedPrompts": failed_prompts.len(),
            "parallelExecution": true,
            "sophisticatedResearch": true,
            "outputFormat": "JSON array of research results",
            "failures": failed_prompts,
            "executedPrompts": executed_prompts.clone()
        });

        debug!(
            "Sophisticated research execution completed for job {}",
            job.id
        );

        // Create the job's prompt text from executed prompts
        let prompt_text = executed_prompts.join("\n\n---\n\n");

        // Update the job's prompt field with the executed prompts
        repo.update_job_prompt(&job.id, &prompt_text).await?;

        // Return success result with JSON format expected by data extraction
        let result_json = json!({
            "searchResults": search_results,
            "searchResultsCount": search_results.len(),
            "summary": summary
        });

        Ok(JobProcessResult::success_with_metadata(
            job.id.clone(),
            JobResultData::Json(result_json),
            result_metadata,
        )
        .with_tokens(Some(total_prompt_tokens), Some(total_completion_tokens))
        .with_system_prompt_template(system_prompt_template.unwrap_or_default())
        .with_actual_cost(total_cost))
    }
}
