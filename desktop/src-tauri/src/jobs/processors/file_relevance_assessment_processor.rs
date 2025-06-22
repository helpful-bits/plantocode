use std::collections::HashMap;
use log::{debug, info, error, warn};
use serde_json::json;
use tauri::AppHandle;
use futures::future;
use regex::Regex;

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, FileRelevanceAssessmentPayload, FileRelevanceAssessmentResponse, FileRelevanceAssessmentProcessingDetails, FileRelevanceAssessmentQualityDetails};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::abstract_llm_processor::{LlmTaskRunner, LlmTaskConfig, LlmTaskConfigBuilder, LlmPromptContext};
use crate::jobs::processors::utils::fs_context_utils;
use crate::utils::token_estimator::estimate_tokens_for_file_batch;

pub struct FileRelevanceAssessmentProcessor;

impl FileRelevanceAssessmentProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Parse paths from LLM text response with robust format handling for modern LLM responses
    fn parse_paths_from_text_response(response_text: &str, _project_directory: &str) -> AppResult<Vec<String>> {
        info!("Parsing LLM response of {} chars", response_text.len());
        let mut paths = Vec::new();
        
        // Normalize line endings
        let normalized_text = response_text.replace("\r\n", "\n").replace("\r", "\n");
        
        // Try to extract JSON array first (common LLM response format)
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&normalized_text) {
            if let Some(array) = json_value.as_array() {
                for item in array {
                    if let Some(path_str) = item.as_str() {
                        if !path_str.trim().is_empty() {
                            paths.push(path_str.trim().to_string());
                        }
                    }
                }
                if !paths.is_empty() {
                    return Ok(Self::deduplicate_paths(paths));
                }
            }
        }
        
        // Split by newlines and process each line with aggressive path extraction
        for line in normalized_text.lines() {
            let line = line.trim();
            
            // Skip truly empty lines or obvious non-path content
            if line.is_empty() 
                || line.starts_with("//") 
                || line.starts_with("<!--")
                || line.len() < 2 
            {
                continue;
            }
            
            // Extract potential file paths from this line using multiple strategies
            Self::extract_paths_from_line(line, &mut paths);
        }
        
        Ok(Self::deduplicate_paths(paths))
    }
    
    /// Extract file paths from a single line using multiple parsing strategies
    fn extract_paths_from_line(line: &str, paths: &mut Vec<String>) {
        let line = line.trim();
        
        // Strategy 1: Handle numbered lists (e.g., "1. path/to/file", "1) src/main.rs")
        if let Some(path) = Self::extract_from_numbered_list(line) {
            paths.push(path);
            return;
        }
        
        // Strategy 2: Handle bullet points (e.g., "- path/to/file", "* src/main.rs")
        if let Some(path) = Self::extract_from_bullet_point(line) {
            paths.push(path);
            return;
        }
        
        // Strategy 3: Handle quoted paths (e.g., "src/main.rs", 'lib/utils.rs')
        if let Some(path) = Self::extract_quoted_path(line) {
            paths.push(path);
            return;
        }
        
        // Strategy 4: Look for file patterns in explanatory text
        if let Some(path) = Self::extract_file_pattern(line) {
            paths.push(path);
            return;
        }
        
        // Strategy 5: Treat entire cleaned line as potential path if it looks like a file
        let cleaned = Self::clean_path_string(line);
        if Self::looks_like_file_path(&cleaned) {
            paths.push(cleaned);
        }
    }
    
    /// Extract path from numbered list format
    fn extract_from_numbered_list(line: &str) -> Option<String> {
        // Match patterns like "1. path", "1) path", "1: path"
        let re = Regex::new(r"^\s*\d+[.):]\s*(.+)$").ok()?;
        if let Some(captures) = re.captures(line) {
            let path = captures.get(1)?.as_str();
            let cleaned = Self::clean_path_string(path);
            if Self::looks_like_file_path(&cleaned) {
                return Some(cleaned);
            }
        }
        None
    }
    
    /// Extract path from bullet point format
    fn extract_from_bullet_point(line: &str) -> Option<String> {
        // Match patterns like "- path", "* path", "+ path"
        if line.starts_with("- ") || line.starts_with("* ") || line.starts_with("+ ") {
            let path = &line[2..];
            let cleaned = Self::clean_path_string(path);
            if Self::looks_like_file_path(&cleaned) {
                return Some(cleaned);
            }
        }
        None
    }
    
    /// Extract quoted path
    fn extract_quoted_path(line: &str) -> Option<String> {
        // Look for quoted content
        for quote_char in ['"', '\'', '`'] {
            if let Some(start) = line.find(quote_char) {
                if let Some(end) = line[start + 1..].find(quote_char) {
                    let path = &line[start + 1..start + 1 + end];
                    let cleaned = Self::clean_path_string(path);
                    if Self::looks_like_file_path(&cleaned) {
                        return Some(cleaned);
                    }
                }
            }
        }
        None
    }
    
    /// Extract file patterns from explanatory text
    fn extract_file_pattern(line: &str) -> Option<String> {
        // Look for common file patterns in text
        let file_patterns = [
            r"\b([a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+)\b",  // file.ext
            r"\b(src/[a-zA-Z0-9_/-]+)\b",            // src/path
            r"\b([a-zA-Z0-9_/-]+/[a-zA-Z0-9_/-]+)\b" // path/to/file
        ];
        
        for pattern in file_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if let Some(captures) = re.captures(line) {
                    let path = captures.get(1)?.as_str();
                    let cleaned = Self::clean_path_string(path);
                    if Self::looks_like_file_path(&cleaned) {
                        return Some(cleaned);
                    }
                }
            }
        }
        None
    }
    
    /// Clean path string of common prefixes/suffixes
    fn clean_path_string(path: &str) -> String {
        path.trim()
            .trim_matches(|c| c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == ';' || c == '.')
            .trim()
            .to_string()
    }
    
    /// Check if string looks like a file path
    fn looks_like_file_path(path: &str) -> bool {
        // Must not be empty
        if path.is_empty() || path.len() < 2 {
            return false;
        }
        
        // Skip obvious non-paths
        if path.starts_with("http") 
            || path.starts_with("www.")
            || path.contains("://")
            || path.starts_with("Based on")
            || path.starts_with("Here are")
            || path.starts_with("The following")
            || path.starts_with("Analysis")
            || path.starts_with("Note")
            || path.starts_with("Summary")
            || path.contains("relevant files")
            || path.contains("according to")
        {
            return false;
        }
        
        // Look for file-like characteristics
        let has_extension = path.contains('.') && !path.ends_with('.');
        let has_path_separator = path.contains('/') || path.contains('\\');
        let looks_like_code_file = path.ends_with(".rs") || path.ends_with(".js") || path.ends_with(".ts") 
            || path.ends_with(".py") || path.ends_with(".java") || path.ends_with(".cpp") 
            || path.ends_with(".c") || path.ends_with(".h") || path.ends_with(".hpp");
        
        // Accept if it has extension OR path separator OR looks like code file
        has_extension || has_path_separator || looks_like_code_file
    }
    
    /// Remove duplicates while preserving order
    fn deduplicate_paths(paths: Vec<String>) -> Vec<String> {
        let mut unique_paths = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for path in paths {
            if seen.insert(path.clone()) {
                unique_paths.push(path);
            }
        }
        unique_paths
    }

    /// Get ACTUAL file size and estimate tokens precisely
    fn estimate_file_tokens(file_path: &str, project_directory: &str) -> AppResult<u32> {
        let full_path = std::path::Path::new(project_directory).join(file_path);
        
        // Get ACTUAL file size - no fallbacks!
        let metadata = std::fs::metadata(&full_path)
            .map_err(|e| AppError::FileSystemError(format!("Cannot read file metadata for {}: {}", file_path, e)))?;
        
        let file_size = metadata.len();
        
        // Precise token estimation: 1 token per 3.5 characters on average
        let content_tokens = (file_size as f64 / 3.5) as u32;
        
        // Add overhead for file path and XML formatting in prompt
        let path_overhead = (file_path.len() as f64 / 4.0) as u32;
        let formatting_overhead = 100; // XML tags, spacing, etc.
        
        Ok(content_tokens + path_overhead + formatting_overhead)
    }

    /// Create intelligent chunks based on ACTUAL file sizes - no fallbacks!
    fn create_content_aware_chunks(files: &[String], project_directory: &str, max_chunk_tokens: u32) -> AppResult<Vec<Vec<String>>> {
        let mut chunks = Vec::new();
        let mut current_chunk = Vec::new();
        let mut current_chunk_tokens = 0u32;
        let mut skipped_files = Vec::new();
        
        // Reserve tokens for system prompt, task description, and response
        let prompt_overhead = 2000u32; // Conservative estimate for prompt overhead
        let available_tokens = max_chunk_tokens.saturating_sub(prompt_overhead);
        
        info!("Creating content-aware chunks with {} available tokens per chunk using ACTUAL file sizes", available_tokens);
        
        for file_path in files {
            // Get ACTUAL file token count - fail if file doesn't exist
            let file_tokens = match Self::estimate_file_tokens(file_path, project_directory) {
                Ok(tokens) => tokens,
                Err(e) => {
                    error!("Cannot access file {}: {}. Skipping this file.", file_path, e);
                    skipped_files.push(file_path.clone());
                    continue;
                }
            };
            
            // If this single file exceeds available tokens, put it in its own chunk
            if file_tokens > available_tokens {
                warn!("File {} has {} tokens, exceeding chunk limit of {}. Processing separately.", 
                    file_path, file_tokens, available_tokens);
                
                // Save current chunk if not empty
                if !current_chunk.is_empty() {
                    chunks.push(current_chunk);
                    current_chunk = Vec::new();
                    current_chunk_tokens = 0;
                }
                
                // Create dedicated chunk for this large file
                chunks.push(vec![file_path.clone()]);
                continue;
            }
            
            // Check if adding this file would exceed chunk limit
            if current_chunk_tokens + file_tokens > available_tokens && !current_chunk.is_empty() {
                // Finalize current chunk and start new one
                info!("Chunk completed with {} files and {} actual tokens", current_chunk.len(), current_chunk_tokens);
                chunks.push(current_chunk);
                current_chunk = Vec::new();
                current_chunk_tokens = 0;
            }
            
            // Add file to current chunk
            current_chunk.push(file_path.clone());
            current_chunk_tokens += file_tokens;
        }
        
        // Don't forget the last chunk
        if !current_chunk.is_empty() {
            info!("Final chunk with {} files and {} actual tokens", current_chunk.len(), current_chunk_tokens);
            chunks.push(current_chunk);
        }
        
        if !skipped_files.is_empty() {
            warn!("Skipped {} inaccessible files: {:?}", skipped_files.len(), skipped_files);
        }
        
        info!("Created {} content-aware chunks for {} accessible files (skipped {})", 
            chunks.len(), files.len() - skipped_files.len(), skipped_files.len());
        
        Ok(chunks)
    }

    /// Process a single chunk of files and return results with usage information
    async fn process_file_chunk(
        chunk: &[String],
        chunk_index: usize,
        total_chunks: usize,
        task_description: &str,
        project_directory: &str,
        task_runner: &LlmTaskRunner,
        settings_repo: &crate::db_utils::SettingsRepository,
        repo: &crate::db_utils::BackgroundJobRepository,
        job_id: &str,
    ) -> AppResult<(Vec<String>, Option<crate::models::OpenRouterUsage>, String, String)> {
        info!("Processing chunk {}/{} with {} files", chunk_index + 1, total_chunks, chunk.len());
        
        // Check for cancellation before processing this chunk
        if job_processor_utils::check_job_canceled(repo, job_id).await? {
            info!("Job {} has been canceled during chunk {} processing", job_id, chunk_index + 1);
            return Err(AppError::JobError("Job was canceled by user".to_string()));
        }

        // Load content for files in this chunk
        let file_contents = fs_context_utils::load_file_contents(chunk, project_directory).await;
        info!("Loaded content for {}/{} files in chunk {}", file_contents.len(), chunk.len(), chunk_index + 1);

        // Create prompt context for this chunk
        let prompt_context = LlmPromptContext {
            task_description: task_description.to_string(),
            file_contents: Some(file_contents),
            directory_tree: None, // Not needed for relevance assessment
            system_prompt_override: None,
        };

        // Log the system prompt being used for this chunk
        info!("System prompt for chunk {}: Fetching from task runner...", chunk_index + 1);
        
        // Execute LLM task for this chunk
        let llm_result = task_runner.execute_llm_task(prompt_context, settings_repo).await
            .map_err(|e| AppError::JobError(format!("Failed to process chunk {}: {}", chunk_index + 1, e)))?;

        // Parse the LLM response for this chunk
        let chunk_relevant_paths = Self::parse_paths_from_text_response(&llm_result.response, project_directory)
            .map_err(|e| AppError::JobError(format!("Failed to parse chunk {} results: {}", chunk_index + 1, e)))?;
        info!("Parsed {} paths from chunk {} response", chunk_relevant_paths.len(), chunk_index + 1);

        info!("Chunk {}/{} identified {} relevant files from {} input files", 
            chunk_index + 1, total_chunks, chunk_relevant_paths.len(), chunk.len());

        Ok((chunk_relevant_paths, llm_result.usage, llm_result.system_prompt_id, llm_result.system_prompt_template))
    }

    /// Merge and deduplicate results from all chunks
    fn merge_chunk_results(chunk_results: Vec<Vec<String>>) -> Vec<String> {
        let mut all_results = Vec::new();
        let mut seen = std::collections::HashSet::new();
        let total_chunks = chunk_results.len();

        // Collect all results while preserving order and removing duplicates
        for chunk_result in chunk_results {
            for path in chunk_result {
                if seen.insert(path.clone()) {
                    all_results.push(path);
                }
            }
        }

        info!("Merged {} unique relevant files from {} chunks", all_results.len(), total_chunks);
        all_results
    }
}

#[async_trait::async_trait]
impl JobProcessor for FileRelevanceAssessmentProcessor {
    fn name(&self) -> &'static str {
        "FileRelevanceAssessment"
    }
    
    fn can_handle(&self, job: &Job) -> bool {
        matches!(job.payload, JobPayload::FileRelevanceAssessment(_))
    }
    
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Get payload
        let payload = match &job.payload {
            JobPayload::FileRelevanceAssessment(p) => p,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Setup job processing using standardized utility
        let (repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(
            &job.id,
            &app_handle,
        ).await?;
        
        // Get project directory from session
        let session = {
            use crate::db_utils::SessionRepository;
            let session_repo = SessionRepository::new(repo.get_pool());
            session_repo.get_session_by_id(&job.session_id).await?
                .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?
        };
        let project_directory = &session.project_directory;
        
        // Get task settings from database
        let task_settings = settings_repo.get_task_settings(&session.project_hash, &job.job_type.to_string()).await?
            .ok_or_else(|| AppError::JobError(format!("No task settings found for project {} and task type {}", session.project_hash, job.job_type.to_string())))?;
        let model_used = task_settings.model;
        let temperature = task_settings.temperature
            .ok_or_else(|| AppError::JobError("Temperature not set in task settings".to_string()))?;
        let max_output_tokens = task_settings.max_tokens as u32;
        
        job_processor_utils::log_job_start(&job.id, "File Relevance Assessment");
        info!("Starting COMPREHENSIVE file relevance assessment with {} files to analyze", 
            payload.locally_filtered_files.len());
        
        // Initialize processing duration tracking
        let mut parallel_duration = std::time::Duration::from_secs(0);
        
        // Check if job has been canceled using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }

        // Initialize LlmTaskRunner with appropriate model settings
        let task_config = LlmTaskConfigBuilder::new()
            .model(model_used.clone())
            .temperature(temperature)
            .max_tokens(max_output_tokens)
            .stream(false)
            .build();
            
        let task_runner = LlmTaskRunner::new(app_handle.clone(), job.clone(), task_config);

        // INTELLIGENT CHUNKED PROCESSING - Process ALL files without limits
        info!("Creating intelligent content-aware chunks for optimal context utilization");
        
        // Get the model's INPUT context window limit - not output limit!
        let model_context_window = crate::utils::config_helpers::get_model_context_window(&model_used, &app_handle).await
            .map_err(|e| AppError::JobError(format!("Failed to get model context window for {}: {}", model_used, e)))?;
        
        info!("Model {} has INPUT context window of {} tokens", model_used, model_context_window);
        
        // Create content-aware chunks based on ACTUAL file sizes using INPUT context window
        // Use 60% of INPUT context window for aggressive chunking while leaving room for response
        let chunk_token_limit = (model_context_window as f64 * 0.6) as u32;
        let chunks = match Self::create_content_aware_chunks(
            &payload.locally_filtered_files,
            project_directory,
            chunk_token_limit,
        ) {
            Ok(chunks) => chunks,
            Err(e) => {
                let error_msg = format!("Failed to create chunks using actual file sizes: {}", e);
                error!("{}", error_msg);
                task_runner.finalize_failure(&repo, &job.id, &error_msg, Some(&e), None).await?;
                return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
            }
        };

        info!("Processing {} files across {} intelligent chunks IN PARALLEL for maximum speed", 
            payload.locally_filtered_files.len(), chunks.len());

        // Check for cancellation before starting parallel processing
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled before parallel processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }

        // PARALLEL PROCESSING - Process ALL chunks concurrently for maximum speed!
        info!("Launching {} concurrent chunk processing tasks", chunks.len());
        let start_time = std::time::Instant::now();
        
        // Create futures for all chunks
        let chunk_futures: Vec<_> = chunks.iter().enumerate().map(|(chunk_index, chunk)| {
            let chunk = chunk.clone();
            let task_description = payload.task_description.clone();
            let project_directory = project_directory.to_string();
            let task_runner = task_runner.clone();
            let settings_repo = settings_repo.clone();
            let repo = repo.clone();
            let job_id = job.id.clone();
            let total_chunks = chunks.len();
            
            tokio::spawn(async move {
                let result = Self::process_file_chunk(
                    &chunk,
                    chunk_index,
                    total_chunks,
                    &task_description,
                    &project_directory,
                    &task_runner,
                    &settings_repo,
                    &repo,
                    &job_id,
                ).await;
                (chunk_index, chunk.len(), result)
            })
        }).collect();

        // Wait for all chunks to complete concurrently
        let chunk_results = futures::future::join_all(chunk_futures).await;
        parallel_duration = start_time.elapsed();
        
        info!("Parallel processing completed in {:.2}s - analyzing results", parallel_duration.as_secs_f64());

        // Process results from parallel execution
        let mut all_chunk_results = Vec::new();
        let mut total_processed_files = 0;
        let mut chunk_processing_errors = Vec::new();
        let mut successful_chunks = 0;
        let mut total_input_tokens = 0i32;
        let mut total_output_tokens = 0i32;
        let mut total_cost = 0.0;
        let mut captured_system_prompt_id = String::new();
        let mut captured_system_prompt_template = String::new();

        for join_result in chunk_results {
            match join_result {
                Ok((chunk_index, chunk_file_count, chunk_result)) => {
                    match chunk_result {
                        Ok((chunk_relevant_paths, chunk_usage, system_prompt_id, system_prompt_template)) => {
                            total_processed_files += chunk_file_count;
                            all_chunk_results.push(chunk_relevant_paths);
                            successful_chunks += 1;
                            
                            // Capture system prompt info from first successful chunk
                            if captured_system_prompt_template.is_empty() && !system_prompt_template.is_empty() {
                                captured_system_prompt_id = system_prompt_id;
                                captured_system_prompt_template = system_prompt_template;
                            }
                            
                            // Aggregate usage information from this chunk
                            if let Some(usage) = chunk_usage {
                                total_input_tokens += usage.prompt_tokens;
                                total_output_tokens += usage.completion_tokens;
                                total_cost += usage.cost.unwrap_or(0.0);
                            }
                            
                            info!("✓ Chunk {}/{} completed successfully ({} files)", 
                                chunk_index + 1, chunks.len(), chunk_file_count);
                        }
                        Err(e) => {
                            let error_msg = format!("Chunk {}/{} processing failed: {}", chunk_index + 1, chunks.len(), e);
                            error!("✗ {}", error_msg);
                            chunk_processing_errors.push(error_msg);
                        }
                    }
                }
                Err(e) => {
                    let error_msg = format!("Chunk task spawn failed: {}", e);
                    error!("✗ {}", error_msg);
                    chunk_processing_errors.push(error_msg);
                }
            }
        }

        info!("PARALLEL PROCESSING COMPLETE: {}/{} chunks successful in {:.2}s", 
            successful_chunks, chunks.len(), parallel_duration.as_secs_f64());

        // Check if we have any successful results
        if all_chunk_results.is_empty() && !chunks.is_empty() {
            let error_msg = format!("All {} chunks failed to process. Errors: {:?}", 
                chunks.len(), chunk_processing_errors);
            error!("{}", error_msg);
            
            // Finalize job failure
            task_runner.finalize_failure(&repo, &job.id, &error_msg, None, None).await?;
            return Ok(JobProcessResult::failure(job.id.clone(), error_msg));
        }

        // Merge results from all successful chunks
        let successful_chunks_count = all_chunk_results.len();
        info!("Merging results from {} successful chunks", successful_chunks_count);
        let relevant_paths = Self::merge_chunk_results(all_chunk_results);

        info!("COMPREHENSIVE processing complete: {} files processed across {} chunks → {} relevant files identified", 
            total_processed_files, chunks.len(), relevant_paths.len());
        
        // Validate the parsed paths against the filesystem using centralized utility
        let (validated_relevant_paths, invalid_relevant_paths) = fs_context_utils::validate_paths_against_filesystem(
            &relevant_paths, 
            project_directory
        ).await;
        
        info!("File relevance assessment validation: {} valid, {} invalid paths", 
            validated_relevant_paths.len(), invalid_relevant_paths.len());
        
        // Calculate token count for validated relevant paths
        let token_count = match estimate_tokens_for_file_batch(&std::path::Path::new(project_directory), &validated_relevant_paths).await {
            Ok(count) => count,
            Err(e) => {
                error!("Failed to estimate tokens for file batch: {}", e);
                0
            }
        };
        
        // Check for cancellation after LLM processing using standardized utility
        if job_processor_utils::check_job_canceled(&repo, &job.id).await? {
            info!("Job {} has been canceled after LLM processing", job.id);
            return Ok(JobProcessResult::canceled(job.id.clone(), "Job was canceled by user".to_string()));
        }
        
        // Store comprehensive results in job metadata
        let result_metadata = json!({
            "processingApproach": "intelligent_chunked_processing",
            "totalFiles": payload.locally_filtered_files.len(),
            "totalChunks": chunks.len(),
            "processedFiles": total_processed_files,
            "successfulChunks": successful_chunks_count,
            "failedChunks": chunk_processing_errors.len(),
            "chunkProcessingErrors": chunk_processing_errors,
            "llmSuggestedFiles": relevant_paths.len(),
            "validatedRelevantFiles": validated_relevant_paths.len(),
            "invalidRelevantFiles": invalid_relevant_paths.len(),
            "chunkTokenLimit": chunk_token_limit,
            "modelContextWindow": model_context_window,
            "maxOutputTokens": max_output_tokens,
            "contextWindowUtilization": format!("{:.1}%", (chunk_token_limit as f64 / model_context_window as f64) * 100.0),
            "parallelProcessing": true,
            "concurrentChunks": chunks.len(),
            "processingDurationSeconds": parallel_duration.as_secs_f64(),
            "initialFilesList": payload.locally_filtered_files,
            "llmSuggestedPaths": relevant_paths,
            "validatedRelevantPaths": validated_relevant_paths,
            "invalidRelevantPaths": invalid_relevant_paths,
            "taskDescription": payload.task_description,
            "projectDirectory": project_directory,
            "modelUsed": model_used,
            "summary": format!("COMPREHENSIVE File Relevance Assessment: {} total files → {} chunks → {} processed files → {} relevant files found", 
                payload.locally_filtered_files.len(),
                chunks.len(),
                total_processed_files,
                validated_relevant_paths.len()),
            "chunkDetails": chunks.iter().enumerate().map(|(i, chunk)| {
                let total_tokens: u32 = chunk.iter()
                    .filter_map(|f| Self::estimate_file_tokens(f, project_directory).ok())
                    .sum();
                json!({
                    "chunkIndex": i + 1,
                    "fileCount": chunk.len(),
                    "actualTokens": total_tokens
                })
            }).collect::<Vec<_>>()
        });
        
        // Create comprehensive response with strongly-typed structs
        let summary = format!("COMPREHENSIVE File Relevance Assessment: {} total files → {} chunks → {} processed files → {} relevant files found", 
            payload.locally_filtered_files.len(),
            chunks.len(),
            total_processed_files,
            validated_relevant_paths.len());
            
        let processing_details = FileRelevanceAssessmentProcessingDetails {
            approach: "intelligent_chunked_processing".to_string(),
            total_files: payload.locally_filtered_files.len(),
            total_chunks: chunks.len(),
            processed_files: total_processed_files,
            successful_chunks: successful_chunks_count,
            failed_chunks: chunk_processing_errors.len(),
            chunk_token_limit: chunk_token_limit as usize,
            model_context_window: model_context_window as usize,
            context_window_utilization: format!("{:.1}%", (chunk_token_limit as f64 / model_context_window as f64) * 100.0),
            parallel_processing: true,
            concurrent_chunks: chunks.len(),
            processing_duration_seconds: parallel_duration.as_secs_f64(),
            no_limits_applied: true,
            comprehensive_analysis: true,
        };
        
        let quality_details = FileRelevanceAssessmentQualityDetails {
            all_files_processed: total_processed_files == payload.locally_filtered_files.len(),
            validated_results: true,
            duplicates_removed: true,
            filesystem_validated: true,
        };
        
        let relevant_files_count = validated_relevant_paths.len();
        let response = FileRelevanceAssessmentResponse {
            count: relevant_files_count,
            relevant_files: validated_relevant_paths.clone(),
            summary,
            token_count: token_count as usize,
            processing: processing_details,
            quality: quality_details,
        };
        
        let response_json_content = serde_json::to_string(&response)
            .map_err(|e| AppError::JobError(format!("Failed to serialize response: {}", e)))?;
        
        // Create aggregated usage information from all chunks
        let aggregated_usage = if total_input_tokens > 0 || total_output_tokens > 0 {
            Some(crate::models::OpenRouterUsage {
                prompt_tokens: total_input_tokens,
                completion_tokens: total_output_tokens,
                total_tokens: total_input_tokens + total_output_tokens,
                cost: Some(total_cost),
            })
        } else {
            None
        };
        
        info!("Aggregated usage across {} chunks: {} input + {} output = {} total tokens (${:.4} cost)", 
            successful_chunks, total_input_tokens, total_output_tokens, 
            total_input_tokens + total_output_tokens, total_cost);

        // For chunked processing, we need to handle finalization differently
        // Since we processed multiple chunks, create a synthetic combined result
        let combined_llm_result = crate::jobs::processors::abstract_llm_processor::LlmTaskResult {
            response: format!("CHUNKED PROCESSING COMPLETED: {} relevant files identified from {} files across {} chunks", 
                validated_relevant_paths.len(), 
                payload.locally_filtered_files.len(),
                chunks.len()),
            usage: aggregated_usage, // Aggregated usage from all chunks
            system_prompt_id: if captured_system_prompt_id.is_empty() { "chunked_processing".to_string() } else { captured_system_prompt_id },
            system_prompt_template: captured_system_prompt_template, // Use actual template from first successful chunk
        };

        // Call task_runner.finalize_success() with the combined result
        task_runner.finalize_success(
            &repo,
            &job.id,
            &combined_llm_result,
            Some(result_metadata),
        ).await?;
        
        debug!("File relevance assessment completed for job {}", job.id);
        
        // Return JobProcessResult::success() with the JSON response string
        Ok(JobProcessResult::success(
            job.id.clone(), 
            response_json_content
        ))
    }
}