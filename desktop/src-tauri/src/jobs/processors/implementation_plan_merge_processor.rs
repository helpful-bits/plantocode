use log::{info, warn, error, debug};
use serde_json::json;
use tauri::AppHandle;
use tokio::fs;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, JobResultData, ImplementationPlanMergePayload};
use crate::models::{JobStatus, TaskType};
use crate::db_utils::BackgroundJobRepository;
use crate::jobs::processors::utils::parsing_utils;
use crate::jobs::processors::{LlmTaskRunner, LlmTaskConfigBuilder, LlmPromptContext};
use crate::utils::{get_timestamp, xml_utils::extract_xml_from_markdown};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::prompt_utils;

pub struct ImplementationPlanMergeProcessor;

impl ImplementationPlanMergeProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait::async_trait]
impl JobProcessor for ImplementationPlanMergeProcessor {
    fn name(&self) -> &'static str {
        "ImplementationPlanMergeProcessor"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::ImplementationPlanMerge(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Extract payload
        let payload = match &job.payload {
            JobPayload::ImplementationPlanMerge(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing
        let (repo, session_repo, settings_repo, mut db_job) = job_processor_utils::setup_job_processing(&job.id, &app_handle).await?;
        
        // Get session object using the session repository
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;
        
        // Get model settings using project-aware configuration
        let model_settings = job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;
        let job_id = job.id.clone();
        
        job_processor_utils::log_job_start(&job_id, "implementation plan merge");
        let project_directory = &session.project_directory;
        
        // Fetch source implementation plans and extract clean XML
        let mut source_plans = Vec::new();
        let mut all_relevant_files = std::collections::HashSet::new();
        
        for (index, job_id) in payload.source_job_ids.iter().enumerate() {
            match repo.get_job_by_id(job_id).await? {
                Some(source_job) => {
                    if let Some(response) = source_job.response {
                        // Extract clean XML from the response
                        let clean_xml = extract_xml_from_markdown(&response);
                        source_plans.push((index + 1, clean_xml));
                        
                        // Try to extract relevant files from the source job's metadata
                        if let Some(metadata_str) = &source_job.metadata {
                            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(metadata_str) {
                                if let Some(plan_data) = metadata.get("planData") {
                                    if let Some(steps) = plan_data.get("steps").and_then(|s| s.as_array()) {
                                        for step in steps {
                                            if let Some(file_ops) = step.get("fileOperations").and_then(|ops| ops.as_array()) {
                                                for op in file_ops {
                                                    if let Some(path) = op.get("path").and_then(|p| p.as_str()) {
                                                        all_relevant_files.insert(path.to_string());
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        warn!("Source job {} has no response", job_id);
                    }
                }
                None => {
                    return Err(AppError::JobError(format!("Source job {} not found", job_id)));
                }
            }
        }
        
        if source_plans.is_empty() {
            return Err(AppError::JobError("No valid source plans found".to_string()));
        }
        
        // Load file contents for context (similar to implementation plan processor)
        let mut file_contents_map = std::collections::HashMap::new();
        let relevant_files_vec: Vec<String> = all_relevant_files.into_iter().collect();
        
        for relative_path_str in &relevant_files_vec {
            let full_path = std::path::Path::new(project_directory).join(relative_path_str);
            match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    file_contents_map.insert(relative_path_str.clone(), content);
                }
                Err(e) => {
                    warn!("Failed to read file {}: {}", full_path.display(), e);
                }
            }
        }
        
        // Generate directory tree for better context
        let directory_tree = match crate::utils::directory_tree::get_directory_tree_with_defaults(project_directory).await {
            Ok(tree) => Some(tree),
            Err(e) => {
                warn!("Failed to generate directory tree: {}", e);
                None
            }
        };
        
        // Construct the user prompt with task description, source plans and instructions
        let mut prompt_content = String::new();
        
        // Add the current task description from the session if available
        if let Some(session_task_desc) = &session.task_description {
            prompt_content.push_str(&format!("<task_description>\n{}\n</task_description>\n\n", session_task_desc));
        }
        
        prompt_content.push_str("<source_plans>\n");
        for (index, plan_content) in &source_plans {
            prompt_content.push_str(&format!("<implementation_plan_{}>\n{}\n</implementation_plan_{}>\n", 
                index, plan_content, index));
        }
        prompt_content.push_str("</source_plans>\n");
        
        if let Some(instructions) = &payload.merge_instructions {
            prompt_content.push_str(&format!("\n<user_instructions>\n{}\n</user_instructions>\n", instructions));
        }
        
        // Store the full prompt content in metadata for UI display
        let prompt_for_display = prompt_content.clone();
        
        // Setup LLM task configuration for streaming (aligned with implementation plan processor)
        let llm_config = LlmTaskConfigBuilder::new(model_used.clone(), temperature, max_output_tokens)
            .stream(true) // Enable streaming for consistency
            .build();
        
        // Create LLM task runner
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), llm_config);
        
        // Create prompt context with file contents and directory tree
        let prompt_context = LlmPromptContext {
            task_description: prompt_content.clone(),
            file_contents: if file_contents_map.is_empty() { None } else { Some(file_contents_map) },
            directory_tree,
        };
        
        // Check if job has been canceled before calling the LLM
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Execute streaming LLM task using the task runner
        info!("Calling LLM for implementation plan merge with model {} (streaming enabled)", model_used);
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
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        info!("Streaming LLM task completed successfully for job {}", job.id);
        info!("System prompt ID: {}", llm_result.system_prompt_id);
        
        // Use the response from the task runner
        let response_content = llm_result.response.clone();
        
        // Continue with regular processing using the collected response
        if response_content.is_empty() {
            let error_msg = "No content received from LLM stream";
            error!("Implementation plan merge job {} failed: {}", job.id, error_msg);
            return Ok(JobProcessResult::failure(job.id.clone(), error_msg.to_string()));
        }
        
        // Check if job has been canceled after LLM call but before further processing
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after LLM call", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Extract clean XML content from the response
        let clean_xml_content = extract_xml_from_markdown(&response_content);
        
        // Parse the merged implementation plan into structured format
        let (structured_plan, human_readable_summary) = match parsing_utils::parse_implementation_plan(&clean_xml_content) {
            Ok(result) => result,
            Err(e) => {
                error!("Failed to parse merged implementation plan for job {}: {}", job.id, e);
                let error_msg = format!("Failed to parse merged implementation plan: {}", e);
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        // Extract metadata about the merge operation
        let merge_metadata = json!({
            "source_job_ids": payload.source_job_ids,
            "merge_instructions": payload.merge_instructions,
            "source_count": payload.source_job_ids.len(),
            "merged_at": get_timestamp(),
            "planData": serde_json::to_value(structured_plan.clone()).unwrap_or_default(),
            "planTitle": if let Some(ref task_desc) = session.task_description {
                // Truncate task description if too long for title
                let truncated_desc = if task_desc.len() > 60 {
                    format!("{}...", &task_desc[..57])
                } else {
                    task_desc.clone()
                };
                format!("{} (Merged from {} plans)", truncated_desc, payload.source_job_ids.len())
            } else {
                format!("Merged Implementation Plan (from {} sources)", payload.source_job_ids.len())
            },
            "summary": human_readable_summary.clone(),
            "isStructured": true,
            "sessionName": session.name,
            "isStreaming": false,
            "fullPromptContent": prompt_for_display,
        });
        
        // Extract system prompt template, usage and cost
        let system_prompt_template = llm_result.system_prompt_template.clone();
        let usage_for_result = llm_result.usage.clone();
        let actual_cost = llm_result.usage.as_ref().and_then(|u| u.cost).unwrap_or(0.0);
        
        // Return success result with the clean XML content as Text data
        let success_message = format!("Merged {} implementation plans successfully", payload.source_job_ids.len());
        let mut result = JobProcessResult::success(job.id.clone(), JobResultData::Text(clean_xml_content))
            .with_tokens(
                usage_for_result.as_ref().map(|u| u.prompt_tokens as u32),
                usage_for_result.as_ref().map(|u| u.completion_tokens as u32)
            )
            .with_system_prompt_template(system_prompt_template)
            .with_actual_cost(actual_cost);
        
        // Add metadata to the result
        result.metadata = Some(merge_metadata);
        
        Ok(result)
    }
}