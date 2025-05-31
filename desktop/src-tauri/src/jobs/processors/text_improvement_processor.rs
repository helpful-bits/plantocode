use async_trait::async_trait;
use log::{info, error};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::models::TaskType;
use crate::jobs::job_processor_utils;


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
        
        // Setup repositories and update job status to running
        let (repo, settings_repo) = job_processor_utils::setup_repositories(&app_handle)?;
        job_processor_utils::update_status_running(&repo, &job_id, "Processing text improvement").await?;
        
        // Build unified prompt using standardized utility
        let composed_prompt = job_processor_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.text_to_improve.clone(),
            None, // codebase_structure
            None, // file_contents
            None, // directory_tree
            &settings_repo,
        ).await?;

        info!("Enhanced Text Improvement prompt composition for job {}", job_id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Extract system and user parts from the composed prompt
        let (system_prompt_text, user_prompt_text, system_prompt_id) = 
            job_processor_utils::extract_prompts_from_composed(&composed_prompt);
        
        info!("Text Improvement prompts for job {}", job_id);
        info!("System prompt: {}", system_prompt_text);
        info!("User prompt: {}", user_prompt_text);
        
        // Create the message objects for the OpenRouter request
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt_text, &user_prompt_text);
        
        // Create API options and execute LLM request
        let project_directory = payload.project_directory.as_deref().unwrap_or("");
        let options = job_processor_utils::create_api_client_options(
            &job.payload,
            TaskType::TextImprovement,
            project_directory,
            false,
            &app_handle,
        ).await?;
        
        let response = job_processor_utils::execute_llm_chat_completion(&app_handle, messages, &options).await?;
        
        // LOG: Full OpenRouter response for debugging
        info!("OpenRouter Text Improvement Response - Job ID: {}", job_id);
        info!("Full Response: {:#?}", response);
        
        // Extract the response content
        let response_content = if !response.choices.is_empty() {
            let content = response.choices[0].message.content.clone();
            info!("Extracted content from OpenRouter response: {}", content);
            content
        } else {
            error!("No response choices received from OpenRouter API");
            return Err(AppError::JobError("No response content received from API".to_string()));
        };
        
        // The simplified prompt returns plain text directly
        let improved_text = response_content.trim().to_string();
        info!("Processing plain text response (length: {})", improved_text.len());
        
        // Get usage statistics before moving the response
        let tokens_sent = response.usage.as_ref().map(|u| u.prompt_tokens as i32);
        let tokens_received = response.usage.as_ref().map(|u| u.completion_tokens as i32);
        let total_tokens = response.usage.as_ref().map(|u| u.total_tokens as i32);
        let usage_clone = response.usage.clone();
        
        info!("Token usage - Sent: {:?}, Received: {:?}, Total: {:?}", tokens_sent, tokens_received, total_tokens);
        
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
        
        // Finalize job success
        job_processor_utils::finalize_job_success(
            &job_id,
            &repo,
            &final_improved_text,
            usage_clone,
            &options.model,
            &system_prompt_id,
            Some(metadata),
        ).await?;
        
        info!("Completed Text Improvement job {}", job_id);
        info!("Tokens sent: {:?}, Tokens received: {:?}", tokens_sent, tokens_received);
        
        let text_len = final_improved_text.len() as i32;
        
        Ok(JobProcessResult::success(job_id, final_improved_text)
            .with_tokens(
                tokens_sent,
                tokens_received,
                total_tokens,
                Some(text_len),
            ))
    }
}