use async_trait::async_trait;
use log::{info, error, debug};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::api_clients::client_trait::ApiClientOptions;
use crate::db_utils::{BackgroundJobRepository, SettingsRepository};
use crate::models::{JobStatus, OpenRouterRequestMessage, OpenRouterContent, TaskType};
use crate::utils::{PromptComposer, CompositionContextBuilder};


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
        
        // Get the repositories from app state
        let repo = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>().inner().clone();
        let settings_repo = app_handle.state::<std::sync::Arc<SettingsRepository>>().inner().clone();
        
        // Update job status to running
        repo.update_job_status(&job_id, &JobStatus::Running.to_string(), Some("Processing text improvement")).await?;
        
        // Create enhanced composition context for prompt generation
        let composition_context = CompositionContextBuilder::new(
            job.session_id.clone(),
            TaskType::TextImprovement,
            payload.text_to_improve.clone(),
        )
        .build();

        // Use the enhanced prompt composer to generate sophisticated prompts
        let prompt_composer = PromptComposer::new();
        let composed_prompt = prompt_composer
            .compose_prompt(&composition_context, &settings_repo)
            .await?;

        info!("Enhanced Text Improvement prompt composition for job {}", job_id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Extract system and user parts from the composed prompt
        let system_prompt_text = composed_prompt.final_prompt.split("\n\n").next().unwrap_or("").to_string();
        let user_prompt_text = composed_prompt.final_prompt.split("\n\n").skip(1).collect::<Vec<&str>>().join("\n\n");
        let system_prompt_id = composed_prompt.system_prompt_id;
        
        info!("Text Improvement prompts for job {}", job_id);
        info!("System prompt: {}", system_prompt_text);
        info!("User prompt: {}", user_prompt_text);
        
        // Get the LLM client using the standardized factory function
        let client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        // Create the message objects for the OpenRouter request
        let system_message = OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: system_prompt_text.clone(),
            }],
        };
        
        let user_message = OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: user_prompt_text.clone(),
            }],
        };
        
        let messages = vec![system_message, user_message];
        
        // Combine messages for token estimation
        let combined_prompt = format!("{}\n{}", system_prompt_text, user_prompt_text);
        
        // Estimate the tokens in the prompt
        let _prompt_tokens = crate::utils::token_estimator::estimate_tokens(&combined_prompt);
        
        // Fetch the database job to get model_used
        let db_job = repo.get_job_by_id(&job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;
        
        // Determine the model to use - prefer job's stored model, then project settings, then server defaults
        let project_directory = payload.project_directory.as_deref().unwrap_or("");
        let model_to_use = match db_job.model_used {
            Some(model) if !model.is_empty() => model,
            _ => crate::config::get_model_for_task_with_project(crate::models::TaskType::TextImprovement, project_directory, &app_handle).await?,
        };
        
        // Get max tokens and temperature - prefer job's stored values, then project settings, then server defaults
        let max_tokens = match db_job.max_output_tokens {
            Some(tokens) if tokens > 0 => Some(tokens as u32),
            _ => match crate::config::get_max_tokens_for_task_with_project(crate::models::TaskType::TextImprovement, project_directory, &app_handle).await {
                Ok(tokens) => Some(tokens),
                Err(e) => return Err(AppError::ConfigError(format!("Failed to get max_tokens for TextImprovement task: {}. Please ensure server database is properly configured.", e))),
            }
        };
        
        let temperature = match db_job.temperature {
            Some(temp) => Some(temp),
            _ => match crate::config::get_temperature_for_task_with_project(crate::models::TaskType::TextImprovement, project_directory, &app_handle).await {
                Ok(temp) => Some(temp),
                Err(e) => return Err(AppError::ConfigError(format!("Failed to get temperature for TextImprovement task: {}. Please ensure server database is properly configured.", e))),
            }
        };
        
        // Create the options with values from config
        let options = ApiClientOptions {
            model: model_to_use.clone(),
            max_tokens,
            temperature,
            stream: false,
        };
        
        debug!("Using model: {} for Text Improvement", model_to_use);
        
        // Send the request with the messages
        let response = client.chat_completion(messages, options).await?;
        
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
        
        // Get usage statistics
        let tokens_sent = response.usage.as_ref().map(|u| u.prompt_tokens as i32);
        let tokens_received = response.usage.as_ref().map(|u| u.completion_tokens as i32);
        let total_tokens = response.usage.as_ref().map(|u| u.total_tokens as i32);
        
        info!("Token usage - Sent: {:?}, Received: {:?}, Total: {:?}", tokens_sent, tokens_received, total_tokens);
        
        // Use improved text or fallback to original if empty
        let final_improved_text = if improved_text.is_empty() {
            payload.text_to_improve.clone()
        } else {
            improved_text
        };
            
        info!("Final improved text (length: {}): {}", final_improved_text.len(), final_improved_text);
        
        // Serialize simple metadata
        let metadata = serde_json::json!({
            "modelUsed": model_to_use,
            "tokensUsed": total_tokens,
        });
        
        // Update the job with the response and metadata
        repo.update_job_response_with_system_prompt(
            &job_id, 
            &final_improved_text,
            Some(JobStatus::Completed),
            Some(&metadata.to_string()),
            tokens_sent,
            tokens_received,
            total_tokens,
            Some(final_improved_text.len() as i32),
            Some(&system_prompt_id),
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