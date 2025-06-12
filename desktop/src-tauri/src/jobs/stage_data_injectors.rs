use log::{info, debug, warn};
use crate::jobs::types::{
    LocalFileFilteringPayload,
    ExtendedPathFinderPayload, PathCorrectionPayload,
    RegexPatternGenerationWorkflowPayload, FileRelevanceAssessmentPayload
};
use crate::db_utils::SettingsRepository;
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
    fn parse_max_files(max_files_str: &str, default: usize) -> usize {
        max_files_str.parse::<usize>().unwrap_or_else(|_| {
            warn!("Invalid max files value '{}', using default: {}", max_files_str, default);
            default
        })
    }
    /// Create LocalFileFilteringPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub async fn create_local_filtering_payload(
        settings_repo: &Arc<SettingsRepository>,
        _workflow_id: String,
        _session_id: String,
        task_description: String,
        _project_directory: String,
        path_pattern: Option<String>,
        content_pattern: Option<String>,
        negative_path_pattern: Option<String>,
        negative_content_pattern: Option<String>,
        excluded_paths_from_workflow: Vec<String>
    ) -> LocalFileFilteringPayload {
        info!("Creating LocalFileFiltering payload from specific data fields");
        
        debug!("workflow_id: {}, path_pattern: {:?}, content_pattern: {:?}, negative_path_pattern: {:?}, negative_content_pattern: {:?}", 
               _workflow_id, path_pattern, content_pattern, negative_path_pattern, negative_content_pattern);
        
        // Get excluded paths from workflow settings
        let excluded_paths_setting = Self::get_workflow_setting(
            settings_repo,
            "FileFinderWorkflow",
            "excludedPaths",
            Some(".git,node_modules,target,dist,build")
        ).await.unwrap_or_else(|| ".git,node_modules,target,dist,build".to_string());
        
        let settings_excluded_paths = Self::parse_excluded_paths(&excluded_paths_setting);
        
        // Merge excluded paths from workflow state with settings-derived excluded paths
        let merged_excluded_paths = Self::merge_excluded_paths(
            &excluded_paths_from_workflow,
            &settings_excluded_paths
        );
        
        LocalFileFilteringPayload {
            task_description,
            excluded_paths: merged_excluded_paths,
            path_pattern,
            content_pattern,
            negative_path_pattern,
            negative_content_pattern,
        }
    }

    /// Create ExtendedPathFinderPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub async fn create_extended_finder_payload(
        settings_repo: &Arc<SettingsRepository>,
        _workflow_id: String,
        _session_id: String,
        task_description: String,
        _project_directory: String,
        initial_paths: Vec<String>
    ) -> ExtendedPathFinderPayload {
        info!("Creating ExtendedPathFinder payload from specific data fields");
        
        debug!("Initial paths count: {}", initial_paths.len());
        
        // Model settings are handled by the job creation system, not stored in payload
        
        // Get max files with content setting
        let max_files_setting = Self::get_workflow_setting(
            settings_repo,
            "FileFinderWorkflow",
            "maxFilesWithContent",
            Some("50")
        ).await.unwrap_or_else(|| "50".to_string());
        
        let _max_files_with_content = Self::parse_max_files(&max_files_setting, 50);
        
        ExtendedPathFinderPayload {
            task_description,
            initial_paths, // AI-filtered files from FileRelevanceAssessment stage
        }
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


    /// Create RegexPatternGenerationWorkflowPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub fn create_regex_generation_payload(
        _workflow_id: String,
        _session_id: String,
        task_description: String,
        _project_directory: String
    ) -> RegexPatternGenerationWorkflowPayload {
        info!("Creating RegexPatternGeneration payload from specific data fields");
        
        debug!("workflow_id: {}", _workflow_id);
        
        RegexPatternGenerationWorkflowPayload {
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


    /// Clone filtering payload with new job ID
    pub fn clone_filtering_with_new_job_id(
        original: &LocalFileFilteringPayload
    ) -> LocalFileFilteringPayload {
        LocalFileFilteringPayload {
            task_description: original.task_description.clone(),
            excluded_paths: original.excluded_paths.clone(),
            path_pattern: original.path_pattern.clone(),
            content_pattern: original.content_pattern.clone(),
            negative_path_pattern: original.negative_path_pattern.clone(),
            negative_content_pattern: original.negative_content_pattern.clone(),
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


    /// Validate filtering payload
    /// Validates that at least one positive pattern (path or content) is provided
    pub fn validate_filtering_payload(
        payload: &LocalFileFilteringPayload
    ) -> Result<(), String> {
        // At least one positive pattern must be provided
        if payload.path_pattern.is_none() && payload.content_pattern.is_none() {
            return Err("At least one positive pattern (path_pattern or content_pattern) must be provided for LocalFileFilteringPayload".to_string());
        }
        
        // Negative patterns are optional
        if payload.negative_path_pattern.is_some() {
            debug!("Negative path pattern provided for exclusion filtering");
        }
        
        if payload.negative_content_pattern.is_some() {
            debug!("Negative content pattern provided for exclusion filtering");
        }
        
        Ok(())
    }

    /// Validate finder payload
    /// Now allows empty directory_tree for graceful degradation
    pub fn validate_finder_payload(
        _payload: &ExtendedPathFinderPayload
    ) -> Result<(), String> {
        // Note: initial_paths can be empty for some finder scenarios
        Ok(())
    }



    /// Extract task description from filtering payload
    pub fn extract_filtering_task_description(
        payload: &LocalFileFilteringPayload
    ) -> String {
        payload.task_description.clone()
    }

    /// Extract task description from finder payload
    pub fn extract_finder_task_description(
        payload: &ExtendedPathFinderPayload
    ) -> String {
        payload.task_description.clone()
    }


    /// Extract task description from regex generation payload
    pub fn extract_regex_task_description(
        payload: &RegexPatternGenerationWorkflowPayload
    ) -> String {
        payload.task_description.clone()
    }

    /// Validate regex generation payload
    pub fn validate_regex_generation_payload(
        payload: &RegexPatternGenerationWorkflowPayload
    ) -> Result<(), String> {
        if payload.task_description.trim().is_empty() {
            return Err("Task description cannot be empty".to_string());
        }
        
        Ok(())
    }

    /// Clone regex payload with new job ID
    pub fn clone_regex_with_new_job_id(
        original: &RegexPatternGenerationWorkflowPayload
    ) -> RegexPatternGenerationWorkflowPayload {
        RegexPatternGenerationWorkflowPayload {
            task_description: original.task_description.clone(),
        }
    }

    // Model configuration is handled by the job creation system, not payload

    /// Add metadata to regex payload (stored as JSON in the background job)
    pub fn add_metadata_to_regex_payload(
        payload: RegexPatternGenerationWorkflowPayload,
        metadata_key: &str,
        metadata_value: serde_json::Value
    ) -> (RegexPatternGenerationWorkflowPayload, serde_json::Value) {
        let metadata = serde_json::json!({
            metadata_key: metadata_value,
            "workflow_stage": "RegexPatternGeneration",
            "created_at": chrono::Utc::now().timestamp_millis()
        });
        
        (payload, metadata)
    }
}