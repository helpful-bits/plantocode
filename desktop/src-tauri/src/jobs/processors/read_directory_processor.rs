use async_trait::async_trait;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use log::{info, error, debug};
use tauri::{AppHandle, Manager};
use serde_json::json;

use crate::error::{AppError, AppResult};
use crate::jobs::types::{Job, JobProcessResult, JobPayload};
use crate::jobs::processor_trait::JobProcessor;
use crate::utils::fs_utils;
use crate::utils::git_utils;
use crate::db_utils::BackgroundJobRepository;
use crate::utils::get_timestamp;
use crate::models::JobStatus;

/// Processor for read directory jobs
pub struct ReadDirectoryProcessor {
    name: String,
}

impl ReadDirectoryProcessor {
    /// Create a new read directory processor
    pub fn new() -> Self {
        Self {
            name: "ReadDirectoryProcessor".to_string(),
        }
    }
    
    /// Fallback method using recursive directory scan with exclusions
    async fn fallback_to_recursive_scan(&self, path: &Path, exclude_patterns: Option<&Vec<String>>) -> AppResult<Vec<PathBuf>> {
        use std::collections::HashSet;
        use crate::constants::EXCLUDED_DIRS_FOR_SCAN;
        
        // Convert excluded dirs array to HashSet for faster lookups
        let excluded_dirs: HashSet<&str> = EXCLUDED_DIRS_FOR_SCAN.iter().copied().collect();
        
        // Use the recursive filtered directory scan
        info!("Starting recursive directory scan with {} excluded directories", excluded_dirs.len());
        let mut files = fs_utils::read_directory_recursive_filtered(path, path, &excluded_dirs).await?;
        
        // Apply custom exclude patterns if provided
        if let Some(patterns) = exclude_patterns {
            if !patterns.is_empty() {
                info!("Applying {} custom exclude patterns", patterns.len());
                let original_count = files.len();
                
                // Create a new Vec to collect the filtered files
                let mut filtered_files = Vec::new();
                
                for file_path in files {
                    let should_include = if let Ok(rel_path) = file_path.strip_prefix(path) {
                        let rel_path_str = rel_path.to_string_lossy();
                        // Check if the file matches any of the exclude patterns
                        !patterns.iter().any(|pattern| {
                            crate::utils::path_utils::matches_pattern(&rel_path_str, pattern)
                        })
                    } else {
                        // If we can't get a relative path, keep the file
                        true
                    };
                    
                    if should_include {
                        filtered_files.push(file_path);
                    }
                }
                
                // Replace the original files Vec with the filtered one
                files = filtered_files;
                
                info!("Excluded {} files using custom patterns", original_count - files.len());
            }
        }
        
        info!("Recursive scan found {} non-binary files", files.len());
        Ok(files)
    }
}

#[async_trait]
impl JobProcessor for ReadDirectoryProcessor {
    /// Get the processor name
    fn name(&self) -> &str {
        &self.name
    }
    
    /// Check if this processor can handle the given job
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::ReadDirectory(_))
    }
    
    /// Process a job
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id().to_string();
        info!("Processing read directory job {}", job_id);
        
        // Get the repository from app state
        let repo_state = app_handle.state::<Arc<BackgroundJobRepository>>();
        let repo = repo_state.inner().clone();
        
        // Update job status to running
        repo.update_job_status(&job_id, "running", Some("Reading directory structure")).await?;
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::ReadDirectory(payload) => payload,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for read directory job {}",
                    job_id
                )));
            }
        };
        
        let directory_path_str = &payload.path;
        let path = Path::new(directory_path_str);
        let normalized_base_path = crate::utils::path_utils::normalize_path(path);
        if !fs_utils::file_exists(path).await {
            return Err(AppError::FileSystemError(format!(
                "Directory does not exist: {}",
                directory_path_str
            )));
        }
        
        // Check if the path is a directory
        if !fs_utils::is_directory(path).await? {
            return Err(AppError::FileSystemError(format!(
                "Path is not a directory: {}",
                directory_path_str
            )));
        }
        
        // Get the files in the directory
        info!("Reading directory {}", directory_path_str);
        
        let mut files = Vec::<PathBuf>::new();
        
        if git_utils::is_git_repository(path) {
            info!("Directory is a git repository, using git-aware file listing");
            match git_utils::get_all_non_ignored_files(path) {
                Ok((git_files, _is_git_repo)) => {
                    // Convert relative paths from git to absolute paths and filter in one pass
                    for rel_file_path in git_files {
                        // Check if the file should be excluded by patterns
                        let should_exclude = if let Some(patterns) = &payload.exclude_patterns {
                            if !patterns.is_empty() {
                                let rel_path_str = rel_file_path.to_string_lossy();
                                // Check if it matches any exclude pattern
                                patterns.iter().any(|pattern| {
                                    crate::utils::path_utils::matches_pattern(&rel_path_str, pattern)
                                })
                            } else {
                                false
                            }
                        } else {
                            false
                        };
                        
                        // Skip if excluded by patterns
                        if should_exclude {
                            continue;
                        }
                        
                        let abs_file_path = path.join(&rel_file_path);
                        
                        // Skip directories and binary files
                        let is_directory = fs_utils::is_directory(&abs_file_path).await?;
                        let is_binary = fs_utils::is_binary_file(&abs_file_path).await;
                        
                        if !is_directory && !is_binary {
                            files.push(abs_file_path);
                        }
                    }
                    info!("Found {} non-binary files using git-aware method", files.len());
                },
                Err(e) => {
                    log::warn!("Git-aware file listing failed: {}, falling back to recursive directory scan", e);
                    files = self.fallback_to_recursive_scan(path, payload.exclude_patterns.as_ref()).await?;
                }
            }
        } else {
            info!("Directory is not a git repository, using recursive directory scan. Exclude patterns: {:?}", payload.exclude_patterns.as_ref());
            files = self.fallback_to_recursive_scan(path, payload.exclude_patterns.as_ref()).await?;
        }
        
        // Convert the absolute paths back to paths relative to the directory
        let mut relative_files = Vec::new();
        for file_path in files {
            if let Ok(rel_path) = file_path.strip_prefix(&normalized_base_path) {
                relative_files.push(rel_path.to_string_lossy().to_string());
            } else {
                log::warn!("Failed to strip prefix for path: {:?}, base path: {:?}", file_path, normalized_base_path);
            }
        }
        
        // Create the response
        let response = json!({
            "directory": directory_path_str,
            "files": relative_files,
            "count": relative_files.len()
        }).to_string();
        
        info!("Completed read directory job {}", job_id);
        info!("Found {} files", relative_files.len());
        
        // Return success with the JSON response
        Ok(JobProcessResult::success(job_id, response))
    }
    
}