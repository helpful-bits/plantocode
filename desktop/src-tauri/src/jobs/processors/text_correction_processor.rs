use std::sync::Arc;
use log::{info, error, debug};
use tauri::AppHandle;
use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_processor_utils;
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
        let (repo, settings_repo, _background_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Build unified prompt using the standardized utility
        let composed_prompt = job_processor_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.text_to_correct.clone(),
            None, // codebase_structure
            None, // file_contents
            None, // directory_tree
            &settings_repo,
        ).await?;

        info!("Enhanced Text Correction prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Extract system and user prompts from the composed result using helper
        let (system_prompt, user_prompt, system_prompt_id) = job_processor_utils::extract_prompts_from_composed(&composed_prompt);
        
        // Create messages using helper
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Create API options using helper
        let api_options = job_processor_utils::create_api_client_options(
            &job.payload,
            TaskType::TextCorrection,
            payload.project_directory.as_deref().unwrap_or(""),
            false,
            &app_handle,
        ).await?;
        
        // Send the request to the LLM using helper
        debug!("Sending text correction request to LLM");
        let model_name = api_options.model.clone(); // Clone before move
        let result = match job_processor_utils::execute_llm_chat_completion(&app_handle, messages, &api_options).await {
            Ok(response) => {
                if response.choices.is_empty() {
                    error!("Empty response from LLM");
                    return Err(AppError::JobError("Empty response from LLM".to_string()));
                }
                
                let corrected_text = response.choices[0].message.content.clone();
                let text_len = corrected_text.len() as i32;
                let usage_clone = response.usage.clone();
                
                // Finalize job success using helper
                job_processor_utils::finalize_job_success(
                    &job.id,
                    &repo,
                    &corrected_text,
                    usage_clone.clone(),
                    &model_name,
                    &system_prompt_id,
                    None,
                ).await?;
                
                // Create and return the result
                JobProcessResult::success(job.id.to_string(), corrected_text)
                    .with_tokens(
                        usage_clone.as_ref().map(|u| u.prompt_tokens as i32),
                        usage_clone.as_ref().map(|u| u.completion_tokens as i32),
                        usage_clone.as_ref().map(|u| u.total_tokens as i32),
                        Some(text_len)
                    )
            },
            Err(e) => {
                let error_message = format!("Text correction failed: {}", e);
                error!("{}", error_message);
                
                // Finalize job failure using helper
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_message).await?;
                
                // Return failure result
                JobProcessResult::failure(job.id.to_string(), error_message)
            }
        };
        
        info!("Completed text correction job {}", job.id);
        Ok(result)
    }
}