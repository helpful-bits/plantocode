use std::path::Path;
use log::{debug, info, error, warn};
use serde_json::json;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, ExtendedPathFinderPayload};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::utils::{llm_api_utils, prompt_utils, response_parser_utils, fs_context_utils};
use crate::models::TaskType;
use crate::utils::directory_tree::get_directory_tree_with_defaults;

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
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(
            &payload.background_job_id,
            &app_handle,
        ).await?;
        
        // Extract model settings from BackgroundJob
        let model_used = db_job.model_used.clone().unwrap_or_else(|| "gpt-3.5-turbo".to_string());
        let temperature = db_job.temperature.unwrap_or(0.7);
        let max_output_tokens = db_job.max_output_tokens.unwrap_or(4000) as u32;
        
        job_processor_utils::log_job_start(&payload.background_job_id, "Extended Path Finding");
        info!("Starting extended path finding for workflow {} with {} AI-filtered initial paths", 
            payload.workflow_id, payload.initial_paths.len());
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before processing", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Generate directory tree on-demand
        let directory_tree = match get_directory_tree_with_defaults(&payload.project_directory).await {
            Ok(tree) => {
                info!("Generated directory tree on-demand for extended path finder ({} lines)", tree.lines().count());
                tree
            }
            Err(e) => {
                warn!("Failed to generate directory tree on-demand: {}. Using empty fallback.", e);
                "No directory structure available".to_string()
            }
        };
        
        // Read file contents for all initial paths to provide complete context
        let mut file_contents = std::collections::HashMap::new();
        for path in &payload.initial_paths {
            let absolute_path = Path::new(&payload.project_directory).join(path);
            match tokio::fs::read_to_string(&absolute_path).await {
                Ok(content) => {
                    info!("Read file content for AI context: {} ({} bytes)", path, content.len());
                    file_contents.insert(path.clone(), content);
                },
                Err(e) => {
                    warn!("Failed to read file content for {}: {}", path, e);
                    // Continue without this file's content - don't fail the whole process
                }
            }
        }
        
        info!("Sending {} file contents to AI for better path finding", file_contents.len());
        
        // Build unified prompt using standardized utility
        let composed_prompt = prompt_utils::build_unified_prompt(
            &job,
            &app_handle,
            payload.task_description.clone(),
            Some(directory_tree.clone()),
            Some(file_contents),
            Some(directory_tree.clone()),
            &settings_repo,
            &model_used,
        ).await?;

        info!("Enhanced Extended Path Finder prompt composition for job {}", job.id);
        info!("System prompt ID: {}", composed_prompt.system_prompt_id);
        
        // Extract prompts using standardized utility
        let (system_prompt, user_prompt, system_prompt_id) = llm_api_utils::extract_prompts_from_composed(&composed_prompt);
        
        // Add initial paths context to the user prompt
        let initial_paths_text = if payload.initial_paths.is_empty() {
            "No initial paths were found through AI relevance assessment.".to_string()
        } else {
            format!("Initial paths found through AI relevance assessment:\n{}", 
                payload.initial_paths.iter().map(|p| format!("- {}", p)).collect::<Vec<_>>().join("\n"))
        };
        
        let enhanced_user_prompt = format!("{}\n\n{}\n\nPlease find additional relevant files that might be needed for this task, considering the initial paths above and the complete directory structure.", 
            user_prompt,
            initial_paths_text
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
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before LLM call", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Call LLM using standardized utility
        info!("Calling LLM for extended path finding with model {}", &api_options.model);
        let api_options_clone = api_options.clone();
        let llm_response = llm_api_utils::execute_llm_chat_completion(&app_handle, messages, api_options).await?;
        
        // Extract the response content
        let response_content = llm_response.choices[0].message.content.clone();
        
        // Parse paths from the LLM response using standardized utility
        let extended_paths = match response_parser_utils::parse_paths_from_text_response(&response_content, &payload.project_directory) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to parse paths from LLM response: {}", e);
                error!("{}", error_msg);
                
                // Finalize job failure using standardized utility
                job_processor_utils::finalize_job_failure(&payload.background_job_id, &repo, &error_msg).await?;
                
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        // Validate extended paths found by LLM
        let (validated_extended_paths, unverified_extended_paths) = fs_context_utils::validate_paths_against_filesystem(
            &extended_paths, 
            &payload.project_directory
        ).await;
        
        info!("Extended paths validation: {} valid, {} invalid paths", 
            validated_extended_paths.len(), unverified_extended_paths.len());
        
        // Combine initial paths (already validated and filtered by AI relevance assessment) with validated extended paths
        let mut combined_validated_paths = payload.initial_paths.clone();
        for path in &validated_extended_paths {
            if !combined_validated_paths.contains(path) {
                combined_validated_paths.push(path.clone());
            }
        }
        
        info!("Extended path finding completed for workflow {}: {} AI-filtered initial + {} validated = {} total verified paths", 
            payload.workflow_id, payload.initial_paths.len(), validated_extended_paths.len(), combined_validated_paths.len());
        
        // Check for cancellation after LLM processing using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled after LLM processing", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Store results in job metadata (supplementary info only)
        let result_metadata = json!({
            "initialPaths": payload.initial_paths.len(),
            "llmRawPaths": extended_paths.len(),
            "validatedLlmPaths": validated_extended_paths.len(),
            "unverifiedLlmPaths": unverified_extended_paths.len(),
            "finalVerifiedPaths": combined_validated_paths.len(),
            "initialPathsList": payload.initial_paths,
            "extendedPaths": extended_paths,
            "validatedExtendedPaths": validated_extended_paths,
            "unverifiedExtendedPaths": unverified_extended_paths,
            "llmResponse": response_content,
            "workflowId": payload.workflow_id,
            "taskDescription": payload.task_description,
            "projectDirectory": payload.project_directory,
            "modelUsed": api_options_clone.model,
            "summary": format!("Extended path finding: {} AI-filtered initial + {} validated = {} total verified paths", 
                payload.initial_paths.len(), 
                validated_extended_paths.len(),
                combined_validated_paths.len())
        });
        
        // Create standardized JSON response with verifiedPaths and unverifiedPaths structure
        let response_json_content = serde_json::json!({
            "verifiedPaths": combined_validated_paths,
            "unverifiedPaths": unverified_extended_paths,
            "count": combined_validated_paths.len(),
            "summary": format!("Extended path finding: {} AI-filtered initial + {} validated = {} total verified paths", 
                payload.initial_paths.len(), 
                validated_extended_paths.len(),
                combined_validated_paths.len())
        }).to_string();
        
        // Finalize job success using standardized utility
        job_processor_utils::finalize_job_success(
            &payload.background_job_id,
            &repo,
            &response_json_content,
            llm_response.usage,
            &api_options_clone.model,
            &system_prompt_id,
            Some(result_metadata),
        ).await?;
        
        debug!("Extended path finding completed for workflow {}", payload.workflow_id);
        
        // NOTE: No longer handling internal chaining - WorkflowOrchestrator manages transitions
        
        // Return success result
        Ok(JobProcessResult::success(
            payload.background_job_id.clone(), 
            response_json_content
        ))
    }
}