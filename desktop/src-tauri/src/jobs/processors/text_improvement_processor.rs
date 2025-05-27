use async_trait::async_trait;
use std::sync::Arc;
use log::{info, error, debug};
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, TextImprovementPayload};
use crate::jobs::processor_trait::JobProcessor;
use crate::api_clients::client_trait::ApiClientOptions;
use crate::prompts::text_improvement::{generate_text_improvement_system_prompt, generate_text_improvement_user_prompt};
use crate::db_utils::BackgroundJobRepository;
use crate::models::{JobStatus, OpenRouterRequestMessage, OpenRouterContent};
use crate::utils::xml_utils::extract_xml_from_markdown;

// Define structs for parsing the XML response
#[derive(Debug, Deserialize, Serialize, Default)]
struct TextImprovementResponseXml {
    #[serde(default)]
    analysis: Option<String>,
    #[serde(default)]
    improved_text: Option<String>,
    #[serde(default)]
    changes: Option<ChangesXml>,
    #[serde(default)]
    recommendations: Option<RecommendationsXml>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct ChangesXml {
    #[serde(rename = "change", default)]
    change: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct RecommendationsXml {
    #[serde(rename = "recommendation", default)]
    recommendation: Vec<String>,
}

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
        
        // Get the repository from app state
        let repo = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>().inner().clone();
        
        // Update job status to running
        repo.update_job_status(&job_id, &JobStatus::Running.to_string(), Some("Processing text improvement")).await?;
        
        // Generate the system and user prompts for text improvement
        let system_prompt_text = generate_text_improvement_system_prompt(
            payload.language.as_deref(),
            Some(&payload.improvement_type),
            None, // No custom prompt
        );
        
        let user_prompt_text = generate_text_improvement_user_prompt(&payload.text_to_improve);
        
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
        let prompt_tokens = crate::utils::token_estimator::estimate_tokens(&combined_prompt);
        
        // Fetch the database job to get model_used
        let db_job = repo.get_job_by_id(&job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;
        
        // Determine the model to use from config
        let model_to_use = match db_job.model_used {
            Some(model) if !model.is_empty() => model,
            _ => crate::config::get_model_for_task(crate::models::TaskType::TextImprovement)?,
        };
        
        // Get max tokens and temperature from config
        let max_tokens = match crate::config::get_default_max_tokens_for_task(Some(crate::models::TaskType::TextImprovement)) {
            Ok(tokens) => Some(tokens),
            Err(_) => Some(4000), // Fallback only if config error occurs
        };
        
        let temperature = match crate::config::get_default_temperature_for_task(Some(crate::models::TaskType::TextImprovement)) {
            Ok(temp) => Some(temp),
            Err(_) => Some(0.5), // Fallback only if config error occurs
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
        
        // Extract the response content
        let response_content = if !response.choices.is_empty() {
            response.choices[0].message.content.clone()
        } else {
            return Err(AppError::JobError("No response content received from API".to_string()));
        };
        
        // Extract XML from markdown code blocks if present
        let clean_xml_content = extract_xml_from_markdown(&response_content);
        debug!("Original response length: {}, Cleaned XML length: {}", response_content.len(), clean_xml_content.len());
        
        // Parse the XML from the cleaned content
        let xml_response: Result<TextImprovementResponseXml, _> = quick_xml::de::from_str(&clean_xml_content);
        
        let parsed_response = match xml_response {
            Ok(result) => result,
            Err(e) => {
                error!("Failed to parse XML response: {}", e);
                
                // Use cleaned XML content as fallback, or original response if cleaning resulted in empty string
                let improved_text = if !clean_xml_content.is_empty() {
                    clean_xml_content
                } else {
                    response_content
                };
                
                // Create a basic response with just the text
                TextImprovementResponseXml {
                    improved_text: Some(improved_text),
                    analysis: None,
                    changes: None,
                    recommendations: None,
                }
            }
        };
        
        // Get usage statistics
        let tokens_sent = response.usage.as_ref().map(|u| u.prompt_tokens as i32);
        let tokens_received = response.usage.as_ref().map(|u| u.completion_tokens as i32);
        let total_tokens = response.usage.as_ref().map(|u| u.total_tokens as i32);
        
        // Get the improved text, falling back to original if missing
        let improved_text = parsed_response.improved_text
            .clone()
            .unwrap_or_else(|| payload.text_to_improve.clone());
        
        // Serialize the detailed analysis data for storing in metadata
        let metadata = serde_json::json!({
            "analysis": parsed_response.analysis,
            "changes": parsed_response.changes.map(|c| c.change),
            "recommendations": parsed_response.recommendations.map(|r| r.recommendation),
            "improvementType": payload.improvement_type,
            "language": payload.language,
            "modelUsed": model_to_use,
            "tokensUsed": total_tokens,
        });
        
        // Update the job with the response and metadata
        repo.update_job_response(
            &job_id, 
            &improved_text,
            Some(JobStatus::Completed),
            Some(&metadata.to_string()),
            tokens_sent,
            tokens_received,
            total_tokens,
            Some(improved_text.len() as i32),
        ).await?;
        
        info!("Completed Text Improvement job {}", job_id);
        info!("Tokens sent: {:?}, Tokens received: {:?}", tokens_sent, tokens_received);
        
        let text_len = improved_text.len() as i32;
        
        Ok(JobProcessResult::success(job_id, improved_text)
            .with_tokens(
                tokens_sent,
                tokens_received,
                total_tokens,
                Some(text_len),
            ))
    }
}