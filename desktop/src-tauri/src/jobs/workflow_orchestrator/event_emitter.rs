use log::warn;
use tauri::{AppHandle, Emitter};

use crate::models::JobStatus;
use crate::jobs::workflow_types::{
    WorkflowState, WorkflowStageJob, WorkflowStatusEvent, WorkflowStageEvent
};

/// Emit workflow status event to frontend
pub(super) async fn emit_workflow_status_event_internal(
    app_handle: &AppHandle,
    workflow_state: &WorkflowState,
    message: &str
) {
    let current_stage = workflow_state.current_stage()
        .map(|stage_job| stage_job.stage_name.clone());

    let event = WorkflowStatusEvent {
        workflow_id: workflow_state.workflow_id.clone(),
        status: workflow_state.status.clone(),
        progress: workflow_state.calculate_progress(),
        current_stage,
        message: message.to_string(),
        error_message: workflow_state.error_message.clone(),
    };

    if let Err(e) = app_handle.emit("file-finder-workflow-status", &event) {
        warn!("Failed to emit workflow status event: {}", e);
    }
}

/// Emit workflow stage event to frontend
pub(super) async fn emit_workflow_stage_event_internal(
    app_handle: &AppHandle,
    workflow_id: &str,
    stage_job: &WorkflowStageJob,
    status: &JobStatus,
    error_message: Option<String>,
) {
    let event = WorkflowStageEvent {
        workflow_id: workflow_id.to_string(),
        stage_name: stage_job.stage_name.clone(),
        task_type: stage_job.task_type,
        job_id: stage_job.job_id.clone(),
        status: status.clone(),
        message: format!("{} - {}", stage_job.stage_name, status.to_string()),
        error_message,
        data: None,
    };

    if let Err(e) = app_handle.emit("file-finder-workflow-stage", &event) {
        warn!("Failed to emit workflow stage event: {}", e);
    }
}