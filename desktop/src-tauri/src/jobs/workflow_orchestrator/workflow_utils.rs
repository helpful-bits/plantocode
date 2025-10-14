use crate::db_utils::settings_repository::SettingsRepository;
use crate::error::AppResult;
use crate::jobs::workflow_types::{
    WorkflowDefinition, WorkflowStage, WorkflowStageDefinition, WorkflowState,
};
use crate::models::TaskType;
use std::sync::Arc;

/// Get model configuration for a specific task type
/// Returns None for local tasks that don't require LLM models
pub(super) async fn get_stage_model_config(
    app_handle: &tauri::AppHandle,
    task_type: TaskType,
    project_directory: &str,
    settings_repo: &Arc<SettingsRepository>,
) -> AppResult<Option<(String, f32, u32)>> {
    // Local tasks don't need LLM model configuration
    match task_type {
        _ => {
            // First try to get workflow-specific model override
            let stage_name = match task_type {
                TaskType::RegexFileFilter => "GeneratingRegex_model",
                TaskType::FileRelevanceAssessment => "FileRelevanceAssessment_model",
                TaskType::ExtendedPathFinder => "ExtendedPathFinder_model",
                TaskType::WebSearchPromptsGeneration => "WebSearchPromptsGeneration_model",
                TaskType::WebSearchExecution => "WebSearchExecution_model",
                TaskType::RootFolderSelection => "RootFolderSelection_model",
                _ => "",
            };

            let workflow_model = if !stage_name.is_empty() {
                settings_repo
                    .get_workflow_setting("FileFinderWorkflow", stage_name)
                    .await
                    .unwrap_or(None)
            } else {
                None
            };

            // Use workflow model override or fall back to project/system defaults
            if let Some(workflow_model) = workflow_model {
                // If we have a workflow-specific model override, still get temperature and max_tokens from config
                let temperature = crate::utils::config_helpers::get_default_temperature_for_task(
                    Some(task_type),
                    app_handle,
                )
                .await?;
                let max_tokens = crate::utils::config_helpers::get_default_max_tokens_for_task(
                    Some(task_type),
                    app_handle,
                )
                .await?;
                Ok(Some((workflow_model, temperature, max_tokens)))
            } else {
                // Use config resolver to get project-specific settings with proper fallback to server defaults
                crate::utils::config_resolver::resolve_model_settings(
                    app_handle,
                    task_type,
                    project_directory,
                    None,
                    None,
                    None,
                )
                .await
            }
        }
    }
}

/// Check if a stage can be validly skipped based on its definition and current state
fn is_stage_skippable(
    stage_def: &WorkflowStageDefinition,
    workflow_state: &WorkflowState,
    workflow_definition: &WorkflowDefinition,
) -> bool {
    // First check if dependencies are met
    let dependencies_met = stage_def.dependencies.iter().all(|dep_name| {
        workflow_definition
            .stages
            .iter()
            .find(|s| &s.stage_name == dep_name)
            .map(|dep_stage| {
                workflow_state.stages.iter().any(|job| {
                    job.task_type == dep_stage.task_type
                        && job.status == crate::models::JobStatus::Completed
                })
            })
            .unwrap_or(false)
    });

    if !dependencies_met {
        return false;
    }

    // Apply task-specific skipping logic
    match stage_def.task_type {
        TaskType::WebSearchPromptsGeneration => {
            // WebSearchPromptsGeneration cannot be skipped - it's needed to generate prompts
            false
        }
        TaskType::WebSearchExecution => {
            // WebSearchExecution can be skipped only if there are no search prompts available
            let web_search_prompts = &workflow_state.intermediate_data.web_search_prompts;
            let prompts_available = !web_search_prompts.is_empty();
            let can_skip = !prompts_available;
            log::debug!(
                "WebSearchExecution stage can be skipped: {} (prompts available: {})",
                can_skip,
                prompts_available
            );
            can_skip
        }
        _ => false,
    }
}

/// Check if a workflow is complete based on its definition
pub(super) fn is_workflow_complete(
    workflow_state: &WorkflowState,
    workflow_definition: &WorkflowDefinition,
) -> bool {
    log::debug!(
        "Checking workflow completion for {} stages",
        workflow_definition.stages.len()
    );

    let mut completed_count = 0;
    let mut skipped_count = 0;
    let mut pending_count = 0;

    // Check if all stages in the definition are either completed or validly skippable
    for stage_def in &workflow_definition.stages {
        let stage_completed = workflow_state.stages.iter().any(|stage_job| {
            // Match stage by task type directly
            stage_def.task_type == stage_job.task_type
                && stage_job.status == crate::models::JobStatus::Completed
        });

        log::debug!(
            "Stage {:?}: completed={}",
            stage_def.task_type,
            stage_completed
        );

        if stage_completed {
            completed_count += 1;
        } else {
            // If stage is not completed, check if it can be validly skipped
            let can_skip = is_stage_skippable(stage_def, workflow_state, workflow_definition);
            log::debug!("Stage {:?}: can_skip={}", stage_def.task_type, can_skip);

            if can_skip {
                skipped_count += 1;
            } else {
                pending_count += 1;
                log::debug!(
                    "Workflow incomplete: stage {:?} not completed and cannot be skipped",
                    stage_def.task_type
                );

                // Log additional context for debugging
                if stage_def.task_type == TaskType::WebSearchExecution {
                    let prompts_count = workflow_state.intermediate_data.web_search_prompts.len();
                    log::debug!(
                        "WebSearchExecution stage requires execution with {} prompts",
                        prompts_count
                    );
                }

                return false;
            }
        }
    }

    log::debug!(
        "All workflow stages completed or validly skipped. Summary: completed={}, skipped={}, pending={}",
        completed_count,
        skipped_count,
        pending_count
    );
    true
}
