use log::{debug, info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::jobs::types::JobUIMetadata;
use crate::jobs::workflow_types::{WorkflowStage, WorkflowState};
use crate::models::{JobStatus, TaskType};
use crate::utils::xml_utils::{extract_query_from_task, extract_research_tasks};

/// Extract and store stage data from a completed job using structured JobResultData
pub(super) async fn extract_and_store_stage_data_internal(
    app_handle: &AppHandle,
    job_id: &str,
    workflow_state: &WorkflowState,
    job_result_data: Option<crate::jobs::types::JobResultData>,
    store_data_fn: impl Fn(
        &str,
        serde_json::Value,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = AppResult<()>> + Send + 'static>,
    >,
) -> AppResult<()> {
    debug!("Extracting and storing stage data for job: {}", job_id);

    // Find the stage this job belongs to
    if let Some(stage_job) = workflow_state.stages.iter().find(|sj| sj.job_id == job_id) {
        debug!("Extracting data for stage: {:?}", stage_job.name);

        // Extract stage-specific data from structured JSON
        let stage_data = match stage_job.task_type {
            TaskType::RegexFileFilter => {
                // Extract files from standardized response
                let response_json = match job_result_data {
                    Some(crate::jobs::types::JobResultData::Json(json_data)) => json_data,
                    Some(crate::jobs::types::JobResultData::Text(text_data)) => {
                        serde_json::from_str(&text_data).map_err(|e| {
                            warn!(
                                "Failed to parse text response as JSON for {:?} job {}: {}",
                                stage_job.task_type, job_id, e
                            );
                            AppError::JobError(format!(
                                "Invalid response format for {:?} job {}",
                                stage_job.task_type, job_id
                            ))
                        })?
                    }
                    None => {
                        return Err(AppError::JobError(format!(
                            "No response data found for {:?} job {}",
                            stage_job.task_type, job_id
                        )));
                    }
                };

                // Check if this is an empty result (no files found)
                let filtered_files = if let Some(is_empty) = response_json.get("isEmptyResult").and_then(|v| v.as_bool()) {
                    if is_empty {
                        info!(
                            "Regex file filter job {} returned empty result - no files matched",
                            job_id
                        );
                        
                        // Return empty array for stage data (will be stored below)
                        // The message is already in the job's response for UI display
                        vec![]
                    } else {
                        // Try standardized format first, fall back to legacy format
                        response_json
                            .get("files")
                            .and_then(|v| v.as_array())
                            .or_else(|| {
                                response_json
                                    .get("filteredFiles")
                                    .and_then(|v| v.as_array())
                            })
                            .ok_or_else(|| {
                                AppError::JobError(format!(
                                    "Missing or invalid 'files' field in regex file filter job {}",
                                    job_id
                                ))
                            })?
                            .clone()
                    }
                } else {
                    // No isEmptyResult flag - use standard extraction
                    response_json
                        .get("files")
                        .and_then(|v| v.as_array())
                        .or_else(|| {
                            response_json
                                .get("filteredFiles")
                                .and_then(|v| v.as_array())
                        })
                        .ok_or_else(|| {
                            AppError::JobError(format!(
                                "Missing or invalid 'files' field in regex file filter job {}",
                                job_id
                            ))
                        })?
                        .clone()
                };

                debug!(
                    "Extracted {} filtered files from job {}",
                    filtered_files.len(),
                    job_id
                );
                serde_json::Value::Array(filtered_files)
            }
            TaskType::PathCorrection => {
                // Extract files from standardized response
                let response_json = match job_result_data {
                    Some(crate::jobs::types::JobResultData::Json(json_data)) => json_data,
                    Some(crate::jobs::types::JobResultData::Text(text_data)) => {
                        serde_json::from_str(&text_data).map_err(|e| {
                            warn!(
                                "Failed to parse text response as JSON for {:?} job {}: {}",
                                stage_job.task_type, job_id, e
                            );
                            AppError::JobError(format!(
                                "Invalid response format for {:?} job {}",
                                stage_job.task_type, job_id
                            ))
                        })?
                    }
                    None => {
                        return Err(AppError::JobError(format!(
                            "No response data found for {:?} job {}",
                            stage_job.task_type, job_id
                        )));
                    }
                };

                // Try standardized format first, fall back to legacy format
                let corrected_paths = response_json
                    .get("files")
                    .and_then(|v| v.as_array())
                    .or_else(|| {
                        response_json
                            .get("correctedPaths")
                            .and_then(|v| v.as_array())
                    })
                    .ok_or_else(|| {
                        AppError::JobError(format!(
                            "Missing or invalid 'files' field in path correction job {}",
                            job_id
                        ))
                    })?;

                debug!(
                    "Extracted {} corrected paths from job {}",
                    corrected_paths.len(),
                    job_id
                );
                serde_json::json!({ "correctedPaths": corrected_paths })
            }
            TaskType::ExtendedPathFinder => {
                // Extract files from standardized response with metadata
                let response_json = match job_result_data {
                    Some(crate::jobs::types::JobResultData::Json(json_data)) => json_data,
                    Some(crate::jobs::types::JobResultData::Text(text_data)) => {
                        serde_json::from_str(&text_data).map_err(|e| {
                            warn!(
                                "Failed to parse text response as JSON for {:?} job {}: {}",
                                stage_job.task_type, job_id, e
                            );
                            AppError::JobError(format!(
                                "Invalid response format for {:?} job {}",
                                stage_job.task_type, job_id
                            ))
                        })?
                    }
                    None => {
                        return Err(AppError::JobError(format!(
                            "No response data found for {:?} job {}",
                            stage_job.task_type, job_id
                        )));
                    }
                };

                // Try standardized format first, fall back to legacy format
                if let Some(files) = response_json.get("files").and_then(|v| v.as_array()) {
                    // Standardized format: extract metadata for verified/unverified counts
                    let verified_count = response_json
                        .get("metadata")
                        .and_then(|m| m.get("verifiedCount"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let unverified_count = response_json
                        .get("metadata")
                        .and_then(|m| m.get("unverifiedCount"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);

                    debug!(
                        "Extracted {} total files ({} verified, {} unverified) from standardized format for job {}",
                        files.len(),
                        verified_count,
                        unverified_count,
                        job_id
                    );

                    // Return legacy format for compatibility
                    let (verified_files, unverified_files) =
                        if verified_count > 0 || unverified_count > 0 {
                            let verified_end = verified_count as usize;
                            (
                                files[0..verified_end.min(files.len())].to_vec(),
                                files[verified_end..].to_vec(),
                            )
                        } else {
                            (files.clone(), vec![])
                        };

                    serde_json::json!({
                        "verifiedPaths": verified_files,
                        "unverifiedPaths": unverified_files
                    })
                } else {
                    // Legacy format
                    let verified_paths = response_json.get("verifiedPaths")
                        .and_then(|v| v.as_array())
                        .ok_or_else(|| AppError::JobError(format!("Missing or invalid 'verifiedPaths' field in extended path finder job {}", job_id)))?;

                    let unverified_paths = response_json.get("unverifiedPaths")
                        .and_then(|v| v.as_array())
                        .ok_or_else(|| AppError::JobError(format!("Missing or invalid 'unverifiedPaths' field in extended path finder job {}", job_id)))?;

                    debug!(
                        "Extracted {} verified and {} unverified paths from legacy format for job {}",
                        verified_paths.len(),
                        unverified_paths.len(),
                        job_id
                    );

                    serde_json::json!({
                        "verifiedPaths": verified_paths,
                        "unverifiedPaths": unverified_paths
                    })
                }
            }
            TaskType::FileRelevanceAssessment => {
                // Extract files from standardized response
                let response_json = match job_result_data {
                    Some(crate::jobs::types::JobResultData::Json(json_data)) => json_data,
                    Some(crate::jobs::types::JobResultData::Text(text_data)) => {
                        serde_json::from_str(&text_data).map_err(|e| {
                            warn!(
                                "Failed to parse text response as JSON for {:?} job {}: {}",
                                stage_job.task_type, job_id, e
                            );
                            AppError::JobError(format!(
                                "Invalid response format for {:?} job {}",
                                stage_job.task_type, job_id
                            ))
                        })?
                    }
                    None => {
                        return Err(AppError::JobError(format!(
                            "No response data found for {:?} job {}",
                            stage_job.task_type, job_id
                        )));
                    }
                };

                // Try standardized format first, fall back to legacy format
                let relevant_files = response_json
                    .get("files")
                    .and_then(|v| v.as_array())
                    .or_else(|| {
                        response_json
                            .get("relevantFiles")
                            .and_then(|v| v.as_array())
                    })
                    .ok_or_else(|| {
                        AppError::JobError(format!(
                            "Missing or invalid 'files' field in file relevance assessment job {}",
                            job_id
                        ))
                    })?;

                // Extract token count from metadata or legacy field
                let token_count = response_json
                    .get("metadata")
                    .and_then(|m| m.get("tokenCount"))
                    .and_then(|v| v.as_u64())
                    .or_else(|| response_json.get("tokenCount").and_then(|v| v.as_u64()))
                    .unwrap_or(0);

                debug!(
                    "Extracted {} relevant files with {} tokens from job {}",
                    relevant_files.len(),
                    token_count,
                    job_id
                );
                serde_json::json!({ "relevantFiles": relevant_files, "tokenCount": token_count })
            }
            TaskType::WebSearchPromptsGeneration => {
                // Handle both Text and Json variants of JobResultData
                match job_result_data {
                    Some(crate::jobs::types::JobResultData::Text(xml_response)) => {
                        // Extract prompts from XML text using the utility function
                        let research_tasks = extract_research_tasks(&xml_response);

                        if research_tasks.is_empty() {
                            return Err(AppError::JobError(format!(
                                "No research tasks extracted from XML response for job {}",
                                job_id
                            )));
                        }

                        debug!(
                            "Extracted {} prompts from XML text response for job {}",
                            research_tasks.len(),
                            job_id
                        );

                        serde_json::json!({
                            "prompts": research_tasks,
                            "promptsCount": research_tasks.len(),
                            "parsingInfo": serde_json::json!({"xmlParsingAttempted": true, "researchTasksFound": research_tasks.len()})
                        })
                    }
                    Some(crate::jobs::types::JobResultData::Json(json_data)) => {
                        // Fallback: try to extract prompts from JSON if available
                        let prompts = json_data
                            .get("prompts")
                            .and_then(|v| v.as_array())
                            .ok_or_else(|| {
                                AppError::JobError(format!(
                                    "Missing or invalid 'prompts' field in job {} response",
                                    job_id
                                ))
                            })?;

                        debug!(
                            "Extracted {} prompts from JSON response for job {}",
                            prompts.len(),
                            job_id
                        );

                        serde_json::json!({
                            "prompts": prompts,
                            "promptsCount": prompts.len(),
                            "parsingInfo": serde_json::json!({"xmlParsingAttempted": false, "researchTasksFound": prompts.len()})
                        })
                    }
                    None => {
                        return Err(AppError::JobError(format!(
                            "No response data found for web search prompts generation job {}",
                            job_id
                        )));
                    }
                }
            }
            TaskType::WebSearchExecution => {
                // Extract searchResults from structured response
                let response_json = match job_result_data {
                    Some(crate::jobs::types::JobResultData::Json(json_data)) => json_data,
                    Some(crate::jobs::types::JobResultData::Text(text_data)) => {
                        serde_json::from_str(&text_data).map_err(|e| {
                            warn!(
                                "Failed to parse text response as JSON for {:?} job {}: {}",
                                stage_job.task_type, job_id, e
                            );
                            AppError::JobError(format!(
                                "Invalid response format for {:?} job {}",
                                stage_job.task_type, job_id
                            ))
                        })?
                    }
                    None => {
                        return Err(AppError::JobError(format!(
                            "No response data found for {:?} job {}",
                            stage_job.task_type, job_id
                        )));
                    }
                };

                let search_results = response_json
                    .get("searchResults")
                    .and_then(|v| v.as_array())
                    .unwrap_or(&vec![])
                    .clone();

                debug!(
                    "Extracted {} search results from job {}",
                    search_results.len(),
                    job_id
                );

                serde_json::json!({
                    "searchResults": search_results,
                    "searchResultsCount": search_results.len()
                })
            }
            TaskType::RootFolderSelection => {
                // Extract root directories from structured response
                let response_json = match job_result_data {
                    Some(crate::jobs::types::JobResultData::Json(json_data)) => json_data,
                    Some(crate::jobs::types::JobResultData::Text(text_data)) => {
                        serde_json::from_str(&text_data).map_err(|e| {
                            warn!(
                                "Failed to parse text response as JSON for {:?} job {}: {}",
                                stage_job.task_type, job_id, e
                            );
                            AppError::JobError(format!(
                                "Invalid response format for {:?} job {}",
                                stage_job.task_type, job_id
                            ))
                        })?
                    }
                    None => {
                        return Err(AppError::JobError(format!(
                            "No response data found for {:?} job {}",
                            stage_job.task_type, job_id
                        )));
                    }
                };

                let root_directories = response_json
                    .get("root_directories")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| {
                        AppError::JobError(format!(
                            "Missing or invalid 'root_directories' field in root folder selection job {}",
                            job_id
                        ))
                    })?;

                debug!(
                    "Extracted {} root directories from job {}",
                    root_directories.len(),
                    job_id
                );
                
                serde_json::json!({
                    "root_directories": root_directories,
                    "directoryCount": root_directories.len()
                })
            }
            _ => {
                warn!(
                    "No stage data extraction implemented for task type {:?} in job {}",
                    stage_job.task_type, job_id
                );
                serde_json::json!({})
            }
        };

        // Store the extracted data using the provided function
        store_data_fn(job_id, stage_data).await.map_err(|e| {
            AppError::JobError(format!(
                "Failed to store stage data for job {}: {}",
                job_id, e
            ))
        })?;

        info!(
            "Successfully extracted and stored data for stage {:?} from job {}",
            stage_job.name, job_id
        );
    } else {
        warn!(
            "Job {} not found in workflow {} stage jobs",
            job_id, workflow_state.workflow_id
        );
    }

    Ok(())
}
