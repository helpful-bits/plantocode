use serde_json::Value;
use log::{info, warn, error, debug};
use regex::Regex;
use crate::error::{AppError, AppResult};
use crate::db_utils::BackgroundJobRepository;
use crate::models::JobStatus;

/// Data validation and recovery utilities
pub struct WorkflowDataValidator;

impl WorkflowDataValidator {

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

    /// Extract filtered paths from LocalFileFiltering job  
    pub async fn extract_filtered_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "LocalFileFiltering", "file_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status - be more lenient for failed/skipped stages
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            warn!("Job {} is not completed (status: {}), attempting to extract partial data", 
                  job_id, job.status);
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                warn!("Job {} has no response, returning empty path list", job_id);
                return Ok(vec![]);
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            warn!("Job {} has empty response, returning empty path list", job_id);
            return Ok(vec![]);
        }
        
        debug!("Extracting filtered paths from response (length: {} chars)", response.len());
        
        // Parse response as JSON and extract filteredFiles array
        let json_value = serde_json::from_str::<Value>(&response)
            .map_err(|e| AppError::JobError(format!(
                "LocalFileFiltering job {} response is not valid JSON: {}", 
                job_id, e
            )))?;
        
        debug!("LocalFileFiltering response parsed as JSON");
        
        // Extract paths from filteredFiles field
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
                    warn!("Non-string item at index {} in filteredFiles array: {:?}", index, item);
                    None
                }
            })
            .collect();
        
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
    /// Returns (verified_paths, unverified_paths)
    pub async fn extract_extended_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<(Vec<String>, Vec<String>)> {
        DataFlowLogger::log_extraction_start(job_id, "ExtendedPathFinder", "extended_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status - be more lenient for failed/skipped stages
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            warn!("Job {} is not completed (status: {}), attempting to extract partial data", 
                  job_id, job.status);
        }
        
        let response_str = match job.response {
            Some(resp) => resp,
            None => {
                warn!("Job {} has no response, returning empty path lists", job_id);
                return Ok((vec![], vec![]));
            }
        };
        
        // Check for empty response
        if response_str.trim().is_empty() {
            warn!("Job {} has empty response, returning empty path lists", job_id);
            return Ok((vec![], vec![]));
        }
        
        debug!("Extracting extended paths from response (length: {} chars)", response_str.len());
        
        // Parse response as JSON object - graceful fallback
        let json_value = match serde_json::from_str::<Value>(&response_str) {
            Ok(value) => value,
            Err(e) => {
                warn!("ExtendedPathFinder job {} response is not valid JSON, returning empty paths: {}", job_id, e);
                return Ok((vec![], vec![]));
            }
        };
        
        debug!("ExtendedPathFinder response parsed as JSON");
        
        // Extract verifiedPaths array from JSON
        let verified_paths: Vec<String> = json_value.get("verifiedPaths").and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|item| item.as_str().map(String::from)).collect())
            .unwrap_or_default();
        
        // Extract unverifiedPaths array from JSON
        let unverified_paths: Vec<String> = json_value.get("unverifiedPaths").and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|item| item.as_str().map(String::from)).collect())
            .unwrap_or_default();
        
        debug!("Extracted {} verified and {} unverified paths before validation", 
               verified_paths.len(), unverified_paths.len());
        
        // Validate and clean the extracted paths
        let cleaned_verified_paths = WorkflowDataValidator::clean_file_paths(verified_paths);
        let cleaned_unverified_paths = WorkflowDataValidator::clean_file_paths(unverified_paths);
        
        WorkflowDataValidator::validate_file_paths(&cleaned_verified_paths)?;
        WorkflowDataValidator::validate_file_paths(&cleaned_unverified_paths)?;
        
        if cleaned_verified_paths.is_empty() && cleaned_unverified_paths.is_empty() {
            warn!("No valid extended paths extracted from ExtendedPathFinder job {}", job_id);
        }
        
        DataFlowLogger::log_extraction_success(job_id, "ExtendedPathFinder", 
                                               cleaned_verified_paths.len() + cleaned_unverified_paths.len(), 
                                               "extended_paths");
        Ok((cleaned_verified_paths, cleaned_unverified_paths))
    }

    /// Extract AI-filtered files from FileRelevanceAssessment job
    pub async fn extract_ai_filtered_files(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "FileRelevanceAssessment", "ai_filtered_files");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status - be more lenient for failed/skipped stages
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            warn!("Job {} is not completed (status: {}), attempting to extract partial data", 
                  job_id, job.status);
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                warn!("Job {} has no response, returning empty path list", job_id);
                return Ok(vec![]);
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            warn!("Job {} has empty response, returning empty path list", job_id);
            return Ok(vec![]);
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
                    warn!("Non-string item at index {} in relevantFiles array: {:?}", index, item);
                    None
                }
            })
            .collect();
        
        debug!("Extracted {} raw AI-filtered paths before validation", paths.len());
        
        // Validate and clean the extracted paths
        let cleaned_paths = WorkflowDataValidator::clean_file_paths(paths);
        WorkflowDataValidator::validate_file_paths(&cleaned_paths)?;
        
        if cleaned_paths.is_empty() {
            warn!("No valid AI-filtered file paths extracted from FileRelevanceAssessment job {}", job_id);
        }
        
        DataFlowLogger::log_extraction_success(job_id, "FileRelevanceAssessment", cleaned_paths.len(), "ai_filtered_files");
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
        
        // Validate job status - be more lenient for failed/skipped stages
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            warn!("Job {} is not completed (status: {}), attempting to extract partial data", 
                  job_id, job.status);
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                warn!("Job {} has no response, returning empty path list", job_id);
                return Ok(vec![]);
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            warn!("Job {} has empty response, returning empty path list", job_id);
            return Ok(vec![]);
        }
        
        debug!("Extracting initial paths from response (length: {} chars)", response.len());
        
        // Parse response as JSON object - graceful fallback
        let json_value = match serde_json::from_str::<Value>(&response) {
            Ok(value) => value,
            Err(e) => {
                warn!("PathFinder job {} response is not valid JSON, returning empty paths: {}", job_id, e);
                DataFlowLogger::log_extraction_success(job_id, "PathFinder", 0, "initial_paths");
                return Ok(vec![]);
            }
        };
        
        debug!("PathFinder response parsed as JSON");
        
        // Extract foundPaths array from JSON object (PathFinder format) - graceful fallback
        let paths: Vec<String> = if let Some(found_paths_value) = json_value.get("foundPaths") {
            if let Some(array) = found_paths_value.as_array() {
                debug!("Found foundPaths array with {} elements", array.len());
                array.iter()
                    .filter_map(|item| {
                        if let Some(path_str) = item.as_str() {
                            Some(path_str.to_string())
                        } else {
                            warn!("Non-string item in foundPaths array: {:?}", item);
                            None
                        }
                    })
                    .collect()
            } else {
                warn!("Job {} foundPaths field is not an array, returning empty paths: {:?}", job_id, found_paths_value);
                vec![]
            }
        } else {
            warn!("Job {} JSON response missing foundPaths field, returning empty paths", job_id);
            vec![]
        };
        
        debug!("Extracted {} raw initial paths before validation", paths.len());
        
        // Validate and clean the extracted paths
        let cleaned_paths = WorkflowDataValidator::clean_file_paths(paths);
        WorkflowDataValidator::validate_file_paths(&cleaned_paths)?;
        
        if cleaned_paths.is_empty() {
            warn!("No valid initial paths extracted from PathFinder job {}", job_id);
        }
        
        DataFlowLogger::log_extraction_success(job_id, "PathFinder", cleaned_paths.len(), "initial_paths");
        Ok(cleaned_paths)
    }

    /// Extract regex patterns from RegexPatternGeneration job
    /// Prioritizes job.metadata.additionalParams.parsedJsonData if available,
    /// then falls back to parsing job.response
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
            warn!("Job {} is not completed (status: {}), attempting to extract partial data", job_id, job.status);
        }
        
        let mut patterns = Vec::new();
        
        // First attempt: extract from job.metadata.additionalParams.parsedJsonData
        if let Some(metadata_str) = &job.metadata {
            debug!("Attempting to extract patterns from job metadata");
            if let Ok(metadata_value) = serde_json::from_str::<Value>(metadata_str) {
                if let Some(additional_params) = metadata_value.get("additionalParams") {
                    if let Some(parsed_json_data) = additional_params.get("parsedJsonData") {
                        debug!("Found parsedJsonData in metadata, extracting patterns");
                        match Self::extract_patterns_from_json(parsed_json_data) {
                            Ok(extracted_patterns) => {
                                if !extracted_patterns.is_empty() {
                                    patterns = extracted_patterns;
                                    debug!("Successfully extracted {} patterns from metadata", patterns.len());
                                }
                            }
                            Err(e) => {
                                warn!("Failed to extract patterns from metadata parsedJsonData: {}", e);
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
                            match Self::extract_patterns_from_json(&json_value) {
                                Ok(extracted_patterns) => {
                                    patterns = extracted_patterns;
                                    debug!("Successfully extracted {} patterns from response", patterns.len());
                                }
                                Err(e) => {
                                    warn!("Failed to extract patterns from response: {}", e);
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
            error!("No regex patterns found in job {} - regex generation stage failed", job_id);
            DataFlowLogger::log_extraction_failure(job_id, "RegexPatternGeneration", "No patterns found - regex generation failed");
            return Err(AppError::JobError(format!("No regex patterns found in job {} - regex generation stage failed", job_id)));
        }
        
        debug!("Extracted {} raw regex patterns before validation", patterns.len());
        
        // Validate and clean the extracted patterns
        let cleaned_patterns = WorkflowDataValidator::clean_regex_patterns(patterns);
        WorkflowDataValidator::validate_regex_patterns(&cleaned_patterns)?;
        
        if cleaned_patterns.is_empty() {
            warn!("No valid regex patterns extracted from RegexPatternGeneration job {}", job_id);
            DataFlowLogger::log_extraction_failure(job_id, "RegexPatternGeneration", "All patterns failed validation");
        } else {
            DataFlowLogger::log_extraction_success(job_id, "RegexPatternGeneration", cleaned_patterns.len(), "regex_patterns");
        }
        
        Ok(cleaned_patterns)
    }
    
    /// Helper method to extract regex patterns from JSON data
    /// Looks for primaryPattern.pattern, alternativePatterns, titleRegex, contentRegex, etc.
    /// Returns empty vector on any parsing error to prevent workflow stall
    pub fn extract_patterns_from_json(json_value: &Value) -> AppResult<Vec<String>> {
        let mut patterns = Vec::new();
        
        // Handle case where json_value is null or not an object
        if json_value.is_null() {
            debug!("JSON value is null, returning empty patterns list");
            return Ok(vec![]);
        }
        
        if !json_value.is_object() && !json_value.is_array() {
            debug!("JSON value is neither object nor array, attempting string conversion");
            if let Some(str_val) = json_value.as_str() {
                if !str_val.trim().is_empty() {
                    patterns.push(str_val.trim().to_string());
                }
            }
            return Ok(patterns);
        }
        
        // Look for primaryPattern.pattern
        if let Some(primary_pattern) = json_value.get("primaryPattern") {
            if let Some(pattern_obj) = primary_pattern.as_object() {
                if let Some(pattern_value) = pattern_obj.get("pattern") {
                    if let Some(pattern_str) = pattern_value.as_str() {
                        let trimmed = pattern_str.trim();
                        if !trimmed.is_empty() {
                            patterns.push(trimmed.to_string());
                            debug!("Extracted primaryPattern.pattern: {}", trimmed);
                        }
                    }
                }
            }
        }
        
        // Look for alternativePatterns array
        if let Some(alternative_patterns) = json_value.get("alternativePatterns") {
            if let Some(array) = alternative_patterns.as_array() {
                for item in array {
                    if let Some(pattern_obj) = item.as_object() {
                        if let Some(pattern_value) = pattern_obj.get("pattern") {
                            if let Some(pattern_str) = pattern_value.as_str() {
                                let trimmed = pattern_str.trim();
                                if !trimmed.is_empty() {
                                    patterns.push(trimmed.to_string());
                                    debug!("Extracted alternativePattern: {}", trimmed);
                                }
                            }
                        }
                    } else if let Some(pattern_str) = item.as_str() {
                        let trimmed = pattern_str.trim();
                        if !trimmed.is_empty() {
                            patterns.push(trimmed.to_string());
                            debug!("Extracted alternativePattern (string): {}", trimmed);
                        }
                    }
                }
            }
        }
        
        // Look for individual regex fields
        let regex_fields = [
            "titleRegex", 
            "contentRegex", 
            "negativeTitleRegex", 
            "negativeContentRegex"
        ];
        
        for field in &regex_fields {
            if let Some(pattern_value) = json_value.get(field) {
                if let Some(pattern_str) = pattern_value.as_str() {
                    let trimmed = pattern_str.trim();
                    if !trimmed.is_empty() {
                        patterns.push(trimmed.to_string());
                        debug!("Extracted {}: {}", field, trimmed);
                    }
                }
            }
        }
        
        // Look for regexPatterns array (newer format)
        if let Some(regex_patterns_value) = json_value.get("regexPatterns") {
            if let Some(array) = regex_patterns_value.as_array() {
                for item in array {
                    if let Some(pattern_str) = item.as_str() {
                        let trimmed = pattern_str.trim();
                        if !trimmed.is_empty() {
                            patterns.push(trimmed.to_string());
                            debug!("Extracted regexPattern: {}", trimmed);
                        }
                    }
                }
            }
        }
        
        // Look for general "patterns" field
        if let Some(patterns_value) = json_value.get("patterns") {
            if let Some(array) = patterns_value.as_array() {
                for item in array {
                    if let Some(pattern_str) = item.as_str() {
                        let trimmed = pattern_str.trim();
                        if !trimmed.is_empty() {
                            patterns.push(trimmed.to_string());
                            debug!("Extracted pattern: {}", trimmed);
                        }
                    }
                }
            } else if let Some(pattern_str) = patterns_value.as_str() {
                let trimmed = pattern_str.trim();
                if !trimmed.is_empty() {
                    patterns.push(trimmed.to_string());
                    debug!("Extracted pattern (string): {}", trimmed);
                }
            }
        }
        
        Ok(patterns)
    }

    /// Extract only title patterns (for file path filtering)
    pub fn extract_title_patterns_from_json(json_value: &Value) -> AppResult<Vec<String>> {
        let mut patterns = Vec::new();
        
        if json_value.is_null() {
            return Ok(vec![]);
        }
        
        // Look for title-specific regex fields only
        let title_fields = ["titleRegex", "negativeTitleRegex"];
        
        for field in &title_fields {
            if let Some(pattern_value) = json_value.get(field) {
                if let Some(pattern_str) = pattern_value.as_str() {
                    let trimmed = pattern_str.trim();
                    if !trimmed.is_empty() {
                        patterns.push(trimmed.to_string());
                        debug!("Extracted title pattern {}: {}", field, trimmed);
                    }
                }
            }
        }
        
        // Fail if no title patterns found
        if patterns.is_empty() {
            return Err(AppError::JobError("No title patterns found in regex generation output".to_string()));
        }
        
        Ok(patterns)
    }

    /// Extract only content patterns (for file content filtering)
    pub fn extract_content_patterns_from_json(json_value: &Value) -> AppResult<Vec<String>> {
        let mut patterns = Vec::new();
        
        if json_value.is_null() {
            return Ok(vec![]);
        }
        
        // Look for content-specific regex fields only
        let content_fields = ["contentRegex", "negativeContentRegex"];
        
        for field in &content_fields {
            if let Some(pattern_value) = json_value.get(field) {
                if let Some(pattern_str) = pattern_value.as_str() {
                    let trimmed = pattern_str.trim();
                    if !trimmed.is_empty() {
                        patterns.push(trimmed.to_string());
                        debug!("Extracted content pattern {}: {}", field, trimmed);
                    }
                }
            }
        }
        
        Ok(patterns)
    }

    /// Extract final paths from PathCorrection or ExtendedPathCorrection job
    pub async fn extract_final_paths(
        job_id: &str, 
        repo: &BackgroundJobRepository
    ) -> AppResult<Vec<String>> {
        DataFlowLogger::log_extraction_start(job_id, "PathCorrection", "final_paths");
        
        let job = repo.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
        
        // Validate job status - be more lenient for failed/skipped stages
        let status = job.status.parse::<JobStatus>()
            .map_err(|e| AppError::JobError(format!("Invalid job status: {}", e)))?;
        
        if status != JobStatus::Completed {
            warn!("Job {} is not completed (status: {}), attempting to extract partial data", 
                  job_id, job.status);
        }
        
        let response = match job.response {
            Some(resp) => resp,
            None => {
                warn!("Job {} has no response, returning empty path list", job_id);
                return Ok(vec![]);
            }
        };
        
        // Check for empty response
        if response.trim().is_empty() {
            warn!("Job {} has empty response, returning empty path list", job_id);
            return Ok(vec![]);
        }
        
        debug!("Extracting final paths from response (length: {} chars)", response.len());
        
        // Parse response as JSON object - graceful fallback
        let json_value = match serde_json::from_str::<Value>(&response) {
            Ok(value) => value,
            Err(e) => {
                warn!("PathCorrection job {} response is not valid JSON, returning empty paths: {}", job_id, e);
                DataFlowLogger::log_extraction_success(job_id, "PathCorrection", 0, "final_paths");
                return Ok(vec![]);
            }
        };
        
        debug!("PathCorrection response parsed as JSON");
        
        // Extract correctedPaths array from JSON object - graceful fallback
        let paths: Vec<String> = if let Some(corrected_paths_value) = json_value.get("correctedPaths") {
            if let Some(array) = corrected_paths_value.as_array() {
                debug!("Found correctedPaths array with {} elements", array.len());
                array.iter()
                    .filter_map(|item| {
                        if let Some(path_str) = item.as_str() {
                            Some(path_str.to_string())
                        } else {
                            warn!("Non-string item in correctedPaths array: {:?}", item);
                            None
                        }
                    })
                    .collect()
            } else {
                warn!("Job {} correctedPaths field is not an array, returning empty paths: {:?}", job_id, corrected_paths_value);
                vec![]
            }
        } else {
            warn!("Job {} JSON response missing correctedPaths field, returning empty paths", job_id);
            vec![]
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

/// Public async function for robust regex pattern extraction from RegexPatternGeneration jobs
/// This function prioritizes job.metadata.additionalParams.parsedJsonData if available,
/// then falls back to parsing job.response
pub async fn extract_regex_patterns(
    job_id: &str, 
    repo: &BackgroundJobRepository
) -> AppResult<Vec<String>> {
    StageDataExtractor::extract_regex_patterns(job_id, repo).await
}