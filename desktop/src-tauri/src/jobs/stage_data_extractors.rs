use serde_json::Value;
use log::{info, warn, error, debug};
use regex::Regex;
use crate::error::{AppError, AppResult};
use crate::db_utils::BackgroundJobRepository;
use crate::models::JobStatus;
use crate::jobs::types::PatternGroup;

/// Data validation and recovery utilities
pub struct WorkflowDataValidator;

impl WorkflowDataValidator {

    /// Validate extracted file paths
    pub fn validate_file_paths(paths: &[String]) -> AppResult<()> {
        if paths.is_empty() {
            error!("No file paths extracted");
            return Err(AppError::JobError("No file paths extracted".to_string()));
        }
        
        for path in paths {
            if path.trim().is_empty() {
                return Err(AppError::JobError("Empty path found in extracted data".to_string()));
            }
            
            // Basic path validation
            if path.contains("..") {
                return Err(AppError::JobError(format!("Potentially unsafe path found: {}", path)));
            }
        }
        
        Ok(())
    }

    /// Validate and clean file paths
    pub fn clean_file_paths(paths: Vec<String>) -> Vec<String> {
        paths
    }

    /// Validate regex patterns
    pub fn validate_regex_patterns(patterns: &[String]) -> AppResult<()> {
        if patterns.is_empty() {
            error!("No regex patterns extracted");
            return Err(AppError::JobError("No regex patterns extracted".to_string()));
        }
        
        for pattern in patterns {
            if pattern.trim().is_empty() {
                return Err(AppError::JobError("Empty regex pattern found in extracted data".to_string()));
            }
            
            // Basic regex validation - try to compile it
            if let Err(e) = Regex::new(pattern) {
                return Err(AppError::JobError(format!("Invalid regex pattern found: {} - Error: {}", pattern, e)));
            }
        }
        
        Ok(())
    }

    /// Validate pattern groups structure
    pub fn validate_pattern_groups(pattern_groups: &[PatternGroup]) -> AppResult<()> {
        if pattern_groups.is_empty() {
            error!("No pattern groups extracted");
            return Err(AppError::JobError("No pattern groups extracted".to_string()));
        }
        
        for (index, group) in pattern_groups.iter().enumerate() {
            if group.title.trim().is_empty() {
                return Err(AppError::JobError(format!("Pattern group at index {} has empty title", index)));
            }
            
            // Validate regex patterns if they exist
            if let Some(ref path_pattern) = group.path_pattern {
                if let Err(e) = Regex::new(path_pattern) {
                    return Err(AppError::JobError(format!("Invalid path pattern in group '{}': {} - Error: {}", group.title, path_pattern, e)));
                }
            }
            
            if let Some(ref content_pattern) = group.content_pattern {
                if let Err(e) = Regex::new(content_pattern) {
                    return Err(AppError::JobError(format!("Invalid content pattern in group '{}': {} - Error: {}", group.title, content_pattern, e)));
                }
            }
            
            if let Some(ref negative_path_pattern) = group.negative_path_pattern {
                if let Err(e) = Regex::new(negative_path_pattern) {
                    return Err(AppError::JobError(format!("Invalid negative path pattern in group '{}': {} - Error: {}", group.title, negative_path_pattern, e)));
                }
            }
            
            // Validate that at least one pattern is provided
            if group.path_pattern.is_none() && group.content_pattern.is_none() && group.negative_path_pattern.is_none() {
                return Err(AppError::JobError(format!("Pattern group '{}' has no patterns defined", group.title)));
            }
        }
        
        Ok(())
    }

    /// Clean regex patterns
    pub fn clean_regex_patterns(patterns: Vec<String>) -> Vec<String> {
        patterns
    }

    /// Clean pattern groups
    pub fn clean_pattern_groups(pattern_groups: Vec<PatternGroup>) -> Vec<PatternGroup> {
        pattern_groups
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

    /// Extract filtered paths from LocalFileFiltering job  
    pub async fn extract_filtered_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "LocalFileFiltering", "file_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Require job status to be Completed
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!("Job {} is not completed (status: {})", job_id, job.status)));
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                return Err(AppError::JobError(format!("Job {} has no response", job_id)));
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            return Err(AppError::JobError(format!("Job {} has empty response", job_id)));
        }
        
        debug!("Extracting filtered paths from response (length: {} chars)", response.len());
        
        // Parse response as JSON and extract filteredFiles array
        let json_value = serde_json::from_str::<Value>(&response)
            .map_err(|e| AppError::JobError(format!(
                "LocalFileFiltering job {} response is not valid JSON: {}", 
                job_id, e
            )))?;
        
        debug!("LocalFileFiltering response parsed as JSON");
        
        // Extract paths from filteredFiles field - ONLY look for filteredFiles
        let filtered_files = json_value.get("filteredFiles")
            .ok_or_else(|| AppError::JobError(format!(
                "LocalFileFiltering job {} response missing 'filteredFiles' field", 
                job_id
            )))?;
        
        let array = filtered_files.as_array()
            .ok_or_else(|| AppError::JobError(format!(
                "LocalFileFiltering job {} 'filteredFiles' field is not an array: {:?}", 
                job_id, filtered_files
            )))?;
        
        debug!("Found filteredFiles array with {} elements", array.len());
        
        let paths: Vec<String> = array.iter()
            .enumerate()
            .filter_map(|(index, item)| {
                if let Some(path_str) = item.as_str() {
                    Some(path_str.to_string())
                } else {
                    error!("Non-string item at index {} in filteredFiles array: {:?}", index, item);
                    None
                }
            })
            .collect();
        
        debug!("Extracted {} raw paths before validation", paths.len());
        
        // Validate the extracted paths
        WorkflowDataValidator::validate_file_paths(&paths)?;
        
        if paths.is_empty() {
            return Err(AppError::JobError(format!("No file paths extracted from LocalFileFiltering job {}", job_id)));
        }
        
        DataFlowLogger::log_extraction_success(job_id, "LocalFileFiltering", paths.len(), "file_paths");
        Ok(paths)
    }

    /// Extract extended paths from ExtendedPathFinder job
    /// Returns (verified_paths, unverified_paths)
    pub async fn extract_extended_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<(Vec<String>, Vec<String>)> {
        DataFlowLogger::log_extraction_start(job_id, "ExtendedPathFinder", "extended_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Require job status to be Completed
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!("Job {} is not completed (status: {})", job_id, job.status)));
        }
        
        let response_str = match job.response {
            Some(resp) => resp,
            None => {
                return Err(AppError::JobError(format!("Job {} has no response", job_id)));
            }
        };
        
        // Check for empty response
        if response_str.trim().is_empty() {
            return Err(AppError::JobError(format!("Job {} has empty response", job_id)));
        }
        
        debug!("Extracting extended paths from response (length: {} chars)", response_str.len());
        
        // Parse response as JSON object
        let json_value = serde_json::from_str::<Value>(&response_str)
            .map_err(|e| AppError::JobError(format!(
                "ExtendedPathFinder job {} response is not valid JSON: {}", 
                job_id, e
            )))?;
        
        debug!("ExtendedPathFinder response parsed as JSON");
        
        // Extract verifiedPaths array from JSON - ONLY look for verifiedPaths
        let verified_paths: Vec<String> = json_value.get("verifiedPaths")
            .ok_or_else(|| AppError::JobError(format!("ExtendedPathFinder job {} response missing 'verifiedPaths' field", job_id)))?
            .as_array()
            .ok_or_else(|| AppError::JobError(format!("ExtendedPathFinder job {} 'verifiedPaths' field is not an array", job_id)))?
            .iter().filter_map(|item| item.as_str().map(String::from)).collect();
        
        // Extract unverifiedPaths array from JSON - allow empty or missing field
        let unverified_paths: Vec<String> = json_value.get("unverifiedPaths")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|item| item.as_str().map(String::from)).collect())
            .unwrap_or_default();
        
        debug!("Extracted {} verified and {} unverified paths before validation", 
               verified_paths.len(), unverified_paths.len());
        
        // Validate only non-empty path arrays (empty arrays are valid for completion logic)
        if !verified_paths.is_empty() {
            WorkflowDataValidator::validate_file_paths(&verified_paths)?
        }
        if !unverified_paths.is_empty() {
            WorkflowDataValidator::validate_file_paths(&unverified_paths)?
        }
        
        if verified_paths.is_empty() && unverified_paths.is_empty() {
            debug!("ExtendedPathFinder job {} returned no extended paths - this may be valid if no additional paths were found", job_id);
        }
        
        DataFlowLogger::log_extraction_success(job_id, "ExtendedPathFinder", 
                                               verified_paths.len() + unverified_paths.len(), 
                                               "extended_paths");
        Ok((verified_paths, unverified_paths))
    }

    /// Extract AI-filtered files from FileRelevanceAssessment job
    pub async fn extract_ai_filtered_files(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "FileRelevanceAssessment", "ai_filtered_files");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Require job status to be Completed
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!("Job {} is not completed (status: {})", job_id, job.status)));
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                return Err(AppError::JobError(format!("Job {} has no response", job_id)));
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            return Err(AppError::JobError(format!("Job {} has empty response", job_id)));
        }
        
        debug!("Extracting AI-filtered files from response (length: {} chars)", response.len());
        
        // Parse response as JSON and extract relevantFiles array
        let json_value = serde_json::from_str::<Value>(&response)
            .map_err(|e| AppError::JobError(format!(
                "FileRelevanceAssessment job {} response is not valid JSON: {}", 
                job_id, e
            )))?;
        
        debug!("FileRelevanceAssessment response parsed as JSON");
        
        // Extract paths from relevantFiles field
        let ai_filtered_files = json_value.get("relevantFiles")
            .ok_or_else(|| AppError::JobError(format!(
                "FileRelevanceAssessment job {} response missing 'relevantFiles' field", 
                job_id
            )))?;
        
        let array = ai_filtered_files.as_array()
            .ok_or_else(|| AppError::JobError(format!(
                "FileRelevanceAssessment job {} 'relevantFiles' field is not an array: {:?}", 
                job_id, ai_filtered_files
            )))?;
        
        debug!("Found relevantFiles array with {} elements", array.len());
        
        let paths: Vec<String> = array.iter()
            .enumerate()
            .filter_map(|(index, item)| {
                if let Some(path_str) = item.as_str() {
                    Some(path_str.to_string())
                } else {
                    error!("Non-string item at index {} in relevantFiles array: {:?}", index, item);
                    None
                }
            })
            .collect();
        
        debug!("Extracted {} raw AI-filtered paths before validation", paths.len());
        
        // Validate the extracted paths
        WorkflowDataValidator::validate_file_paths(&paths)?;
        
        if paths.is_empty() {
            return Err(AppError::JobError(format!("No AI-filtered file paths extracted from FileRelevanceAssessment job {}", job_id)));
        }
        
        DataFlowLogger::log_extraction_success(job_id, "FileRelevanceAssessment", paths.len(), "ai_filtered_files");
        Ok(paths)
    }

    /// Extract AI-filtered files with token count from FileRelevanceAssessment job
    pub async fn extract_ai_filtered_files_with_token_count(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<(Vec<String>, u32)> {
        DataFlowLogger::log_extraction_start(job_id, "FileRelevanceAssessment", "ai_filtered_files_with_token_count");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Require job status to be Completed
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!("Job {} is not completed (status: {})", job_id, job.status)));
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                return Err(AppError::JobError(format!("Job {} has no response", job_id)));
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            return Err(AppError::JobError(format!("Job {} has empty response", job_id)));
        }
        
        debug!("Extracting AI-filtered files with token count from response (length: {} chars)", response.len());
        
        // Parse response as JSON and extract relevantFiles array and tokenCount
        let json_value = serde_json::from_str::<Value>(&response)
            .map_err(|e| AppError::JobError(format!(
                "FileRelevanceAssessment job {} response is not valid JSON: {}", 
                job_id, e
            )))?;
        
        debug!("FileRelevanceAssessment response parsed as JSON");
        
        // Extract paths from relevantFiles field
        let ai_filtered_files = json_value.get("relevantFiles")
            .ok_or_else(|| AppError::JobError(format!(
                "FileRelevanceAssessment job {} response missing 'relevantFiles' field", 
                job_id
            )))?;
        
        let array = ai_filtered_files.as_array()
            .ok_or_else(|| AppError::JobError(format!(
                "FileRelevanceAssessment job {} 'relevantFiles' field is not an array: {:?}", 
                job_id, ai_filtered_files
            )))?;
        
        debug!("Found relevantFiles array with {} elements", array.len());
        
        let paths: Vec<String> = array.iter()
            .enumerate()
            .filter_map(|(index, item)| {
                if let Some(path_str) = item.as_str() {
                    Some(path_str.to_string())
                } else {
                    error!("Non-string item at index {} in relevantFiles array: {:?}", index, item);
                    None
                }
            })
            .collect();
        
        debug!("Extracted {} raw AI-filtered paths before validation", paths.len());
        
        // Extract token count (default to 0 if not present)
        let token_count = json_value.get("tokenCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        
        debug!("Extracted token count: {}", token_count);
        
        // Validate the extracted paths
        WorkflowDataValidator::validate_file_paths(&paths)?;
        
        if paths.is_empty() {
            return Err(AppError::JobError(format!("No AI-filtered file paths extracted from FileRelevanceAssessment job {}", job_id)));
        }
        
        DataFlowLogger::log_extraction_success(job_id, "FileRelevanceAssessment", paths.len(), "ai_filtered_files_with_token_count");
        Ok((paths, token_count))
    }

    /// Extract initial paths from PathFinder job
    pub async fn extract_initial_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "PathFinder", "initial_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Require job status to be Completed
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!("Job {} is not completed (status: {})", job_id, job.status)));
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                return Err(AppError::JobError(format!("Job {} has no response", job_id)));
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            return Err(AppError::JobError(format!("Job {} has empty response", job_id)));
        }
        
        debug!("Extracting initial paths from response (length: {} chars)", response.len());
        
        // Parse response as JSON object
        let json_value = serde_json::from_str::<Value>(&response)
            .map_err(|e| AppError::JobError(format!(
                "PathFinder job {} response is not valid JSON: {}", 
                job_id, e
            )))?;
        
        debug!("PathFinder response parsed as JSON");
        
        // Extract foundPaths array from JSON object - ONLY look for foundPaths
        let found_paths_value = json_value.get("foundPaths")
            .ok_or_else(|| AppError::JobError(format!("PathFinder job {} response missing 'foundPaths' field", job_id)))?;
        
        let array = found_paths_value.as_array()
            .ok_or_else(|| AppError::JobError(format!("PathFinder job {} 'foundPaths' field is not an array: {:?}", job_id, found_paths_value)))?;
        
        debug!("Found foundPaths array with {} elements", array.len());
        
        let paths: Vec<String> = array.iter()
            .filter_map(|item| {
                if let Some(path_str) = item.as_str() {
                    Some(path_str.to_string())
                } else {
                    error!("Non-string item in foundPaths array: {:?}", item);
                    None
                }
            })
            .collect();
        
        debug!("Extracted {} raw initial paths before validation", paths.len());
        
        // Validate the extracted paths
        WorkflowDataValidator::validate_file_paths(&paths)?;
        
        if paths.is_empty() {
            return Err(AppError::JobError(format!("No initial paths extracted from PathFinder job {}", job_id)));
        }
        
        DataFlowLogger::log_extraction_success(job_id, "PathFinder", paths.len(), "initial_paths");
        Ok(paths)
    }

    /// Extract regex patterns from RegexFileFilter job
    /// Prioritizes job.metadata.additionalParams.parsedJsonData if available,
    /// then falls back to parsing job.response
    pub async fn extract_regex_patterns(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "RegexFileFilter", "regex_patterns");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Require job status to be Completed
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!("Job {} is not completed (status: {})", job_id, job.status)));
        }
        
        let mut patterns = Vec::new();
        
        // First attempt: extract from job.metadata.additionalParams.parsedJsonData
        if let Some(metadata_str) = &job.metadata {
            debug!("Attempting to extract patterns from job metadata");
            if let Ok(metadata_value) = serde_json::from_str::<Value>(metadata_str) {
                if let Some(additional_params) = metadata_value.get("additionalParams") {
                    if let Some(parsed_json_data) = additional_params.get("parsedJsonData") {
                        debug!("Found parsedJsonData in metadata, attempting pattern groups extraction first");
                        
                        // Try pattern groups first (new structure)
                        match Self::extract_pattern_groups_from_json(parsed_json_data) {
                            Ok(pattern_groups) => {
                                if !pattern_groups.is_empty() {
                                    debug!("Successfully extracted {} pattern groups from metadata", pattern_groups.len());
                                    // Convert pattern groups to flat list for backwards compatibility
                                    for group in &pattern_groups {
                                        if let Some(ref path_pattern) = group.path_pattern {
                                            patterns.push(path_pattern.clone());
                                        }
                                        if let Some(ref content_pattern) = group.content_pattern {
                                            patterns.push(content_pattern.clone());
                                        }
                                        if let Some(ref negative_path_pattern) = group.negative_path_pattern {
                                            patterns.push(negative_path_pattern.clone());
                                        }
                                    }
                                    if !patterns.is_empty() {
                                        debug!("Converted pattern groups to {} individual patterns", patterns.len());
                                    }
                                }
                            }
                            Err(e) => {
                                debug!("Pattern groups extraction failed, falling back to individual patterns: {}", e);
                            }
                        }
                        
                    }
                }
            }
        }
        
        // Second attempt: fallback to parsing job.response if no patterns found
        if patterns.is_empty() {
            debug!("No patterns found in metadata, falling back to job response");
            if let Some(response) = &job.response {
                if !response.trim().is_empty() {
                    debug!("Extracting regex patterns from response (length: {} chars)", response.len());
                    match serde_json::from_str::<Value>(response) {
                        Ok(json_value) => {
                            // Try pattern groups first (new structure)
                            match Self::extract_pattern_groups_from_json(&json_value) {
                                Ok(pattern_groups) => {
                                    if !pattern_groups.is_empty() {
                                        debug!("Successfully extracted {} pattern groups from response", pattern_groups.len());
                                        // Convert pattern groups to flat list for backwards compatibility
                                        for group in &pattern_groups {
                                            if let Some(ref path_pattern) = group.path_pattern {
                                                patterns.push(path_pattern.clone());
                                            }
                                            if let Some(ref content_pattern) = group.content_pattern {
                                                patterns.push(content_pattern.clone());
                                            }
                                            if let Some(ref negative_path_pattern) = group.negative_path_pattern {
                                                patterns.push(negative_path_pattern.clone());
                                            }
                                        }
                                        if !patterns.is_empty() {
                                            debug!("Converted pattern groups to {} individual patterns from response", patterns.len());
                                        }
                                    }
                                }
                                Err(e) => {
                                    debug!("Pattern groups extraction from response failed, falling back to individual patterns: {}", e);
                                }
                            }
                            
                        }
                        Err(e) => {
                            warn!("Failed to parse job response as JSON: {}", e);
                        }
                    }
                } else {
                    warn!("Job {} has empty response", job_id);
                }
            } else {
                warn!("Job {} has no response", job_id);
            }
        }
        
        // If no patterns found, this is an error - the regex generation stage failed
        if patterns.is_empty() {
            error!("No regex patterns found in job {} - regex file filter stage failed", job_id);
            DataFlowLogger::log_extraction_failure(job_id, "RegexFileFilter", "No patterns found - regex file filter failed");
            return Err(AppError::JobError(format!("No regex patterns found in job {} - regex file filter stage failed", job_id)));
        }
        
        debug!("Extracted {} raw regex patterns before validation", patterns.len());
        
        // Validate the extracted patterns
        WorkflowDataValidator::validate_regex_patterns(&patterns)?;
        
        DataFlowLogger::log_extraction_success(job_id, "RegexFileFilter", patterns.len(), "regex_patterns");
        
        Ok(patterns)
    }
    
    /// Extract pattern groups from JSON data
    /// Returns Vec<PatternGroup> for the new pattern groups structure
    pub fn extract_pattern_groups_from_json(json_value: &Value) -> AppResult<Vec<PatternGroup>> {
        let mut pattern_groups = Vec::new();
        
        // Handle case where json_value is null or not an object
        if json_value.is_null() {
            debug!("JSON value is null, returning empty pattern groups list");
            return Ok(vec![]);
        }
        
        if !json_value.is_object() {
            debug!("JSON value is not an object, returning empty pattern groups list");
            return Ok(vec![]);
        }
        
        // Extract pattern groups array
        if let Some(pattern_groups_value) = json_value.get("patternGroups") {
            if let Some(array) = pattern_groups_value.as_array() {
                debug!("Found patternGroups array with {} elements", array.len());
                
                for (index, group_value) in array.iter().enumerate() {
                    if let Some(group_obj) = group_value.as_object() {
                        // Extract title (required)
                        let title = group_obj.get("title")
                            .and_then(|v| v.as_str())
                            .map(|s| s.trim().to_string())
                            .unwrap_or_else(|| format!("Pattern Group {}", index + 1));
                        
                        // Extract optional patterns
                        let path_pattern = group_obj.get("pathPattern")
                            .and_then(|v| v.as_str())
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .map(String::from);
                        
                        let content_pattern = group_obj.get("contentPattern")
                            .and_then(|v| v.as_str())
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .map(String::from);
                        
                        let negative_path_pattern = group_obj.get("negativePathPattern")
                            .and_then(|v| v.as_str())
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .map(String::from);
                        
                        let pattern_group = PatternGroup {
                            title,
                            path_pattern,
                            content_pattern,
                            negative_path_pattern,
                        };
                        
                        debug!("Extracted pattern group: {}", pattern_group.title);
                        pattern_groups.push(pattern_group);
                    } else {
                        warn!("Non-object item at index {} in patternGroups array: {:?}", index, group_value);
                    }
                }
            } else {
                warn!("patternGroups field is not an array: {:?}", pattern_groups_value);
            }
        } else {
            debug!("No patternGroups field found in JSON");
        }
        
        Ok(pattern_groups)
    }


    /// Extract file path regex patterns specifically for LocalFileFiltering
    /// Uses pattern groups extraction and converts to flat list
    pub fn extract_filepath_regex_patterns(raw_regex_json: &Value) -> AppResult<Vec<String>> {
        let pattern_groups = Self::extract_pattern_groups_from_json(raw_regex_json)?;
        let mut patterns = Vec::new();
        for group in &pattern_groups {
            if let Some(ref path_pattern) = group.path_pattern {
                patterns.push(path_pattern.clone());
            }
        }
        Ok(patterns)
    }

    /// Extract single path pattern (for file path filtering) using clean structure
    pub fn extract_path_pattern_from_json(json_value: &Value) -> AppResult<Option<String>> {
        if json_value.is_null() {
            return Ok(None);
        }
        
        // Look ONLY for pathPattern field
        if let Some(pattern_value) = json_value.get("pathPattern") {
            if let Some(pattern_str) = pattern_value.as_str() {
                let trimmed = pattern_str.trim();
                if !trimmed.is_empty() {
                    debug!("Extracted path pattern: {}", trimmed);
                    return Ok(Some(trimmed.to_string()));
                }
            }
        }
        
        Ok(None)
    }

    /// Extract single content pattern (for file content filtering) using clean structure
    pub fn extract_content_pattern_from_json(json_value: &Value) -> AppResult<Option<String>> {
        if json_value.is_null() {
            return Ok(None);
        }
        
        // Look ONLY for contentPattern field
        if let Some(pattern_value) = json_value.get("contentPattern") {
            if let Some(pattern_str) = pattern_value.as_str() {
                let trimmed = pattern_str.trim();
                if !trimmed.is_empty() {
                    debug!("Extracted content pattern: {}", trimmed);
                    return Ok(Some(trimmed.to_string()));
                }
            }
        }
        
        Ok(None)
    }

    /// Extract single negative path pattern (for file path exclusion) using clean structure
    pub fn extract_negative_path_pattern_from_json(json_value: &Value) -> AppResult<Option<String>> {
        if json_value.is_null() {
            return Ok(None);
        }
        
        // Look ONLY for negativePathPattern field
        if let Some(pattern_value) = json_value.get("negativePathPattern") {
            if let Some(pattern_str) = pattern_value.as_str() {
                let trimmed = pattern_str.trim();
                if !trimmed.is_empty() {
                    debug!("Extracted negative path pattern: {}", trimmed);
                    return Ok(Some(trimmed.to_string()));
                }
            }
        }
        
        Ok(None)
    }


    /// Extract final paths from PathCorrection job
    pub async fn extract_final_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "PathCorrection", "final_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Require job status to be Completed
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            return Err(AppError::JobError(format!("Job {} is not completed (status: {})", job_id, job.status)));
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                return Err(AppError::JobError(format!("Job {} has no response", job_id)));
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            return Err(AppError::JobError(format!("Job {} has empty response", job_id)));
        }
        
        debug!("Extracting final paths from response (length: {} chars)", response.len());
        
        // Parse response as JSON object
        let json_value = serde_json::from_str::<Value>(&response)
            .map_err(|e| AppError::JobError(format!(
                "PathCorrection job {} response is not valid JSON: {}", 
                job_id, e
            )))?;
        
        debug!("PathCorrection response parsed as JSON");
        
        // Extract correctedPaths array from JSON object - ONLY look for correctedPaths
        let corrected_paths_value = json_value.get("correctedPaths")
            .ok_or_else(|| AppError::JobError(format!("PathCorrection job {} response missing 'correctedPaths' field", job_id)))?;
        
        let array = corrected_paths_value.as_array()
            .ok_or_else(|| AppError::JobError(format!("PathCorrection job {} 'correctedPaths' field is not an array: {:?}", job_id, corrected_paths_value)))?;
        
        debug!("Found correctedPaths array with {} elements", array.len());
        
        let paths: Vec<String> = array.iter()
            .filter_map(|item| {
                if let Some(path_str) = item.as_str() {
                    Some(path_str.to_string())
                } else {
                    error!("Non-string item in correctedPaths array: {:?}", item);
                    None
                }
            })
            .collect();
        
        debug!("Extracted {} raw final paths before validation", paths.len());
        
        // Validate the extracted paths
        WorkflowDataValidator::validate_file_paths(&paths)?;
        
        if paths.is_empty() {
            return Err(AppError::JobError(format!("No final paths extracted from PathCorrection job {}", job_id)));
        }
        
        DataFlowLogger::log_extraction_success(job_id, "PathCorrection", paths.len(), "final_paths");
        Ok(paths)
    }
    
    // Additional helper methods would continue here...
    
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
}

/// Public async function for robust regex pattern extraction from RegexFileFilter jobs
/// This function prioritizes job.metadata.additionalParams.parsedJsonData if available,
/// then falls back to parsing job.response
pub async fn extract_regex_patterns(
    job_id: &str, 
    repo: &BackgroundJobRepository
) -> AppResult<Vec<String>> {
    StageDataExtractor::extract_regex_patterns(job_id, repo).await
}

/// Public async function for extracting AI-filtered files with token count from FileRelevanceAssessment jobs
pub async fn extract_ai_filtered_files_with_token_count(
    job_id: &str, 
    repo: &BackgroundJobRepository
) -> AppResult<(Vec<String>, u32)> {
    StageDataExtractor::extract_ai_filtered_files_with_token_count(job_id, repo).await
}

/// Public function for extracting pattern groups from JSON data
pub fn extract_pattern_groups_from_json(json_value: &Value) -> AppResult<Vec<PatternGroup>> {
    StageDataExtractor::extract_pattern_groups_from_json(json_value)
}

/// Public function for extracting and validating pattern groups from RegexFileFilter jobs
pub async fn extract_pattern_groups_from_regex_job(
    job_id: &str, 
    repo: &BackgroundJobRepository
) -> AppResult<Vec<PatternGroup>> {
    DataFlowLogger::log_extraction_start(job_id, "RegexFileFilter", "pattern_groups");
    
    let job = repo.get_job_by_id(job_id).await?
        .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
    
    // Require job status to be Completed
    let status = job.status.parse::<JobStatus>()
        .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
    
    if status != JobStatus::Completed {
        return Err(AppError::JobError(format!("Job {} is not completed (status: {})", job_id, job.status)));
    }
    
    let mut pattern_groups = Vec::new();
    
    // First attempt: extract from job.metadata.additionalParams.parsedJsonData
    if let Some(metadata_str) = &job.metadata {
        debug!("Attempting to extract pattern groups from job metadata");
        if let Ok(metadata_value) = serde_json::from_str::<Value>(metadata_str) {
            if let Some(additional_params) = metadata_value.get("additionalParams") {
                if let Some(parsed_json_data) = additional_params.get("parsedJsonData") {
                    debug!("Found parsedJsonData in metadata, extracting pattern groups");
                    match StageDataExtractor::extract_pattern_groups_from_json(parsed_json_data) {
                        Ok(extracted_groups) => {
                            if !extracted_groups.is_empty() {
                                pattern_groups = extracted_groups;
                                debug!("Successfully extracted {} pattern groups from metadata", pattern_groups.len());
                            }
                        }
                        Err(e) => {
                            warn!("Failed to extract pattern groups from metadata parsedJsonData: {}", e);
                        }
                    }
                }
            }
        }
    }
    
    // Second attempt: fallback to parsing job.response if no pattern groups found
    if pattern_groups.is_empty() {
        debug!("No pattern groups found in metadata, falling back to job response");
        if let Some(response) = &job.response {
            if !response.trim().is_empty() {
                debug!("Extracting pattern groups from response (length: {} chars)", response.len());
                match serde_json::from_str::<Value>(response) {
                    Ok(json_value) => {
                        match StageDataExtractor::extract_pattern_groups_from_json(&json_value) {
                            Ok(extracted_groups) => {
                                pattern_groups = extracted_groups;
                                debug!("Successfully extracted {} pattern groups from response", pattern_groups.len());
                            }
                            Err(e) => {
                                warn!("Failed to extract pattern groups from response: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse job response as JSON: {}", e);
                    }
                }
            } else {
                warn!("Job {} has empty response", job_id);
            }
        } else {
            warn!("Job {} has no response", job_id);
        }
    }
    
    // If no pattern groups found, this is an error
    if pattern_groups.is_empty() {
        error!("No pattern groups found in job {}", job_id);
        DataFlowLogger::log_extraction_failure(job_id, "RegexFileFilter", "No pattern groups found");
        return Err(AppError::JobError(format!("No pattern groups found in job {}", job_id)));
    }
    
    debug!("Extracted {} raw pattern groups before validation", pattern_groups.len());
    
    // Validate the extracted pattern groups
    WorkflowDataValidator::validate_pattern_groups(&pattern_groups)?;
    
    DataFlowLogger::log_extraction_success(job_id, "RegexFileFilter", pattern_groups.len(), "pattern_groups");
    
    Ok(pattern_groups)
}