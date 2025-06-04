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
    let repo = app_handle.state::<std::sync::Arc<crate::db_utils::BackgroundJobRepository>>().inner().clone();
    let settings_repo = app_handle.state::<std::sync::Arc<crate::db_utils::SettingsRepository>>().inner().clone();

    match task_type {
        TaskType::RegexPatternGeneration => {
            let payload = StageDataInjector::create_regex_generation_payload(
                workflow_state.workflow_id.clone(),
                workflow_state.session_id.clone(),
                workflow_state.task_description.clone(),
                workflow_state.project_directory.clone()
            );
            Ok(JobPayload::RegexPatternGenerationWorkflow(payload))
        }
        TaskType::LocalFileFiltering => {
            // Retrieve raw_regex_patterns from workflow_state.intermediate_data and parse into Vec<String> with robust fallback
            let raw_regex_patterns_value = workflow_state.intermediate_data.raw_regex_patterns
                .as_ref()
                .cloned()
                .unwrap_or_else(|| {
                    warn!("Raw regex patterns missing from intermediate_data for LocalFileFiltering, using empty array");
                    serde_json::Value::Array(vec![])
                });

            // Use StageDataExtractor::extract_patterns_from_json to parse the raw JSON into Vec<String>
            let regex_patterns = crate::jobs::stage_data_extractors::StageDataExtractor::extract_patterns_from_json(&raw_regex_patterns_value)
                .unwrap_or_else(|e| {
                    warn!("Failed to extract regex patterns for LocalFiltering, using empty list: {}", e);
                    vec![]
                });
            
            debug!("Extracted {} regex patterns for LocalFileFiltering payload", regex_patterns.len());

            let payload = StageDataInjector::create_local_filtering_payload(
                &settings_repo,
                workflow_state.workflow_id.clone(),
                workflow_state.session_id.clone(),
                workflow_state.task_description.clone(),
                workflow_state.project_directory.clone(),
                regex_patterns,
                workflow_state.excluded_paths.clone()
            ).await;

            // Validate payload before returning
            StageDataInjector::validate_filtering_payload(&payload)
                .map_err(|e| AppError::JobError(format!("LocalFiltering payload validation failed: {}", e)))?;

            Ok(JobPayload::LocalFileFiltering(payload))
        }
        TaskType::PathFinder => {
            // NOTE: This task type is superseded by ExtendedPathFinder for the main FileFinderWorkflow
            // Keeping for backward compatibility with older workflows
            return Err(AppError::JobError("PathFinder task type is superseded by ExtendedPathFinder in FileFinderWorkflow".to_string()));
        }
        TaskType::PathCorrection => {
            // NOTE: This task type is superseded by ExtendedPathCorrection for the main FileFinderWorkflow
            // Keeping for backward compatibility with older workflows
            return Err(AppError::JobError("PathCorrection task type is superseded by ExtendedPathCorrection in FileFinderWorkflow".to_string()));
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
        TaskType::ExtendedPathCorrection => {
            // Retrieve extended_unverified_paths from workflow_state.intermediate_data with robust fallback
            let unverified_paths = workflow_state.intermediate_data.extended_unverified_paths
                .clone(); // extended_unverified_paths is Vec<String>, not Option<Vec<String>>
            
            if unverified_paths.is_empty() {
                warn!("Extended unverified paths is empty in intermediate_data for ExtendedPathCorrection");
            } else {
                debug!("Using {} extended unverified paths for ExtendedPathCorrection payload", unverified_paths.len());
            }

            let payload = StageDataInjector::create_path_correction_payload(
                workflow_state.workflow_id.clone(),
                workflow_state.session_id.clone(),
                workflow_state.task_description.clone(),
                workflow_state.project_directory.clone(),
                unverified_paths
            );

            Ok(JobPayload::ExtendedPathCorrection(payload))
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
        _ => Err(AppError::JobError(format!("Unsupported task type for abstract workflow: {:?}", task_type)))
    }
}

