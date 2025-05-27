use async_trait::async_trait;
use std::path::Path;
use std::sync::Arc;
use log::{info, error};
use tauri::{AppHandle, Manager};
use serde_json::json;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobProcessResult, JobPayload, GenerateDirectoryTreePayload};
use crate::jobs::processor_trait::JobProcessor;
use crate::utils::directory_tree::{generate_directory_tree, DirectoryTreeOptions};
use crate::utils::fs_utils;
use crate::db_utils::BackgroundJobRepository;
use crate::models::JobStatus;
use crate::BACKGROUND_JOB_REPO;

/// Processor for generating directory tree jobs
pub struct GenerateDirectoryTreeProcessor {
    name: String,
}

impl GenerateDirectoryTreeProcessor {
    /// Create a new generate directory tree processor
    pub fn new() -> Self {
        Self {
            name: "GenerateDirectoryTreeProcessor".to_string(),
        }
    }
}

#[async_trait]
impl JobProcessor for GenerateDirectoryTreeProcessor {
    /// Get the processor name
    fn name(&self) -> &str {
        &self.name
    }
    
    /// Check if this processor can handle the given job
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::GenerateDirectoryTree(_))
    }
    
    /// Process a job
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id().to_string();
        info!("Processing generate directory tree job {}", job_id);
        
        // Get the repository from app state or global variable
        let repo = app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        // Update job status to running - convert enum to string
        repo.update_job_status(&job_id, "running", Some("Generating directory tree")).await?;
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::GenerateDirectoryTree(payload) => payload,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for generate directory tree job {}",
                    job_id
                )));
            }
        };
        
        let project_directory = job.project_directory.as_ref()
            .ok_or_else(|| AppError::JobError("Project directory not found in job".to_string()))?;
        
        // Check if the directory exists
        let path = Path::new(project_directory);
        if !fs_utils::file_exists(path).await {
            let error_msg = format!("Directory does not exist: {}", project_directory);
            repo.update_job_status(&job_id, "failed", Some(&error_msg)).await?;
            return Err(AppError::FileSystemError(error_msg));
        }
        
        // Check if the path is a directory
        if !fs_utils::is_directory(path).await? {
            let error_msg = format!("Path is not a directory: {}", project_directory);
            repo.update_job_status(&job_id, "failed", Some(&error_msg)).await?;
            return Err(AppError::FileSystemError(error_msg));
        }
        
        // Generate the directory tree
        info!("Generating directory tree for {}", project_directory);
        
        let options = payload.options.clone().unwrap_or_default();
        
        match generate_directory_tree(path, options).await {
            Ok(tree) => {
                // Create the response
                let response = json!({
                    "directory": project_directory,
                    "tree": tree
                }).to_string();
                
                // Update job status to completed
                repo.update_job_status_completed(
                    &job_id, 
                    &response, 
                    None, 
                    None, 
                    None, 
                    None, 
                    Some(response.len() as i32)
                ).await?;
                
                info!("Completed generate directory tree job {}", job_id);
                
                // Return success with the JSON response
                Ok(JobProcessResult::success(job_id, response))
            },
            Err(e) => {
                let error_msg = format!("Failed to generate directory tree: {}", e);
                error!("{}", error_msg);
                
                // Update job status to failed
                repo.update_job_status(&job_id, "failed", Some(&error_msg)).await?;
                
                // Return error
                Err(AppError::JobError(error_msg))
            }
        }
    }
}