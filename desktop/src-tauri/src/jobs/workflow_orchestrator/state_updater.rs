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
        WorkflowStage::RegexPatternGeneration => {
            // Store the entire stage_data as raw JSON for later pattern extraction
            // This ensures we preserve all data regardless of its structure
            workflow_state.intermediate_data.raw_regex_patterns = Some(stage_data);
            debug!("Stored raw regex patterns data in intermediate_data");
        }
        WorkflowStage::LocalFileFiltering => {
            if let Some(files) = stage_data.get("filteredFiles").and_then(|v| v.as_array()) {
                workflow_state.intermediate_data.locally_filtered_files = files.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                debug!("Stored {} locally filtered files in intermediate_data", 
                       workflow_state.intermediate_data.locally_filtered_files.len());
            } else {
                warn!("LocalFiltering stage_data missing or invalid 'filteredFiles' field, keeping existing data");
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
                warn!("ExtendedPathFinder stage_data missing or invalid 'verifiedPaths' field");
            }
            if let Some(unverified) = stage_data.get("unverifiedPaths").and_then(|v| v.as_array()) {
                workflow_state.intermediate_data.extended_unverified_paths = unverified.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                debug!("Stored {} extended unverified paths in intermediate_data", 
                       workflow_state.intermediate_data.extended_unverified_paths.len());
            } else {
                warn!("ExtendedPathFinder stage_data missing or invalid 'unverifiedPaths' field");
            }
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

/// Mark a workflow as completed and update its state
pub(super) async fn mark_workflow_completed_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    workflow_id: &str
) -> AppResult<WorkflowState> {
    let mut workflows_guard = workflows.lock().await;
    if let Some(workflow_state) = workflows_guard.get_mut(workflow_id) {
        workflow_state.status = WorkflowStatus::Completed;
        workflow_state.completed_at = Some(chrono::Utc::now().timestamp_millis());
        workflow_state.updated_at = workflow_state.completed_at
            .ok_or_else(|| AppError::JobError("Workflow completed_at should be set".to_string()))?;

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

/// Update job status in workflow state
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
            // Update the job status
            stage_job.status = status.clone();
            stage_job.error_message = error_message.clone();
            // Update completed_at when status changes
            if status == JobStatus::Completed || status == JobStatus::Failed {
                stage_job.completed_at = Some(chrono::Utc::now().timestamp_millis());
            }
            
            // Update workflow updated_at timestamp
            workflow_state.updated_at = chrono::Utc::now().timestamp_millis();
            
            debug!("Updated job {} status to {:?} in workflow {}", job_id, status, workflow_id);
            return Ok(Some(workflow_id.clone()));
        }
    }
    
    warn!("Job {} not found in any workflow's stage_jobs list", job_id);
    Err(AppError::JobError(format!("Job {} not found in any workflow", job_id)))
}

/// Store stage data in workflow intermediate data
pub(super) async fn store_stage_data_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    job_id: &str,
    stage_data: serde_json::Value
) -> AppResult<()> {
    let mut workflows_guard = workflows.lock().await;
    
    // Find the workflow containing this job
    for (workflow_id, workflow_state) in workflows_guard.iter_mut() {
        if let Some(stage_job) = workflow_state.stage_jobs.iter().find(|job| job.job_id == job_id) {
            // Update intermediate data based on the stage
            if let Some(workflow_stage) = WorkflowStage::from_task_type(&stage_job.task_type) {
                update_intermediate_data_internal(workflow_state, &workflow_stage, stage_data)?;
            } else {
                warn!("Could not convert task type {:?} to workflow stage for job {}", stage_job.task_type, job_id);
            }
            workflow_state.updated_at = chrono::Utc::now().timestamp_millis();
            
            debug!("Stored stage data for job {} in workflow {}", job_id, workflow_id);
            return Ok(());
        }
    }
    
    Err(AppError::JobError(format!("Job {} not found in any workflow", job_id)))
}