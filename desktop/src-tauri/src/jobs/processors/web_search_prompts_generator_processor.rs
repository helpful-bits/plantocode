use log::{debug, info, warn};
use serde_json::json;
use tauri::AppHandle;
use tokio::fs;

use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::processors::{LlmPromptContext, LlmTaskConfigBuilder, LlmTaskRunner};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData};
use crate::models::TaskType;
use crate::utils::xml_utils::{
    extract_query_from_task, extract_research_tasks, extract_task_title, split_research_documents,
};

pub struct WebSearchPromptsGeneratorProcessor;

impl WebSearchPromptsGeneratorProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Parse XML response to extract multiple sophisticated research task prompts
    fn parse_xml_response(&self, response: &str) -> (Vec<String>, serde_json::Value) {
        debug!("Parsing XML response for sophisticated research tasks");

        // Extract complete research task XML documents (these become the prompts)
        let research_task_prompts = extract_research_tasks(response);

        let parsing_info = serde_json::json!({
            "xmlParsingAttempted": true,
            "researchTasksFound": research_task_prompts.len(),
            "sophisticatedPrompts": true
        });

        // If no research tasks found from XML parsing, this is an error condition
        if research_task_prompts.is_empty() {
            debug!(
                "No research tasks extracted from XML - this indicates a problem with the XML format"
            );
        }

        (research_task_prompts, parsing_info)
    }
}

#[async_trait::async_trait]
impl JobProcessor for WebSearchPromptsGeneratorProcessor {
    fn name(&self) -> &'static str {
        "WebSearchPromptsGeneratorProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::WebSearchPromptsGeneration(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let (repo, session_repo, settings_repo, background_job) =
            job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;

        // Get session
        let session = session_repo
            .get_session_by_id(&job.session_id)
            .await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;

        // Extract payload data
        let task_description = match &job.payload {
            JobPayload::WebSearchPromptsGeneration(payload) => payload.task_description.clone(),
            _ => {
                return Err(AppError::JobError(
                    "Invalid payload type for WebSearchPromptsGenerator".to_string(),
                ));
            }
        };

        // Use included_files from session (UI selection) instead of payload files
        let relevant_files = session.included_files.clone();

        // Get model settings using project-aware configuration
        let model_settings =
            job_processor_utils::get_llm_task_config(&background_job, &app_handle, &session)
                .await?;
        let (model_used, temperature, max_output_tokens) = model_settings;

        // Setup LLM task configuration
        let llm_config =
            LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
                .stream(true)
                .build();

        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);

        // Use simple task description - let the system prompt handle formatting and file contents

        // Load content of files in relevant_files
        let mut file_contents = std::collections::HashMap::new();
        for relative_path_str in &relevant_files {
            let full_path =
                std::path::Path::new(&session.project_directory).join(relative_path_str);
            match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    file_contents.insert(relative_path_str.clone(), content);
                }
                Err(e) => {
                    warn!("Failed to read file {}: {}", full_path.display(), e);
                }
            }
        }

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

        // Create prompt context - use original task description, system prompt will handle formatting
        let prompt_context = LlmPromptContext {
            task_description: task_description.clone(),
            file_contents: Some(file_contents),
            directory_tree,
        };

        // Execute LLM task with streaming to handle large responses properly
        let llm_result = match task_runner
            .execute_streaming_llm_task(prompt_context, &settings_repo, &repo, &job.id)
            .await
        {
            Ok(result) => result,
            Err(e) => {
                let error_msg = format!(
                    "WebSearchPromptsGeneration LLM task execution failed: {}",
                    e
                );
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        // Extract system prompt template and actual cost
        let system_prompt_template = llm_result.system_prompt_template.clone();
        let actual_cost = llm_result
            .usage
            .as_ref()
            .and_then(|u| u.cost)
            .unwrap_or(0.0);

        // Parse XML response to extract sophisticated research task prompts
        let (prompts, parsing_info) = self.parse_xml_response(&llm_result.response);

        if prompts.is_empty() {
            let error_msg = "No research prompts could be extracted from LLM response. This indicates the LLM did not follow the expected format.";
            return Ok(JobProcessResult::failure(
                job.id.clone(),
                error_msg.to_string(),
            ));
        }

        let summary = if prompts.len() > 0 {
            format!("Generated {} research prompts", prompts.len())
        } else {
            "No research prompts generated".to_string()
        };

        // Create structured JSON result
        let result_json = json!({
            "prompts": prompts.clone(),
            "promptCount": prompts.len(),
            "queries": prompts.iter()
                .filter_map(|p| extract_query_from_task(p))
                .collect::<Vec<_>>(),
            "summary": summary
        });

        // Store metadata with workflow data for orchestrator and display data
        let enhanced_metadata = json!({
            "taskDescription": task_description,
            "selectedFilesCount": relevant_files.len(),
            "modelUsed": model_used,
            "promptsCount": prompts.len(),
            "prompts": prompts,
            "parsingInfo": parsing_info,
            "summary": summary,
            "workflowData": {
                "prompts": prompts,
                "promptsCount": prompts.len(),
                "parsingInfo": parsing_info
            }
        });

        debug!("WebSearchPromptsGeneration completed for job {}", job.id);

        // Return success result with structured JSON and preserved LLM data
        Ok(JobProcessResult::success_with_metadata(
            job.id.clone(),
            JobResultData::Json(result_json),
            enhanced_metadata,
        )
        .with_tokens(
            llm_result.usage.as_ref().map(|u| u.prompt_tokens as u32),
            llm_result
                .usage
                .as_ref()
                .map(|u| u.completion_tokens as u32),
        )
        .with_system_prompt_template(system_prompt_template)
        .with_actual_cost(actual_cost))
    }
}
