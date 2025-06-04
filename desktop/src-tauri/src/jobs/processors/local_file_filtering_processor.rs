use std::path::Path;
use log::{debug, info, error, warn};
use serde_json::json;
use tauri::AppHandle;
use regex;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, LocalFileFilteringPayload};
use crate::jobs::job_processor_utils;
use crate::utils::path_utils;
use crate::utils::directory_tree::get_directory_tree_for_processor;

pub struct LocalFileFilteringProcessor;

impl LocalFileFilteringProcessor {
    pub fn new() -> Self {
        Self
    }
    
    /// Perform local file filtering based on regex patterns and task description keywords
    fn filter_paths_by_task(&self, directory_tree: &str, task_description: &str, project_directory: &str, regex_patterns: &[String]) -> AppResult<Vec<String>> {
        let mut filtered_paths = Vec::new();
        
        // Handle case where directory tree is unavailable
        if directory_tree.trim().is_empty() || directory_tree == "No directory structure available" {
            info!("Directory tree is unavailable for filtering, returning empty path list");
            return Ok(filtered_paths);
        }
        
        // Extract potential keywords from task description
        let keywords = self.extract_keywords_from_task(task_description);
        
        // Parse directory tree lines
        for line in directory_tree.lines() {
            let line = line.trim();
            
            // Skip empty lines or directory indicators
            if line.is_empty() || line.ends_with('/') {
                continue;
            }
            
            // Extract file path from tree format
            if let Some(file_path) = self.extract_file_path_from_tree_line(line) {
                // Check if path matches any regex patterns or keywords
                let matches_regex = self.path_matches_regex_patterns(&file_path, regex_patterns);
                let matches_keywords = self.path_matches_keywords(&file_path, &keywords);
                
                // Prioritize regex matching if patterns are provided, use keywords as fallback
                if (!regex_patterns.is_empty() && matches_regex) || (regex_patterns.is_empty() && matches_keywords) {
                    // Make path relative to project directory
                    let normalized_path = if Path::new(&file_path).is_absolute() {
                        match path_utils::make_relative_to(&file_path, project_directory) {
                            Ok(rel_path) => rel_path.to_string_lossy().to_string(),
                            Err(_) => continue,
                        }
                    } else {
                        file_path
                    };
                    
                    filtered_paths.push(normalized_path);
                }
            }
        }
        
        // Remove duplicates and sort
        filtered_paths.sort();
        filtered_paths.dedup();
        
        Ok(filtered_paths)
    }
    
    /// Extract keywords from task description for filtering
    fn extract_keywords_from_task(&self, task_description: &str) -> Vec<String> {
        let mut keywords = Vec::new();
        
        // Common file extensions that might be mentioned
        let file_extensions = vec![
            ".rs", ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".cpp", ".c", ".h",
            ".css", ".scss", ".html", ".json", ".yaml", ".yml", ".toml", ".md",
            ".txt", ".config", ".env", ".sh", ".sql", ".go", ".php", ".rb"
        ];
        
        // Check for file extensions in task description
        for ext in file_extensions {
            if task_description.to_lowercase().contains(ext) {
                keywords.push(ext.to_string());
            }
        }
        
        // Extract words that look like file/directory names
        let words: Vec<&str> = task_description.split_whitespace().collect();
        for word in words {
            let clean_word = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '_' && c != '-' && c != '.');
            
            // Add words that look like filenames or module names
            if clean_word.len() > 2 && (
                clean_word.contains('.') ||
                clean_word.contains('_') ||
                clean_word.contains('-') ||
                clean_word.chars().all(|c| c.is_lowercase() || c.is_numeric() || c == '_' || c == '-')
            ) {
                keywords.push(clean_word.to_lowercase());
            }
        }
        
        keywords
    }
    
    /// Extract file path from a directory tree line
    fn extract_file_path_from_tree_line(&self, line: &str) -> Option<String> {
        // Remove tree formatting characters
        let cleaned = line
            .replace("├── ", "")
            .replace("└── ", "")
            .replace("│   ", "")
            .replace("    ", "")
            .trim()
            .to_string();
        
        if cleaned.is_empty() || cleaned.ends_with('/') {
            None
        } else {
            Some(cleaned)
        }
    }
    
    /// Check if a file path matches any of the regex patterns
    fn path_matches_regex_patterns(&self, path: &str, regex_patterns: &[String]) -> bool {
        if regex_patterns.is_empty() {
            return false;
        }
        
        for pattern in regex_patterns {
            match regex::Regex::new(pattern) {
                Ok(regex) => {
                    if regex.is_match(path) {
                        debug!("Path '{}' matches regex pattern '{}'", path, pattern);
                        return true;
                    }
                },
                Err(e) => {
                    error!("Invalid regex pattern '{}': {}", pattern, e);
                    // Continue to next pattern instead of failing
                    continue;
                }
            }
        }
        
        false
    }
    
    /// Check if a file path matches any of the keywords
    fn path_matches_keywords(&self, path: &str, keywords: &[String]) -> bool {
        let path_lower = path.to_lowercase();
        
        for keyword in keywords {
            if path_lower.contains(keyword) {
                return true;
            }
        }
        
        // Also check for common important files
        let important_patterns = vec![
            "main", "index", "app", "config", "settings", "setup", "init",
            "core", "util", "helper", "service", "handler", "controller",
            "model", "component", "api", "router", "route"
        ];
        
        for pattern in important_patterns {
            if path_lower.contains(pattern) {
                return true;
            }
        }
        
        false
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
            &payload.background_job_id, 
            &app_handle
        ).await?;
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled before processing", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Log regex patterns information
        if !payload.regex_patterns.is_empty() {
            info!("Using {} regex patterns for filtering: {:?}", 
                payload.regex_patterns.len(), payload.regex_patterns);
        } else {
            info!("No regex patterns provided, using keyword-based filtering");
        }
        
        // Generate directory tree on-demand
        let directory_tree = match get_directory_tree_for_processor(&payload.project_directory, Some(&payload.excluded_paths)).await {
            Ok(tree) => {
                info!("Generated directory tree on-demand for local file filtering ({} lines)", tree.lines().count());
                tree
            }
            Err(e) => {
                warn!("Failed to generate directory tree on-demand: {}. Using empty fallback.", e);
                "No directory structure available".to_string()
            }
        };
        
        // Perform local file filtering
        let filtered_paths = match self.filter_paths_by_task(
            &directory_tree,
            &payload.task_description,
            &payload.project_directory,
            &payload.regex_patterns
        ) {
            Ok(paths) => paths,
            Err(e) => {
                let error_msg = format!("Failed to filter paths: {}", e);
                error!("{}", error_msg);
                
                // Update job to failed using standardized utility
                job_processor_utils::finalize_job_failure(&payload.background_job_id, &repo, &error_msg).await?;
                
                return Ok(JobProcessResult::failure(payload.background_job_id.clone(), error_msg));
            }
        };
        
        info!("Filtered to {} potentially relevant files for workflow {}", 
            filtered_paths.len(), payload.workflow_id);
        
        // Check if job has been canceled after filtering using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &payload.background_job_id).await? {
            info!("Job {} has been canceled after filtering", payload.background_job_id);
            return Ok(JobProcessResult::failure(payload.background_job_id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Store results in job metadata (supplementary info only)
        let result_metadata = json!({
            "workflowId": payload.workflow_id,
            "taskDescription": payload.task_description,
            "projectDirectory": payload.project_directory,
            "regexPatternsUsed": payload.regex_patterns.len(),
            "regexPatterns": payload.regex_patterns,
            "filteringMethod": if payload.regex_patterns.is_empty() { "keyword-based" } else { "regex-based" },
            "summary": format!("Found {} potentially relevant files using {} filtering", 
                filtered_paths.len(),
                if payload.regex_patterns.is_empty() { "keyword-based" } else { "regex-based" }
            )
        });
        
        // Serialize filtered_paths into a structured JSON object
        let response_json_content = serde_json::json!({
            "filteredFiles": filtered_paths,
            "count": filtered_paths.len(),
            "summary": format!("Found {} potentially relevant files using {} filtering", 
                filtered_paths.len(), 
                if payload.regex_patterns.is_empty() { "keyword-based" } else { "regex-based" }
            )
        }).to_string();
        
        // Finalize job success using standardized utility
        job_processor_utils::finalize_job_success(
            &payload.background_job_id,
            &repo,
            &response_json_content,
            None, // No LLM usage for this processor
            "LocalFileFiltering", // Model used (processor name for non-LLM)
            "LocalFileFiltering", // System prompt ID (processor name for non-LLM)
            Some(result_metadata),
        ).await?;
        
        debug!("Local file filtering completed for workflow {}", payload.workflow_id);
        
        // NOTE: No longer handling internal chaining - WorkflowOrchestrator manages transitions
        
        // Return success result
        Ok(JobProcessResult::success(
            payload.background_job_id.clone(), 
            response_json_content
        ))
    }
}