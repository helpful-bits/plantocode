use std::sync::Arc;
use log::{debug, warn, info};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::{JobStatus, TaskType};
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::jobs::workflow_types::{WorkflowState, WorkflowStage};
use crate::jobs::stage_data_extractors::StageDataExtractor;

/// Extract and store stage data from a completed job
pub(super) async fn extract_and_store_stage_data_internal(
    app_handle: &AppHandle,
    job_id: &str,
    workflow_state: &WorkflowState,
    store_data_fn: impl Fn(&str, serde_json::Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = AppResult<()>> + Send + 'static>>
) -> AppResult<()> {
    debug!("Extracting and storing stage data for job: {}", job_id);
    
    // Get the database repository
    let repo = app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
    
    // Get the job to verify status and extract raw response
    let job = repo.get_job_by_id(job_id).await?
        .ok_or_else(|| AppError::JobError(format!("Job {} not found", job_id)))?;
    
    // Verify job is completed before attempting extraction
    let job_status = job.status.parse::<JobStatus>()
        .map_err(|e| AppError::JobError(format!("Invalid job status for {}: {}", job_id, e)))?;
    
    if job_status != JobStatus::Completed {
        return Err(AppError::JobError(format!(
            "Cannot extract data from job {} - job status is {:?}, expected Completed", 
            job_id, job_status
        )));
    }
    
    // Find the stage this job belongs to
    if let Some(stage_job) = workflow_state.stage_jobs.iter().find(|sj| sj.job_id == job_id) {
        debug!("Extracting data for stage: {:?}", stage_job.stage_name);
        
        // Extract stage-specific data using StageDataExtractor
        let stage_data = match stage_job.task_type {
            TaskType::RegexPatternGeneration => {
                // For regex generation, we need to store the raw JSON response for later pattern extraction
                let raw_response = job.response.as_ref()
                    .ok_or_else(|| AppError::JobError(format!("No response found for regex generation job {}", job_id)))?;
                
                // Parse the response as JSON to validate it's properly formatted
                let parsed_json = serde_json::from_str::<serde_json::Value>(raw_response)
                    .map_err(|e| AppError::JobError(format!("Invalid JSON response from regex generation job {}: {}", job_id, e)))?;
                
                debug!("Successfully extracted raw regex patterns JSON from job {}", job_id);
                parsed_json
            }
            TaskType::LocalFileFiltering => {
                let filtered_paths = StageDataExtractor::extract_filtered_paths(job_id, &repo).await
                    .map_err(|e| AppError::JobError(format!("Failed to extract filtered paths from job {}: {}", job_id, e)))?;
                
                debug!("Extracted {} filtered paths from job {}", filtered_paths.len(), job_id);
                serde_json::json!({ "filteredFiles": filtered_paths })
            }
            TaskType::PathFinder => {
                let initial_paths = StageDataExtractor::extract_initial_paths(job_id, &repo).await
                    .map_err(|e| AppError::JobError(format!("Failed to extract initial paths from job {}: {}", job_id, e)))?;
                
                debug!("Extracted {} initial paths from job {}", initial_paths.len(), job_id);
                
                // For PathFinder, we need to separate verified and unverified paths
                let job_response = job.response.as_ref()
                    .ok_or_else(|| AppError::JobError(format!("No response found for PathFinder job {}", job_id)))?;
                let (verified_paths, unverified_paths) = parse_path_finder_response_internal(job_response, initial_paths)
                    .map_err(|e| AppError::JobError(format!("Failed to parse PathFinder response for job {}: {}", job_id, e)))?;
                
                serde_json::json!({ 
                    "verifiedPaths": verified_paths,
                    "unverifiedPaths": unverified_paths 
                })
            }
            TaskType::PathCorrection => {
                let corrected_paths = StageDataExtractor::extract_final_paths(job_id, &repo).await
                    .map_err(|e| AppError::JobError(format!("Failed to extract corrected paths from job {}: {}", job_id, e)))?;
                
                debug!("Extracted {} corrected paths from job {}", corrected_paths.len(), job_id);
                serde_json::json!({ "correctedPaths": corrected_paths })
            }
            TaskType::ExtendedPathFinder => {
                let (verified_paths, unverified_paths) = StageDataExtractor::extract_extended_paths(job_id, &repo).await
                    .map_err(|e| AppError::JobError(format!("Failed to extract extended paths from job {}: {}", job_id, e)))?;

                debug!("Extracted {} verified and {} unverified extended paths from job {}", verified_paths.len(), unverified_paths.len(), job_id);

                serde_json::json!({
                    "verifiedPaths": verified_paths,
                    "unverifiedPaths": unverified_paths
                })
            }
            TaskType::ExtendedPathCorrection => {
                let final_paths = StageDataExtractor::extract_final_paths(job_id, &repo).await
                    .map_err(|e| AppError::JobError(format!("Failed to extract final paths from job {}: {}", job_id, e)))?;
                
                debug!("Extracted {} final corrected paths from job {}", final_paths.len(), job_id);
                serde_json::json!({ "correctedPaths": final_paths })
            }
            TaskType::FileRelevanceAssessment => {
                let ai_filtered_files = StageDataExtractor::extract_ai_filtered_files(job_id, &repo).await
                    .map_err(|e| AppError::JobError(format!("Failed to extract AI filtered files from job {}: {}", job_id, e)))?;
                debug!("Extracted {} AI filtered files from job {}", ai_filtered_files.len(), job_id);
                serde_json::json!({ "relevantFiles": ai_filtered_files })
            }
            _ => {
                warn!("No stage data extraction implemented for task type {:?} in job {}", stage_job.task_type, job_id);
                serde_json::json!({})
            }
        };
        
        // Store the extracted data using the provided function
        store_data_fn(job_id, stage_data).await
            .map_err(|e| AppError::JobError(format!("Failed to store stage data for job {}: {}", job_id, e)))?;
        
        info!("Successfully extracted and stored data for stage {:?} from job {}", stage_job.stage_name, job_id);
    } else {
        warn!("Job {} not found in workflow {} stage jobs", job_id, workflow_state.workflow_id);
    }
    
    Ok(())
}

/// Parse PathFinder response to separate verified and unverified paths
fn parse_path_finder_response_internal(
    job_response: &str, 
    fallback_paths: Vec<String>
) -> AppResult<(Vec<String>, Vec<String>)> {
    // Try to parse the response as JSON first
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(job_response) {
        if let Some(verified) = parsed.get("verifiedPaths").and_then(|v| v.as_array()) {
            let verified_paths: Vec<String> = verified.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
            
            if let Some(unverified) = parsed.get("unverifiedPaths").and_then(|v| v.as_array()) {
                let unverified_paths: Vec<String> = unverified.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                
                return Ok((verified_paths, unverified_paths));
            }
        }
    }
    
    // If parsing fails, treat all paths as verified for backward compatibility
    Ok((fallback_paths, vec![]))
}