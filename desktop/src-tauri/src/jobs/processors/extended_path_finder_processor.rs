use log::{debug, info, error};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, ExtendedPathFinderPayload};
use crate::jobs::job_processor_utils;
use crate::models::TaskType;

pub struct ExtendedPathFinderProcessor;

impl ExtendedPathFinderProcessor {
    pub fn new() -> Self {
        Self
    }
    
}

#[async_trait::async_trait]
impl JobProcessor for ExtendedPathFinderProcessor {
    fn name(&self) -> &'static str {
        "ExtendedPathFinder"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::ExtendedPathFinder(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::ExtendedPathFinder(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing using standardized utility
        let (repo, settings_repo, _background_job) = job_processor_utils::setup_job_processing(
            &payload.background_job_id,
            &app_handle,
        ).await?;
        
        job_processor_utils::log_job_start(&payload.background_job_id, "Extended Path Finding");
        info!("Starting extended path finding for workflow {} with {} initial paths", 
            payload.workflow_id, payload.initial_paths.len());
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before processing", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Build unified prompt using standardized utility
        let composed_prompt = job_processor_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.task_description.clone(),
            Some(payload.directory_tree.clone()),
            None,
            Some(payload.directory_tree.clone()),
            &settings_repo,
        ).await?;

        info!("Enhanced Extended Path Finder prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        
        // Extract prompts using standardized utility
        let (system_prompt, user_prompt, system_prompt_id) = job_processor_utils::extract_prompts_from_composed(&composed_prompt);
        
        // Add initial paths context to the user prompt
        let initial_paths_text = if payload.initial_paths.is_empty() {
            "No initial paths were found through local filtering.".to_string()
        } else {
            format!("Initial paths found through local filtering:\n{}", 
                payload.initial_paths.iter().map(|p| format!("- {}", p)).collect::<Vec<_>>().join("\n"))
        };
        
        let enhanced_user_prompt = format!("{}\n\n{}\n\nPlease find additional relevant files that might be needed for this task, considering the initial paths above and the complete directory structure.", 
            user_prompt,
            initial_paths_text
        );

        // Create messages using standardized utility
        let messages = job_processor_utils::create_openrouter_messages(&system_prompt, &enhanced_user_prompt);
        
        // Create API client options using standardized utility
        let api_options = job_processor_utils::create_api_client_options(
            &job.payload,
            TaskType::PathFinder,
            &payload.project_directory,
            false,
            &app_handle,
        ).await?;
        
        // Check for cancellation before LLM call using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before LLM call", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Call LLM using standardized utility
        info!("Calling LLM for extended path finding with model {}", &api_options.model);
        let llm_response = job_processor_utils::execute_llm_chat_completion(&app_handle, messages, &api_options).await?;
        
        // Extract the response content
        let response_content = llm_response.choices[0].message.content.clone();
        
        // Parse paths from the LLM response using standardized utility
        let extended_paths = match job_processor_utils::parse_paths_from_text_response(&response_content, &payload.project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to parse paths from LLM response: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using standardized utility
                job_processor_utils::finalize_job_failure(&payload.background_job_id, &repo, &error_msg).await?;
                
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        // Combine initial paths with extended paths, removing duplicates
        let mut all_paths = payload.initial_paths.clone();
        for path in extended_paths {
            if !all_paths.contains(&path) {
                all_paths.push(path);
            }
        }
        
        info!("Extended path finding completed for workflow {}: {} initial + {} new = {} total paths", 
            payload.workflow_id, payload.initial_paths.len(), all_paths.len() - payload.initial_paths.len(), all_paths.len());
        
        // Check for cancellation after LLM processing using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled after LLM processing", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Store results in job metadata (supplementary info only)
        let result_metadata = json!({
            "initialPaths": payload.initial_paths,
            "llmResponse": response_content,
            "workflowId": payload.workflow_id,
            "taskDescription": payload.task_description,
            "projectDirectory": payload.project_directory,
            "modelUsed": api_options.model,
            "summary": format!("Extended path finding: {} initial + {} new = {} total paths", 
                payload.initial_paths.len(), 
                all_paths.len() - payload.initial_paths.len(), 
                all_paths.len())
        });
        
        // Store found paths as newline-separated string in response
        let final_response_content = if all_paths.is_empty() {
            String::new()
        } else {
            all_paths.join("\n")
        };
        
        // Finalize job success using standardized utility
        job_processor_utils::finalize_job_success(
            &payload.background_job_id,
            &repo,
            &final_response_content,
            llm_response.usage,
            &api_options.model,
            &system_prompt_id,
            Some(result_metadata),
        ).await?;
        
        debug!("Extended path finding completed for workflow {}", payload.workflow_id);
        
        // NOTE: No longer handling internal chaining - WorkflowOrchestrator manages transitions
        
        // Return success result
        Ok(JobProcessResult::success(
            payload.background_job_id.clone(), 
            format!("Extended path finding completed, found {} total relevant files", all_paths.len())
        ))
    }
}