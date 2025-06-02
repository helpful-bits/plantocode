use async_trait::async_trait;
use log::{info, error, debug};
use tauri::AppHandle;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::models::TaskType;
use crate::utils::xml_utils::extract_xml_from_markdown;
use crate::jobs::job_processor_utils;

// Define structs for parsing the XML response
#[derive(Debug, Deserialize, Serialize, Default)]
struct TaskEnhancementResponseXml {
    original_task: Option<String>,
    enhanced_task: String,
    analysis: Option<String>,
    considerations: Option<ConsiderationsXml>,
    acceptance_criteria: Option<AcceptanceCriteriaXml>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct ConsiderationsXml {
    #[serde(rename = "consideration", default)]
    consideration: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct AcceptanceCriteriaXml {
    #[serde(rename = "criterion", default)]
    criterion: Vec<String>,
}

pub struct TaskEnhancementProcessor;

impl TaskEnhancementProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl JobProcessor for TaskEnhancementProcessor {
    fn name(&self) -> &str {
        "TaskEnhancementProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.task_type_str() == crate::models::TaskType::TaskEnhancement.to_string() &&
        matches!(job.payload, JobPayload::TaskEnhancement(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id().to_string();
        info!("Processing Task Enhancement job {}", job_id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::TaskEnhancement(payload) => payload,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for Task Enhancement job {}",
                    job_id
                )));
            }
        };
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job_id, &app_handle).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&job_id, "task enhancement");
        
        // Build unified prompt
        let composed_prompt = job_processor_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.task_description.clone(),
            payload.project_context.clone(),
            None,
            None,
            &settings_repo,
            &model_used,
        ).await?;

        info!("Enhanced Task Enhancement prompt composition for job {}", job_id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        // Extract system and user parts from the composed prompt - USING HELPER
        let (system_prompt_text, user_prompt_text, system_prompt_id) = 
            job_processor_utils::extract_prompts_from_composed(&composed_prompt);
        
        // Get the LLM client using the standardized factory function - USING HELPER
        let client = job_processor_utils::get_api_client(&app_handle)?;
        
        // Create the message objects for the OpenRouter request - USING HELPER
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt_text, &user_prompt_text);
        
        // Combine messages for token estimation
        let combined_prompt = format!("{}\n{}", system_prompt_text, user_prompt_text);
        
        // Estimate the tokens in the prompt
        let prompt_tokens = crate::utils::token_estimator::estimate_tokens(&combined_prompt);
        
        // Create API options using helper
        let options = job_processor_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            false,
        )?;
        
        // Store model name before options is moved
        let model_name = options.model.clone();
        debug!("Using model: {} for Task Enhancement", model_name);
        
        // Send the request with the messages using helper
        let response = job_processor_utils::execute_llm_chat_completion(&app_handle, messages, options).await?;
        
        // Extract the response content
        let response_content = if !response.choices.is_empty() {
            response.choices[0].message.content.clone()
        } else {
            return Err(AppError::JobError("No response content received from API".to_string()));
        };
        
        let clean_xml_content = extract_xml_from_markdown(&response_content);
        
        // Parse the XML from the cleaned content
        let xml_response: Result<TaskEnhancementResponseXml, _> = quick_xml::de::from_str(&clean_xml_content);
        
        let parsed_response = match xml_response {
            Ok(result) => result,
            Err(e) => {
                error!("Failed to parse XML response: {}", e);
                
                // Use cleaned XML content as fallback, or original response if cleaning resulted in empty string
                let enhanced_task = if !clean_xml_content.is_empty() {
                    clean_xml_content
                } else {
                    response_content
                };
                
                // Create a basic response with just the text
                TaskEnhancementResponseXml {
                    original_task: None,
                    enhanced_task,
                    analysis: None,
                    considerations: None,
                    acceptance_criteria: None,
                }
            }
        };
        
        // Get usage statistics
        let tokens_sent = response.usage.as_ref().map(|u| u.prompt_tokens as i32);
        let tokens_received = response.usage.as_ref().map(|u| u.completion_tokens as i32);
        let total_tokens = response.usage.as_ref().map(|u| u.total_tokens as i32);
        
        // Serialize the detailed analysis data for storing in metadata
        let metadata = serde_json::json!({
            "originalTask": parsed_response.original_task,
            "analysis": parsed_response.analysis,
            "considerations": parsed_response.considerations.map(|c| c.consideration),
            "acceptanceCriteria": parsed_response.acceptance_criteria.map(|a| a.criterion),
            "targetField": payload.target_field,
        });
        
        // Finalize job success using helper
        job_processor_utils::finalize_job_success(
            &job_id,
            &repo,
            &parsed_response.enhanced_task,
            response.usage,
            &model_name,
            &system_prompt_id,
            Some(metadata),
        ).await?;
        
        info!("Completed Task Enhancement job {}", job_id);
        info!("Tokens sent: {:?}, Tokens received: {:?}", tokens_sent, tokens_received);
        
        let enhanced_task = parsed_response.enhanced_task.clone();
        let task_len = enhanced_task.len() as i32;
        
        Ok(JobProcessResult::success(job_id, enhanced_task)
            .with_tokens(
                tokens_sent,
                tokens_received,
                total_tokens,
                Some(task_len),
            ))
    }
}