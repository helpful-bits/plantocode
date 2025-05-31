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
        let (repo, settings_repo, _) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        job_processor_utils::log_job_start(&job.id, "path correction");
        debug!("Paths to correct: {}", payload.paths_to_correct);
        
        // Parse paths from string to array
        let paths: Vec<&str> = payload.paths_to_correct
            .split('\n')
            .map(|line| line.trim())
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .collect();
            
        let project_directory = job.project_directory.as_ref()
            .ok_or_else(|| AppError::JobError("Project directory not found in job".to_string()))?;
        
        // Handle system prompt override or use unified prompt
        let task_description = paths.join("\n");
        let composed_prompt = if let Some(override_prompt) = &payload.system_prompt_override {
            crate::utils::unified_prompt_system::ComposedPrompt {
                final_prompt: format!("{}\n\n{}", override_prompt, task_description),
                system_prompt_id: "override".to_string(),
                context_sections: vec![],
                estimated_tokens: Some(crate::utils::token_estimator::estimate_tokens(override_prompt) as usize),
            }
        } else {
            // Use build_unified_prompt helper
            job_processor_utils::build_unified_prompt(
                &job,
                &app_handle,
                task_description,
                payload.directory_tree.clone(),
                None,
                payload.directory_tree.clone(),
                &settings_repo,
            ).await?
        };

        // Extract system and user prompts from the composed result
        let (system_prompt, user_prompt, system_prompt_id) = job_processor_utils::extract_prompts_from_composed(&composed_prompt);
        
        // Build messages array
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt, &user_prompt);
        
        // Create API options
        let api_options = job_processor_utils::create_api_client_options(
            &job.payload,
            TaskType::PathCorrection,
            project_directory,
            false,
            &app_handle,
        ).await?;
        
        debug!("Sending path correction request with options: {:?}", api_options);
        
        // Call the LLM API
        match job_processor_utils::execute_llm_chat_completion(&app_handle, messages, &api_options).await {
            Ok(llm_response) => {
                debug!("Received path correction response");
                
                // Extract text content from response
                if let Some(choice) = llm_response.choices.first() {
                    let content = &choice.message.content;
                    
                    // Parse response to extract corrected paths using standardized utility
                    let corrected_paths = match job_processor_utils::parse_paths_from_text_response(content, project_directory) {
                        Ok(paths) => paths,
                        Err(e) => {
                            warn!("Failed to parse paths from response, trying XML parsing: {}", e);
                            // Fallback to custom XML parsing
                            match Self::parse_corrected_paths(content) {
                                Ok((paths, _)) => paths,
                                Err(_) => {
                                    warn!("XML parsing also failed, using raw content");
                                    vec![content.clone()]
                                }
                            }
                        }
                    };
                    
                    // Create metadata
                    let metadata = serde_json::json!({
                        "correctedPaths": corrected_paths,
                        "fullResponse": content
                    });
                    
                    // Create simple newline-separated response
                    let simple_response = corrected_paths.join("\n");
                    
                    // Get model used
                    let model_used = &api_options.model;
                    
                    // Clone usage before moving it
                    let usage_clone = llm_response.usage.clone();
                    
                    // Finalize job success
                    job_processor_utils::finalize_job_success(
                        &job.id,
                        &repo,
                        &simple_response,
                        llm_response.usage,
                        model_used,
                        &system_prompt_id,
                        Some(metadata),
                    ).await?;
                    
                    info!("Path correction completed: {} paths corrected", corrected_paths.len());
                    debug!("Corrected paths: {:?}", corrected_paths);
                    
                    // Return success result
                    Ok(JobProcessResult::success(job.id.clone(), simple_response.clone())
                        .with_tokens(
                            usage_clone.as_ref().map(|u| u.prompt_tokens as i32),
                            usage_clone.as_ref().map(|u| u.completion_tokens as i32),
                            usage_clone.as_ref().map(|u| u.total_tokens as i32),
                            Some(simple_response.len() as i32)
                        ))
                } else {
                    // No choices in response
                    let error_msg = "No content in LLM response".to_string();
                    error!("{}", error_msg);
                    
                    // Finalize job failure
                    job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg).await?;
                    
                    Ok(JobProcessResult::failure(job.id.clone(), error_msg))
                }
            },
            Err(e) => {
                // API error
                let error_msg = format!("LLM API error: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_msg))
            }
        }
    }
}