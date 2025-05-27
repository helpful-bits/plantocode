use async_trait::async_trait;
use std::sync::Arc;
use log::{info, error, debug};
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, TaskEnhancementPayload};
use crate::jobs::processor_trait::JobProcessor;
use crate::api_clients::client_trait::{ApiClient, ApiClientOptions};
use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::prompts::task_enhancement::{generate_task_enhancement_system_prompt, generate_task_enhancement_user_prompt};
use crate::db_utils::BackgroundJobRepository;
use crate::models::{JobStatus, OpenRouterRequestMessage, OpenRouterContent};
use crate::api_clients::client_factory;
use crate::utils::xml_utils::extract_xml_from_markdown;

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
        
        // Get the repository from app state
        let repo = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>().inner().clone();
        
        // Update job status to running
        repo.update_job_status(&job_id, &JobStatus::Running.to_string(), Some("Processing task enhancement")).await?;
        
        // Generate the system and user prompts for task enhancement
        let system_prompt_text = generate_task_enhancement_system_prompt();
        let user_prompt_text = generate_task_enhancement_user_prompt(
            &payload.task_description,
            payload.project_context.as_deref(),
        );
        
        // Get the LLM client using the standardized factory function
        let client = client_factory::get_api_client(&app_handle)?;
        
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
        let prompt_tokens = crate::utils::token_estimator::estimate_tokens(&combined_prompt);
        
        // Fetch the database job to get model_used
        let db_job = repo.get_job_by_id(&job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;
        
        // Determine the model to use from config with robust fallback
        let mut model_to_use = match db_job.model_used {
            Some(model) if !model.is_empty() => model,
            _ => {
                // Try to get task-specific model first
                match crate::config::get_model_for_task(crate::models::TaskType::TaskEnhancement) {
                    Ok(model) => model,
                    Err(_) => {
                        // If task-specific model fails, fall back to default LLM model
                        crate::config::get_default_llm_model_id()?
                    }
                }
            }
        };
        
        // Final safety check - if model is still empty, try default fallback
        if model_to_use.is_empty() {
            model_to_use = crate::config::get_default_llm_model_id()?;
        }
        
        // Get max tokens and temperature from config
        let max_tokens = Some(crate::config::get_default_max_tokens_for_task(Some(crate::models::TaskType::TaskEnhancement))?);
        
        let temperature = Some(crate::config::get_default_temperature_for_task(Some(crate::models::TaskType::TaskEnhancement))?);
        
        // Create the options with values from config
        let options = ApiClientOptions {
            model: model_to_use.clone(),
            max_tokens,
            temperature,
            stream: false,
        };
        
        debug!("Using model: {} for Task Enhancement", model_to_use);
        
        // Send the request with the messages
        let response = client.chat_completion(messages, options).await?;
        
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
            "modelUsed": model_to_use,
            "tokensUsed": total_tokens,
            "targetField": payload.target_field,
        });
        
        // Update the job with the response and metadata
        repo.update_job_response(
            &job_id, 
            &parsed_response.enhanced_task,
            Some(JobStatus::Completed),
            Some(&metadata.to_string()),
            tokens_sent,
            tokens_received,
            total_tokens,
            Some(parsed_response.enhanced_task.len() as i32),
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