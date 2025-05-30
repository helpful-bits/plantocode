use log::{debug, info, warn, error};
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::api_clients::{ApiClient, client_trait::ApiClientOptions};
use crate::db_utils::{BackgroundJobRepository, SettingsRepository};
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, RegexPatternGenerationPayload};
use crate::models::{BackgroundJob, JobStatus, OpenRouterRequestMessage, OpenRouterContent, TaskType};
use crate::utils::{get_timestamp, PromptComposer, CompositionContextBuilder};

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
        matches!(job.payload, JobPayload::RegexPatternGeneration(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::RegexPatternGeneration(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Get dependencies from app state
        let repo_state = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>();
        let repo = repo_state.inner().clone();
        let settings_repo = app_handle.state::<std::sync::Arc<SettingsRepository>>().inner().clone();
        
        let llm_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        // Update job status to running
        let timestamp = get_timestamp();
        let mut db_job = repo.get_job_by_id(&job.id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job.id)))?;
        db_job.status = "running".to_string();
        db_job.updated_at = Some(timestamp);
        db_job.start_time = Some(timestamp);
        repo.update_job(&db_job).await?;
        
        // Create enhanced composition context for sophisticated prompt generation
        let composition_context = CompositionContextBuilder::new(
            job.session_id.clone(),
            TaskType::RegexPatternGeneration,
            payload.task_description.clone(),
        )
        .project_directory(Some(payload.project_directory.clone()))
        .codebase_structure(payload.directory_tree.clone())
        .build();

        // Use the enhanced prompt composer to generate sophisticated prompts
        let prompt_composer = PromptComposer::new();
        let composed_prompt = prompt_composer
            .compose_prompt(&composition_context, &settings_repo)
            .await?;

        info!("Enhanced Regex Pattern Generation prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        let prompt = composed_prompt.final_prompt;
        let system_prompt_id = composed_prompt.system_prompt_id;
        
        info!("Generating regex patterns for task: {}", &payload.task_description);
        
        // Create messages for the LLM
        let messages = vec![
            OpenRouterRequestMessage {
                role: "user".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: prompt,
                }],
            },
        ];
        
        // Determine which model to use from config
        let model = match payload.model_override.clone() {
            Some(model) => model,
            None => crate::config::get_model_for_task_with_project(TaskType::RegexPatternGeneration, &payload.project_directory, &app_handle).await?
        };
        
        // Get temperature from payload or config
        let temperature = match payload.temperature_override {
            Some(temp) => temp,
            None => crate::config::get_temperature_for_task_with_project(TaskType::RegexPatternGeneration, &payload.project_directory, &app_handle).await?
        };
        
        // Get max tokens from payload or config
        let max_tokens = match payload.max_tokens_override {
            Some(tokens) => Some(tokens),
            None => Some(crate::config::get_max_tokens_for_task_with_project(TaskType::RegexPatternGeneration, &payload.project_directory, &app_handle).await?)
        };
        
        // Create API client options
        let api_options = ApiClientOptions {
            model: model.clone(),
            max_tokens,
            temperature: Some(temperature),
            stream: false,
        };
        
        // Call LLM
        info!("Calling LLM for regex pattern generation with model {}", &model);
        let llm_response = match llm_client.chat_completion(messages, api_options).await {
            Ok(response) => response,
            Err(e) => {
                error!("Failed to call LLM: {}", e);
                let error_msg = format!("Failed to call LLM: {}", e);
                
                // Update job to failed
                let timestamp = get_timestamp();
                let mut db_job = repo.get_job_by_id(&job.id).await?
                    .ok_or_else(|| AppError::JobError(format!("Job {} not found", job.id)))?;
                db_job.status = "failed".to_string();
                db_job.error_message = Some(error_msg.clone());
                db_job.updated_at = Some(timestamp);
                db_job.end_time = Some(timestamp);
                repo.update_job(&db_job).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // Extract the response content
        let response_content = llm_response.choices[0].message.content.clone();
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
        
        // Update the job with the results
        let timestamp = get_timestamp();
        let mut db_job = repo.get_job_by_id(&job.id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job.id)))?;
        db_job.status = "completed".to_string();
        db_job.response = Some(response_content.clone());  // Always store the raw LLM response
        db_job.updated_at = Some(timestamp);
        db_job.end_time = Some(timestamp);
        db_job.model_used = Some(model);
        
        // Add token usage if available
        if let Some(usage) = llm_response.usage {
            db_job.tokens_sent = Some(usage.prompt_tokens as i32);
            db_job.tokens_received = Some(usage.completion_tokens as i32);
            db_job.total_tokens = Some(usage.total_tokens as i32);
        }
        
        // Store additional metadata including JSON validation status
        let mut metadata_map = serde_json::Map::new();
        metadata_map.insert("json_valid".to_string(), json!(json_validation_result.0));
        if let Some(parsed_json) = json_validation_result.1 {
            metadata_map.insert("parsed_json".to_string(), parsed_json);
        }
        
        db_job.metadata = Some(serde_json::Value::Object(metadata_map).to_string());
        db_job.system_prompt_id = Some(system_prompt_id);
        
        // Update the job
        repo.update_job(&db_job).await?;
        
        // Return success result with the raw LLM response
        Ok(JobProcessResult::success(job.id.clone(), response_content))
    }
}