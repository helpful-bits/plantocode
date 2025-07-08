use log::{info, debug, warn};
use crate::jobs::types::{
    ExtendedPathFinderPayload, PathCorrectionPayload,
    RegexFileFilterPayload, FileRelevanceAssessmentPayload
};
use crate::db_utils::SettingsRepository;
use crate::error::{AppError, AppResult};
use std::sync::Arc;

/// Stage-specific data injection utilities for creating next-stage payloads
pub struct StageDataInjector;

impl StageDataInjector {
    /// Get workflow setting value with fallback to default
    async fn get_workflow_setting(
        settings_repo: &Arc<SettingsRepository>,
        workflow_name: &str,
        setting_key: &str,
        default_value: Option<&str>
    ) -> Option<String> {
        match settings_repo.get_workflow_setting(workflow_name, setting_key).await {
            Ok(Some(value)) if !value.trim().is_empty() => Some(value),
            Ok(_) => default_value.map(|s| s.to_string()),
            Err(e) => {
                warn!("Failed to get workflow setting {}:{}: {}", workflow_name, setting_key, e);
                default_value.map(|s| s.to_string())
            }
        }
    }

    /// Parse excluded paths from a comma-separated string
    fn parse_excluded_paths(excluded_paths_str: &str) -> Vec<String> {
        excluded_paths_str
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }

    /// Parse timeout value from string
    fn parse_timeout_ms(timeout_str: &str, default: u64) -> u64 {
        timeout_str.parse::<u64>().unwrap_or_else(|_| {
            warn!("Invalid timeout value '{}', using default: {}", timeout_str, default);
            default
        })
    }

    /// Parse max files value from string
    fn parse_max_files(max_files_str: &str) -> AppResult<usize> {
        max_files_str.parse::<usize>()
            .map_err(|e| AppError::ConfigError(format!("Invalid max files value '{}': {}", max_files_str, e)))
    }

    /// Create ExtendedPathFinderPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub async fn create_extended_finder_payload(
        _settings_repo: &Arc<SettingsRepository>,
        _workflow_id: String,
        _session_id: String,
        task_description: String,
        _project_directory: String,
        initial_paths: Vec<String>
    ) -> AppResult<ExtendedPathFinderPayload> {
        info!("Creating ExtendedPathFinder payload from specific data fields");
        
        debug!("Initial paths count: {}", initial_paths.len());
        
        // Model settings are handled by the job creation system, not stored in payload
        
        Ok(ExtendedPathFinderPayload {
            task_description,
            initial_paths, // AI-filtered files from FileRelevanceAssessment stage
        })
    }


    /// Create PathCorrectionPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub fn create_path_correction_payload(
        _workflow_id: String,
        _session_id: String,
        _task_description: String,
        _project_directory: String,
        paths_to_correct: Vec<String>
    ) -> PathCorrectionPayload {
        info!("Creating PathCorrection payload from specific data fields");
        
        debug!("Paths to correct count: {}", paths_to_correct.len());
        
        // Convert Vec<String> to newline-separated String for PathCorrectionPayload
        let paths_string = if paths_to_correct.is_empty() {
            "No paths available for correction".to_string()
        } else {
            paths_to_correct.join("\n")
        };
        
        PathCorrectionPayload {
            paths_to_correct: paths_string,
        }
    }


    /// Create RegexFileFilterPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub fn create_regex_generation_payload(
        _workflow_id: String,
        _session_id: String,
        task_description: String,
        _project_directory: String
    ) -> RegexFileFilterPayload {
        info!("Creating RegexFileFilter payload from specific data fields");
        
        debug!("workflow_id: {}", _workflow_id);
        
        RegexFileFilterPayload {
            task_description,
        }
    }

    /// Create FileRelevanceAssessmentPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    pub fn create_file_relevance_assessment_payload(
        _workflow_id: String,
        _session_id: String,
        task_description: String,
        _project_directory: String,
        locally_filtered_files: Vec<String>
    ) -> FileRelevanceAssessmentPayload {
        info!("Creating FileRelevanceAssessment payload with {} locally filtered files", locally_filtered_files.len());
        
        FileRelevanceAssessmentPayload {
            task_description,
            locally_filtered_files,
        }
    }



    /// Clone finder payload with new job ID
    pub fn clone_finder_with_new_job_id(
        original: &ExtendedPathFinderPayload
    ) -> ExtendedPathFinderPayload {
        ExtendedPathFinderPayload {
            task_description: original.task_description.clone(),
            initial_paths: original.initial_paths.clone(),
        }
    }


    /// Merge excluded paths from multiple sources
    pub fn merge_excluded_paths(
        base_excluded: &[String],
        additional_excluded: &[String]
    ) -> Vec<String> {
        let mut merged = base_excluded.to_vec();
        
        for path in additional_excluded {
            if !merged.contains(path) {
                merged.push(path.clone());
            }
        }
        
        debug!("Merged excluded paths: {} total", merged.len());
        merged
    }



    /// Validate finder payload
    /// Now allows empty directory_tree for graceful degradation
    pub fn validate_finder_payload(
        _payload: &ExtendedPathFinderPayload
    ) -> Result<(), String> {
        // Note: initial_paths can be empty for some finder scenarios
        Ok(())
    }




    /// Extract task description from finder payload
    pub fn extract_finder_task_description(
        payload: &ExtendedPathFinderPayload
    ) -> String {
        payload.task_description.clone()
    }


    /// Extract task description from regex generation payload
    pub fn extract_regex_task_description(
        payload: &RegexFileFilterPayload
    ) -> String {
        payload.task_description.clone()
    }

    /// Validate regex generation payload
    pub fn validate_regex_generation_payload(
        payload: &RegexFileFilterPayload
    ) -> Result<(), String> {
        if payload.task_description.trim().is_empty() {
            return Err("Task description cannot be empty".to_string());
        }
        
        Ok(())
    }

    /// Clone regex payload with new job ID
    pub fn clone_regex_with_new_job_id(
        original: &RegexFileFilterPayload
    ) -> RegexFileFilterPayload {
        RegexFileFilterPayload {
            task_description: original.task_description.clone(),
        }
    }

    // Model configuration is handled by the job creation system, not payload

    /// Add metadata to regex payload (stored as JSON in the background job)
    pub fn add_metadata_to_regex_payload(
        payload: RegexFileFilterPayload,
        metadata_key: &str,
        metadata_value: serde_json::Value
    ) -> (RegexFileFilterPayload, serde_json::Value) {
        let metadata = serde_json::json!({
            metadata_key: metadata_value,
            "workflow_stage": "RegexFileFilter",
            "created_at": chrono::Utc::now().timestamp_millis()
        });
        
        (payload, metadata)
    }
}