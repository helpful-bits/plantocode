use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::jobs::workflow_types::{WorkflowResult, WorkflowState, WorkflowStatus};
use crate::models::JobStatus;

/// Get workflow status and progress by workflow ID
pub(super) async fn get_workflow_status_internal(
    workflows: &Mutex<HashMap<String, WorkflowState>>,
    workflow_id: &str,
) -> AppResult<WorkflowState> {
    let workflows_guard = workflows.lock().await;
    workflows_guard
        .get(workflow_id)
        .cloned()
        .ok_or_else(|| AppError::JobError(format!("Workflow not found: {}", workflow_id)))
}

/// Get workflow results (final selected files and intermediate data)
pub(super) async fn get_workflow_results_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    workflow_id: &str,
) -> AppResult<WorkflowResult> {
    let workflow_state = get_workflow_status_internal(workflows, workflow_id).await?;
    Ok(WorkflowResult::from_workflow_state(&workflow_state))
}

/// Get all active workflows (running or created)
pub(super) async fn get_active_workflows_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
) -> Vec<WorkflowState> {
    let workflows_guard = workflows.lock().await;
    workflows_guard
        .values()
        .filter(|w| matches!(w.status, WorkflowStatus::Running | WorkflowStatus::Created))
        .cloned()
        .collect()
}

/// Get all workflow states (active and recent)
pub(super) async fn get_all_workflow_states_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
) -> AppResult<Vec<WorkflowState>> {
    let workflows_guard = workflows.lock().await;
    Ok(workflows_guard.values().cloned().collect())
}

/// Get workflow state by ID (returns None if not found)
pub(super) async fn get_workflow_state_by_id_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    workflow_id: &str,
) -> AppResult<Option<WorkflowState>> {
    let workflows_guard = workflows.lock().await;
    Ok(workflows_guard.get(workflow_id).cloned())
}

/// Find workflow ID by job ID
pub(super) async fn find_workflow_id_by_job_id_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    job_id: &str,
) -> AppResult<String> {
    let workflows_guard = workflows.lock().await;
    for (workflow_id, workflow_state) in workflows_guard.iter() {
        if workflow_state.get_stage_job(job_id).is_some() {
            return Ok(workflow_id.clone());
        }
    }
    Err(AppError::JobError(format!(
        "No workflow found for job ID: {}",
        job_id
    )))
}

/// Get a specific stage job by job ID
pub(super) async fn get_stage_job_by_id_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    job_id: &str,
) -> AppResult<Option<crate::jobs::workflow_types::WorkflowStageJob>> {
    let workflows_guard = workflows.lock().await;
    for workflow_state in workflows_guard.values() {
        if let Some(stage_job) = workflow_state.get_stage_job(job_id) {
            return Ok(Some(stage_job.clone()));
        }
    }
    Ok(None)
}

// count_running_jobs_in_workflow_internal moved to stage_scheduler.rs

/// Find a dependency job by task type in the workflow state (only completed jobs)
pub(super) fn get_dependency_job_for_data_extraction(
    workflow_state: &WorkflowState,
    dependency_task_type: crate::models::TaskType,
) -> AppResult<&crate::jobs::workflow_types::WorkflowStageJob> {
    use crate::jobs::workflow_types::WorkflowStage;
    use crate::models::TaskType;

    workflow_state
        .stages
        .iter()
        .find(|job| job.task_type == dependency_task_type && job.status == JobStatus::Completed)
        .ok_or_else(|| {
            AppError::JobError(format!(
                "No completed dependency job found for task type: {:?}",
                dependency_task_type
            ))
        })
}

/// Find the most recent job attempt for a given task type, regardless of status
/// This is useful for workflows that can continue with partial data from failed-but-skipped stages
pub(super) fn get_latest_job_for_stage(
    workflow_state: &WorkflowState,
    dependency_task_type: crate::models::TaskType,
) -> Option<&crate::jobs::workflow_types::WorkflowStageJob> {
    use crate::jobs::workflow_types::WorkflowStage;
    use crate::models::TaskType;

    workflow_state
        .stages
        .iter()
        .filter(|job| {
            job.task_type == dependency_task_type
                && (job.status == JobStatus::Completed
                    || job.status == JobStatus::Failed
                    || job.status == JobStatus::Canceled)
        })
        .max_by_key(|job| job.created_at)
}

/// Check if a workflow is complete (all stages finished)
pub(super) async fn is_workflow_complete_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    workflow_id: &str,
) -> bool {
    let workflows_guard = workflows.lock().await;
    if let Some(workflow_state) = workflows_guard.get(workflow_id) {
        workflow_state.is_completed()
    } else {
        false
    }
}

/// Check if a workflow has any failed stages
pub(super) async fn workflow_has_failed_internal(
    workflows: &Arc<Mutex<HashMap<String, WorkflowState>>>,
    workflow_id: &str,
) -> bool {
    let workflows_guard = workflows.lock().await;
    if let Some(workflow_state) = workflows_guard.get(workflow_id) {
        workflow_state.has_failed()
    } else {
        false
    }
}

/// Get the latest root directories from completed RootFolderSelection jobs
pub fn get_latest_root_directories(jobs: &Vec<crate::jobs::types::Job>) -> Option<Vec<String>> {
    for j in jobs.iter().rev() {
        if j.task_type.to_string() == "RootFolderSelection" {
            if let Some(res) = &j.result_json {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(res) {
                    if let Some(arr) = v.get("rootDirectories").and_then(|a| a.as_array()) {
                        let out = arr
                            .iter()
                            .filter_map(|x| x.as_str().map(|s| s.to_string()))
                            .collect::<Vec<_>>();
                        return Some(out);
                    }
                }
            }
        }
    }
    None
}
