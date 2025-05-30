use std::path::Path;
use std::collections::HashMap;
use std::str::FromStr;
use log::{debug, info, warn, error};
use serde_json::json;
use tauri::{AppHandle, Manager};
use quick_xml::Reader;
use quick_xml::events::Event;

use crate::api_clients::{ApiClient, client_trait::ApiClientOptions};
use crate::db_utils::{BackgroundJobRepository, SettingsRepository};
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, ImplementationPlanPayload, StructuredImplementationPlan, StructuredImplementationPlanStep, StructuredImplementationPlanStepOperation};
use crate::models::{BackgroundJob, JobStatus, OpenRouterRequestMessage, OpenRouterContent, TaskType};
use crate::utils::{get_timestamp, PromptComposer, CompositionContextBuilder};
use crate::utils::{fs_utils, path_utils};
use crate::utils::xml_utils::extract_xml_from_markdown;

pub struct ImplementationPlanProcessor;

impl ImplementationPlanProcessor {
    pub fn new() -> Self {
        Self {}
    }
    
    // Parse implementation plan from the XML response with enhanced error handling
    fn parse_implementation_plan(&self, clean_xml_content: &str) -> AppResult<(StructuredImplementationPlan, String)> {
        debug!("Parsing implementation plan from cleaned XML content");
        
        if clean_xml_content.trim().is_empty() {
            warn!("Empty XML content provided for parsing");
            return Err(AppError::ValidationError("Empty XML content provided".to_string()));
        }
        
        // First, try to validate that the content at least looks like XML
        if !clean_xml_content.trim_start().starts_with('<') {
            warn!("Content does not appear to be XML: {}", &clean_xml_content[..100.min(clean_xml_content.len())]);
        }
        
        // Attempt to deserialize the clean XML content into structured format
        match quick_xml::de::from_str::<StructuredImplementationPlan>(clean_xml_content) {
            Ok(structured_plan) => {
                // Validate the parsed plan has meaningful content
                if structured_plan.steps.is_empty() {
                    warn!("Parsed implementation plan has no steps");
                }
                
                // Generate human-readable summary
                let mut summary = String::new();
                if let Some(instructions) = &structured_plan.agent_instructions {
                    summary.push_str(&format!("Agent Instructions: {}\n\n", instructions));
                }
                
                summary.push_str(&format!("Implementation Plan with {} steps:\n", structured_plan.steps.len()));
                for (i, step) in structured_plan.steps.iter().enumerate() {
                    summary.push_str(&format!("{}. {}: {}\n", i + 1, step.title, step.description));
                }
                
                Ok((structured_plan, summary.trim().to_string()))
            },
            Err(e) => {
                warn!("Failed to parse structured XML: {}. Content length: {}", e, clean_xml_content.len());
                
                // Enhanced fallback: try to extract meaningful content even from malformed XML
                let fallback_content = if clean_xml_content.len() > 500 {
                    // Try to extract first meaningful paragraph or section
                    if let Some(first_tag_end) = clean_xml_content.find('>') {
                        if let Some(last_tag_start) = clean_xml_content.rfind('<') {
                            if first_tag_end < last_tag_start {
                                clean_xml_content[first_tag_end + 1..last_tag_start].trim().to_string()
                            } else {
                                clean_xml_content.to_string()
                            }
                        } else {
                            clean_xml_content.to_string()
                        }
                    } else {
                        clean_xml_content.to_string()
                    }
                } else {
                    clean_xml_content.to_string()
                };
                
                let fallback_plan = StructuredImplementationPlan {
                    agent_instructions: Some("Note: This plan was parsed from malformed XML and may need manual review.".to_string()),
                    steps: vec![StructuredImplementationPlanStep {
                        number: Some("1".to_string()),
                        title: "Implementation Plan (Fallback)".to_string(),
                        description: fallback_content.clone(),
                        file_operations: None,
                    }],
                };
                
                let summary = format!("Implementation Plan (parsed with fallback): {}", 
                    if fallback_content.len() > 200 {
                        format!("{}...", &fallback_content[..200])
                    } else {
                        fallback_content
                    }
                );
                
                Ok((fallback_plan, summary))
            }
        }
    }
    
    // Save implementation plan to a file
    async fn save_implementation_plan_to_file(&self, content: &str, project_directory: &str, job_id: &str, session_id: &str, app_handle: &AppHandle) -> AppResult<String> {
        // Create a unique file path using the new utility function
        let file_path = path_utils::create_unique_output_filepath(
            session_id,
            "implementation_plan",
            Some(Path::new(project_directory)),
            "xml",
            Some(crate::constants::IMPLEMENTATION_PLANS_DIR_NAME),
            app_handle
        ).await?;
        
        // Save the plan - properly await the async function and pass the PathBuf directly
        fs_utils::write_string_to_file(&file_path, content).await?;
        
        // Make this path relative to the project directory for storage
        let relative_path = match path_utils::make_relative_to(&file_path, project_directory) {
            Ok(rel_path) => rel_path.to_string_lossy().to_string(),
            Err(_) => file_path.to_string_lossy().to_string(), // Fallback to absolute path if needed
        };
        
        Ok(relative_path)
    }
}

#[async_trait::async_trait]
impl JobProcessor for ImplementationPlanProcessor {
    fn name(&self) -> &'static str {
        "ImplementationPlanProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::ImplementationPlan(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::ImplementationPlan(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Get dependencies from app state
        let (repo, settings_repo) = crate::jobs::job_processor_utils::setup_repositories(&app_handle)?;
        
        // Get LLM client using the standardized factory function
        let llm_client = crate::jobs::job_processor_utils::get_api_client(&app_handle)?;
        
        
        // Update job status to running
        let timestamp = get_timestamp();
        // Get the background job from the repository
        let mut db_job = repo.get_job_by_id(&payload.background_job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Background job {} not found", payload.background_job_id)))?;
        db_job.status = "running".to_string();
        db_job.updated_at = Some(timestamp);
        db_job.start_time = Some(timestamp);
        
        // Load contents of relevant files
        let mut file_contents_map: HashMap<String, String> = HashMap::new();
        
        let project_directory = job.project_directory.as_ref()
            .ok_or_else(|| AppError::JobError("Project directory not found in job".to_string()))?;
            
        for relative_path_str in &payload.relevant_files {
            // Construct full path
            let full_path = std::path::Path::new(project_directory).join(relative_path_str);
            
            // Read file content
            match fs_utils::read_file_to_string(&*full_path.to_string_lossy()).await {
                Ok(content) => {
                    // Add to map with relative path as key
                    file_contents_map.insert(relative_path_str.clone(), content);
                },
                Err(e) => {
                    // Log warning but continue with other files
                    warn!("Failed to read file {}: {}", full_path.display(), e);
                }
            }
        }
        
        // Create enhanced composition context for sophisticated prompt generation
        let composition_context = CompositionContextBuilder::new(
            job.session_id.clone(),
            TaskType::ImplementationPlan,
            payload.task_description.clone(),
        )
        .project_directory(Some(project_directory.clone()))
        .project_structure(payload.project_structure.clone())
        .file_contents(if file_contents_map.is_empty() { None } else { Some(file_contents_map.clone()) })
        .relevant_files(Some(payload.relevant_files.clone()))
        .codebase_structure(payload.project_structure.clone())
        .build();

        // Use the enhanced prompt composer to generate sophisticated prompts
        let prompt_composer = PromptComposer::new();
        let composed_prompt = prompt_composer
            .compose_prompt(&composition_context, &settings_repo)
            .await?;

        info!("Enhanced Implementation Plan prompt composition for job {}", payload.background_job_id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
        }

        let prompt = composed_prompt.final_prompt;
        let system_prompt_id = composed_prompt.system_prompt_id;
        
        info!("Generated implementation plan prompt for task: {}", &payload.task_description);
        
        // Estimate the number of tokens in the prompt
        let estimated_prompt_tokens = crate::utils::token_estimator::estimate_tokens(&prompt);
        info!("Estimated prompt tokens: {}", estimated_prompt_tokens);
        
        // Store token estimate in the job
        db_job.tokens_sent = Some(estimated_prompt_tokens as i32);
        
        // Update the job with token estimate before LLM call
        repo.update_job(&db_job).await?;
        
        // Create messages for the LLM (note: prompt will be used later for streaming)
        let _messages = vec![
            OpenRouterRequestMessage {
                role: "user".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: prompt.clone(),
                }],
            },
        ];
        
        // Create API client options
        let api_options = ApiClientOptions {
            model: payload.model.clone(),
            max_tokens: payload.max_tokens,
            temperature: Some(payload.temperature), // temperature is f32, not Option<f32> in the payload
            stream: false,
        };
        
        // Check if job has been canceled before calling the LLM
        let job_id = &payload.background_job_id;
        let job_status = match repo.get_job_by_id(job_id).await {
            Ok(Some(job)) => crate::models::JobStatus::from_str(&job.status).unwrap_or(crate::models::JobStatus::Created),
            _ => crate::models::JobStatus::Created,
        };
        
        if job_status == crate::models::JobStatus::Canceled {
            info!("Job {} has been canceled before processing", job_id);
            return Ok(JobProcessResult::failure(job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Call LLM using streaming
        info!("Calling LLM for implementation plan with model {} (streaming enabled)", &payload.model);
        
        // Set streaming to true for the API client options
        let mut streaming_api_options = api_options;
        streaming_api_options.stream = true;
        
        // Prepare variables to collect the streaming response
        let mut response_content = String::new();
        let mut accumulated_tokens = 0;
        let mut accumulated_chars = 0;
        
        // Use the full generated prompt instead of a simplified one to maintain consistency
        // The prompt variable already contains the comprehensive implementation plan prompt
        let stream = match llm_client.stream_complete(&prompt, streaming_api_options).await {
            Ok(stream) => stream,
            Err(e) => {
                error!("Failed to initiate LLM stream for job {}: {}", payload.background_job_id, e);
                let error_msg = format!("Failed to initiate LLM stream: {}", e);
                
                // Update job to failed with comprehensive error information
                let timestamp = get_timestamp();
                
                // Get the job
                let mut job = repo.get_job_by_id(&payload.background_job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("Job not found: {}", payload.background_job_id)))?;
                
                // Update job fields with detailed error information
                job.status = JobStatus::Failed.to_string();
                job.error_message = Some(error_msg.clone());
                job.updated_at = Some(timestamp);
                job.end_time = Some(timestamp);
                
                // Log the failure for debugging
                warn!("Implementation plan job {} failed during LLM stream initialization. Model: {}, Max tokens: {:?}", 
                    payload.background_job_id, payload.model, payload.max_tokens);
                
                // Save updated job
                repo.update_job(&job).await?;
                
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        // Process the stream and collect the response
        use futures::StreamExt;
        let mut stream_handle = stream;
        
        while let Some(chunk_result) = stream_handle.next().await {
            // Check if job has been canceled during streaming
            let job_status = match repo.get_job_by_id(job_id).await {
                Ok(Some(job)) => crate::models::JobStatus::from_str(&job.status).unwrap_or(crate::models::JobStatus::Created),
                _ => crate::models::JobStatus::Created,
            };
            
            if job_status == crate::models::JobStatus::Canceled {
                info!("Job {} was canceled during streaming", job_id);
                return Ok(JobProcessResult::failure(job_id.clone(), "Job was canceled by user".to_string()));
            }
            
            // Process the chunk
            match chunk_result {
                Ok(chunk) => {
                    // Safely extract content from the choice message with bounds checking
                    if !chunk.choices.is_empty() {
                        if let Some(content) = &chunk.choices[0].delta.content {
                            if !content.is_empty() {
                                // Use the token estimator for more accurate token counting
                                let estimated_tokens = crate::utils::token_estimator::estimate_tokens(content) as i32;
                                accumulated_tokens += estimated_tokens;
                                accumulated_chars += content.len() as i32;
                                
                                // Append the chunk to the response
                                response_content.push_str(content);
                                
                                // Update the job's response with the new chunk, but don't fail on update errors
                                if let Err(e) = repo.append_to_job_response(
                                    &payload.background_job_id,
                                    content,
                                    estimated_tokens,
                                    accumulated_chars
                                ).await {
                                    warn!("Failed to append chunk to job response: {}", e);
                                    // Continue processing even if updates fail
                                }
                            }
                        }
                    }
                },
                Err(e) => {
                    warn!("Error receiving stream chunk: {}", e);
                    // Continue processing despite errors in individual chunks
                }
            }
        }
        
        // Log completion of streaming
        info!("Completed streaming response for job {}, received {} tokens", job_id, accumulated_tokens);
        
        // Continue with regular processing using the collected response
        if response_content.is_empty() {
            let error_msg = "No content received from LLM stream";
            error!("Implementation plan job {} failed: {}", payload.background_job_id, error_msg);
            
            // Update job to failed with detailed information
            let timestamp = get_timestamp();
            
            // Get the job
            let mut job = repo.get_job_by_id(&payload.background_job_id).await?
                .ok_or_else(|| AppError::JobError(format!("Job not found: {}", payload.background_job_id)))?;
            
            // Update job fields with comprehensive error information
            job.status = JobStatus::Failed.to_string();
            job.error_message = Some(error_msg.to_string());
            job.updated_at = Some(timestamp);
            job.end_time = Some(timestamp);
            
            // Log additional context for debugging
            warn!("Implementation plan job {} received empty response. Accumulated tokens: {}, Model: {}", 
                payload.background_job_id, accumulated_tokens, payload.model);
            
            // Save updated job
            repo.update_job(&job).await?;
            
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg.to_string()));
        }
        
        // Check if job has been canceled after LLM call but before further processing
        let job_status = match repo.get_job_by_id(job_id).await {
            Ok(Some(job)) => crate::models::JobStatus::from_str(&job.status).unwrap_or(crate::models::JobStatus::Created),
            _ => crate::models::JobStatus::Created,
        };
        
        if job_status == crate::models::JobStatus::Canceled {
            info!("Job {} has been canceled after LLM call", job_id);
            return Ok(JobProcessResult::failure(job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Extract clean XML content from the response
        let clean_xml_content = extract_xml_from_markdown(&response_content);
        
        // Parse the implementation plan into structured format
        let (structured_plan, human_readable_summary) = match self.parse_implementation_plan(&clean_xml_content) {
            Ok(result) => result,
            Err(e) => {
                error!("Failed to parse implementation plan for job {}: {}", payload.background_job_id, e);
                let error_msg = format!("Failed to parse implementation plan: {}", e);
                
                // Update job to failed
                let timestamp = get_timestamp();
                let mut job = repo.get_job_by_id(&payload.background_job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("Job not found: {}", payload.background_job_id)))?;
                
                job.status = JobStatus::Failed.to_string();
                job.error_message = Some(error_msg.clone());
                job.updated_at = Some(timestamp);
                job.end_time = Some(timestamp);
                
                // Store the raw response for debugging
                job.response = Some(format!("Raw LLM Response (parsing failed): {}", 
                    if response_content.len() > 1000 { 
                        format!("{}...", &response_content[..1000]) 
                    } else { 
                        response_content.clone() 
                    }
                ));
                
                repo.update_job(&job).await?;
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        // Save the clean XML content to a file
        let file_path = match self.save_implementation_plan_to_file(
            &clean_xml_content,
            &payload.project_directory,
            &payload.background_job_id,
            &payload.session_id,
            &app_handle
        ).await {
            Ok(path) => path,
            Err(e) => {
                error!("Failed to save implementation plan file for job {}: {}", payload.background_job_id, e);
                let error_msg = format!("Failed to save implementation plan file: {}", e);
                
                // Update job to failed but include the parsed content in response
                let timestamp = get_timestamp();
                let mut job = repo.get_job_by_id(&payload.background_job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("Job not found: {}", payload.background_job_id)))?;
                
                job.status = JobStatus::Failed.to_string();
                job.error_message = Some(error_msg.clone());
                job.response = Some(human_readable_summary.clone());
                job.updated_at = Some(timestamp);
                job.end_time = Some(timestamp);
                
                // Still set token usage since LLM call succeeded
                job.tokens_received = Some(accumulated_tokens as i32);
                if let Some(tokens_sent) = job.tokens_sent {
                    job.total_tokens = Some(tokens_sent + accumulated_tokens as i32);
                }
                
                repo.update_job(&job).await?;
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        // Extract the generated title from job metadata, if it exists
        let metadata: Option<serde_json::Value> = match &db_job.metadata {
            Some(metadata_str) => match serde_json::from_str(metadata_str) {
                Ok(json) => Some(json),
                Err(_) => None,
            },
            None => None,
        };
        
        let generated_title = match metadata {
            Some(json) => {
                if let Some(title) = json.get("generated_title").and_then(|v| v.as_str()) {
                    title.to_string()
                } else {
                    "Implementation Plan".to_string()
                }
            },
            None => "Implementation Plan".to_string(),
        };
        
        // Update the job with the results
        let timestamp = get_timestamp();
        
        // Get the job and update it with all results at once
        let mut job = repo.get_job_by_id(&payload.background_job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job not found: {}", payload.background_job_id)))?;
            
        // Update job fields for completion
        job.status = JobStatus::Completed.to_string();
        job.response = Some(clean_xml_content.clone());
        job.updated_at = Some(timestamp);
        job.end_time = Some(timestamp);
        job.model_used = Some(payload.model.clone());
        
        
        // Set token usage from streaming
        job.tokens_received = Some(accumulated_tokens as i32);
        
        // Calculate total tokens based on tokens_sent (which we set earlier) + tokens_received
        if let Some(tokens_sent) = job.tokens_sent {
            job.total_tokens = Some(tokens_sent + accumulated_tokens as i32);
        }
        
        // Set model parameters
        job.max_output_tokens = payload.max_tokens.map(|t| t as i32);
        job.temperature = Some(payload.temperature);
        
        // Store structured data in metadata, preserving any existing metadata fields
        let updated_metadata = match repo.get_job_by_id(&payload.background_job_id).await?
            .and_then(|job| job.metadata)
            .and_then(|metadata_str| serde_json::from_str::<serde_json::Value>(&metadata_str).ok()) {
            Some(mut json) => {
                json["planData"] = serde_json::to_value(structured_plan).unwrap_or_default();
                json["outputPath"] = json!(file_path);
                // Keep the generated_title if it exists
                json
            },
            None => json!({
                "planData": serde_json::to_value(structured_plan).unwrap_or_default(),
                "outputPath": file_path,
                "generated_title": generated_title,
            }),
        };
        
        job.metadata = Some(updated_metadata.to_string());
        job.system_prompt_id = Some(system_prompt_id);
        
        // Update the job with the additional fields
        repo.update_job(&job).await?;
        
        // Return success result
        let success_message = format!("Implementation plan '{}' generated and saved to {}", generated_title, file_path);
        Ok(JobProcessResult::success(payload.background_job_id.clone(), success_message))
    }
}