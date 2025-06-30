use std::sync::Arc;
use std::collections::HashMap;
use log::{info, warn, error, debug};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::models::JobStatus;
use crate::jobs::workflow_types::{WorkflowState, WorkflowStatus, WorkflowStage};

/// Update intermediate data in workflow state based on stage completion
pub(super) fn update_intermediate_data_internal(
    workflow_state: &mut WorkflowState,
    stage: &WorkflowStage,
    stage_data: serde_json::Value,
) -> AppResult<()> {
    match stage {
        WorkflowStage::RegexFileFilter => {
            // Expect stage_data as JSON array of strings (file paths)
            if let Some(files_array) = stage_data.as_array() {
                workflow_state.intermediate_data.locally_filtered_files = files_array.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                debug!("Stored {} locally filtered files from RegexFileFilter in intermediate_data", 
                       workflow_state.intermediate_data.locally_filtered_files.len());
            } else {
                warn!("RegexFileFilter stage_data is not a valid JSON array of file paths");
            }
        }
        WorkflowStage::FileRelevanceAssessment => {
            if let Some(files) = stage_data.get("relevantFiles").and_then(|v| v.as_array()) {
                workflow_state.intermediate_data.ai_filtered_files = files.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                debug!("Stored {} AI filtered files in intermediate_data",
                       workflow_state.intermediate_data.ai_filtered_files.len());
            } else {
                warn!("FileRelevanceAssessment stage_data missing or invalid 'relevantFiles' field, keeping existing data");
            }
            
            workflow_state.intermediate_data.ai_filtered_files_token_count = stage_data
                .get("tokenCount")
                .and_then(|v| v.as_u64())
                .and_then(|v| u32::try_from(v).ok());
        }
        WorkflowStage::ExtendedPathFinder => {
            if let Some(verified) = stage_data.get("verifiedPaths").and_then(|v| v.as_array()) {
                workflow_state.intermediate_data.extended_verified_paths = verified.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                debug!("Stored {} extended verified paths in intermediate_data", 
                       workflow_state.intermediate_data.extended_verified_paths.len());
            } else {
                warn!("ExtendedPathFinder stage_data missing 'verifiedPaths' field, keeping existing data");
            }
            
            // Always initialize unverified paths, defaulting to empty if missing
            workflow_state.intermediate_data.extended_unverified_paths = stage_data
                .get("unverifiedPaths")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            
            debug!("Stored {} extended unverified paths in intermediate_data", 
                   workflow_state.intermediate_data.extended_unverified_paths.len());
        }
        WorkflowStage::PathCorrection => {
            if let Some(corrected) = stage_data.get("correctedPaths").and_then(|v| v.as_array()) {
                workflow_state.intermediate_data.extended_corrected_paths = corrected.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                debug!("Stored {} extended corrected paths in intermediate_data", 
                       workflow_state.intermediate_data.extended_corrected_paths.len());
            } else {
                warn!("PathCorrection stage_data missing or invalid 'correctedPaths' field");
            }
        }
    }
    Ok(())
}

/// Mark a workflow as completed and update its state atomically
pub(super) async fn mark_workflow_completed_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    workflow_id: &str
) -> AppResult<WorkflowState> {
    let mut workflows_guard = workflows.lock().await;
    if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
        // Atomic state update - all changes within single lock
        let current_time = chrono::Utc::now().timestamp_millis();
        
        // Validate state before making changes
        if workflow_state.status == WorkflowStatus::Completed {
            return Err(AppError::JobError(format!("Workflow {} is already completed", workflow_id)));
        }
        
        // Apply all changes atomically
        workflow_state.status = WorkflowStatus::Completed;
        workflow_state.completed_at = Some(current_time);
        workflow_state.updated_at = current_time;

        info!("Workflow {} completed successfully", workflow_id);
        Ok(workflow_state.clone())
    } else {
        Err(AppError::JobError(format!("Workflow not found: {}", workflow_id)))
    }
}

/// Mark a workflow as failed and update its state
pub(super) async fn mark_workflow_failed_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    workflow_id: &str,
    error_message: &str
) -> AppResult<WorkflowState> {
    let mut workflows_guard = workflows.lock().await;
    if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
        workflow_state.status = WorkflowStatus::Failed;
        workflow_state.completed_at = Some(chrono::Utc::now().timestamp_millis());
        workflow_state.updated_at = workflow_state.completed_at
            .ok_or_else(|| AppError::JobError("Workflow completed_at should be set".to_string()))?;
        workflow_state.error_message = Some(error_message.to_string());

        error!("Workflow {} failed: {}", workflow_id, error_message);
        Ok(workflow_state.clone())
    } else {
        Err(AppError::JobError(format!("Workflow not found: {}", workflow_id)))
    }
}

/// Update job status in workflow state atomically
pub(super) async fn update_job_status_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    job_id: &str,
    status: JobStatus,
    error_message: Option<String>
) -> AppResult<Option<String>> { // Returns workflow_id if found
    let mut workflows_guard = workflows.lock().await;
    
    // Find the workflow containing this job
    for (workflow_id, workflow_state) in workflows_guard.iter_mut() {
        if let Some(stage_job) = workflow_state.stage_jobs.iter_mut().find(|job| job.job_id == job_id) {
            // Atomic timestamp for consistency
            let current_time = chrono::Utc::now().timestamp_millis();
            
            // Update all job fields atomically
            stage_job.status = status.clone();
            stage_job.error_message = error_message.clone();
            if status == JobStatus::Completed || status == JobStatus::Failed {
                stage_job.completed_at = Some(current_time);
            }
            
            // Update workflow timestamp atomically
            workflow_state.updated_at = current_time;
            
            debug!("Updated job {} status to {:?} in workflow {}", job_id, status, workflow_id);
            return Ok(Some(workflow_id.clone()));
        }
    }
    
    // Return explicit error instead of warning if job not found
    error!("Job {} not found in any workflow's stage_jobs list", job_id);
    Err(AppError::JobError(format!("Job {} not found in any workflow", job_id)))
}

/// Store stage data in workflow intermediate data atomically
pub(super) async fn store_stage_data_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    job_id: &str,
    stage_data: serde_json::Value
) -> AppResult<()> {
    let mut workflows_guard = workflows.lock().await;
    
    // Find the workflow containing this job
    for (workflow_id, workflow_state) in workflows_guard.iter_mut() {
        if let Some(stage_job) = workflow_state.stage_jobs.iter().find(|job| job.job_id == job_id) {
            // Create a backup of current state for rollback capability
            let original_intermediate_data = workflow_state.intermediate_data.clone();
            let original_updated_at = workflow_state.updated_at;
            
            // Update intermediate data based on the stage
            if let Some(workflow_stage) = WorkflowStage::from_task_type(&stage_job.task_type) {
                match update_intermediate_data_internal(workflow_state, &workflow_stage, stage_data) {
                    Ok(_) => {
                        // Atomic timestamp update after successful data update
                        workflow_state.updated_at = chrono::Utc::now().timestamp_millis();
                        debug!("Stored stage data for job {} in workflow {}", job_id, workflow_id);
                        return Ok(());
                    }
                    Err(e) => {
                        // Rollback on failure
                        workflow_state.intermediate_data = original_intermediate_data;
                        workflow_state.updated_at = original_updated_at;
                        return Err(e);
                    }
                }
            } else {
                return Err(AppError::JobError(format!(
                    "Could not convert task type {:?} to workflow stage for job {}", 
                    stage_job.task_type, job_id
                )));
            }
        }
    }
    
    Err(AppError::JobError(format!("Job {} not found in any workflow", job_id)))
}

/// Atomically update both job status and stage data in a single operation
pub(super) async fn atomic_stage_completion_update(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    job_id: &str,
    status: JobStatus,
    stage_data: Option<serde_json::Value>,
    error_message: Option<String>
) -> AppResult<String> { // Returns workflow_id
    let mut workflows_guard = workflows.lock().await;
    
    // Find the workflow containing this job
    for (workflow_id, workflow_state) in workflows_guard.iter_mut() {
        // First, find the job and get its task type without holding a mutable borrow
        let stage_job_info = workflow_state.stage_jobs.iter()
            .find(|job| job.job_id == job_id)
            .map(|job| (job.task_type.clone(), job.status.clone(), job.error_message.clone(), job.completed_at));
        
        if let Some((task_type, original_job_status, original_job_error, original_job_completed_at)) = stage_job_info {
            // Create backups for rollback capability
            let original_intermediate_data = workflow_state.intermediate_data.clone();
            let original_updated_at = workflow_state.updated_at;
            
            // Atomic timestamp for all updates
            let current_time = chrono::Utc::now().timestamp_millis();
            
            // Update job status first
            let stage_job = workflow_state.stage_jobs.iter_mut().find(|job| job.job_id == job_id).unwrap();
            stage_job.status = status.clone();
            stage_job.error_message = error_message.clone();
            if status == JobStatus::Completed || status == JobStatus::Failed {
                stage_job.completed_at = Some(current_time);
            }
            
            // Update stage data if provided
            if let Some(data) = stage_data {
                if let Some(workflow_stage) = WorkflowStage::from_task_type(&task_type) {
                    match update_intermediate_data_internal(workflow_state, &workflow_stage, data) {
                        Ok(_) => {
                            // Success - update workflow timestamp
                            workflow_state.updated_at = current_time;
                            debug!("Atomically updated job {} status to {:?} and stored stage data in workflow {}", 
                                   job_id, status, workflow_id);
                            return Ok(workflow_id.clone());
                        }
                        Err(e) => {
                            // Rollback all changes on stage data failure
                            let stage_job = workflow_state.stage_jobs.iter_mut().find(|job| job.job_id == job_id).unwrap();
                            stage_job.status = original_job_status;
                            stage_job.error_message = original_job_error;
                            stage_job.completed_at = original_job_completed_at;
                            workflow_state.intermediate_data = original_intermediate_data;
                            workflow_state.updated_at = original_updated_at;
                            return Err(e);
                        }
                    }
                } else {
                    // Rollback job status changes on stage conversion failure
                    let stage_job = workflow_state.stage_jobs.iter_mut().find(|job| job.job_id == job_id).unwrap();
                    stage_job.status = original_job_status;
                    stage_job.error_message = original_job_error;
                    stage_job.completed_at = original_job_completed_at;
                    return Err(AppError::JobError(format!(
                        "Could not convert task type {:?} to workflow stage for job {}", 
                        task_type, job_id
                    )));
                }
            } else {
                // No stage data to update, just update workflow timestamp
                workflow_state.updated_at = current_time;
                debug!("Atomically updated job {} status to {:?} in workflow {}", 
                       job_id, status, workflow_id);
                return Ok(workflow_id.clone());
            }
        }
    }
    
    Err(AppError::JobError(format!("Job {} not found in any workflow", job_id)))
}