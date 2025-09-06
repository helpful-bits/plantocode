use crate::error::{AppError, AppResult};
use crate::jobs::types::JobPayload;
use crate::jobs::workflow_types::{
    WorkflowDefinition, WorkflowStage, WorkflowStageDefinition, WorkflowState,
};
use crate::models::TaskType;
use crate::utils;
use log::{debug, warn};
use tauri::Manager;

/// Create payload for abstract stage with proper data injection from dependencies
pub(super) async fn create_abstract_stage_payload(
    app_handle: &tauri::AppHandle,
    workflow_state: &WorkflowState,
    stage_definition: &WorkflowStageDefinition,
    workflow_definition: &WorkflowDefinition,
) -> AppResult<JobPayload> {
    let task_type = stage_definition.task_type;

    match task_type {
        TaskType::RootFolderSelection => {
            use crate::jobs::types::RootFolderSelectionPayload;
            use crate::utils;

            let candidate_paths = utils::workspace_roots::list_root_level_folders(&app_handle, &workflow_state.project_directory).await?;
            let candidate_roots: Vec<String> = candidate_paths
                .into_iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect();

            let payload = RootFolderSelectionPayload {
                task_description: workflow_state.task_description.clone(),
                candidate_roots,
            };
            Ok(JobPayload::RootFolderSelection(payload))
        }
        TaskType::RegexFileFilter => {
            use crate::jobs::types::RegexFileFilterPayload;

            // Get root directories from the workflow state (stored by RootFolderSelection)
            let root_directories = if !workflow_state.intermediate_data.selected_root_directories.is_empty() {
                // Use the directories selected by the RootFolderSelection stage
                workflow_state.intermediate_data.selected_root_directories.clone()
            } else {
                // Fallback to default workspace roots if no selection was made
                let roots = utils::workspace_roots::resolve_workspace_roots(
                    &app_handle,
                    &workflow_state.project_directory,
                )
                .await?;
                
                roots
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect()
            };

            let payload = RegexFileFilterPayload {
                task_description: workflow_state.task_description.clone(),
                root_directories,
            };
            Ok(JobPayload::RegexFileFilter(payload))
        }
        TaskType::PathCorrection => {
            use crate::jobs::types::PathCorrectionPayload;

            // Retrieve extended_unverified_paths from workflow_state.intermediate_data with robust fallback
            let unverified_paths = workflow_state
                .intermediate_data
                .extended_unverified_paths
                .clone(); // extended_unverified_paths is Vec<String>, not Option<Vec<String>>

            if unverified_paths.is_empty() {
                warn!("Extended unverified paths is empty in intermediate_data for PathCorrection");
            } else {
                debug!(
                    "Using {} extended unverified paths for PathCorrection payload",
                    unverified_paths.len()
                );
            }

            let payload = PathCorrectionPayload {
                paths_to_correct: unverified_paths,
            };

            Ok(JobPayload::PathCorrection(payload))
        }
        TaskType::ExtendedPathFinder => {
            use crate::jobs::types::ExtendedPathFinderPayload;

            // Retrieve ai_filtered_files from workflow_state.intermediate_data with robust fallback
            let initial_paths = workflow_state.intermediate_data.ai_filtered_files.clone();

            if initial_paths.is_empty() {
                warn!("AI filtered files is empty in intermediate_data for ExtendedPathFinder");
            } else {
                debug!(
                    "Using {} AI filtered files for ExtendedPathFinder payload",
                    initial_paths.len()
                );
            }

            // Pass the selected root directories for scoped directory tree generation
            let selected_root_directories = workflow_state.intermediate_data.selected_root_directories.clone();

            let payload = ExtendedPathFinderPayload {
                task_description: workflow_state.task_description.clone(),
                initial_paths,
                selected_root_directories,
            };

            Ok(JobPayload::ExtendedPathFinder(payload))
        }
        TaskType::FileRelevanceAssessment => {
            use crate::jobs::types::FileRelevanceAssessmentPayload;

            let payload = FileRelevanceAssessmentPayload {
                task_description: workflow_state.task_description.clone(),
                locally_filtered_files: workflow_state
                    .intermediate_data
                    .locally_filtered_files
                    .clone(),
            };
            Ok(JobPayload::FileRelevanceAssessment(payload))
        }
        TaskType::WebSearchPromptsGeneration => {
            use crate::jobs::types::WebSearchPromptsGenerationPayload;

            // WebSearchPromptsGeneration gets task description to generate research prompts
            let payload = WebSearchPromptsGenerationPayload {
                task_description: workflow_state.task_description.clone(),
            };
            Ok(JobPayload::WebSearchPromptsGeneration(payload))
        }
        TaskType::WebSearchExecution => {
            use crate::jobs::types::WebSearchExecutionPayload;

            // WebSearchExecution gets generated prompts from previous stage
            let prompts = workflow_state.intermediate_data.web_search_prompts.clone();

            if prompts.is_empty() {
                warn!("Web search prompts is empty in intermediate_data for WebSearchExecution");
            } else {
                debug!(
                    "Using {} web search prompts for WebSearchExecution payload",
                    prompts.len()
                );
            }

            let payload = WebSearchExecutionPayload { prompts };
            Ok(JobPayload::WebSearchExecution(payload))
        }
        _ => Err(AppError::JobError(format!(
            "Unsupported task type for abstract workflow: {:?}",
            task_type
        ))),
    }
}
