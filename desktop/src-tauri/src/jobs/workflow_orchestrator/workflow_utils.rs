use std::sync::Arc;
use crate::error::AppResult;
use crate::models::TaskType;
use crate::db_utils::settings_repository::SettingsRepository;
use crate::jobs::workflow_types::{WorkflowState, WorkflowStage, WorkflowDefinition};

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
        TaskType::LocalFileFiltering => {
            Ok(None)
        }
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
                crate::config::get_model_for_task_with_project(task_type, project_directory, app_handle)
                    .await
                    .unwrap_or_else(|_| "file-finder-hybrid".to_string())
            };

            let temperature = crate::config::get_temperature_for_task_with_project(task_type, project_directory, app_handle)
                .await
                .unwrap_or(0.5);
            let max_tokens = crate::config::get_max_tokens_for_task_with_project(task_type, project_directory, app_handle)
                .await
                .unwrap_or(4000);

            Ok(Some((model, temperature, max_tokens)))
        }
    }
}

/// Check if a workflow is complete based on its definition
pub(super) fn is_workflow_complete(workflow_state: &WorkflowState, workflow_definition: &WorkflowDefinition) -> bool {
    // Check if all stages in the definition have completed successfully
    for stage_def in &workflow_definition.stages {
        let stage_completed = workflow_state.stage_jobs.iter().any(|stage_job| {
            // Match stage by task type directly
            stage_def.task_type == stage_job.task_type && stage_job.status == crate::models::JobStatus::Completed
        });

        if !stage_completed {
            return false;
        }
    }

    true
}