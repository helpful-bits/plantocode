use std::path::Path;
use log::{debug, info, error, warn};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, ExtendedPathCorrectionPayload};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{llm_api_utils, prompt_utils, response_parser_utils, fs_context_utils};
use crate::models::{TaskType};
use crate::utils::directory_tree::get_directory_tree_with_defaults;

pub struct ExtendedPathCorrectionProcessor;

impl ExtendedPathCorrectionProcessor {
    pub fn new() -> Self {
        Self
    }
    
}

#[async_trait::async_trait]
impl JobProcessor for ExtendedPathCorrectionProcessor {
    fn name(&self) -> &'static str {
        "ExtendedPathCorrection"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::ExtendedPathCorrection(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::ExtendedPathCorrection(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing using standardized utility
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(
            &job.id,
            &app_handle,
        ).await?;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&job.session_id, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for session {} and task type {}", job.session_id, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        // Get project directory using session-based utility
        let project_directory = crate::utils::get_project_directory_from_session(&job.session_id, &app_handle).await?;

        job_processor_utils::log_job_start(&job.id, "Extended Path Correction");
        info!("Starting extended path correction for {} paths", 
            payload.extended_paths.len());
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // First, validate existing paths against filesystem
        let (valid_paths, invalid_paths) = fs_context_utils::validate_paths_against_filesystem(
            &payload.extended_paths, 
            &project_directory
        ).await;
        
        info!("Path validation: {} valid, {} invalid paths", valid_paths.len(), invalid_paths.len());
        
        // If we have invalid paths, use AI to correct them
        let corrected_paths = if !invalid_paths.is_empty() {
            // Generate directory tree using session-based utility
            let directory_tree = match crate::utils::get_directory_tree_from_session(&job.session_id, &app_handle).await {
                Ok(tree) => {
                    info!("Generated directory tree using session-based utility for path correction ({} lines)", tree.lines().count());
                    tree
                }
                Err(e) => {
                    warn!("Failed to generate directory tree using session-based utility: {}. Using empty fallback.", e);
                    "No directory structure available".to_string()
                }
            };
        
            // Build unified prompt using standardized utility
            let composed_prompt = prompt_utils::build_unified_prompt(
                &job,
                &app_handle,
                payload.task_description.clone(),
                None,
                Some(directory_tree.clone()),
                &settings_repo,
                &model_used,
            ).await?;

            info!("Enhanced Path Correction prompt composition for job {}", job.id);
            info!("System prompt ID: {}", composed_prompt.system_prompt_id);
            
            // Extract prompts using standardized utility
            let (system_prompt, user_prompt, system_prompt_id) = llm_api_utils::extract_prompts_from_composed(&composed_prompt);
            
            // Add path correction context to the user prompt
            let invalid_paths_text = format!("Invalid paths that need correction:\n{}", 
                invalid_paths.iter().map(|p| format!("- {}", p)).collect::<Vec<_>>().join("\n"));
            
            let valid_paths_text = if valid_paths.is_empty() {
                "No valid paths found.".to_string()
            } else {
                format!("Valid paths (for reference):\n{}", 
                    valid_paths.iter().map(|p| format!("- {}", p)).collect::<Vec<_>>().join("\n"))
            };
            
            let enhanced_user_prompt = format!("{}\n\n{}\n\n{}\n\nPlease provide corrected versions of the invalid paths above, ensuring they exist in the directory structure and are relevant to the task.", 
                user_prompt,
                invalid_paths_text,
                valid_paths_text
            );

            // Create messages using standardized utility
            let messages = llm_api_utils::create_openrouter_messages(&system_prompt, &enhanced_user_prompt);
            
            // Create API client options using standardized utility
            let api_options = llm_api_utils::create_api_client_options(
                model_used.clone(),
                temperature,
                max_output_tokens,
                false,
            )?;
            
            // Check for cancellation before LLM call using standardized utility
            if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
                info!("Job {} has been canceled before LLM call", job.id);
                return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
            }
            
            // Call LLM using standardized utility
            info!("Calling LLM for path correction with model {}", &api_options.model);
            let llm_response = llm_api_utils::execute_llm_chat_completion(&app_handle, messages, api_options.clone()).await?;
            
            // Extract the response content
            let response_content = llm_response.choices[0].message.content.clone();
            
            // Parse corrected paths from the LLM response using standardized utility
            match response_parser_utils::parse_paths_from_text_response(&response_content, &project_directory) {
                Ok(paths) => {
                    // Store LLM usage info separately since we're not finalizing yet
                    paths
                },
                Err(e) => {
                    error!("Failed to parse corrected paths from LLM response: {}", e);
                    // Continue with empty corrected paths rather than failing
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };
        
        // Combine valid paths with corrected paths
        let mut final_paths = valid_paths.clone();
        
        // Validate corrected paths and add valid ones
        if !corrected_paths.is_empty() {
            let (valid_corrected, _invalid_corrected) = fs_context_utils::validate_paths_against_filesystem(
                &corrected_paths, 
                &project_directory
            ).await;
            
            for path in valid_corrected {
                if !final_paths.contains(&path) {
                    final_paths.push(path);
                }
            }
        }
        
        info!("Path correction completed: {} final paths", 
            final_paths.len());
        
        // Check for cancellation after processing using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Store results in job metadata (supplementary info only)
        let result_metadata = json!({
            "originalPaths": payload.extended_paths,
            "validPaths": valid_paths,
            "invalidPaths": invalid_paths,
            "correctedPaths": corrected_paths,
            "taskDescription": payload.task_description,
            "projectDirectory": project_directory,
            "summary": format!("Path correction: {} original → {} valid + {} corrected = {} final", 
                payload.extended_paths.len(),
                valid_paths.len(),
                corrected_paths.len(),
                final_paths.len())
        });
        
        // Serialize final_paths (combined valid and AI-corrected paths) into a simple JSON array for consistent output
        let response_json_content = serde_json::json!({
            "correctedPaths": final_paths,
            "count": final_paths.len()
        }).to_string();
        
        // Finalize job success using standardized utility
        // Use model_used variable for finalization (already extracted from db_job)
        let final_model_used = if !invalid_paths.is_empty() {
            model_used.clone()
        } else {
            "ExtendedPathCorrection".to_string()
        };
        
        job_processor_utils::finalize_job_success(
            &job.id,
            &repo,
            &response_json_content,
            None, // No direct LLM usage since it's conditional
            &final_model_used,
            "ExtendedPathCorrection",
            Some(result_metadata),
        ).await?;
        
        debug!("Extended path correction completed");
        
        // Return success result
        Ok(JobProcessResult::success(
            job.id.clone(), 
            response_json_content
        ))
    }
}