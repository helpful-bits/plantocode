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
        info!("Processing text correction/improvement job {}", job.id);
        
        // Extract the text to process
        let (text_to_process, is_correction_task, target_field) = match &job.payload {
            JobPayload::TextCorrection(p) => (p.text_to_correct.clone(), true, None::<String>),
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup repositories and mark job as running
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
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
        // Format the text appropriately based on task type
        let task_description = if is_correction_task {
            // For text correction, wrap in XML tags for correction context
            format!(
                r#"<text_to_correct>
{}
</text_to_correct>"#,
                text_to_process
            )
        } else {
            // For text improvement, use the text directly as task description
            text_to_process.clone()
        };
        
        let prompt_context = LlmPromptContext {
            task_description,
            file_contents: None,
            directory_tree: None,
            system_prompt_override: None,
        };
        
        debug!("Sending text correction request to LLM with model: {}", model_used);
        
        // Execute LLM task using the task runner
        let result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(llm_result) => {
                info!("Text {}/{} LLM task completed successfully for job {}", 
                       if is_correction_task { "Correction" } else { "Improvement" }, 
                       if is_correction_task { "Correction" } else { "Improvement" },
                       job.id);
                info!("System prompt ID: {}", llm_result.system_prompt_id);
                
                let processed_text = llm_result.response.clone();
                let text_len = processed_text.len() as i32;
                
                // Create metadata based on task type
                let metadata = if is_correction_task {
                    serde_json::json!({
                        "job_type": "TEXT_CORRECTION",
                        "workflow_stage": "TextCorrection"
                    })
                } else {
                    serde_json::json!({
                        "job_type": "TEXT_IMPROVEMENT",
                        "workflow_stage": "TextCorrection",
                        "target_field": target_field
                    })
                };
                
                // Finalize job success using task runner
                task_runner.finalize_success(
                    &repo,
                    &job.id,
                    &llm_result,
                    Some(metadata),
                ).await?;
                
                // Create and return the result
                JobProcessResult::success(job.id.to_string(), processed_text)
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
                task_runner.finalize_failure(&repo, &job.id, &error_message, Some(&e)).await?;
                
                // Return failure result
                JobProcessResult::failure(job.id.to_string(), error_message)
            }
        };
        
        info!("Completed text correction job {}", job.id);
        Ok(result)
    }
}