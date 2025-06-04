use std::collections::HashMap;
use log::{info, warn};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::{JobStatus, TaskType};
use crate::utils::job_creation_utils;
use crate::jobs::workflow_types::{
    WorkflowState, WorkflowStage,
    WorkflowDefinition, WorkflowStageDefinition
};
use crate::jobs::types::JobPayload;


/// Find abstract stages ready to execute based on workflow definition
pub(super) async fn find_next_abstract_stages_to_execute_internal<'a>(
    workflow_state: &WorkflowState,
    workflow_definition: &'a WorkflowDefinition
) -> Vec<&'a WorkflowStageDefinition> {
    let mut eligible_stages = Vec::new();
    
    for stage_def in &workflow_definition.stages {
        // Check if this stage already has a job by matching stage name or task type
        let stage_exists = workflow_state.stage_jobs.iter().any(|job| {
            // Match by task type directly
            job.task_type == stage_def.task_type
        });

        if stage_exists {
            continue;
        }

        // Check if dependencies are met
        if abstract_stage_dependencies_met_internal(stage_def, workflow_state, workflow_definition) {
            eligible_stages.push(stage_def);
        }
    }

    eligible_stages
}

/// Check if dependencies for an abstract stage definition are met
pub(super) fn abstract_stage_dependencies_met_internal(
    stage_def: &WorkflowStageDefinition, 
    workflow_state: &WorkflowState,
    workflow_definition: &WorkflowDefinition
) -> bool {
    if stage_def.dependencies.is_empty() {
        return true; // No dependencies, can execute
    }

    // Check that all dependency stages are completed
    for dep_stage_name in &stage_def.dependencies {
        if let Some(dep_stage_def) = workflow_definition.get_stage(dep_stage_name) {
            // Find if this dependency stage has been completed
            let dep_completed = workflow_state.stage_jobs.iter().any(|job| {
                // Match by task type and check if completed
                job.task_type == dep_stage_def.task_type && job.status == JobStatus::Completed
            });

            if !dep_completed {
                return false; // Dependency not completed
            }
        } else {
            return false; // Dependency stage not found
        }
    }

    true // All dependencies are met
}

/// Check if dependencies for an abstract stage are met (internal helper)
pub(super) fn abstract_stage_dependencies_met_enhanced_internal(
    stage_def: &WorkflowStageDefinition, 
    workflow_state: &WorkflowState,
    workflow_definition: &WorkflowDefinition
) -> bool {
    if stage_def.dependencies.is_empty() {
        return true; // No dependencies, can execute
    }

    // Check that all dependency stages are completed
    for dep_stage_name in &stage_def.dependencies {
        if let Some(dep_stage_def) = workflow_definition.get_stage(dep_stage_name) {
            // Find if this dependency stage has been completed
            let dep_completed = workflow_state.stage_jobs.iter().any(|job| {
                // Match by task type and check if completed
                job.task_type == dep_stage_def.task_type && job.status == JobStatus::Completed
            });

            if !dep_completed {
                return false; // Dependency not completed
            }
        } else {
            return false; // Dependency stage not found
        }
    }

    true // All dependencies are met
}

/// Get maximum concurrent stages allowed per workflow
pub(super) async fn get_max_concurrent_stages_internal() -> usize {
    // This could be configurable, but for now we'll use a reasonable default
    // The JobQueue's semaphore will ultimately control system-wide concurrency
    3 // Allow up to 3 stages to run concurrently per workflow
}

/// Count the number of currently running jobs in a specific workflow
pub(super) async fn count_running_jobs_in_workflow_internal(
    workflows: &tokio::sync::Mutex<std::collections::HashMap<String, WorkflowState>>,
    workflow_id: &str
) -> usize {
    use crate::models::JobStatus;
    let workflows_guard = workflows.lock().await;
    if let Some(workflow_state) = workflows_guard.get(workflow_id) {
        workflow_state.stage_jobs.iter()
            .filter(|job| job.status == JobStatus::Running)
            .count()
    } else {
        0
    }
}


/// Convert workflow stage to task type
pub(super) fn stage_to_task_type_internal(stage: &WorkflowStage) -> TaskType {
    match stage {
        WorkflowStage::GeneratingRegex => TaskType::RegexPatternGeneration,
        WorkflowStage::LocalFiltering => TaskType::LocalFileFiltering,
        WorkflowStage::FileRelevanceAssessment => TaskType::FileRelevanceAssessment,
        WorkflowStage::ExtendedPathFinder => TaskType::ExtendedPathFinder,
        WorkflowStage::ExtendedPathCorrection => TaskType::ExtendedPathCorrection,
    }
}

/// Get model configuration for a specific stage
pub(super) async fn get_stage_model_config_internal(
    stage: &WorkflowStage, 
    project_directory: &str,
    app_handle: &AppHandle
) -> AppResult<Option<(String, f32, u32)>> {
    let task_type = stage_to_task_type_internal(stage);
    
    // Get settings repository from app state
    let settings_repo = app_handle.state::<std::sync::Arc<crate::db_utils::settings_repository::SettingsRepository>>().inner().clone();
    
    // Use the refactored function from workflow_utils
    super::workflow_utils::get_stage_model_config(
        app_handle,
        task_type,
        project_directory,
        &settings_repo
    ).await
}