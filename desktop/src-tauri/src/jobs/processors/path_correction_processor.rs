use async_trait::async_trait;
use tauri::AppHandle;
use log::{debug, info, warn, error};
use serde_json;
use regex::Regex;

use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::TaskType;
use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{llm_api_utils, prompt_utils, response_parser_utils};

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
        
        // Setup job processing
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job.id, "path correction");
        debug!("Paths to correct: {}", payload.paths_to_correct);
        
        // Parse paths from string to array
        let paths: Vec<&str> = payload.paths_to_correct
            .split('\n')
            .map(|line| line.trim())
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .collect();
            
        // Get project directory from session
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        let project_directory = &session.project_directory;
        
        // Use unified prompt system exclusively
        let task_description = paths.join("\n");
        let composed_prompt = prompt_utils::build_unified_prompt(
            &job,
            &app_handle,
            task_description,
            None,
            None,
            &settings_repo,
            &model_used,
        ).await?;

        // Extract system and user prompts from the composed result
        let (system_prompt, user_prompt, system_prompt_id) = llm_api_utils::extract_prompts_from_composed(&composed_prompt);
        
        // Build messages array
        let messages = llm_api_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Create API options
        let api_options = llm_api_utils::create_api_client_options(
            model_used.clone(),
            temperature,
            max_output_tokens,
            false,
        )?;
        
        debug!("Sending path correction request with options: {:?}", api_options);
        
        // Call the LLM API
        let api_options_clone = api_options.clone();
        match llm_api_utils::execute_llm_chat_completion(&app_handle, messages, api_options).await {
            Ok(llm_response) => {
                debug!("Received path correction response");
                
                // Extract text content from response
                if let Some(choice) = llm_response.choices.first() {
                    let content = &choice.message.content;
                    
                    // Primary parsing: XML output (as expected by system prompt)
                    let corrected_paths = match Self::parse_corrected_paths(content) {
                        Ok((paths, _)) => {
                            info!("Successfully parsed {} paths using XML parsing", paths.len());
                            paths
                        },
                        Err(e) => {
                            warn!("XML parsing failed: {}, trying fallback plain text parsing", e);
                            // Fallback to plain text parsing for robustness
                            match response_parser_utils::parse_paths_from_text_response(content, project_directory) {
                                Ok(paths) => {
                                    info!("Successfully parsed {} paths using plain text fallback", paths.len());
                                    paths
                                },
                                Err(_) => {
                                    warn!("Both XML and plain text parsing failed, using raw content");
                                    vec![content.clone()]
                                }
                            }
                        }
                    };
                    
                    // Create JSON response object
                    let json_response_obj = serde_json::json!({ 
                        "correctedPaths": corrected_paths, 
                        "count": corrected_paths.len() 
                    });
                    let json_response_str = json_response_obj.to_string();
                    
                    // Create metadata with LLM raw response and detailed corrections for additionalParams
                    let (_, detailed_metadata) = match Self::parse_corrected_paths(content) {
                        Ok((_, meta)) => (corrected_paths.clone(), meta),
                        Err(_) => (corrected_paths.clone(), serde_json::json!({"correctedPathDetails": []}))
                    };
                    
                    let metadata = serde_json::json!({
                        "llmRawResponse": content,
                        "parsedCorrections": detailed_metadata
                    });
                    
                    // Get model used
                    let model_used = &api_options_clone.model;
                    
                    // Clone usage before moving it
                    let usage_clone = llm_response.usage.clone();
                    
                    // Finalize job success
                    job_processor_utils::finalize_job_success(
                        &job.id,
                        &repo,
                        &json_response_str,
                        llm_response.usage,
                        model_used,
                        &system_prompt_id,
                        Some(metadata),
                    ).await?;
                    
                    info!("Path correction completed: {} paths corrected", corrected_paths.len());
                    debug!("Corrected paths: {:?}", corrected_paths);
                    
                    // Return success result
                    Ok(JobProcessResult::success(job.id.clone(), json_response_str.clone())
                        .with_tokens(
                            usage_clone.as_ref().map(|u| u.prompt_tokens as i32),
                            usage_clone.as_ref().map(|u| u.completion_tokens as i32),
                            usage_clone.as_ref().map(|u| u.total_tokens as i32),
                            Some(json_response_str.len() as i32)
                        ))
                } else {
                    // No choices in response
                    let error_msg = "No content in LLM response".to_string();
                    error!("{}", error_msg);
                    
                    // Finalize job failure
                    job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg, None).await?;
                    
                    Ok(JobProcessResult::failure(job.id.clone(), error_msg))
                }
            },
            Err(e) => {
                // API error
                let error_msg = format!("LLM API error: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg, Some(&e)).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_msg))
            }
        }
    }
}