use serde_json::Value;
use log::{info, warn, error, debug};
use regex::Regex;
use crate::error::{AppError, AppResult};
use crate::db_utils::BackgroundJobRepository;
use crate::models::JobStatus;

/// Data validation and recovery utilities
pub struct WorkflowDataValidator;

impl WorkflowDataValidator {
    /// Validate extracted directory tree data
    pub fn validate_directory_tree(data: &str) -> AppResult<()> {
        if data.trim().is_empty() {
            return Err(AppError::JobError("Directory tree data is empty".to_string()));
        }
        
        // Check for basic directory tree structure indicators
        if !data.contains('/') && !data.contains('\\') {
            warn!("Directory tree data may be malformed - no path separators found");
        }
        
        Ok(())
    }

    /// Validate extracted file paths
    pub fn validate_file_paths(paths: &[String]) -> AppResult<()> {
        if paths.is_empty() {
            warn!("No file paths extracted");
            return Ok(()); // Empty paths might be valid in some cases
        }
        
        for path in paths {
            if path.trim().is_empty() {
                return Err(AppError::JobError("Empty path found in extracted data".to_string()));
            }
            
            // Basic path validation
            if path.contains("..") {
                warn!("Potentially unsafe path found: {}", path);
            }
        }
        
        Ok(())
    }

    /// Validate and clean file paths
    pub fn clean_file_paths(paths: Vec<String>) -> Vec<String> {
        paths.into_iter()
            .filter_map(|path| {
                let cleaned = path.trim().to_string();
                if cleaned.is_empty() {
                    None
                } else {
                    Some(cleaned)
                }
            })
            .collect()
    }

    /// Validate regex patterns
    pub fn validate_regex_patterns(patterns: &[String]) -> AppResult<()> {
        if patterns.is_empty() {
            warn!("No regex patterns extracted");
            return Ok(()); // Empty patterns might be valid in some cases
        }
        
        for pattern in patterns {
            if pattern.trim().is_empty() {
                return Err(AppError::JobError("Empty regex pattern found in extracted data".to_string()));
            }
            
            // Basic regex validation - try to compile it
            if let Err(e) = Regex::new(pattern) {
                warn!("Invalid regex pattern found: {} - Error: {}", pattern, e);
                // Don't fail immediately, just warn - some patterns might be partial
            }
        }
        
        Ok(())
    }

    /// Clean regex patterns
    pub fn clean_regex_patterns(patterns: Vec<String>) -> Vec<String> {
        patterns.into_iter()
            .filter_map(|pattern| {
                let cleaned = pattern.trim().to_string();
                if cleaned.is_empty() || cleaned.len() < 2 {
                    None
                } else {
                    Some(cleaned)
                }
            })
            .collect()
    }

    /// Attempt to recover corrupted JSON data
    pub fn recover_json_data(corrupted_json: &str) -> AppResult<Value> {
        // First try normal parsing
        if let Ok(value) = serde_json::from_str::<Value>(corrupted_json) {
            return Ok(value);
        }
        
        // Try to fix common JSON issues
        let mut fixed_json = corrupted_json.to_string();
        
        // Remove trailing commas
        fixed_json = fixed_json.replace(",}", "}");
        fixed_json = fixed_json.replace(",]", "]");
        
        // Try parsing again
        if let Ok(value) = serde_json::from_str::<Value>(&fixed_json) {
            warn!("Successfully recovered corrupted JSON data");
            return Ok(value);
        }
        
        // If all else fails, return a default structure
        warn!("Failed to recover JSON data, returning empty object");
        Ok(serde_json::json!({}))
    }
}

/// Comprehensive data flow logging utility
pub struct DataFlowLogger;

impl DataFlowLogger {
    /// Log data extraction attempt
    pub fn log_extraction_start(job_id: &str, stage: &str, expected_data_type: &str) {
        info!("🔍 Starting data extraction - Job: {}, Stage: {}, Expected: {}", 
              job_id, stage, expected_data_type);
    }

    /// Log successful data extraction
    pub fn log_extraction_success(job_id: &str, stage: &str, data_size: usize, data_type: &str) {
        info!("✅ Data extraction successful - Job: {}, Stage: {}, Size: {} {}", 
              job_id, stage, data_size, data_type);
        debug!("📊 Data extraction metrics - Job: {} extracted {} {} items", 
               job_id, data_size, data_type);
    }

    /// Log data extraction failure
    pub fn log_extraction_failure(job_id: &str, stage: &str, error: &str) {
        error!("❌ Data extraction failed - Job: {}, Stage: {}, Error: {}", 
               job_id, stage, error);
    }
}

/// Stage-specific data extraction utilities
pub struct StageDataExtractor;

impl StageDataExtractor {
    /// Extract directory tree from DirectoryTreeGeneration job
    pub async fn extract_directory_tree(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<String> {
        DataFlowLogger::log_extraction_start(job_id, "DirectoryTreeGeneration", "directory_tree");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!(
                "Job {} is not completed (status: {})", 
                job_id, 
                job.status
            )));
        }
        
        // Extract response (directory tree content)
        let response = job.response
            .ok_or_else(|| AppError::JobError(format!("Job {} has no response", job_id)))?;
        
        // For DirectoryTreeGeneration, the response should be the raw directory tree
        let directory_tree = response.trim().to_string();
        
        // Validate the extracted data
        WorkflowDataValidator::validate_directory_tree(&directory_tree)?;
        
        DataFlowLogger::log_extraction_success(job_id, "DirectoryTreeGeneration", directory_tree.len(), "characters");
        Ok(directory_tree)
    }

    /// Extract filtered paths from LocalFileFiltering job  
    pub async fn extract_filtered_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "LocalFileFiltering", "file_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!(
                "Job {} is not completed (status: {})", 
                job_id, 
                job.status
            )));
        }
        
        let response = job.response
            .ok_or_else(|| AppError::JobError(format!("Job {} has no response", job_id)))?;
        
        debug!("Extracting filtered paths from response (length: {} chars)", response.len());
        
        // LocalFileFiltering processor stores newline-separated strings, not JSON
        let paths = if let Ok(json_value) = serde_json::from_str::<Value>(&response) {
            debug!("LocalFileFiltering response parsed as JSON");
            
            // Check if it's a simple array of strings
            if let Some(array) = json_value.as_array() {
                debug!("Response is JSON array with {} elements", array.len());
                array.iter()
                    .filter_map(|item| {
                        if let Some(path_str) = item.as_str() {
                            Some(path_str.to_string())
                        } else {
                            warn!("Non-string item in filtered paths array: {:?}", item);
                            None
                        }
                    })
                    .collect()
            } else {
                // Fallback to generic JSON extraction
                debug!("Response is not a simple array, attempting generic JSON extraction");
                Self::extract_paths_from_json(&json_value)?
            }
        } else {
            // Primary format: newline-separated text (most common for LocalFileFiltering)
            debug!("LocalFileFiltering response is plain text, parsing as newline-separated paths");
            Self::extract_paths_from_text(&response)?
        };
        
        debug!("Extracted {} raw paths before validation", paths.len());
        
        // Validate and clean the extracted paths
        let cleaned_paths = WorkflowDataValidator::clean_file_paths(paths);
        WorkflowDataValidator::validate_file_paths(&cleaned_paths)?;
        
        if cleaned_paths.is_empty() {
            warn!("No valid file paths extracted from LocalFileFiltering job {}", job_id);
        }
        
        DataFlowLogger::log_extraction_success(job_id, "LocalFileFiltering", cleaned_paths.len(), "file_paths");
        Ok(cleaned_paths)
    }

    /// Extract extended paths from ExtendedPathFinder job
    pub async fn extract_extended_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "ExtendedPathFinder", "extended_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!(
                "Job {} is not completed (status: {})", 
                job_id, 
                job.status
            )));
        }
        
        let response = job.response
            .ok_or_else(|| AppError::JobError(format!("Job {} has no response", job_id)))?;
        
        debug!("Extracting extended paths from response (length: {} chars)", response.len());
        
        // ExtendedPathFinder should primarily return structured JSON (PathFinderResult)
        let paths = if let Ok(json_value) = serde_json::from_str::<Value>(&response) {
            debug!("ExtendedPathFinder response parsed as JSON");
            
            // Try to parse as PathFinderResult first (structured response)
            if let Ok(result) = serde_json::from_value::<crate::jobs::processors::path_finder_types::PathFinderResult>(json_value.clone()) {
                debug!("Extracted PathFinderResult with {} verified paths and {} unverified paths", 
                       result.paths.len(), result.unverified_paths.len());
                
                // Prefer verified paths, but include unverified if no verified paths found
                if !result.paths.is_empty() {
                    debug!("Using {} verified paths from PathFinderResult", result.paths.len());
                    result.paths
                } else if !result.unverified_paths.is_empty() {
                    debug!("No verified paths found, using {} unverified paths from PathFinderResult", result.unverified_paths.len());
                    result.unverified_paths
                } else {
                    debug!("PathFinderResult contains no paths");
                    vec![]
                }
            } else {
                // Fallback to generic path extraction for other JSON structures
                debug!("Could not parse as PathFinderResult, attempting generic path extraction");
                Self::extract_paths_from_path_finder_json(&json_value)?
            }
        } else {
            // Fallback to text parsing - might be newline-separated paths
            debug!("ExtendedPathFinder response is plain text, parsing as newline-separated paths");
            Self::extract_paths_from_text(&response)?
        };
        
        debug!("Extracted {} raw extended paths before validation", paths.len());
        
        // Validate and clean the extracted paths
        let cleaned_paths = WorkflowDataValidator::clean_file_paths(paths);
        WorkflowDataValidator::validate_file_paths(&cleaned_paths)?;
        
        if cleaned_paths.is_empty() {
            warn!("No valid extended paths extracted from ExtendedPathFinder job {}", job_id);
        }
        
        DataFlowLogger::log_extraction_success(job_id, "ExtendedPathFinder", cleaned_paths.len(), "extended_paths");
        Ok(cleaned_paths)
    }

    /// Extract final corrected paths from path correction jobs (InitialPathCorrection or ExtendedPathCorrection)
    pub async fn extract_final_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "PathCorrection", "final_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!(
                "Job {} is not completed (status: {})", 
                job_id, 
                job.status
            )));
        }
        
        let response = job.response
            .ok_or_else(|| AppError::JobError(format!("Job {} has no response", job_id)))?;
        
        debug!("Extracting final paths from response (length: {} chars)", response.len());
        
        // Path correction processors can produce multiple formats:
        // 1. Newline-separated paths (most common)
        // 2. JSON array of strings
        // 3. XML with path tags (legacy format)
        let paths = if response.trim().starts_with('<') && response.contains("<path") {
            // XML format - extract paths using XML parsing
            debug!("PathCorrection response appears to be XML format");
            Self::extract_paths_from_xml(&response)?
        } else if let Ok(json_value) = serde_json::from_str::<Value>(&response) {
            debug!("PathCorrection response parsed as JSON");
            
            // Check if it's a simple array of strings
            if let Some(array) = json_value.as_array() {
                debug!("Response is JSON array with {} elements", array.len());
                array.iter()
                    .filter_map(|item| {
                        if let Some(path_str) = item.as_str() {
                            Some(path_str.to_string())
                        } else {
                            warn!("Non-string item in final paths array: {:?}", item);
                            None
                        }
                    })
                    .collect()
            } else {
                // Fallback to generic JSON extraction
                debug!("Response is not a simple array, attempting generic JSON extraction");
                Self::extract_paths_from_json(&json_value)?
            }
        } else {
            // Primary format: newline-separated text
            debug!("PathCorrection response is plain text, parsing as newline-separated paths");
            Self::extract_paths_from_text(&response)?
        };
        
        debug!("Extracted {} raw final paths before validation", paths.len());
        
        // Validate and clean the extracted paths
        let cleaned_paths = WorkflowDataValidator::clean_file_paths(paths);
        WorkflowDataValidator::validate_file_paths(&cleaned_paths)?;
        
        if cleaned_paths.is_empty() {
            warn!("No valid final paths extracted from PathCorrection job {}", job_id);
        }
        
        DataFlowLogger::log_extraction_success(job_id, "PathCorrection", cleaned_paths.len(), "final_paths");
        Ok(cleaned_paths)
    }

    /// Extract initial paths from PathFinder job
    pub async fn extract_initial_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "PathFinder", "initial_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!(
                "Job {} is not completed (status: {})", 
                job_id, 
                job.status
            )));
        }
        
        let response = job.response
            .ok_or_else(|| AppError::JobError(format!("Job {} has no response", job_id)))?;
        
        // PathFinder should primarily return structured JSON (PathFinderResult)
        let paths = if let Ok(json_value) = serde_json::from_str::<Value>(&response) {
            // Try to parse as PathFinderResult first
            if let Ok(result) = serde_json::from_value::<crate::jobs::processors::path_finder_types::PathFinderResult>(json_value.clone()) {
                debug!("Extracted PathFinderResult with {} verified paths and {} unverified paths", 
                       result.paths.len(), result.unverified_paths.len());
                // Prefer verified paths, but include unverified if no verified paths found
                if !result.paths.is_empty() {
                    result.paths
                } else {
                    result.unverified_paths
                }
            } else {
                // Fallback to generic path extraction
                Self::extract_paths_from_path_finder_json(&json_value)?
            }
        } else {
            // Fallback to text parsing
            Self::extract_paths_from_text(&response)?
        };
        
        // Validate and clean the extracted paths
        let cleaned_paths = WorkflowDataValidator::clean_file_paths(paths);
        WorkflowDataValidator::validate_file_paths(&cleaned_paths)?;
        
        DataFlowLogger::log_extraction_success(job_id, "PathFinder", cleaned_paths.len(), "initial_paths");
        Ok(cleaned_paths)
    }

    /// Extract regex patterns from RegexPatternGeneration job
    pub async fn extract_regex_patterns(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "RegexPatternGeneration", "regex_patterns");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!(
                "Job {} is not completed (status: {})", 
                job_id, 
                job.status
            )));
        }
        
        let response = job.response
            .ok_or_else(|| AppError::JobError(format!("Job {} has no response", job_id)))?;
        
        debug!("Extracting regex patterns from response (length: {} chars)", response.len());
        
        // RegexPatternGeneration processor stores output as JSON string, so parse accordingly
        let patterns = if let Ok(json_value) = serde_json::from_str::<Value>(&response) {
            debug!("Successfully parsed response as JSON");
            
            // First, check if it's a simple array of strings (most common format)
            if let Some(array) = json_value.as_array() {
                debug!("Response is a JSON array with {} elements", array.len());
                array.iter()
                    .filter_map(|item| {
                        if let Some(pattern_str) = item.as_str() {
                            Some(pattern_str.to_string())
                        } else if let Some(pattern_obj) = item.as_object() {
                            // Handle objects that might have a "pattern" field
                            pattern_obj.get("pattern")
                                .and_then(|p| p.as_str())
                                .map(|s| s.to_string())
                        } else {
                            warn!("Non-string item in regex patterns array: {:?}", item);
                            None
                        }
                    })
                    .collect()
            } else {
                // Fallback to complex JSON extraction with various possible structures
                debug!("Response is not a simple array, attempting complex JSON extraction");
                Self::extract_regex_patterns_from_json(&json_value)?
            }
        } else {
            // Fallback to text parsing - the response might be plain text with one pattern per line
            warn!("Could not parse response as JSON, falling back to text parsing");
            Self::extract_regex_patterns_from_text(&response)?
        };
        
        debug!("Extracted {} raw patterns before validation", patterns.len());
        
        // Validate and clean the extracted regex patterns
        let cleaned_patterns = WorkflowDataValidator::clean_regex_patterns(patterns);
        WorkflowDataValidator::validate_regex_patterns(&cleaned_patterns)?;
        
        if cleaned_patterns.is_empty() {
            warn!("No valid regex patterns extracted from job {}", job_id);
        }
        
        DataFlowLogger::log_extraction_success(job_id, "RegexPatternGeneration", cleaned_patterns.len(), "regex_patterns");
        Ok(cleaned_patterns)
    }

    /// Extract workflow metadata from job
    pub async fn extract_workflow_metadata(
        job_id: &str,
        repo: &BackgroundJobRepository
    ) -> AppResult<Value> {
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        if let Some(metadata) = &job.metadata {
            let metadata_value = WorkflowDataValidator::recover_json_data(metadata)?;
            Ok(metadata_value)
        } else {
            Ok(serde_json::json!({}))
        }
    }

    /// Extract specific field from job response with fallback strategies
    pub async fn extract_response_field(
        job_id: &str,
        repo: &BackgroundJobRepository,
        field_path: &str
    ) -> AppResult<Value> {
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        let response = job.response
            .ok_or_else(|| AppError::JobError(format!("Job {} has no response", job_id)))?;
        
        // Try to parse response as JSON and extract field
        if let Ok(json_value) = serde_json::from_str::<Value>(&response) {
            let path_parts: Vec<&str> = field_path.split('.').collect();
            let mut current_value = &json_value;
            
            for part in path_parts {
                current_value = current_value.get(part)
                    .ok_or_else(|| AppError::JobError(format!(
                        "Field '{}' not found in response at path '{}'", 
                        part, 
                        field_path
                    )))?;
            }
            
            Ok(current_value.clone())
        } else {
            // If not JSON, treat as plain text
            Ok(Value::String(response))
        }
    }

    // Helper methods for parsing different response formats

    /// Extract paths from JSON response
    fn extract_paths_from_json(json_value: &Value) -> AppResult<Vec<String>> {
        let mut paths = Vec::new();
        
        // Common JSON structures for file paths
        if let Some(files_array) = json_value.get("files") {
            if let Some(array) = files_array.as_array() {
                for item in array {
                    if let Some(path_str) = item.as_str() {
                        paths.push(path_str.to_string());
                    } else if let Some(path_obj) = item.as_object() {
                        // Handle object with path field
                        if let Some(path_val) = path_obj.get("path") {
                            if let Some(path_str) = path_val.as_str() {
                                paths.push(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }
        
        // Check for paths array directly
        if let Some(paths_array) = json_value.get("paths") {
            if let Some(array) = paths_array.as_array() {
                for item in array {
                    if let Some(path_str) = item.as_str() {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }
        
        // Check for selected_files array (FileFinderWorkflow format)
        if let Some(selected_files) = json_value.get("selected_files") {
            if let Some(array) = selected_files.as_array() {
                for item in array {
                    if let Some(path_str) = item.as_str() {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }
        
        Ok(paths)
    }

    /// Extract paths from PathFinder-specific JSON format
    fn extract_paths_from_path_finder_json(json_value: &Value) -> AppResult<Vec<String>> {
        let mut paths = Vec::new();
        
        // Extract verified paths
        if let Some(verified) = json_value.get("verified_paths") {
            if let Some(array) = verified.as_array() {
                for item in array {
                    if let Some(path_str) = item.as_str() {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }
        
        // Extract unverified paths (if we want to include them)
        if let Some(unverified) = json_value.get("unverified_paths") {
            if let Some(array) = unverified.as_array() {
                for item in array {
                    if let Some(path_str) = item.as_str() {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }
        
        // Fallback to generic extraction
        if paths.is_empty() {
            paths = Self::extract_paths_from_json(json_value)?;
        }
        
        Ok(paths)
    }

    /// Extract paths from XML response (for path correction)
    fn extract_paths_from_xml(xml_content: &str) -> AppResult<Vec<String>> {
        let mut paths = Vec::new();
        
        // Extract corrected paths using regex
        let path_regex = Regex::new(r#"<path[^>]+corrected="([^"]*)"[^>]*>"#)
            .map_err(|e| AppError::JobError(format!("Failed to create regex: {}", e)))?;
        
        for captures in path_regex.captures_iter(xml_content) {
            if let Some(corrected) = captures.get(1) {
                let path = corrected.as_str().trim();
                if !path.is_empty() {
                    paths.push(path.to_string());
                }
            }
        }
        
        // Fallback: extract any paths in <path> tags
        if paths.is_empty() {
            let simple_path_regex = Regex::new(r#"<path[^>]*>([^<]*)</path>"#)
                .map_err(|e| AppError::JobError(format!("Failed to create fallback regex: {}", e)))?;
            
            for captures in simple_path_regex.captures_iter(xml_content) {
                if let Some(path_content) = captures.get(1) {
                    let path = path_content.as_str().trim();
                    if !path.is_empty() {
                        paths.push(path.to_string());
                    }
                }
            }
        }
        
        Ok(paths)
    }

    /// Extract paths from plain text response (one path per line)
    fn extract_paths_from_text(text_content: &str) -> AppResult<Vec<String>> {
        let mut paths = Vec::new();
        
        for line in text_content.lines() {
            let line = line.trim();
            
            // Skip empty lines or comments
            if line.is_empty() || 
               line.starts_with("//") || 
               line.starts_with("#") ||
               line.starts_with("Note:") ||
               line.starts_with("Analysis:") ||
               line.len() < 2 {
                continue;
            }
            
            // Clean the line of potential prefixes/suffixes
            let cleaned_path = line
                .trim_matches(|c| c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == '-' || c == '*')
                .trim();
            
            if !cleaned_path.is_empty() {
                paths.push(cleaned_path.to_string());
            }
        }
        
        Ok(paths)
    }

    /// Extract regex patterns from JSON response
    fn extract_regex_patterns_from_json(json_value: &Value) -> AppResult<Vec<String>> {
        let mut patterns = Vec::new();
        
        // Common JSON structures for regex patterns
        if let Some(patterns_array) = json_value.get("patterns") {
            if let Some(array) = patterns_array.as_array() {
                for item in array {
                    if let Some(pattern_str) = item.as_str() {
                        patterns.push(pattern_str.to_string());
                    } else if let Some(pattern_obj) = item.as_object() {
                        // Handle object with pattern field
                        if let Some(pattern_val) = pattern_obj.get("pattern") {
                            if let Some(pattern_str) = pattern_val.as_str() {
                                patterns.push(pattern_str.to_string());
                            }
                        }
                    }
                }
            }
        }
        
        // Check for regex_patterns array directly
        if let Some(regex_patterns) = json_value.get("regex_patterns") {
            if let Some(array) = regex_patterns.as_array() {
                for item in array {
                    if let Some(pattern_str) = item.as_str() {
                        patterns.push(pattern_str.to_string());
                    }
                }
            }
        }
        
        // Check for generated_patterns array
        if let Some(generated_patterns) = json_value.get("generated_patterns") {
            if let Some(array) = generated_patterns.as_array() {
                for item in array {
                    if let Some(pattern_str) = item.as_str() {
                        patterns.push(pattern_str.to_string());
                    }
                }
            }
        }
        
        Ok(patterns)
    }

    /// Extract regex patterns from plain text response (one pattern per line)
    fn extract_regex_patterns_from_text(text_content: &str) -> AppResult<Vec<String>> {
        let mut patterns = Vec::new();
        
        for line in text_content.lines() {
            let line = line.trim();
            
            // Skip empty lines or comments
            if line.is_empty() || 
               line.starts_with("//") || 
               line.starts_with("#") ||
               line.starts_with("Note:") ||
               line.starts_with("Analysis:") ||
               line.starts_with("Explanation:") ||
               line.len() < 2 {
                continue;
            }
            
            // Clean the line of potential prefixes/suffixes
            let cleaned_pattern = line
                .trim_matches(|c| c == '"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == '-' || c == '*')
                .trim();
            
            // Basic validation: should look like a regex pattern
            if !cleaned_pattern.is_empty() && cleaned_pattern.len() > 1 {
                patterns.push(cleaned_pattern.to_string());
            }
        }
        
        Ok(patterns)
    }

    /// Extract job completion timestamp
    pub async fn extract_completion_timestamp(
        job_id: &str,
        repo: &BackgroundJobRepository
    ) -> AppResult<Option<i64>> {
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        Ok(job.end_time)
    }

    /// Extract job processing duration in milliseconds
    pub async fn extract_processing_duration(
        job_id: &str,
        repo: &BackgroundJobRepository
    ) -> AppResult<Option<i64>> {
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        if let (Some(start), Some(end)) = (job.start_time, job.end_time) {
            Ok(Some(end - start))
        } else {
            Ok(None)
        }
    }

    /// Extract token usage information from job
    pub async fn extract_token_usage(
        job_id: &str,
        repo: &BackgroundJobRepository
    ) -> AppResult<(Option<i32>, Option<i32>, Option<i32>)> {
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        Ok((job.tokens_sent, job.tokens_received, job.total_tokens))
    }

    /// Get error message from failed job
    pub async fn extract_error_message(
        job_id: &str,
        repo: &BackgroundJobRepository
    ) -> AppResult<Option<String>> {
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        Ok(job.error_message)
    }

    /// Check if job has specific metadata field
    pub async fn has_metadata_field(
        job_id: &str,
        repo: &BackgroundJobRepository,
        field_path: &str
    ) -> AppResult<bool> {
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        if let Some(metadata) = &job.metadata {
            if let Ok(metadata_value) = serde_json::from_str::<Value>(metadata) {
                let path_parts: Vec<&str> = field_path.split('.').collect();
                let mut current_value = &metadata_value;
                
                for part in path_parts {
                    if let Some(next_value) = current_value.get(part) {
                        current_value = next_value;
                    } else {
                        return Ok(false);
                    }
                }
                
                return Ok(true);
            }
        }
        
        Ok(false)
    }
}