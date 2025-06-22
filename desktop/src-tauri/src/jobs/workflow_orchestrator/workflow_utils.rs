use std::sync::Arc;
use crate::error::AppResult;
use crate::models::TaskType;
use crate::db_utils::settings_repository::SettingsRepository;
use crate::jobs::workflow_types::{WorkflowState, WorkflowStage, WorkflowDefinition, WorkflowStageDefinition};

/// Get model configuration for a specific task type
/// Returns None for local tasks that don't require LLM models
pub(super) async fn get_stage_model_config(
    app_handle: &tauri::AppHandle, 
    task_type: TaskType, 
    project_directory: &str, 
    settings_repo: &Arc<SettingsRepository>
) -> AppResult<Option<(String, f32, u32)>> {
    // Local tasks don't need LLM model configuration
    match task_type {
        _ => {
            // First try to get workflow-specific model override
            let stage_name = match task_type {
                TaskType::RegexPatternGeneration => "GeneratingRegex_model",
                TaskType::FileRelevanceAssessment => "FileRelevanceAssessment_model",
                TaskType::ExtendedPathFinder => "ExtendedPathFinder_model",
                TaskType::PathCorrection => "PathCorrection_model",
                _ => "",
            };

            let workflow_model = if !stage_name.is_empty() {
                settings_repo.get_workflow_setting("FileFinderWorkflow", stage_name).await
                    .unwrap_or(None)
            } else {
                None
            };

            // Use workflow model override or fall back to project/system defaults
            let model = if let Some(workflow_model) = workflow_model {
                workflow_model
            } else {
                crate::utils::config_helpers::get_model_for_task(task_type, app_handle)
                    .await
                    .unwrap_or_else(|_| "file-finder-hybrid".to_string())
            };

            let temperature = crate::utils::config_helpers::get_default_temperature_for_task(Some(task_type), app_handle)
                .await
                .unwrap_or(0.5);
            let max_tokens = crate::utils::config_helpers::get_default_max_tokens_for_task(Some(task_type), app_handle)
                .await
                .unwrap_or(4000);

            Ok(Some((model, temperature, max_tokens)))
        }
    }
}

/// Check if a stage can be validly skipped based on its definition and current state
fn is_stage_skippable(stage_def: &WorkflowStageDefinition, workflow_state: &WorkflowState, workflow_definition: &WorkflowDefinition) -> bool {
    // First check if dependencies are met
    let dependencies_met = stage_def.dependencies.iter().all(|dep_name| {
        workflow_definition.stages.iter()
            .find(|s| &s.stage_name == dep_name)
            .map(|dep_stage| {
                workflow_state.stage_jobs.iter().any(|job| {
                    job.task_type == dep_stage.task_type && job.status == crate::models::JobStatus::Completed
                })
            })
            .unwrap_or(false)
    });

    if !dependencies_met {
        return false;
    }

    // Apply task-specific skipping logic
    match stage_def.task_type {
        TaskType::PathCorrection => {
            // PathCorrection can be skipped if there are no unverified paths to correct
            workflow_state.intermediate_data.extended_unverified_paths.is_empty()
        }
        _ => false,
    }
}

/// Check if a workflow is complete based on its definition
pub(super) fn is_workflow_complete(workflow_state: &WorkflowState, workflow_definition: &WorkflowDefinition) -> bool {
    // Check if all stages in the definition are either completed or validly skippable
    for stage_def in &workflow_definition.stages {
        let stage_completed = workflow_state.stage_jobs.iter().any(|stage_job| {
            // Match stage by task type directly
            stage_def.task_type == stage_job.task_type && stage_job.status == crate::models::JobStatus::Completed
        });

        if !stage_completed {
            // If stage is not completed, check if it can be validly skipped
            if !is_stage_skippable(stage_def, workflow_state, workflow_definition) {
                return false;
            }
        }
    }

    true
}