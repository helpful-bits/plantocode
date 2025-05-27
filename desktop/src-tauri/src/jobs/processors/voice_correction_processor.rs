use async_trait::async_trait;
use std::sync::Arc;
use log::{info, error, debug};
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobPayload, JobProcessResult, VoiceCorrectionPayload};
use crate::jobs::processor_trait::JobProcessor;
use crate::api_clients::client_trait::{ApiClient, ApiClientOptions};
use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::prompts::voice_correction::generate_voice_correction_prompt;
use crate::db_utils::BackgroundJobRepository;
use crate::models::{JobStatus, OpenRouterRequestMessage, OpenRouterContent};
use crate::api_clients::client_factory;
use crate::utils::xml_utils::extract_xml_from_markdown;

// Define structs for parsing the XML response
#[derive(Debug, Deserialize, Serialize, Default)]
struct VoiceCorrectionResponseXml {
    corrected_text: String,
    changes: Option<ChangesXml>,
    confidence: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct ChangesXml {
    #[serde(rename = "change", default)]
    change: Vec<String>,
}

pub struct VoiceCorrectionProcessor;

impl VoiceCorrectionProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl JobProcessor for VoiceCorrectionProcessor {
    fn name(&self) -> &str {
        "VoiceCorrectionProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.task_type_str == crate::models::TaskType::VoiceCorrection.to_string() &&
        matches!(job.payload, JobPayload::VoiceCorrection(_))
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id.clone();
        info!("Processing Voice Correction job {}", job_id);
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::VoiceCorrection(payload) => payload,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for Voice Correction job {}",
                    job_id
                )));
            }
        };
        
        // Get the repository from app state
        let repo = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>().inner().clone();
        
        // Update job status to running
        repo.update_job_status(&job_id, &JobStatus::Running.to_string(), Some("Processing voice correction")).await?;
        
        // Generate the voice correction prompt based on the payload
        let correction_prompt = generate_voice_correction_prompt(
            &payload.text_to_correct,
            &payload.language,
        );
        
        // Get the LLM client using the standardized factory function
        let client = client_factory::get_api_client(&app_handle)?;
        
        // Estimate the tokens in the prompt
        let prompt_tokens = crate::utils::token_estimator::estimate_tokens(&correction_prompt);
        
        // Fetch the database job to get model_used
        let db_job = repo.get_job_by_id(&job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;
        
        // Determine the model to use from config
        let model_to_use = match db_job.model_used {
            Some(model) if !model.is_empty() => model,
            _ => {
                let project_dir = payload.project_directory.as_deref().unwrap_or("");
                crate::config::get_model_for_task_with_project(crate::models::TaskType::VoiceCorrection, project_dir).await?
            }
        };
        
        // Get max tokens and temperature from project/server config
        let project_dir = payload.project_directory.as_deref().unwrap_or("");
        let max_tokens = match crate::config::get_max_tokens_for_task_with_project(crate::models::TaskType::VoiceCorrection, project_dir).await {
            Ok(tokens) => Some(tokens),
            Err(_) => Some(4000), // Fallback only if config error occurs
        };
        
        let temperature = match crate::config::get_temperature_for_task_with_project(crate::models::TaskType::VoiceCorrection, project_dir).await {
            Ok(temp) => Some(temp),
            Err(_) => Some(0.3), // Fallback only if config error occurs
        };
        
        // Create the options with values from config
        let options = ApiClientOptions {
            model: model_to_use.clone(),
            max_tokens,
            temperature,
            stream: false,
        };
        
        debug!("Using model: {} for Voice Correction", model_to_use);
        
        // Send the request
        let response = client.complete(&correction_prompt, options).await?;
        
        // Extract the response content
        let response_content = if !response.choices.is_empty() {
            response.choices[0].message.content.clone()
        } else {
            return Err(AppError::JobError("No response content received from API".to_string()));
        };
        
        let clean_xml_content = extract_xml_from_markdown(&response_content);
        
        // Parse the XML from the cleaned content
        let xml_response: Result<VoiceCorrectionResponseXml, _> = quick_xml::de::from_str(&clean_xml_content);
        
        let parsed_response = match xml_response {
            Ok(result) => result,
            Err(e) => {
                error!("Failed to parse XML response: {}", e);
                
                // Use cleaned XML content as fallback, or original response if cleaning resulted in empty string
                let corrected_text = if !clean_xml_content.is_empty() {
                    clean_xml_content
                } else {
                    response_content
                };
                
                // Create a basic response with just the text
                VoiceCorrectionResponseXml {
                    corrected_text,
                    changes: None,
                    confidence: None,
                }
            }
        };
        
        // Get usage statistics
        let tokens_sent = response.usage.as_ref().map(|u| u.prompt_tokens as i32);
        let tokens_received = response.usage.as_ref().map(|u| u.completion_tokens as i32);
        let total_tokens = response.usage.as_ref().map(|u| u.total_tokens as i32);
        
        // Serialize the detailed analysis data for storing in metadata
        let metadata = serde_json::json!({
            "changes": parsed_response.changes.map(|c| c.change),
            "confidence": parsed_response.confidence,
            "language": payload.language,
            "modelUsed": model_to_use,
            "tokensUsed": total_tokens,
            "originalJobId": payload.original_job_id,
        });
        
        // Update the job with the response and metadata
        repo.update_job_response(
            &job_id, 
            &parsed_response.corrected_text,
            Some(JobStatus::Completed),
            Some(&metadata.to_string()),
            tokens_sent,
            tokens_received,
            total_tokens,
            Some(parsed_response.corrected_text.len() as i32),
        ).await?;
        
        info!("Completed Voice Correction job {}", job_id);
        info!("Tokens sent: {:?}, Tokens received: {:?}", tokens_sent, tokens_received);
        
        let corrected_text = parsed_response.corrected_text.clone();
        let text_len = corrected_text.len() as i32;
        
        Ok(JobProcessResult::success(job_id, corrected_text)
            .with_tokens(
                tokens_sent,
                tokens_received,
                total_tokens,
                Some(text_len),
            ))
    }
}