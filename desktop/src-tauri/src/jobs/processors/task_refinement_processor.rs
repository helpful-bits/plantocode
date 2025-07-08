use async_trait::async_trait;
use log::{info, error, debug, warn};
use tauri::AppHandle;
use tokio::fs;

use crate::utils::config_resolver;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData};
use crate::jobs::processor_trait::JobProcessor;
use crate::models::TaskType;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};

pub struct TaskRefinementProcessor;

impl TaskRefinementProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl JobProcessor for TaskRefinementProcessor {
    fn name(&self) -> &str {
        "TaskRefinementProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.task_type_str() == TaskType::TaskRefinement.to_string() &&
        matches!(job.payload, JobPayload::TaskRefinement(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id().to_string();
        info!("Processing Task Refinement job {}", job_id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::TaskRefinement(payload) => payload,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for Task Refinement job {}",
                    job_id
                )));
            }
        };
        
        // Setup job processing
        let (repo, session_repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job_id, &app_handle).await?;
        
        // Get session using centralized repository
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;
        
        // Get model settings using centralized config resolution
        let model_settings = config_resolver::resolve_model_settings(
            &app_handle,
            job.task_type,
            &session.project_directory,
            None, // model_override
            None, // temperature_override  
            None, // max_tokens_override
        ).await?
        .ok_or_else(|| AppError::ConfigError(format!("Task {:?} requires LLM configuration", job.task_type)))?;

        let (model_used, temperature, max_output_tokens) = model_settings;
        
        job_processor_utils::log_job_start(&job_id, "task refinement");
        let project_directory = &session.project_directory;
        
        // Load content of files in payload.relevant_files
        let mut file_contents = std::collections::HashMap::new();
        for relative_path_str in &payload.relevant_files {
            let full_path = std::path::Path::new(project_directory).join(relative_path_str);
            match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    file_contents.insert(relative_path_str.clone(), content);
                }
                Err(e) => {
                    warn!("Failed to read file {}: {}", full_path.display(), e);
                }
            }
        }
        
        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context with file contents
        let prompt_context = LlmPromptContext {
            task_description: payload.task_description.clone(),
            file_contents: Some(file_contents),
            directory_tree: None,
        };
        
        debug!("Using model: {} for Task Refinement", model_used);
        
        // Execute LLM task using the task runner
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                error!("Task Refinement LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                return Ok(JobProcessResult::failure(job_id, error_msg));
            }
        };
        
        info!("Task Refinement LLM task completed successfully for job {}", job_id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        let refined_content = llm_result.response.trim().to_string();
        
        // Format the response with structured appending: original + refinement
        let structured_response = format!(
            "{}\n\n---\n\n<refined_task>\n{}\n</refined_task>",
            payload.task_description,
            refined_content
        );
        
        // Extract usage and system prompt template before moving it
        let usage_for_result = llm_result.usage.clone();
        let system_prompt_template = llm_result.system_prompt_template.clone();
        let actual_cost = llm_result.usage.as_ref().and_then(|u| u.cost).unwrap_or(0.0);
        
        info!("Completed Task Refinement job {}", job_id);
        
        // Return success result with structured text data
        Ok(JobProcessResult::success(job_id, JobResultData::Text(structured_response))
            .with_tokens(
                usage_for_result.as_ref().map(|u| u.prompt_tokens as u32),
                usage_for_result.as_ref().map(|u| u.completion_tokens as u32)
            )
            .with_system_prompt_template(system_prompt_template)
            .with_actual_cost(actual_cost))
    }
}