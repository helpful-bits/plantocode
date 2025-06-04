use std::sync::Arc;
use log::{info, error, debug};
use tauri::AppHandle;
use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};
use crate::models::TaskType;

/// Processor for text correction (consolidates voice correction and post-transcription correction)
pub struct TextCorrectionProcessor;

impl TextCorrectionProcessor {
    pub fn new() -> Self {
        Self {}
    }
    

}

#[async_trait]
impl JobProcessor for TextCorrectionProcessor {
    fn name(&self) -> &'static str {
        "TextCorrectionProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::TextCorrection(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing text correction job {}", job.id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::TextCorrection(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup repositories and mark job as running
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
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
        // Format the text as XML for correction context
        let task_description = format!(
            r#"<text_to_correct>
{}
</text_to_correct>"#,
            payload.text_to_correct
        );
        
        let prompt_context = LlmPromptContext {
            task_description,
            file_contents: None,
            directory_tree: None,
            codebase_structure: None,
            system_prompt_override: None,
        };
        
        debug!("Sending text correction request to LLM with model: {}", model_used);
        
        // Execute LLM task using the task runner
        let result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(llm_result) => {
                info!("Text Correction LLM task completed successfully for job {}", job.id);
                info!("System prompt ID: {}", llm_result.system_prompt_id);
                
                let corrected_text = llm_result.response.clone();
                let text_len = corrected_text.len() as i32;
                
                // Finalize job success using task runner
                task_runner.finalize_success(
                    &repo,
                    &job.id,
                    &llm_result,
                    None,
                ).await?;
                
                // Create and return the result
                JobProcessResult::success(job.id.to_string(), corrected_text)
                    .with_tokens(
                        llm_result.usage.as_ref().map(|u| u.prompt_tokens as i32),
                        llm_result.usage.as_ref().map(|u| u.completion_tokens as i32),
                        llm_result.usage.as_ref().map(|u| u.total_tokens as i32),
                        Some(text_len)
                    )
            },
            Err(e) => {
                let error_message = format!("Text correction failed: {}", e);
                error!("{}", error_message);
                
                // Finalize job failure using task runner
                task_runner.finalize_failure(&repo, &job.id, &error_message).await?;
                
                // Return failure result
                JobProcessResult::failure(job.id.to_string(), error_message)
            }
        };
        
        info!("Completed text correction job {}", job.id);
        Ok(result)
    }
}