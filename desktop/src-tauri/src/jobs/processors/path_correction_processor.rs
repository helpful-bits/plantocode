use async_trait::async_trait;
use tauri::{AppHandle, Manager};
use log::{debug, info, warn, error};
use serde_json;
use regex::Regex;

use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, PathCorrectionPayload};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::models::{OpenRouterRequestMessage, OpenRouterContent, JobStatus};
use crate::utils::{PromptComposer, CompositionContextBuilder};
use crate::db_utils::SettingsRepository;
use crate::error::{AppError, AppResult};
use crate::api_clients::client_trait::ApiClientOptions;

/// Processor for path correction jobs
pub struct PathCorrectionProcessor;

impl PathCorrectionProcessor {
    pub fn new() -> Self {
        Self {}
    }
    
    /// Parse XML response and extract corrected paths
    fn parse_corrected_paths(xml_response: &str) -> AppResult<(Vec<String>, serde_json::Value)> {
        // Extract corrected paths using regex
        let path_regex = Regex::new(r#"<path[^>]+original="([^"]*)"[^>]+corrected="([^"]*)"[^>]*>([^<]*)</path>"#)
            .map_err(|e| AppError::JobError(format!("Failed to create regex: {}", e)))?;
        
        let mut corrected_paths = Vec::new();
        let mut detailed_corrections = Vec::new();
        
        for captures in path_regex.captures_iter(xml_response) {
            let original = captures.get(1).map_or("", |m| m.as_str()).trim();
            let corrected = captures.get(2).map_or("", |m| m.as_str()).trim();
            let explanation = captures.get(3).map_or("", |m| m.as_str()).trim();
            
            // Add corrected path to simple list
            corrected_paths.push(corrected.to_string());
            
            // Add detailed information for metadata
            detailed_corrections.push(serde_json::json!({
                "original": original,
                "corrected": corrected,
                "explanation": explanation
            }));
        }
        
        // If no paths were found, try fallback parsing
        if corrected_paths.is_empty() {
            // Look for any corrected="..." attributes
            let fallback_regex = Regex::new(r#"corrected="([^"]*)""#)
                .map_err(|e| AppError::JobError(format!("Failed to create fallback regex: {}", e)))?;
            
            for captures in fallback_regex.captures_iter(xml_response) {
                if let Some(corrected) = captures.get(1) {
                    let path = corrected.as_str().trim();
                    if !path.is_empty() {
                        corrected_paths.push(path.to_string());
                        detailed_corrections.push(serde_json::json!({
                            "original": "",
                            "corrected": path,
                            "explanation": "Extracted via fallback parsing"
                        }));
                    }
                }
            }
        }
        
        let metadata = serde_json::json!({
            "correctedPathDetails": detailed_corrections,
            "fullResponse": xml_response
        });
        
        Ok((corrected_paths, metadata))
    }
}

#[async_trait]
impl JobProcessor for PathCorrectionProcessor {
    fn name(&self) -> &str {
        "PathCorrectionProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::PathCorrection(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Extract payload
        let payload = match &job.payload {
            JobPayload::PathCorrection(p) => p,
            _ => {
                return Err(AppError::JobError(format!(
                    "Cannot process job with payload type {:?} in PathCorrectionProcessor",
                    job.task_type_str()
                )));
            }
        };
        
        // Get repository and LLM client
        let repo = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>().inner().clone();
        let llm_client = crate::jobs::job_processor_utils::get_api_client(&app_handle)?;
        
        
        // Get the full job details
        let db_job = repo.get_job_by_id(&job.id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job.id)))?;
            
        // Update job status to running
        repo.update_job_status(&job.id, &JobStatus::Running.to_string(), None).await?;
        
        info!("Processing path correction job: {}", job.id);
        debug!("Paths to correct: {}", payload.paths_to_correct);
        
        // Parse paths from string to array
        let paths: Vec<&str> = payload.paths_to_correct
            .split('\n')
            .map(|line| line.trim())
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .collect();
            
        let project_directory = job.project_directory.as_ref()
            .ok_or_else(|| AppError::JobError("Project directory not found in job".to_string()))?;
        
        // Get settings repository for PromptComposer
        let settings_repo = app_handle.state::<std::sync::Arc<SettingsRepository>>().inner().clone();
        
        // Create composition context with paths as task description
        let task_description = paths.join("\n");
        let composition_context = CompositionContextBuilder::new(
            job.session_id.clone(),
            crate::models::TaskType::PathCorrection,
            task_description.clone(),
        )
        .project_directory(Some(project_directory.clone()))
        .codebase_structure(payload.directory_tree.clone())
        .build();

        // Use PromptComposer to generate the complete prompt
        let prompt_composer = PromptComposer::new();
        let composed_prompt = if let Some(override_prompt) = &payload.system_prompt_override {
            // Handle override case - create a simple composed prompt
            crate::utils::prompt_composition::ComposedPrompt {
                final_prompt: format!("{}\n\n{}", override_prompt, task_description),
                system_prompt_id: "override".to_string(),
                context_sections: vec![],
                estimated_tokens: Some(crate::utils::token_estimator::estimate_tokens(override_prompt) as usize),
            }
        } else {
            prompt_composer
                .compose_prompt(&composition_context, &settings_repo)
                .await?
        };

        // Extract system and user prompts from the composed result
        let parts: Vec<&str> = composed_prompt.final_prompt.splitn(2, "\n\n").collect();
        let system_prompt = parts.get(0).unwrap_or(&"").to_string();
        let user_prompt = parts.get(1).unwrap_or(&"").to_string();
        let system_prompt_id = composed_prompt.system_prompt_id;
        
        // Build messages array
        let messages = vec![
            OpenRouterRequestMessage {
                role: "system".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: system_prompt,
                }],
            },
            OpenRouterRequestMessage {
                role: "user".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: user_prompt,
                }],
            },
        ];
        
        // Set API options with model from payload or project/server config
        let project_dir = job.project_directory.as_deref().unwrap_or("");
        let model_to_use = if let Some(model_override) = payload.model_override.clone() {
            model_override
        } else {
            crate::config::get_model_for_task_with_project(crate::models::TaskType::PathCorrection, project_dir, &app_handle).await?
        };
        
        // Get max tokens and temperature from payload or project/server config
        let max_tokens = if let Some(tokens) = payload.max_output_tokens {
            tokens
        } else {
            crate::config::get_max_tokens_for_task_with_project(crate::models::TaskType::PathCorrection, project_dir, &app_handle).await
                .map_err(|e| AppError::ConfigError(format!("Failed to get max_tokens for PathCorrection task: {}. Please ensure server database is properly configured.", e)))?
        };
        
        let temperature = if let Some(temp) = payload.temperature {
            temp
        } else {
            crate::config::get_temperature_for_task_with_project(crate::models::TaskType::PathCorrection, project_dir, &app_handle).await
                .map_err(|e| AppError::ConfigError(format!("Failed to get temperature for PathCorrection task: {}. Please ensure server database is properly configured.", e)))?
        };
        
        let api_options = ApiClientOptions {
            model: model_to_use,
            max_tokens: Some(max_tokens),
            temperature: Some(temperature),
            stream: false,
        };
        
        debug!("Sending path correction request with options: {:?}", api_options);
        
        // Call the LLM API
        match llm_client.chat_completion(messages, api_options).await {
            Ok(llm_response) => {
                debug!("Received path correction response");
                
                // Extract text content from response
                if let Some(choice) = llm_response.choices.first() {
                    let content = &choice.message.content;
                    
                    // Parse XML response to extract corrected paths
                    let (corrected_paths, metadata) = match Self::parse_corrected_paths(content) {
                        Ok(result) => result,
                        Err(e) => {
                            warn!("Failed to parse XML response, using raw content: {}", e);
                            // Fallback: use the raw content as a single "path"
                            let fallback_metadata = serde_json::json!({
                                "correctedPathDetails": [],
                                "fullResponse": content,
                                "parseError": format!("{}", e)
                            });
                            (vec![content.clone()], fallback_metadata)
                        }
                    };
                    
                    // Create simple newline-separated response
                    let simple_response = corrected_paths.join("\n");
                    
                    // Update job status to completed
                    repo.update_job_status(&job.id, &JobStatus::Completed.to_string(), None).await?;
                    
                    // Get updated job
                    let mut updated_job = db_job.clone();
                    updated_job.status = JobStatus::Completed.to_string();
                    updated_job.response = Some(simple_response.clone());
                    updated_job.metadata = Some(metadata.to_string());
                    updated_job.tokens_sent = llm_response.usage.as_ref().map(|u| u.prompt_tokens as i32);
                    updated_job.tokens_received = llm_response.usage.as_ref().map(|u| u.completion_tokens as i32);
                    updated_job.total_tokens = llm_response.usage.as_ref().map(|u| u.total_tokens as i32);
                    updated_job.chars_received = Some(simple_response.len() as i32);
                    
                    // Update model used
                    if let Some(model) = payload.model_override.clone() {
                        updated_job.model_used = Some(model);
                    } else {
                        updated_job.model_used = Some(llm_response.model.clone());
                    }
                    updated_job.system_prompt_id = Some(system_prompt_id.clone());
                    
                    // Save updated job
                    repo.update_job(&updated_job).await?;
                    
                    info!("Path correction completed: {} paths corrected", corrected_paths.len());
                    debug!("Corrected paths: {:?}", corrected_paths);
                    
                    // Return success result
                    Ok(JobProcessResult::success(job.id.clone(), simple_response.clone())
                        .with_tokens(
                            llm_response.usage.as_ref().map(|u| u.prompt_tokens as i32),
                            llm_response.usage.as_ref().map(|u| u.completion_tokens as i32),
                            llm_response.usage.as_ref().map(|u| u.total_tokens as i32),
                            Some(simple_response.len() as i32)
                        ))
                } else {
                    // No choices in response
                    let error_msg = "No content in LLM response".to_string();
                    error!("{}", error_msg);
                    
                    // Update job as failed
                    let mut updated_job = db_job.clone();
                    updated_job.status = JobStatus::Failed.to_string();
                    updated_job.error_message = Some(error_msg.clone());
                    repo.update_job(&updated_job).await?;
                    
                    Ok(JobProcessResult::failure(job.id.clone(), error_msg))
                }
            },
            Err(e) => {
                // API error
                let error_msg = format!("LLM API error: {}", e);
                error!("{}", error_msg);
                
                // Update job as failed
                let mut updated_job = db_job.clone();
                updated_job.status = JobStatus::Failed.to_string();
                updated_job.error_message = Some(error_msg.clone());
                repo.update_job(&updated_job).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_msg))
            }
        }
    }
}