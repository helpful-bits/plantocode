use std::path::Path;
use std::str::FromStr;
use log::{debug, info, warn, error};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, StructuredImplementationPlan, StructuredImplementationPlanStep};
use crate::models::{JobStatus, TaskType, OpenRouterRequestMessage, OpenRouterContent};
use crate::utils::{get_timestamp, fs_utils, path_utils};
use crate::utils::xml_utils::extract_xml_from_markdown;
use crate::utils::job_metadata_builder::JobMetadataBuilder;
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{fs_context_utils, prompt_utils};
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};

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
        let is_xml_format = clean_xml_content.trim_start().starts_with('<');
        if !is_xml_format {
            warn!("Content does not appear to be XML: {}", &clean_xml_content[..100.min(clean_xml_content.len())]);
            // Don't fail immediately, let's try to create a structured plan from the text
            return self.create_fallback_plan_from_text(clean_xml_content);
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
                // Fall back to text parsing
                self.create_fallback_plan_from_text(clean_xml_content)
            }
        }
    }
    
    // Create a structured plan from plain text response
    fn create_fallback_plan_from_text(&self, text_content: &str) -> AppResult<(StructuredImplementationPlan, String)> {
        debug!("Creating fallback plan from text content");
        
        // Try to parse the text content into meaningful steps
        let mut steps = Vec::new();
        let mut current_step = 1;
        
        // Split by common step indicators (numbers, bullet points, etc.)
        let lines: Vec<&str> = text_content.lines().collect();
        let mut current_description = String::new();
        let mut step_title = "Implementation Step".to_string();
        
        for line in lines.iter() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            
            // Check if this line looks like a step header (starts with number, bullet, etc.)
            if trimmed.starts_with(char::is_numeric) || 
               trimmed.starts_with("Step") ||
               trimmed.starts_with("##") ||
               trimmed.starts_with("-") ||
               trimmed.starts_with("*") {
                
                // Save previous step if we have content
                if !current_description.trim().is_empty() {
                    steps.push(StructuredImplementationPlanStep {
                        number: Some(current_step.to_string()),
                        title: step_title.clone(),
                        description: current_description.trim().to_string(),
                        file_operations: None,
                        bash_commands: None,
                        exploration_commands: None,
                    });
                    current_step += 1;
                    current_description.clear();
                }
                
                // Extract title from this line
                step_title = trimmed
                    .trim_start_matches(char::is_numeric)
                    .trim_start_matches('.')
                    .trim_start_matches('-')
                    .trim_start_matches('*')
                    .trim_start_matches('#')
                    .trim_start_matches("Step")
                    .trim_start_matches(':')
                    .trim()
                    .to_string();
                
                if step_title.is_empty() {
                    step_title = format!("Implementation Step {}", current_step);
                }
            } else {
                // Add to current description
                if !current_description.is_empty() {
                    current_description.push('\n');
                }
                current_description.push_str(trimmed);
            }
        }
        
        // Add the last step
        if !current_description.trim().is_empty() {
            steps.push(StructuredImplementationPlanStep {
                number: Some(current_step.to_string()),
                title: step_title,
                description: current_description.trim().to_string(),
                file_operations: None,
                bash_commands: None,
                exploration_commands: None,
            });
        }
        
        // If no steps were parsed, create a single step with all content
        if steps.is_empty() {
            steps.push(StructuredImplementationPlanStep {
                number: Some("1".to_string()),
                title: "Implementation Plan".to_string(),
                description: text_content.trim().to_string(),
                file_operations: None,
                bash_commands: None,
                exploration_commands: None,
            });
        }
        
        let fallback_plan = StructuredImplementationPlan {
            agent_instructions: Some("Note: This plan was parsed from text format. The LLM did not return XML as expected.".to_string()),
            steps,
        };
        
        // Generate summary
        let summary = format!("Implementation Plan with {} steps (parsed from text format)", fallback_plan.steps.len());
        
        Ok((fallback_plan, summary))
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
        
        // Setup job processing
        let (repo, settings_repo, mut db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        let llm_client = crate::jobs::processors::utils::llm_api_utils::get_api_client(&app_handle)?;
        let job_id = job.id.clone();
        
        job_processor_utils::log_job_start(&job_id, "implementation plan");
        
        // Get project directory from session
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        let project_directory = &session.project_directory;
            
        // Load file contents and generate directory tree - FULL CONTENT WITHOUT TRUNCATION
        let file_contents = Some(fs_context_utils::load_file_contents(&payload.relevant_files, project_directory).await);
        let directory_tree = fs_context_utils::generate_directory_tree_for_context(project_directory).await;
        
        // Build unified prompt using full content without preemptive truncation
        let composed_prompt = prompt_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.task_description.clone(),
            file_contents,
            directory_tree,
            &settings_repo,
            &model_used,
        ).await?;

        info!("Enhanced Implementation Plan prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        info!("Context sections: {:?}", composed_prompt.context_sections);
        if let Some(tokens) = composed_prompt.estimated_tokens {
            info!("Estimated tokens: {}", tokens);
            
            // Log warning if estimated tokens exceed typical model limits
            if tokens > 100000 {
                warn!("Implementation plan job {} estimated tokens ({}) exceeds typical model limits but proceeding with full content", 
                    job.id, tokens);
                
                // Store warning in job metadata for visibility
                if let Ok(mut job_for_metadata) = repo.get_job_by_id(&job.id).await {
                    if let Some(existing_job) = job_for_metadata {
                        let metadata = match existing_job.metadata {
                            Some(ref metadata_str) => {
                                match serde_json::from_str::<serde_json::Value>(&metadata_str) {
                                    Ok(mut json) => {
                                        json["token_warning"] = serde_json::json!({
                                            "estimated_tokens": tokens,
                                            "warning": "Content exceeds typical model limits but proceeding with full content"
                                        });
                                        json
                                    },
                                    Err(_) => serde_json::json!({
                                        "token_warning": {
                                            "estimated_tokens": tokens,
                                            "warning": "Content exceeds typical model limits but proceeding with full content"
                                        }
                                    })
                                }
                            },
                            None => serde_json::json!({
                                "token_warning": {
                                    "estimated_tokens": tokens,
                                    "warning": "Content exceeds typical model limits but proceeding with full content"
                                }
                            })
                        };
                        
                        let mut updated_job = existing_job;
                        updated_job.metadata = Some(metadata.to_string());
                        if let Err(e) = repo.update_job(&updated_job).await {
                            warn!("Failed to update job metadata with token warning: {}", e);
                        }
                    }
                }
            }
        }

        let prompt = composed_prompt.final_prompt;
        let system_prompt_id = composed_prompt.system_prompt_id;
        
        info!("Generated implementation plan prompt for task: {}", &payload.task_description);
        
        
        // Setup LLM task configuration for streaming
        let llm_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(true) // Enable streaming for implementation plans
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context
        let prompt_context = LlmPromptContext {
            task_description: payload.task_description.clone(),
            file_contents: Some(fs_context_utils::load_file_contents(&payload.relevant_files, project_directory).await),
            directory_tree: fs_context_utils::generate_directory_tree_for_context(project_directory).await,
            system_prompt_override: None,
        };
        
        // Check if job has been canceled before calling the LLM
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Execute streaming LLM task using the task runner
        info!("Calling LLM for implementation plan with model {} (streaming enabled)", model_used);
        let llm_result = match task_runner.execute_streaming_llm_task(
            prompt_context,
            &settings_repo,
            &repo,
            &job.id,
        ).await {
            Ok(result) => result,
            Err(e) => {
                error!("Streaming LLM task execution failed: {}", e);
                let error_msg = format!("Streaming LLM task execution failed: {}", e);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e)).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        info!("Streaming LLM task completed successfully for job {}", job.id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // Use the response from the task runner
        let response_content = llm_result.response;
        
        // Continue with regular processing using the collected response
        if response_content.is_empty() {
            let error_msg = "No content received from LLM stream";
            error!("Implementation plan job {} failed: {}", job.id, error_msg);
            task_runner.finalize_failure(&repo, &job.id, &error_msg, None).await?;
            return Ok(JobProcessResult::failure(job.id.clone(), error_msg.to_string()));
        }
        
        // Check if job has been canceled after LLM call but before further processing using helper
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after LLM call", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Extract clean XML content from the response
        let clean_xml_content = extract_xml_from_markdown(&response_content);
        
        // Parse the implementation plan into structured format
        let (structured_plan, human_readable_summary) = match self.parse_implementation_plan(&clean_xml_content) {
            Ok(result) => result,
            Err(e) => {
                error!("Failed to parse implementation plan for job {}: {}", job.id, e);
                let error_msg = format!("Failed to parse implementation plan: {}", e);
                
                // Update job to failed using helper
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg, None).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // The clean XML content will be stored directly in job.response
        // The structured plan data is stored in metadata (additional_params)
        
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
                    // Sanitize the title since it may come from LLM response
                    crate::utils::path_utils::sanitize_filename(title)
                } else {
                    "Implementation Plan".to_string()
                }
            },
            None => "Implementation Plan".to_string(),
        };
        
        // Update the job with the results
        let timestamp = get_timestamp();
        
        // Get the job and update it with all results at once
        let mut job = repo.get_job_by_id(&job.id).await?
            .ok_or_else(|| AppError::JobError(format!("Job not found: {}", job.id)))?;
        
        // Get session name for better UI display
        let session_name = crate::jobs::processors::utils::prompt_utils::get_session_name(&job.session_id, &app_handle).await.unwrap_or_else(|_| Some("Untitled Session".to_string())).unwrap_or_else(|| "Untitled Session".to_string());
            
        // Construct the additional_params specific to the implementation plan
        let mut impl_plan_additional_params = json!({
            "planData": serde_json::to_value(structured_plan.clone()).unwrap_or_default(),
            "planTitle": generated_title.clone(),
            "summary": human_readable_summary.clone(),
            "isStructured": true,
            "sessionName": session_name
        });
        
        // Ensure streaming flags are cleared for completed jobs
        if let Some(obj) = impl_plan_additional_params.as_object_mut() {
            obj.insert("isStreaming".to_string(), json!(false));
            // Remove streaming-specific fields that should not persist for completed jobs
            obj.remove("streamProgress");
            obj.remove("responseLength");
            obj.remove("estimatedTotalLength");
            obj.remove("lastStreamUpdateTime");
            obj.remove("streamStartTime");
        }
        
        // Finalize job success with clean XML content stored in database response field
        job_processor_utils::finalize_job_success(
            &job.id,
            &repo,
            &clean_xml_content, // Store only clean XML content in job.response
            llm_result.usage,
            &model_used,
            &llm_result.system_prompt_id,
            Some(impl_plan_additional_params), // Pass the correctly structured additional_params
        ).await?;
        
        // Return success result with the actual clean XML content
        let success_message = format!("Implementation plan '{}' generated successfully", generated_title);
        Ok(JobProcessResult::success(job.id.clone(), clean_xml_content))
    }
}