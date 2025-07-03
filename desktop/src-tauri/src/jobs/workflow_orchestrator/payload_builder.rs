use log::{warn, debug};
use tauri::Manager;
use crate::error::{AppError, AppResult};
use crate::jobs::workflow_types::{WorkflowDefinition, WorkflowStage, WorkflowStageDefinition, WorkflowState};
use crate::jobs::types::JobPayload;
use crate::jobs::stage_data_injectors::StageDataInjector;
use crate::models::TaskType;

/// Create payload for abstract stage with proper data injection from dependencies
pub(super) async fn create_abstract_stage_payload(
    app_handle: &tauri::AppHandle,
    workflow_state: &WorkflowState,
    stage_definition: &WorkflowStageDefinition,
    workflow_definition: &WorkflowDefinition
) -> AppResult<JobPayload> {
    let task_type = stage_definition.task_type;
    let repo = match app_handle.try_state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>() {
        Some(repo) => repo.inner().clone(),
        None => {
            return Err(AppError::InitializationError(
                "Background job repository not yet initialized. Please wait for app initialization to complete.".to_string()
            ));
        }
    };
    let settings_repo = match app_handle.try_state::<std::sync::Arc<crate::db_utils::SettingsRepository>>() {
        Some(repo) => repo.inner().clone(),
        None => {
            return Err(AppError::InitializationError(
                "Settings repository not yet initialized. Please wait for app initialization to complete.".to_string()
            ));
        }
    };

    match task_type {
        TaskType::RegexFileFilter => {
            let payload = StageDataInjector::create_regex_generation_payload(
                workflow_state.workflow_id.clone(),
                workflow_state.session_id.clone(),
                workflow_state.task_description.clone(),
                workflow_state.project_directory.clone()
            );
            Ok(JobPayload::RegexFileFilter(payload))
        }
        TaskType::PathCorrection => {
            // Retrieve extended_unverified_paths from workflow_state.intermediate_data with robust fallback
            let unverified_paths = workflow_state.intermediate_data.extended_unverified_paths
                .clone(); // extended_unverified_paths is Vec<String>, not Option<Vec<String>>
            
            if unverified_paths.is_empty() {
                warn!("Extended unverified paths is empty in intermediate_data for PathCorrection");
            } else {
                debug!("Using {} extended unverified paths for PathCorrection payload", unverified_paths.len());
            }

            let payload = StageDataInjector::create_path_correction_payload(
                workflow_state.workflow_id.clone(),
                workflow_state.session_id.clone(),
                workflow_state.task_description.clone(),
                workflow_state.project_directory.clone(),
                unverified_paths
            );

            Ok(JobPayload::PathCorrection(payload))
        }
        TaskType::ExtendedPathFinder => {
            // Retrieve ai_filtered_files from workflow_state.intermediate_data with robust fallback
            let initial_paths = workflow_state.intermediate_data.ai_filtered_files.clone();
            
            if initial_paths.is_empty() {
                warn!("AI filtered files is empty in intermediate_data for ExtendedPathFinder");
            } else {
                debug!("Using {} AI filtered files for ExtendedPathFinder payload", initial_paths.len());
            }

            let payload = StageDataInjector::create_extended_finder_payload(
                &settings_repo,
                workflow_state.workflow_id.clone(),
                workflow_state.session_id.clone(),
                workflow_state.task_description.clone(),
                workflow_state.project_directory.clone(),
                initial_paths
            ).await;

            Ok(JobPayload::ExtendedPathFinder(payload))
        }
        TaskType::FileRelevanceAssessment => {
            let payload = StageDataInjector::create_file_relevance_assessment_payload(
                workflow_state.workflow_id.clone(),
                workflow_state.session_id.clone(),
                workflow_state.task_description.clone(),
                workflow_state.project_directory.clone(),
                workflow_state.intermediate_data.locally_filtered_files.clone()
            );
            Ok(JobPayload::FileRelevanceAssessment(payload))
        }
        TaskType::WebSearchQueryGeneration => {
            use crate::jobs::types::WebSearchQueryGenerationPayload;
            
            // WebSearchQueryGeneration gets all data it needs from the session directly
            // No need to pass files through the workflow payload
            let payload = WebSearchQueryGenerationPayload {
                task_description: workflow_state.task_description.clone(),
            };
            Ok(JobPayload::WebSearchQueryGeneration(payload))
        }
        TaskType::WebSearchExecution => {
            use crate::jobs::types::WebSearchExecutionPayload;
            
            // Get prompt from intermediate_data (it should be stored from the query generation stage)
            let prompt = workflow_state.intermediate_data.web_search_prompt.clone().unwrap_or_default();
            
            if prompt.is_empty() {
                warn!("Web search prompt is empty in intermediate_data for WebSearchExecution");
            } else {
                debug!("Using web search prompt for WebSearchExecution payload");
            }

            let payload = WebSearchExecutionPayload {
                prompt,
            };
            Ok(JobPayload::WebSearchExecution(payload))
        }
        _ => Err(AppError::JobError(format!("Unsupported task type for abstract workflow: {:?}", task_type)))
    }
}

