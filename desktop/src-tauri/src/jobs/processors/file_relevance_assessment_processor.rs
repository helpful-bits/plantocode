use std::collections::HashMap;
use log::{debug, info, error, warn};
use serde_json::json;
use tauri::AppHandle;
use futures::future;
use chrono;
use tokio::fs;


use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult, FileRelevanceAssessmentPayload, FileRelevanceAssessmentResponse, FileRelevanceAssessmentProcessingDetails, FileRelevanceAssessmentQualityDetails};
use crate::jobs::job_processor_utils;
use crate::jobs::processors::abstract_llm_processor::{LlmTaskRunner, LlmTaskConfig, LlmTaskConfigBuilder, LlmPromptContext};
use crate::utils::token_estimator::estimate_tokens_for_file_batch;

pub struct FileRelevanceAssessmentProcessor;

impl FileRelevanceAssessmentProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Parse paths from LLM text response using newline separation (as instructed in system prompt)
    fn parse_paths_from_text_response(response_text: &str, _project_directory: &str) -> AppResult<Vec<String>> {
        info!("Parsing LLM response of {} chars", response_text.len());
        
        // Parse newline-separated paths as instructed in system prompt
        let paths: Vec<String> = response_text
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .map(|line| line.to_string())
            .collect();
        
        info!("Successfully parsed {} paths from newline-separated response", paths.len());
        Ok(Self::deduplicate_paths(paths))
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


    /// Create intelligent chunks based on ACTUAL file sizes - no fallbacks!
    async fn create_content_aware_chunks(files: &[String], project_directory: &str, max_chunk_tokens: u32) -> AppResult<Vec<Vec<String>>> {
        let mut chunks = Vec::new();
        let mut current_chunk = Vec::new();
        let mut current_chunk_tokens = 0u32;
        let mut skipped_files = Vec::new();
        
        // Reserve tokens for system prompt, task description, and response
        let prompt_overhead = 2000u32; // Conservative estimate for prompt overhead
        let available_tokens = max_chunk_tokens.saturating_sub(prompt_overhead);
        
        info!("Creating content-aware chunks with {} available tokens per chunk using ACTUAL file sizes", available_tokens);
        
        for file_path in files {
            // Get content-based token estimation using standard utilities
            let full_path = std::path::Path::new(project_directory).join(file_path);
            let file_tokens = match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    let extension = std::path::Path::new(file_path)
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("");
                    match extension {
                        "json" | "xml" | "yml" | "yaml" | "toml" => {
                            crate::utils::token_estimator::estimate_structured_data_tokens(&content)
                        }
                        "rs" | "ts" | "js" | "tsx" | "jsx" | "py" | "java" | "cpp" | "c" | "h" | "cs" | "go" | "php" | "rb" | "swift" | "kt" => {
                            crate::utils::token_estimator::estimate_code_tokens(&content)
                        }
                        _ => {
                            crate::utils::token_estimator::estimate_tokens(&content)
                        }
                    }
                }
                Err(e) => {
                    error!("Cannot read file {}: {}. Skipping.", file_path, e);
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
        let mut file_contents = std::collections::HashMap::new();
        for relative_path_str in chunk {
            let full_path = std::path::Path::new(project_directory).join(relative_path_str);
            match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    file_contents.insert(relative_path_str.clone(), content);
                }
                Err(e) => {
                    warn!("Failed to read file {}: {}", full_path.display(), e);
                }
            }
        }
        info!("Loaded content for {}/{} files in chunk {}", file_contents.len(), chunk.len(), chunk_index + 1);
        
        // Log chunk details to file for debugging
        Self::log_chunk_to_file(chunk_index + 1, total_chunks, chunk, &file_contents, task_description).await;

        // Create prompt context for this chunk
        let prompt_context = LlmPromptContext {
            task_description: task_description.to_string(),
            file_contents: Some(file_contents),
            directory_tree: None, // Not needed for relevance assessment
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

    /// Log chunk details to temporary file for debugging
    async fn log_chunk_to_file(
        chunk_index: usize,
        total_chunks: usize,
        files: &[String],
        file_contents: &std::collections::HashMap<String, String>,
        task_description: &str,
    ) {
        let base_dir = std::path::Path::new("/Users/kirylkazlovich/dev/vibe-manager/tmp");
        let chunk_dir = base_dir.join("file_chunks").join("FileRelevanceAssessment");
        
        if let Err(_) = tokio::fs::create_dir_all(&chunk_dir).await {
            return;
        }
        
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S%.3f");
        let filename = format!("chunk_{}_of_{}_{}.txt", chunk_index, total_chunks, timestamp);
        let filepath = chunk_dir.join(filename);
        
        let mut chunk_info = format!(
            "=== CHUNK {} OF {} ===\n=== TASK DESCRIPTION ===\n{}\n\n=== FILES IN CHUNK ({}) ===\n",
            chunk_index, total_chunks, task_description, files.len()
        );
        
        for file_path in files {
            chunk_info.push_str(&format!("- {}\n", file_path));
        }
        
        chunk_info.push_str("\n=== FILE CONTENTS ===\n");
        for (file_path, content) in file_contents {
            chunk_info.push_str(&format!("\n--- FILE: {} ({} chars) ---\n{}\n", file_path, content.len(), content));
        }
        
        chunk_info.push_str("\n=== END CHUNK ===\n");
        
        let _ = tokio::fs::write(&filepath, chunk_info).await;
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
        let (repo, session_repo, settings_repo, db_job) = job_processor_utils::setup_job_processing(
            &job.id,
            &app_handle,
        ).await?;
        
        // Get project directory from session
        let session = session_repo.get_session_by_id(&job.session_id).await?
            .ok_or_else(|| AppError::JobError(format!("Session {} not found", job.session_id)))?;
        let project_directory = &session.project_directory;
        
        // Get model settings using project-aware configuration
        let model_settings = job_processor_utils::get_llm_task_config(&db_job, &app_handle, &session).await?;
        let (model_used, temperature, max_output_tokens) = model_settings;
        
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
        ).await {
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
                            
                            // Aggregate server-provided usage information from this chunk
                            if let Some(usage) = chunk_usage {
                                total_input_tokens += usage.prompt_tokens;
                                total_output_tokens += usage.completion_tokens;
                                // Sum server-calculated costs from multiple chunks
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
        
        // Validate the parsed paths against the filesystem
        let mut validated_relevant_paths = Vec::new();
        let mut invalid_relevant_paths = Vec::new();
        
        for relative_path in &relevant_paths {
            let absolute_path = std::path::Path::new(project_directory).join(relative_path);
            match tokio::fs::metadata(&absolute_path).await {
                Ok(metadata) if metadata.is_file() => {
                    validated_relevant_paths.push(relative_path.clone());
                },
                _ => {
                    debug!("Path doesn't exist or isn't a regular file: {}", absolute_path.display());
                    invalid_relevant_paths.push(relative_path.clone());
                }
            }
        }
        
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
        
        // Create chunk details outside the JSON macro
        let mut chunk_details = Vec::new();
        for (i, chunk) in chunks.iter().enumerate() {
            let mut total_tokens = 0u32;
            for f in chunk {
                let full_path = std::path::Path::new(project_directory).join(f);
                if let Ok(content) = fs::read_to_string(&full_path).await {
                    let extension = std::path::Path::new(f)
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("");
                    let tokens = match extension {
                        "json" | "xml" | "yml" | "yaml" | "toml" => {
                            crate::utils::token_estimator::estimate_structured_data_tokens(&content)
                        }
                        "rs" | "ts" | "js" | "tsx" | "jsx" | "py" | "java" | "cpp" | "c" | "h" | "cs" | "go" | "php" | "rb" | "swift" | "kt" => {
                            crate::utils::token_estimator::estimate_code_tokens(&content)
                        }
                        _ => {
                            crate::utils::token_estimator::estimate_tokens(&content)
                        }
                    };
                    total_tokens += tokens;
                }
            }
            chunk_details.push(json!({
                "chunkIndex": i + 1,
                "fileCount": chunk.len(),
                "actualTokens": total_tokens
            }));
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
            "chunkDetails": chunk_details
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
                cached_input_tokens: Some(0),
                cache_write_tokens: Some(0),
                cache_read_tokens: Some(0),
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