use log::{error, info};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;

use super::super::workflow_types::{
    WorkflowDefinition, WorkflowStage, WorkflowStageDefinition, WorkflowState,
};
use super::{payload_builder, workflow_utils};
use crate::db_utils::settings_repository::SettingsRepository;
use crate::error::AppResult;
use crate::jobs::types::JobPayload;
use crate::models::TaskType;
use crate::utils::job_creation_utils;

/// Create and queue a job for a specific workflow stage using abstract workflow definitions
/// This is the canonical method for creating stage jobs with workflow lock held
pub async fn create_abstract_stage_job_with_lock_internal(
    workflows: &mut HashMap<String, WorkflowState>,
    workflow_state: &WorkflowState,
    stage_definition: &WorkflowStageDefinition,
    workflow_definition: &WorkflowDefinition,
    app_handle: &AppHandle,
    settings_repo: &Arc<SettingsRepository>,
) -> AppResult<String> {
    let task_type = stage_definition.task_type;

    // Create stage payload based on task type and dependency data
    let job_payload = payload_builder::create_abstract_stage_payload(
        app_handle,
        workflow_state,
        stage_definition,
        workflow_definition,
    )
    .await?;

    // Convert to WorkflowStage for model configuration (only for stages that have WorkflowStage equivalents)
    let stage = match task_type {
        TaskType::RootFolderSelection => Some(WorkflowStage::RootFolderSelection),
        TaskType::RegexFileFilter => Some(WorkflowStage::RegexFileFilter),
        TaskType::FileRelevanceAssessment => Some(WorkflowStage::FileRelevanceAssessment),
        TaskType::ExtendedPathFinder => Some(WorkflowStage::ExtendedPathFinder),
        TaskType::PathCorrection => Some(WorkflowStage::PathCorrection),
        TaskType::WebSearchPromptsGeneration => Some(WorkflowStage::WebSearchPromptsGeneration),
        TaskType::WebSearchExecution => Some(WorkflowStage::WebSearchExecution),
        _ => {
            return Err(crate::error::AppError::JobError(format!(
                "Unsupported task type for workflow stage: {:?}",
                task_type
            )));
        }
    };

    // Get model configuration for the stage
    let model_settings = get_stage_model_config_for_definition_internal(
        stage_definition,
        &workflow_state.project_directory,
        app_handle,
        settings_repo,
    )
    .await?;

    // Determine API type based on whether the task requires LLM
    let api_type_str = if model_settings.is_some() {
        "openrouter"
    } else {
        "filesystem"
    };

    // Create the background job
    let job_id = job_creation_utils::create_and_queue_background_job(
        &workflow_state.session_id,
        &workflow_state.project_directory,
        api_type_str,
        task_type,
        &stage_definition.stage_name.to_uppercase().replace(" ", "_"),
        &workflow_state.task_description,
        model_settings,
        job_payload,
        10,                                        // High priority for workflow jobs
        Some(workflow_state.workflow_id.clone()),  // workflow_id
        Some(stage_definition.stage_name.clone()), // workflow_stage
        Some(serde_json::json!({
            "workflowId": workflow_state.workflow_id,
            "workflowStage": stage.map(|s| serde_json::to_value(&s).unwrap().as_str().unwrap().to_string()).unwrap_or_else(|| stage_definition.stage_name.clone()),
            "stageName": stage_definition.stage_name,
            "workflowTaskDescription": workflow_state.task_description.clone()
        })),
        app_handle,
    )
    .await?;

    // Add the stage job to workflow state using the provided mutable reference
    if let Some(workflow) = workflows.get_mut(&workflow_state.workflow_id) {
        let depends_on = if stage_definition.dependencies.is_empty() {
            None
        } else {
            // Find the job ID of the first dependency
            stage_definition
                .dependencies
                .first()
                .and_then(|dep_stage_name| workflow_definition.get_stage(dep_stage_name))
                .and_then(|dep_stage_def| {
                    workflow
                        .stages
                        .iter()
                        .find(|job| job.task_type == dep_stage_def.task_type)
                })
                .map(|job| job.job_id.clone())
        };

        workflow.add_stage_job(
            stage_definition.stage_name.clone(),
            stage_definition.task_type,
            job_id.clone(),
            depends_on,
        );
    }

    info!(
        "Created abstract stage job {} for stage '{}'",
        job_id, stage_definition.stage_name
    );
    Ok(job_id)
}

/// Get model configuration for a stage definition
pub async fn get_stage_model_config_for_definition_internal(
    stage_definition: &WorkflowStageDefinition,
    project_directory: &str,
    app_handle: &AppHandle,
    settings_repo: &Arc<SettingsRepository>,
) -> AppResult<Option<(String, f32, u32)>> {
    // Use the refactored function from workflow_utils that takes TaskType directly
    workflow_utils::get_stage_model_config(
        app_handle,
        stage_definition.task_type,
        project_directory,
        settings_repo,
    )
    .await
}
