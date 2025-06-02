use log::{debug, info, warn, error};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::TaskType;
use crate::jobs::job_processor_utils;

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
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&job.id, "regex pattern generation");
        
        // Build unified prompt using standardized helper
        let composed_prompt = job_processor_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.task_description.clone(),
            payload.directory_tree.clone(),
            None,
            None,
            &settings_repo,
            &model_used,
        ).await?;

        info!("Enhanced Regex Pattern Generation prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Extract system and user prompts from the composed result
        let (system_prompt, user_prompt, system_prompt_id) = job_processor_utils::extract_prompts_from_composed(&composed_prompt);
        
        info!("Generating regex patterns for task: {}", &payload.task_description);
        
        // Create messages
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Create API options
        let api_options = job_processor_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            false,
        )?;
        
        // Call LLM
        let model_name = api_options.model.clone();
        info!("Calling LLM for regex pattern generation with model {}", &model_name);
        let llm_response = match job_processor_utils::execute_llm_chat_completion(&app_handle, messages, api_options).await {
            Ok(response) => response,
            Err(e) => {
                error!("Failed to call LLM: {}", e);
                let error_msg = format!("Failed to call LLM: {}", e);
                
                // Finalize job failure
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg).await?;
                
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
        
        // Create custom metadata with JSON validation info
        let mut metadata = serde_json::json!({
            "job_type": "REGEX_PATTERN_GENERATION",
            "workflow_stage": "RegexGeneration",
            "jsonValid": json_validation_result.0
        });
        
        // Add parsed regex data if JSON is valid
        if let Some(parsed_json) = json_validation_result.1 {
            metadata["parsedJson"] = parsed_json;
        }
        
        // Finalize job success
        job_processor_utils::finalize_job_success(
            &job.id,
            &repo,
            &response_content,
            llm_response.usage,
            &model_name,
            &system_prompt_id,
            Some(metadata),
        ).await?;
        
        // Return success result with the raw LLM response
        Ok(JobProcessResult::success(job.id.clone(), response_content))
    }
}