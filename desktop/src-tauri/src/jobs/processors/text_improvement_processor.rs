use async_trait::async_trait;
use log::{info, error};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::models::TaskType;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};


pub struct TextImprovementProcessor;

impl TextImprovementProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl JobProcessor for TextImprovementProcessor {
    fn name(&self) -> &str {
        "TextImprovementProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.task_type_str == crate::models::TaskType::TextImprovement.to_string() &&
        matches!(job.payload, JobPayload::TextImprovement(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id.clone();
        info!("Processing Text Improvement job {}", job_id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::TextImprovement(payload) => payload,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for Text Improvement job {}",
                    job_id
                )));
            }
        };
        
        // Setup job processing and update status to running
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job_id, &app_handle).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
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
            task_description: payload.text_to_improve.clone(),
            file_contents: None,
            directory_tree: None,
            codebase_structure: None,
            system_prompt_override: None,
        };
        
        info!("Executing Text Improvement LLM task for job {}", job_id);
        
        // Execute LLM task using the task runner
        let llm_result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(result) => result,
            Err(e) => {
                error!("Text Improvement LLM task execution failed: {}", e);
                let error_msg = format!("LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job_id, &error_msg).await?;
                return Ok(JobProcessResult::failure(job_id, error_msg));
            }
        };
        
        info!("Text Improvement LLM task completed successfully for job {}", job_id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // The simplified prompt returns plain text directly
        let improved_text = llm_result.response.trim().to_string();
        info!("Processing plain text response (length: {})", improved_text.len());
        
        // Use improved text or fallback to original if empty
        let final_improved_text = if improved_text.is_empty() {
            payload.text_to_improve.clone()
        } else {
            improved_text
        };
            
        info!("Final improved text (length: {}): {}", final_improved_text.len(), final_improved_text);
        
        // Create standardized metadata
        let metadata = serde_json::json!({
            "job_type": "TEXT_IMPROVEMENT",
            "workflow_stage": "TextImprovement",
            "target_field": payload.target_field
        });
        
        // Extract usage before moving it
        let usage_for_result = llm_result.usage.clone();
        
        // Use manual finalization since we need to set the response to final_improved_text
        // instead of the raw LLM response
        job_processor_utils::finalize_job_success(
            &job_id,
            &repo,
            &final_improved_text, // Use final improved text as response
            llm_result.usage,
            &model_used,
            &llm_result.system_prompt_id,
            Some(metadata),
        ).await?;
        
        info!("Completed Text Improvement job {}", job_id);
        
        let text_len = final_improved_text.len() as i32;
        
        Ok(JobProcessResult::success(job_id, final_improved_text)
            .with_tokens(
                usage_for_result.as_ref().map(|u| u.prompt_tokens as i32),
                usage_for_result.as_ref().map(|u| u.completion_tokens as i32),
                usage_for_result.as_ref().map(|u| u.total_tokens as i32),
                Some(text_len),
            ))
    }
}