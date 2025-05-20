use std::path::Path;
use std::collections::HashMap;
use std::str::FromStr;
use log::{debug, info, warn, error};
use serde_json::json;
use tauri::{AppHandle, Manager};
use quick_xml::Reader;
use quick_xml::events::Event;

use crate::api_clients::{ApiClient, client_trait::ApiClientOptions};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, ImplementationPlanPayload};
use crate::models::{BackgroundJob, JobStatus, OpenRouterRequestMessage, OpenRouterContent};
use crate::prompts::implementation_plan::{generate_implementation_plan_prompt, generate_enhanced_implementation_plan_prompt};
use crate::utils::get_timestamp;
use crate::utils::{fs_utils, path_utils};

pub struct ImplementationPlanProcessor;

impl ImplementationPlanProcessor {
    pub fn new() -> Self {
        Self {}
    }
    
    // Ensure job is visible to the user
    async fn ensure_job_visible(&self, repo: &BackgroundJobRepository, job_id: &str) -> AppResult<()> {
        // Get the current job
        if let Some(mut job) = repo.get_job_by_id(job_id).await? {
            // Set visibility flags
            job.visible = Some(true);
            job.cleared = Some(false);
            
            // Update the job
            repo.update_job(&job).await?;
        }
        
        Ok(())
    }
    
    // Parse implementation plan from the XML response
    fn parse_implementation_plan(&self, response: &str) -> AppResult<serde_json::Value> {
        debug!("Parsing implementation plan from response");
        
        // Check if the response contains an implementation_plan tag
        if !response.contains("<implementation_plan>") {
            warn!("Response does not contain <implementation_plan> tag");
            return Ok(json!({
                "raw_content": response,
                "format": "raw",
                "parsing_status": "failed"
            }));
        }
        
        // Prepare to extract the content from the implementation_plan tag
        let mut reader = Reader::from_str(response);
        reader.trim_text(true);
        
        let mut buf = Vec::new();
        let mut in_implementation_plan = false;
        let mut implementation_plan_content = String::new();
        
        // Parse the XML response
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    if e.name().as_ref() == b"implementation_plan" {
                        in_implementation_plan = true;
                    }
                },
                Ok(Event::End(ref e)) => {
                    if e.name().as_ref() == b"implementation_plan" {
                        in_implementation_plan = false;
                    }
                },
                Ok(Event::Text(e)) => {
                    if in_implementation_plan {
                        implementation_plan_content.push_str(&e.unescape().unwrap_or_default().to_string());
                    }
                },
                Ok(Event::Eof) => break,
                Err(e) => {
                    warn!("Error parsing XML: {}", e);
                    return Ok(json!({
                        "raw_content": response,
                        "format": "raw",
                        "parsing_status": "error",
                        "error": format!("Error parsing XML: {}", e)
                    }));
                },
                _ => {}
            }
            buf.clear();
        }
        
        // If we couldn't extract content properly, return the raw response
        if implementation_plan_content.is_empty() {
            Ok(json!({
                "raw_content": response,
                "format": "xml",
                "parsing_status": "success"
            }))
        } else {
            // Structured JSON representation of the parsed implementation plan
            Ok(json!({
                "raw_content": response,
                "format": "xml",
                "parsing_status": "success",
                "content": implementation_plan_content.trim()
            }))
        }
    }
    
    // Save implementation plan to a file
    async fn save_implementation_plan_to_file(&self, content: &str, project_directory: &str, job_id: &str, session_id: &str) -> AppResult<String> {
        // Create a unique file path using the new utility function
        let file_path = path_utils::create_unique_output_filepath(
            session_id,
            "implementation_plan",
            Some(Path::new(project_directory)),
            "xml",
            Some(crate::constants::IMPLEMENTATION_PLANS_DIR_NAME)
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
        let repo = app_handle.state::<std::sync::Arc<BackgroundJobRepository>>().inner().clone();
        
        // Get LLM client using the standardized factory function
        let llm_client = crate::api_clients::client_factory::get_api_client(&app_handle)?;
        
        // Ensure job is visible
        self.ensure_job_visible(&repo, &payload.background_job_id).await?;
        
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
        
        for relative_path_str in &payload.relevant_files {
            // Construct full path
            let full_path = std::path::Path::new(&payload.project_directory).join(relative_path_str);
            
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
        
        // Generate the enhanced implementation plan prompt with file contents
        info!("Generating enhanced implementation plan for task: {}", &payload.task_description);
        let prompt = generate_enhanced_implementation_plan_prompt(
            &payload.task_description,
            payload.project_structure.as_deref(),
            &file_contents_map
        );
        
        // Estimate the number of tokens in the prompt
        let estimated_prompt_tokens = crate::utils::token_estimator::estimate_tokens(&prompt);
        info!("Estimated prompt tokens: {}", estimated_prompt_tokens);
        
        // Store token estimate in the job
        db_job.tokens_sent = Some(estimated_prompt_tokens as i32);
        
        // Update the job with token estimate before LLM call
        repo.update_job(&db_job).await?;
        
        // Create messages for the LLM
        let messages = vec![
            OpenRouterRequestMessage {
                role: "user".to_string(),
                content: vec![OpenRouterContent::Text {
                    content_type: "text".to_string(),
                    text: prompt,
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
        
        // For streaming, we need to convert the messages to a single prompt
        // because the stream_complete method only accepts a single prompt string
        let single_prompt = format!(
            "User request: {}\n\nPlease generate a detailed implementation plan in XML format with <implementation_plan> tags.",
            payload.task_description
        );
        
        // Call the streaming API
        let stream = match llm_client.stream_complete(&single_prompt, streaming_api_options).await {
            Ok(stream) => stream,
            Err(e) => {
                error!("Failed to initiate LLM stream: {}", e);
                let error_msg = format!("Failed to initiate LLM stream: {}", e);
                
                // Update job to failed
                let timestamp = get_timestamp();
                
                // Get the job
                let mut job = repo.get_job_by_id(&payload.background_job_id).await?
                    .ok_or_else(|| AppError::JobError(format!("Job not found: {}", payload.background_job_id)))?;
                
                // Update job fields
                job.status = JobStatus::Failed.to_string();
                job.error_message = Some(error_msg.clone());
                job.updated_at = Some(timestamp);
                job.end_time = Some(timestamp);
                
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
                    // Extract content from the choice message
                    if let Some(content) = &chunk.choices[0].delta.content {
                        // Compute token count - this is an approximation, better to use a tokenizer
                        let estimated_tokens = (content.len() as f32 / 4.0).ceil() as i32;
                        accumulated_tokens += estimated_tokens;
                        accumulated_chars += content.len() as i32;
                        
                        // Append the chunk to the response
                        response_content.push_str(content);
                        
                        // Update the job's response with the new chunk
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
            error!("{}", error_msg);
            
            // Update job to failed
            let timestamp = get_timestamp();
            
            // Get the job
            let mut job = repo.get_job_by_id(&payload.background_job_id).await?
                .ok_or_else(|| AppError::JobError(format!("Job not found: {}", payload.background_job_id)))?;
            
            // Update job fields
            job.status = JobStatus::Failed.to_string();
            job.error_message = Some(error_msg.to_string());
            job.updated_at = Some(timestamp);
            job.end_time = Some(timestamp);
            
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
        
        // Parse the implementation plan
        let structured_data = self.parse_implementation_plan(&response_content)?;
        
        // Save the implementation plan to a file
        let file_path = self.save_implementation_plan_to_file(
            &response_content,
            &payload.project_directory,
            &payload.background_job_id,
            &payload.session_id
        ).await?;
        
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
        job.response = Some(response_content.clone());
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
                json["planData"] = structured_data;
                json["outputPath"] = json!(file_path);
                // Keep the generated_title if it exists
                json
            },
            None => json!({
                "planData": structured_data,
                "outputPath": file_path,
                "generated_title": generated_title,
            }),
        };
        
        job.metadata = Some(updated_metadata.to_string());
        
        // Update the job with the additional fields
        repo.update_job(&job).await?;
        
        // Return success result
        let success_message = format!("Implementation plan '{}' generated and saved to {}", generated_title, file_path);
        Ok(JobProcessResult::success(payload.background_job_id.clone(), success_message))
    }
}