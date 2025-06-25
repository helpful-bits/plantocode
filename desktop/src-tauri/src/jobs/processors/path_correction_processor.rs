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
use crate::jobs::processors::utils::prompt_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};

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

    /// Parse paths from LLM text response with robust format handling
    fn parse_paths_from_text_response(response_text: &str, project_directory: &str) -> AppResult<Vec<String>> {
        let mut paths = Vec::new();
        
        // Normalize line endings
        let normalized_text = response_text.replace("\r\n", "\n").replace("\r", "\n");
        
        // Split by newlines and process each line
        for line in normalized_text.lines() {
            let line = line.trim();
            
            // Filter out empty lines or lines that are clearly not paths
            if line.is_empty()
                || line.starts_with("//")
                || line.starts_with("#")
                || line.starts_with("Note:")
                || line.starts_with("Analysis:")
                || line.starts_with("Here are")
                || line.starts_with("The following")
                || line.starts_with("Based on")
                || line.starts_with("```")
                || line == "json"
                || line == "JSON"
                || line.len() < 2
            {
                continue;
            }
            
            // Handle numbered lists (e.g., "1. path/to/file")
            let line_without_numbers = if line.chars().next().map_or(false, |c| c.is_ascii_digit()) {
                if let Some(dot_pos) = line.find('.') {
                    line[dot_pos + 1..].trim()
                } else {
                    line
                }
            } else {
                line
            };
            
            // Handle bullet points (e.g., "- path/to/file", "* path/to/file")
            let line_without_bullets = if line_without_numbers.starts_with("- ") || line_without_numbers.starts_with("* ") {
                &line_without_numbers[2..]
            } else {
                line_without_numbers
            };
            
            // Clean the line of potential prefixes/suffixes
            let cleaned_path = line_without_bullets
                .trim_matches(|c| {
                    c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == ';'
                })
                .trim();
            
            if !cleaned_path.is_empty() {
                paths.push(cleaned_path.to_string());
            }
        }
        
        // Remove duplicates while preserving order
        let mut unique_paths = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for path in paths {
            if seen.insert(path.clone()) {
                unique_paths.push(path);
            }
        }
        
        Ok(unique_paths)
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
        let (repo, session_repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get session object using the session repository
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;
        
        // Get model settings using project-aware configuration
        let model_settings = job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;
        
        job_processor_utils::log_job_start(&job.id, "path correction");
        debug!("Paths to correct: {}", payload.paths_to_correct);
        
        // Parse paths from string to array
        let paths: Vec<&str> = payload.paths_to_correct
            .split('\n')
            .map(|line| line.trim())
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .collect();
        let project_directory = &session.project_directory;
        
        // Setup LLM task configuration
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context
        let task_description = paths.join("\n");
        let prompt_context = LlmPromptContext {
            task_description,
            file_contents: None,
            directory_tree: None,
        };
        
        debug!("Sending path correction request with model: {}", model_used);
        
        // Execute LLM task using the task runner
        match task_runner.execute_llm_task(prompt_context, &settings_repo).await {
            Ok(llm_result) => {
                debug!("Received path correction response");
                
                let content = &llm_result.response;
                
                // Primary parsing: XML output (as expected by system prompt)
                let corrected_paths = match Self::parse_corrected_paths(content) {
                    Ok((paths, _)) => {
                        info!("Successfully parsed {} paths using XML parsing", paths.len());
                        paths
                    },
                    Err(e) => {
                        warn!("XML parsing failed: {}, trying fallback plain text parsing", e);
                        // Fallback to plain text parsing for robustness
                        match Self::parse_paths_from_text_response(content, project_directory) {
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
                
                // Clone usage before moving it
                let usage_clone = llm_result.usage.clone();
                
                // Create a modified LLM result with our JSON response
                let mut modified_llm_result = llm_result.clone();
                modified_llm_result.response = json_response_str.clone();
                
                // Finalize job success using task runner
                task_runner.finalize_success(
                    &repo,
                    &job.id,
                    &modified_llm_result,
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
            },
            Err(e) => {
                // API error
                let error_msg = format!("Path correction LLM task execution failed: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using task runner
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_msg))
            }
        }
    }
}