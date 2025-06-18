use log::{debug, info, warn, error};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::TaskType;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{prompt_utils};
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};
use crate::utils::directory_tree::get_directory_tree_with_defaults;

pub struct RegexPatternGenerationProcessor;

impl RegexPatternGenerationProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait::async_trait]
impl JobProcessor for RegexPatternGenerationProcessor {
    fn name(&self) -> &'static str {
        "RegexPatternGenerationProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::RegexPatternGenerationWorkflow(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Extract task description from workflow payload
        let task_description_for_prompt = match &job.payload {
            JobPayload::RegexPatternGenerationWorkflow(p) => {
                p.task_description.clone()
            }
            _ => return Err(AppError::JobError("Invalid payload type for RegexPatternGenerationProcessor".to_string())),
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Generate directory tree using session-based utility (avoids duplicate session lookup)
        let directory_tree_for_prompt = match crate::utils::get_directory_tree_from_session(&job.session_id, &app_handle).await {
            Ok(tree) => {
                info!("Generated directory tree using session-based utility for regex pattern generation ({} lines)", tree.lines().count());
                Some(tree)
            }
            Err(e) => {
                warn!("Failed to generate directory tree using session-based utility: {}. Continuing without directory context.", e);
                None
            }
        };
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job.id, "regex pattern generation");
        
        // Build unified prompt using standardized helper
        let composed_prompt = prompt_utils::build_unified_prompt(
            &job,
            &app_handle,
            task_description_for_prompt.clone(),
            None,
            directory_tree_for_prompt.clone(),
            &settings_repo,
            &model_used,
        ).await?;

        info!("Enhanced Regex Pattern Generation prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_total_tokens {
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
        
        // Create prompt context
        let prompt_context = LlmPromptContext {
            task_description: task_description_for_prompt.clone(),
            file_contents: None,
            directory_tree: directory_tree_for_prompt.clone(), // This is now correctly an Option<String>
            system_prompt_override: None,
        };
        
        info!("Generating regex patterns for task: {}", &task_description_for_prompt);
        info!("Calling LLM for regex pattern generation with model {}", &model_used);
        
        // Execute LLM task using the task runner
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                error!("Regex Pattern Generation LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        info!("Regex Pattern Generation LLM task completed successfully for job {}", job.id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // Extract the response content
        let response_content = llm_result.response.clone();
        debug!("LLM response content: {}", response_content);
        
        // Attempt to parse the content as JSON
        let json_validation_result = match serde_json::from_str::<serde_json::Value>(&response_content) {
            Ok(parsed_json) => {
                debug!("Successfully parsed JSON response");
                (true, Some(parsed_json))
            },
            Err(e) => {
                warn!("Failed to parse LLM response as JSON: {}. Storing raw content.", e);
                (false, None)
            }
        };
        
        // Create custom metadata with JSON validation info
        let metadata = serde_json::json!({
            "job_type": "REGEX_PATTERN_GENERATION", // Keep for clarity
            "workflow_stage": "RegexGeneration", // Keep for clarity
            "jsonValid": json_validation_result.0,
            "parsedJsonData": json_validation_result.1 // Store parsed JSON under this key
        });
        
        // Finalize job success using task runner
        task_runner.finalize_success(
            &repo,
            &job.id,
            &llm_result,
            Some(metadata),
        ).await?;
        
        // Return success result with the raw LLM response
        Ok(JobProcessResult::success(job.id.clone(), response_content))
    }
}