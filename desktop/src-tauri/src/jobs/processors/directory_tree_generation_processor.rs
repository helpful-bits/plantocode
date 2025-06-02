use std::path::Path;
use log::{debug, info, error};
use serde_json::json;
use tauri::AppHandle;

use crate::constants::EXCLUDED_DIRS_FOR_SCAN;
use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::jobs::job_processor_utils;
use crate::utils::directory_tree::{generate_directory_tree, DirectoryTreeOptions};

pub struct DirectoryTreeGenerationProcessor;

impl DirectoryTreeGenerationProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl JobProcessor for DirectoryTreeGenerationProcessor {
    fn name(&self) -> &'static str {
        "DirectoryTreeGeneration"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::DirectoryTreeGeneration(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::DirectoryTreeGeneration(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup repositories and mark job as running using standardized utility
        let (repo, _settings_repo, _background_job) = job_processor_utils::setup_job_processing(
            &payload.background_job_id,
            &app_handle,
        ).await?;
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before processing", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Generate directory tree
        let project_dir_path = Path::new(&payload.project_directory);
        
        // Create tree generation options
        let tree_options = DirectoryTreeOptions {
            max_depth: None,
            include_ignored: false,
            respect_gitignore: true,
            exclude_patterns: Some(
                EXCLUDED_DIRS_FOR_SCAN.iter()
                    .map(|&s| s.to_string())
                    .chain(payload.excluded_paths.iter().cloned())
                    .collect()
            ),
            include_files: true,
            include_dirs: true,
            include_hidden: false,
        };
        
        // Generate the directory tree asynchronously
        let directory_tree = match generate_directory_tree(project_dir_path, tree_options).await {
            Ok(tree) => tree,
            Err(e) => {
                let error_msg = format!("Failed to generate directory tree: {}", e);
                error!("{}", error_msg);
                
                // Update job to failed using standardized utility
                job_processor_utils::finalize_job_failure(&payload.background_job_id, &repo, &error_msg).await?;
                
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        info!("Generated directory tree with {} lines for workflow {}", 
            directory_tree.lines().count(), payload.workflow_id);
        
        // Check if job has been canceled after tree generation using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled after tree generation", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Store results: response = raw directory tree, metadata = supplementary info
        let result_metadata = json!({
            "workflowId": payload.workflow_id,
            "projectDirectory": payload.project_directory,
            "excludedPaths": payload.excluded_paths,
            "summary": format!("Directory tree generated with {} lines", directory_tree.lines().count())
        });
        
        // Store the line count before moving the directory_tree
        let line_count = directory_tree.lines().count();
        
        // Finalize job success using standardized utility
        // The directory_tree string is the primary output, store it directly in job.response
        job_processor_utils::finalize_job_success(
            &payload.background_job_id,
            &repo,
            &directory_tree,
            None, // No LLM usage for this processor
            "DirectoryTreeGeneration", // Model used (processor name for non-LLM)
            "DirectoryTreeGeneration", // System prompt ID (processor name for non-LLM)
            Some(result_metadata),
        ).await?;
        
        debug!("Directory tree generation completed for workflow {}", payload.workflow_id);
        
        // NOTE: No longer handling internal chaining - WorkflowOrchestrator manages transitions
        
        // Return success result
        Ok(JobProcessResult::success(
            payload.background_job_id.clone(), 
            format!("Directory tree generated successfully with {} lines", line_count)
        ))
    }
}