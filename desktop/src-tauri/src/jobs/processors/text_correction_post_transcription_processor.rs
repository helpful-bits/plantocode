use std::sync::Arc;
use log::{info, error, debug};
use tauri::{AppHandle, Manager};
use async_trait::async_trait;

use crate::api_clients::client_trait::{ApiClient, ApiClientOptions};
use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_helpers;
use crate::models::{OpenRouterRequestMessage, OpenRouterContent};
use crate::db_utils::background_job_repository::BackgroundJobRepository;

/// Processor for text correction after transcription
pub struct TextCorrectionPostTranscriptionProcessor;

impl TextCorrectionPostTranscriptionProcessor {
    pub fn new() -> Self {
        Self {}
    }
    
    /// Helper method to create system prompt for text correction
    fn create_system_prompt(&self, language: &str) -> String {
        format!(
            r#"You are a helpful assistant that corrects and cleans up transcribed spoken text. 
            Your goal is to make the text more readable without changing the meaning.
            The text is in {language}.

            When correcting text:
            1. Fix grammatical errors and typos
            2. Add proper punctuation and capitalization
            3. Remove filler words (um, uh, like, etc.) and repeated words
            4. Split run-on sentences into proper sentences
            5. Structure text into paragraphs when appropriate
            6. Preserve the original meaning and intent
            7. Maintain technical terms, names, and specific terminology mentioned

            Keep the language natural and conversational - don't make it overly formal.
            Return ONLY the corrected text without comments or explanations."#, 
            language = language
        )
    }
}

#[async_trait]
impl JobProcessor for TextCorrectionPostTranscriptionProcessor {
    fn name(&self) -> &'static str {
        "TextCorrectionPostTranscriptionProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::TextCorrectionPostTranscription(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing text correction post transcription job {}", job.id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::TextCorrectionPostTranscription(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Get the API client
        let llm_client = app_handle.state::<Arc<dyn ApiClient>>();
        
        // Update job status to running
        let repo = app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        job_helpers::update_job_status_running(&repo, &job.id).await?;
        
        // Create messages for the LLM
        let system_prompt = self.create_system_prompt(&payload.language);
        
        let system_message = OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![
                OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: system_prompt,
                },
            ],
        };
        
        let user_message = OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![
                OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: payload.text_to_correct.clone(),
                },
            ],
        };
        
        // Get the model and settings from app config
        // Default to text improvement models if the specific ones aren't available
        let model = match crate::config::get_model_for_task(crate::models::TaskType::TextCorrectionPostTranscription) {
            Ok(m) => m,
            Err(_) => match crate::config::get_model_for_task(crate::models::TaskType::TextImprovement) {
                Ok(m) => m,
                Err(e) => return Err(AppError::ConfigError(format!("Failed to get model: {}", e))),
            },
        };
        
        let temperature = match crate::config::get_default_temperature_for_task(Some(crate::models::TaskType::TextCorrectionPostTranscription)) {
            Ok(t) => t,
            Err(_) => match crate::config::get_default_temperature_for_task(Some(crate::models::TaskType::TextImprovement)) {
                Ok(t) => t,
                Err(_) => 0.7, // Default fallback
            },
        };
        
        let max_tokens = match crate::config::get_default_max_tokens_for_task(Some(crate::models::TaskType::TextCorrectionPostTranscription)) {
            Ok(t) => t,
            Err(_) => match crate::config::get_default_max_tokens_for_task(Some(crate::models::TaskType::TextImprovement)) {
                Ok(t) => t,
                Err(_) => 2000, // Default fallback
            },
        };
        
        // Create options for the API client
        let api_options = ApiClientOptions {
            model,
            max_tokens: Some(max_tokens),
            temperature: Some(temperature),
            stream: false,
        };
        
        // Send the request to the LLM
        debug!("Sending text correction request to LLM");
        let result = match llm_client.chat_completion(vec![system_message, user_message], api_options).await {
            Ok(response) => {
                if response.choices.is_empty() {
                    error!("Empty response from LLM");
                    return Err(AppError::JobError("Empty response from LLM".to_string()));
                }
                
                let corrected_text = response.choices[0].message.content.clone();
                
                // Extract usage stats
                let usage = response.usage.as_ref();
                let prompt_tokens = usage.map(|u| u.prompt_tokens as i32);
                let completion_tokens = usage.map(|u| u.completion_tokens as i32);
                let total_tokens = usage.map(|u| u.total_tokens as i32);
                let chars_received = Some(corrected_text.len() as i32);
                
                // Update job with the corrected text
                job_helpers::update_job_status_completed(
                    &repo, 
                    &job.id, 
                    &corrected_text, 
                    prompt_tokens, 
                    completion_tokens, 
                    total_tokens, 
                    chars_received
                ).await?;
                
                // Create and return the result
                JobProcessResult::success(job.id.to_string(), corrected_text)
                    .with_tokens(prompt_tokens, completion_tokens, total_tokens, chars_received)
            },
            Err(e) => {
                let error_message = format!("Text correction failed: {}", e);
                error!("{}", error_message);
                
                // Update job status to failed
                job_helpers::update_job_status_failed(&repo, &job.id, &error_message).await?;
                
                // Return failure result
                JobProcessResult::failure(job.id.to_string(), error_message)
            }
        };
        
        info!("Completed text correction post transcription job {}", job.id);
        Ok(result)
    }
}