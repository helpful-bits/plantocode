use std::sync::Arc;
use log::{info, error, debug, warn};
use tauri::{AppHandle, Manager};
use async_trait::async_trait;

use crate::api_clients::client_trait::{ApiClient, ApiClientOptions};
use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::job_helpers;
use crate::models::{OpenRouterRequestMessage, OpenRouterContent, TaskType};
use crate::db_utils::{BackgroundJobRepository, SettingsRepository};
use crate::utils::{PromptComposer, CompositionContextBuilder};

/// Processor for text correction (consolidates voice correction and post-transcription correction)
pub struct TextCorrectionProcessor;

impl TextCorrectionProcessor {
    pub fn new() -> Self {
        Self {}
    }
    

    /// Helper method to get model with fallback logic
    async fn get_model_with_fallback(
        app_handle: &AppHandle,
        project_dir: &str,
        primary_task: crate::models::TaskType,
        fallback_task: crate::models::TaskType,
    ) -> AppResult<String> {
        match crate::config::get_model_for_task_with_project(primary_task, project_dir, app_handle).await {
            Ok(model) => Ok(model),
            Err(e_primary) => {
                warn!("Failed to get model for primary task {}: {}. Trying fallback.", primary_task.to_string(), e_primary);
                crate::config::get_model_for_task_with_project(fallback_task, project_dir, app_handle).await.map_err(|e_fallback| {
                    error!("Failed to get model for fallback task {}: {}. No model determined.", fallback_task.to_string(), e_fallback);
                    AppError::ConfigError(format!("Failed to determine model for {} (primary error: {}) or {} (fallback error: {})", primary_task.to_string(), e_primary, fallback_task.to_string(), e_fallback))
                })
            }
        }
    }

    /// Helper method to get temperature with fallback logic
    async fn get_temperature_with_fallback(
        app_handle: &AppHandle,
        project_dir: &str,
        primary_task: crate::models::TaskType,
        fallback_task: crate::models::TaskType,
    ) -> AppResult<f32> {
        match crate::config::get_temperature_for_task_with_project(primary_task, project_dir, app_handle).await {
            Ok(val) => Ok(val),
            Err(e_primary) => {
                warn!("Failed to get temperature for primary task {}: {}. Trying fallback.", primary_task.to_string(), e_primary);
                crate::config::get_temperature_for_task_with_project(fallback_task, project_dir, app_handle).await.map_err(|e_fallback| {
                    error!("Failed to get temperature for fallback task {}: {}. No config determined.", fallback_task.to_string(), e_fallback);
                    AppError::ConfigError(format!("Failed to determine temperature for {} (primary error: {}) or {} (fallback error: {})", primary_task.to_string(), e_primary, fallback_task.to_string(), e_fallback))
                })
            }
        }
    }

    /// Helper method to get max_tokens with fallback logic
    async fn get_max_tokens_with_fallback(
        app_handle: &AppHandle,
        project_dir: &str,
        primary_task: crate::models::TaskType,
        fallback_task: crate::models::TaskType,
    ) -> AppResult<u32> {
        match crate::config::get_max_tokens_for_task_with_project(primary_task, project_dir, app_handle).await {
            Ok(val) => Ok(val),
            Err(e_primary) => {
                warn!("Failed to get max_tokens for primary task {}: {}. Trying fallback.", primary_task.to_string(), e_primary);
                crate::config::get_max_tokens_for_task_with_project(fallback_task, project_dir, app_handle).await.map_err(|e_fallback| {
                    error!("Failed to get max_tokens for fallback task {}: {}. No config determined.", fallback_task.to_string(), e_fallback);
                    AppError::ConfigError(format!("Failed to determine max_tokens for {} (primary error: {}) or {} (fallback error: {})", primary_task.to_string(), e_primary, fallback_task.to_string(), e_fallback))
                })
            }
        }
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
        
        // Get the API client
        let llm_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        // Update job status to running
        let repo = app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        job_helpers::update_job_status_running(&repo, &job.id).await?;
        
        // Get settings repository for PromptComposer
        let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
        
        // Create composition context for sophisticated prompt generation
        let composition_context = CompositionContextBuilder::new(
            job.session_id.clone(),
            TaskType::TextCorrection,
            payload.text_to_correct.clone(),
        )
        .project_directory(payload.project_directory.clone())
        .build();

        // Use PromptComposer to generate the complete prompt
        let prompt_composer = PromptComposer::new();
        let composed_prompt = prompt_composer
            .compose_prompt(&composition_context, &settings_repo)
            .await?;

        info!("Enhanced Text Correction prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Extract system and user prompts from the composed result
        let parts: Vec<&str> = composed_prompt.final_prompt.splitn(2, "\n\n").collect();
        let system_prompt = parts.get(0).unwrap_or(&"").to_string();
        let user_prompt = parts.get(1).unwrap_or(&"").to_string();
        let system_prompt_id = composed_prompt.system_prompt_id;
        
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
                    text: user_prompt,
                },
            ],
        };
        
        // Get the model and settings from project/server config
        // Default to text improvement models if the specific ones aren't available
        let project_dir = payload.project_directory.as_deref().unwrap_or("");
        let model = Self::get_model_with_fallback(
            &app_handle,
            project_dir,
            crate::models::TaskType::TextCorrection,
            crate::models::TaskType::TextImprovement,
        ).await?;
        
        let temperature = Self::get_temperature_with_fallback(
            &app_handle,
            project_dir,
            crate::models::TaskType::TextCorrection,
            crate::models::TaskType::TextImprovement,
        ).await?;
        
        let max_tokens = Self::get_max_tokens_with_fallback(
            &app_handle,
            project_dir,
            crate::models::TaskType::TextCorrection,
            crate::models::TaskType::TextImprovement,
        ).await?;
        
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
                
                // Update job with the corrected text and system prompt ID
                repo.update_job_response_with_system_prompt(
                    &job.id,
                    &corrected_text,
                    Some(crate::models::JobStatus::Completed),
                    None, // metadata
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                    chars_received,
                    Some(&system_prompt_id),
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
        
        info!("Completed text correction job {}", job.id);
        Ok(result)
    }
}