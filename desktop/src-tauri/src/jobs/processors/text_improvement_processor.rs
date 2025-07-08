use std::sync::Arc;
use log::{info, error, debug};
use tauri::AppHandle;
use async_trait::async_trait;


use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};
use crate::models::TaskType;

/// Processor for text improvement (consolidates voice improvement and post-transcription improvement)
pub struct TextImprovementProcessor;

impl TextImprovementProcessor {
    pub fn new() -> Self {
        Self {}
    }
    

}

#[async_trait]
impl JobProcessor for TextImprovementProcessor {
    fn name(&self) -> &'static str {
        "TextImprovementProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::TextImprovement(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing text improvement job {}", job.id);
        
        // Extract the text to process
        let text_to_process = match &job.payload {
            JobPayload::TextImprovement(p) => p.text_to_improve.clone(),
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup repositories and mark job as running
        let (repo, session_repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get session using centralized repository
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;
        
        // Get model settings using project-aware configuration
        let model_settings = job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;
        
        // Setup LLM task configuration with explicit values from config resolution
        let llm_config = LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context
        // For text improvement, wrap in XML tags for improvement context
        let task_description = format!(
            r#"<text_to_improve>
{}
</text_to_improve>"#,
            text_to_process
        );
        
        let prompt_context = LlmPromptContext {
            task_description,
            file_contents: None,
            directory_tree: None,
        };
        
        debug!("Sending text improvement request to LLM with model: {}", model_used);
        
        // Execute LLM task using the task runner
        let result = match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(llm_result) => {
                info!("Text improvement LLM task completed successfully for job {}", job.id);
                info!("System prompt ID: {}", llm_result.system_prompt_id);
                
                let processed_text = llm_result.response.clone();
                let text_len = processed_text.len() as i32;
                let system_prompt_template = llm_result.system_prompt_template.clone();
                let actual_cost = llm_result.usage.as_ref().and_then(|u| u.cost).unwrap_or(0.0);
                
                // Create and return the result
                JobProcessResult::success(job.id.to_string(), JobResultData::Text(processed_text))
                    .with_tokens(
                        llm_result.usage.as_ref().map(|u| u.prompt_tokens as u32),
                        llm_result.usage.as_ref().map(|u| u.completion_tokens as u32)
                    )
                    .with_system_prompt_template(system_prompt_template)
                    .with_actual_cost(actual_cost)
            },
            Err(e) => {
                let error_message = format!("Text improvement failed: {}", e);
                error!("{}", error_message);
                
                // Return failure result
                JobProcessResult::failure(job.id.to_string(), error_message)
            }
        };
        
        info!("Completed text improvement job {}", job.id);
        Ok(result)
    }
}