use std::path::Path;
use std::fs;
use log::{debug, info, error, warn};
use serde_json::json;
use tauri::AppHandle;
use regex;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, LocalFileFilteringPayload};
use crate::jobs::job_processor_utils;
use crate::utils::path_utils;
use crate::utils::git_utils;

pub struct LocalFileFilteringProcessor;

impl LocalFileFilteringProcessor {
    pub fn new() -> Self {
        Self
    }
    
    /// Perform file filtering using the BEST SOLUTION:
    /// 1. Positive filtering: (path_pattern OR content_pattern) 
    /// 2. Negative filtering: NOT (negative_path_pattern OR negative_content_pattern)
    fn filter_files_with_single_patterns(
        &self,
        project_directory: &str,
        excluded_paths: &[String],
        path_pattern: Option<&str>,
        content_pattern: Option<&str>,
        negative_path_pattern: Option<&str>,
        negative_content_pattern: Option<&str>
    ) -> AppResult<Vec<String>> {
        // Validate that at least one positive pattern is provided
        if path_pattern.is_none() && content_pattern.is_none() {
            return Err(AppError::JobError("At least one positive pattern (path or content) must be provided for file filtering".to_string()));
        }
        
        // Compile regex patterns
        let compiled_path_regex = if let Some(pattern) = path_pattern {
            Some(self.compile_single_regex(pattern)?)
        } else {
            None
        };
        
        let compiled_content_regex = if let Some(pattern) = content_pattern {
            Some(self.compile_single_regex(pattern)?)
        } else {
            None
        };
        
        let compiled_negative_path_regex = if let Some(pattern) = negative_path_pattern {
            Some(self.compile_single_regex(pattern)?)
        } else {
            None
        };
        
        let compiled_negative_content_regex = if let Some(pattern) = negative_content_pattern {
            Some(self.compile_single_regex(pattern)?)
        } else {
            None
        };
        
        let mut positive_matches = Vec::new();
        
        // Normalize the project directory path
        let project_path = Path::new(project_directory);
        let normalized_project_dir = match fs::canonicalize(project_path) {
            Ok(path) => path,
            Err(e) => {
                return Err(AppError::JobError(format!("Failed to canonicalize project directory {}: {}", project_directory, e)));
            }
        };
        
        info!("Starting git-aware file discovery with title and content filtering in: {}", normalized_project_dir.display());
        
        // Use git-aware file discovery instead of glob traversal
        let (git_files, is_git_repo) = git_utils::get_all_non_ignored_files(&normalized_project_dir)?;
        
        if !is_git_repo {
            return Err(AppError::JobError("Project directory is not a git repository. Only git repositories are supported for file filtering.".to_string()));
        }
        
        let total_files = git_files.len();
        info!("Found {} git-tracked and non-ignored files", total_files);
        
        // STEP 1: Apply positive filtering (path_pattern OR content_pattern)
        for relative_path_buf in git_files {
            let relative_path = relative_path_buf.to_string_lossy().to_string();
            
            // Check if path should be excluded by exclusion patterns
            if self.is_path_excluded(&relative_path, excluded_paths) {
                continue;
            }
            
            let mut matches_positive = false;
            
            // Check path pattern match
            if let Some(ref path_regex) = compiled_path_regex {
                if path_regex.is_match(&relative_path) {
                    debug!("File '{}' matches path pattern", relative_path);
                    matches_positive = true;
                }
            }
            
            // Check content pattern match (if no path match yet)
            if !matches_positive {
                if let Some(ref content_regex) = compiled_content_regex {
                    let full_path = normalized_project_dir.join(&relative_path);
                    match fs::read_to_string(&full_path) {
                        Ok(content) => {
                            if content_regex.is_match(&content) {
                                debug!("File '{}' matches content pattern", relative_path);
                                matches_positive = true;
                            }
                        }
                        Err(e) => {
                            debug!("Failed to read file {} for content filtering: {}", relative_path, e);
                            // Skip files that can't be read
                            continue;
                        }
                    }
                }
            }
            
            // If matches positive criteria, add to positive matches
            if matches_positive {
                positive_matches.push(relative_path);
            }
        }
        
        let positive_count = positive_matches.len();
        info!("Positive filtering found {} files matching (path OR content) criteria", positive_count);
        
        // STEP 2: Apply negative filtering (NOT (negative_path_pattern OR negative_content_pattern))
        let mut final_matches = Vec::new();
        
        for relative_path in positive_matches {
            let mut matches_negative = false;
            
            // Check negative path pattern
            if let Some(ref negative_path_regex) = compiled_negative_path_regex {
                if negative_path_regex.is_match(&relative_path) {
                    debug!("File '{}' excluded by negative path pattern", relative_path);
                    matches_negative = true;
                }
            }
            
            // Check negative content pattern (if no path exclusion yet)
            if !matches_negative {
                if let Some(ref negative_content_regex) = compiled_negative_content_regex {
                    let full_path = normalized_project_dir.join(&relative_path);
                    match fs::read_to_string(&full_path) {
                        Ok(content) => {
                            if negative_content_regex.is_match(&content) {
                                debug!("File '{}' excluded by negative content pattern", relative_path);
                                matches_negative = true;
                            }
                        }
                        Err(e) => {
                            debug!("Failed to read file {} for negative content filtering: {}", relative_path, e);
                            // If we can't read the file, include it (don't exclude based on content)
                        }
                    }
                }
            }
            
            // Include file only if it doesn't match negative criteria
            if !matches_negative {
                final_matches.push(relative_path);
            }
        }
        
        // Remove duplicates and sort
        final_matches.sort();
        final_matches.dedup();
        
        info!("BEST SOLUTION filtering results: {} total files → {} positive matches → {} final matches (after negative filtering)", 
            total_files, positive_count, final_matches.len());
        
        Ok(final_matches)
    }

    
    /// Check if a path should be excluded based on exclusion patterns
    fn is_path_excluded(&self, path: &str, excluded_paths: &[String]) -> bool {
        for exclusion_pattern in excluded_paths {
            // Use glob pattern matching for exclusions
            if let Ok(pattern) = glob::Pattern::new(exclusion_pattern) {
                if pattern.matches(path) {
                    debug!("Path '{}' excluded by pattern '{}'", path, exclusion_pattern);
                    return true;
                }
            } else {
                // Fallback to simple string matching if glob pattern is invalid
                if path.contains(exclusion_pattern) {
                    debug!("Path '{}' excluded by substring match '{}'", path, exclusion_pattern);
                    return true;
                }
            }
        }
        false
    }
    
    
    /// Compile a single regex pattern with validation
    fn compile_single_regex(&self, pattern: &str) -> AppResult<regex::Regex> {
        match regex::Regex::new(pattern) {
            Ok(regex) => {
                debug!("Successfully compiled regex pattern: {}", pattern);
                Ok(regex)
            },
            Err(e) => {
                error!("Invalid regex pattern '{}': {}", pattern, e);
                Err(AppError::JobError(format!("Invalid regex pattern '{}': {}", pattern, e)))
            }
        }
    }
}

#[async_trait::async_trait]
impl JobProcessor for LocalFileFilteringProcessor {
    fn name(&self) -> &'static str {
        "LocalFileFiltering"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::LocalFileFiltering(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::LocalFileFiltering(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing using standardized utility
        let (repo, _settings_repo, _background_job) = job_processor_utils::setup_job_processing(
            &job.id, 
            &app_handle
        ).await?;
        
        // Get project directory from session
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        let project_directory = &session.project_directory;
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Log regex patterns information
        info!("Using patterns for filtering - path: {:?}, content: {:?}, negative_path: {:?}, negative_content: {:?}", 
            payload.path_pattern, payload.content_pattern, payload.negative_path_pattern, payload.negative_content_pattern);
        
        // Perform BEST SOLUTION file filtering with single patterns and proper OR logic
        let filtered_paths = match self.filter_files_with_single_patterns(
            &project_directory,
            &payload.excluded_paths,
            payload.path_pattern.as_deref(),
            payload.content_pattern.as_deref(),
            payload.negative_path_pattern.as_deref(),
            payload.negative_content_pattern.as_deref()
        ) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to filter paths: {}", e);
                error!("{}", error_msg);
                
                // Update job to failed using standardized utility - non-LLM processor
                job_processor_utils::finalize_job_failure(&job.id, &repo, &error_msg, Some(&e), None, None).await?;
                
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };
        
        info!("Filtered to {} potentially relevant files for workflow {}", 
            filtered_paths.len(), job.id);
        
        // Check if job has been canceled after filtering using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after filtering", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Store results in job metadata (supplementary info only)
        let result_metadata = json!({
            "workflowId": job.id,
            "taskDescription": payload.task_description,
            "projectDirectory": project_directory,
            "pathPattern": payload.path_pattern,
            "contentPattern": payload.content_pattern,
            "negativePathPattern": payload.negative_path_pattern,
            "negativeContentPattern": payload.negative_content_pattern,
            "filteringMethod": "best-solution-single-patterns-or-logic",
            "summary": format!("Found {} potentially relevant files using BEST SOLUTION: (path OR content) AND NOT (negative_path OR negative_content)", 
                filtered_paths.len()
            )
        });
        
        // Serialize filtered_paths into a structured JSON object
        let response_json_content = serde_json::json!({
            "filteredFiles": filtered_paths,
            "count": filtered_paths.len(),
            "summary": format!("Found {} potentially relevant files using BEST SOLUTION: (path OR content) AND NOT (negative_path OR negative_content)", 
                filtered_paths.len()
            )
        }).to_string();
        
        // Finalize job success using standardized utility
        job_processor_utils::finalize_job_success(
            &job.id,
            &repo,
            &response_json_content,
            None, // No LLM usage for this processor
            "LocalFileFiltering", // Model used (processor name for non-LLM)
            "LocalFileFiltering", // System prompt ID (processor name for non-LLM)
            Some(result_metadata),
        ).await?;
        
        debug!("Local file filtering completed for workflow {}", job.id);
        
        // NOTE: No longer handling internal chaining - WorkflowOrchestrator manages transitions
        
        // Return success result
        Ok(JobProcessResult::success(
            job.id.clone(), 
            response_json_content
        ))
    }
}