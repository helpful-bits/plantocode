use log::{info, debug, warn};
use crate::jobs::types::{
    LocalFileFilteringPayload,
    ExtendedPathFinderPayload, ExtendedPathCorrectionPayload,
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
        workflow_id: String,
        session_id: String,
        task_description: String,
        project_directory: String,
        regex_patterns: Vec<String>,
        excluded_paths_from_workflow: Vec<String>
    ) -> LocalFileFilteringPayload {
        info!("Creating LocalFileFiltering payload from specific data fields");
        
        debug!("workflow_id: {}, patterns_count: {}", 
               workflow_id, regex_patterns.len());
        
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
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id,
            task_description,
            project_directory,
            excluded_paths: merged_excluded_paths,
            regex_patterns,
            workflow_id,
        }
    }

    /// Create ExtendedPathFinderPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub async fn create_extended_finder_payload(
        settings_repo: &Arc<SettingsRepository>,
        workflow_id: String,
        session_id: String,
        task_description: String,
        project_directory: String,
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
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id,
            task_description,
            project_directory,
            initial_paths, // AI-filtered files from FileRelevanceAssessment stage
            workflow_id,
        }
    }


    /// Create ExtendedPathCorrectionPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub fn create_path_correction_payload(
        workflow_id: String,
        session_id: String,
        task_description: String,
        project_directory: String,
        paths_to_correct: Vec<String>
    ) -> ExtendedPathCorrectionPayload {
        info!("Creating ExtendedPathCorrection payload from specific data fields");
        
        debug!("Paths to correct count: {}", paths_to_correct.len());
        
        ExtendedPathCorrectionPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id,
            task_description,
            project_directory,
            extended_paths: if paths_to_correct.is_empty() {
                vec!["No paths available for correction".to_string()]
            } else {
                paths_to_correct
            }, // paths_to_correct are the unverified paths from the previous finder stage
            workflow_id,
        }
    }


    /// Create RegexPatternGenerationWorkflowPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    /// Note: directory_tree is now generated on-demand by the processor
    pub fn create_regex_generation_payload(
        workflow_id: String,
        session_id: String,
        task_description: String,
        project_directory: String
    ) -> RegexPatternGenerationWorkflowPayload {
        info!("Creating RegexPatternGeneration payload from specific data fields");
        
        debug!("workflow_id: {}", workflow_id);
        
        RegexPatternGenerationWorkflowPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id,
            task_description,
            project_directory,
            workflow_id,
        }
    }

    /// Create FileRelevanceAssessmentPayload from specific data fields
    /// Data sourced from WorkflowState.intermediate_data
    pub fn create_file_relevance_assessment_payload(
        workflow_id: String,
        session_id: String,
        task_description: String,
        project_directory: String,
        locally_filtered_files: Vec<String>
    ) -> FileRelevanceAssessmentPayload {
        info!("Creating FileRelevanceAssessment payload with {} locally filtered files", locally_filtered_files.len());
        
        FileRelevanceAssessmentPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id,
            task_description,
            project_directory,
            locally_filtered_files,
            workflow_id,
        }
    }


    /// Clone filtering payload with new job ID
    pub fn clone_filtering_with_new_job_id(
        original: &LocalFileFilteringPayload
    ) -> LocalFileFilteringPayload {
        LocalFileFilteringPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id: original.session_id.clone(),
            task_description: original.task_description.clone(),
            project_directory: original.project_directory.clone(),
            excluded_paths: original.excluded_paths.clone(),
            regex_patterns: original.regex_patterns.clone(),
            workflow_id: original.workflow_id.clone(),
        }
    }

    /// Clone finder payload with new job ID
    pub fn clone_finder_with_new_job_id(
        original: &ExtendedPathFinderPayload
    ) -> ExtendedPathFinderPayload {
        ExtendedPathFinderPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id: original.session_id.clone(),
            task_description: original.task_description.clone(),
            project_directory: original.project_directory.clone(),
            initial_paths: original.initial_paths.clone(),
            workflow_id: original.workflow_id.clone(),
        }
    }

    /// Clone correction payload with new job ID
    pub fn clone_correction_with_new_job_id(
        original: &ExtendedPathCorrectionPayload
    ) -> ExtendedPathCorrectionPayload {
        ExtendedPathCorrectionPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id: original.session_id.clone(),
            task_description: original.task_description.clone(),
            project_directory: original.project_directory.clone(),
            extended_paths: original.extended_paths.clone(),
            workflow_id: original.workflow_id.clone(),
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
    /// Now allows empty directory_tree for graceful degradation
    pub fn validate_filtering_payload(
        payload: &LocalFileFilteringPayload
    ) -> Result<(), String> {
        if payload.session_id.trim().is_empty() {
            return Err("Session ID cannot be empty".to_string());
        }
        
        // Allow empty directory_tree - payload creation handles this gracefully
        // if payload.directory_tree.trim().is_empty() {
        //     return Err("Directory tree cannot be empty".to_string());
        // }
        
        if payload.workflow_id.trim().is_empty() {
            return Err("Workflow ID cannot be empty".to_string());
        }
        
        
        if payload.regex_patterns.is_empty() {
            warn!("Regex patterns list is empty for LocalFileFilteringPayload");
        }
        
        Ok(())
    }

    /// Validate finder payload
    /// Now allows empty directory_tree for graceful degradation
    pub fn validate_finder_payload(
        payload: &ExtendedPathFinderPayload
    ) -> Result<(), String> {
        if payload.session_id.trim().is_empty() {
            return Err("Session ID cannot be empty".to_string());
        }
        
        // Allow empty directory_tree - payload creation handles this gracefully
        // if payload.directory_tree.trim().is_empty() {
        //     return Err("Directory tree cannot be empty".to_string());
        // }
        
        if payload.workflow_id.trim().is_empty() {
            return Err("Workflow ID cannot be empty".to_string());
        }
        
        
        // Note: initial_paths can be empty for some finder scenarios
        Ok(())
    }

    /// Validate correction payload
    /// Now allows empty data for graceful degradation
    pub fn validate_correction_payload(
        payload: &ExtendedPathCorrectionPayload
    ) -> Result<(), String> {
        if payload.session_id.trim().is_empty() {
            return Err("Session ID cannot be empty".to_string());
        }
        
        // Allow empty directory_tree - payload creation handles this gracefully
        // if payload.directory_tree.trim().is_empty() {
        //     return Err("Directory tree cannot be empty".to_string());
        // }
        
        if payload.workflow_id.trim().is_empty() {
            return Err("Workflow ID cannot be empty".to_string());
        }
        
        
        // Allow empty extended_paths - payload creation provides fallback
        // if payload.extended_paths.is_empty() {
        //     return Err("Extended paths cannot be empty for correction".to_string());
        // }
        
        Ok(())
    }


    /// Extract workflow info from filtering payload
    pub fn extract_filtering_workflow_info(
        payload: &LocalFileFilteringPayload
    ) -> (String, String, String, String) {
        (
            payload.workflow_id.clone(),
            payload.session_id.clone(),
            payload.task_description.clone(),
            payload.project_directory.clone()
        )
    }

    /// Extract workflow info from finder payload
    pub fn extract_finder_workflow_info(
        payload: &ExtendedPathFinderPayload
    ) -> (String, String, String, String) {
        (
            payload.workflow_id.clone(),
            payload.session_id.clone(),
            payload.task_description.clone(),
            payload.project_directory.clone()
        )
    }

    /// Extract workflow info from correction payload
    pub fn extract_correction_workflow_info(
        payload: &ExtendedPathCorrectionPayload
    ) -> (String, String, String, String) {
        (
            payload.workflow_id.clone(),
            payload.session_id.clone(),
            payload.task_description.clone(),
            payload.project_directory.clone()
        )
    }

    /// Extract workflow info from regex generation payload
    pub fn extract_regex_workflow_info(
        payload: &RegexPatternGenerationWorkflowPayload
    ) -> (String, String, String, String) {
        (
            payload.workflow_id.clone(),
            payload.session_id.clone(),
            payload.task_description.clone(),
            payload.project_directory.clone()
        )
    }

    /// Validate regex generation payload
    pub fn validate_regex_generation_payload(
        payload: &RegexPatternGenerationWorkflowPayload
    ) -> Result<(), String> {
        if payload.session_id.trim().is_empty() {
            return Err("Session ID cannot be empty".to_string());
        }
        
        if payload.task_description.trim().is_empty() {
            return Err("Task description cannot be empty".to_string());
        }
        
        if payload.project_directory.trim().is_empty() {
            return Err("Project directory cannot be empty".to_string());
        }
        
        if payload.workflow_id.trim().is_empty() {
            return Err("Workflow ID cannot be empty".to_string());
        }
        
        Ok(())
    }

    /// Clone regex payload with new job ID
    pub fn clone_regex_with_new_job_id(
        original: &RegexPatternGenerationWorkflowPayload
    ) -> RegexPatternGenerationWorkflowPayload {
        RegexPatternGenerationWorkflowPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id: original.session_id.clone(),
            task_description: original.task_description.clone(),
            project_directory: original.project_directory.clone(),
            workflow_id: original.workflow_id.clone(),
        }
    }

    // Model configuration is handled by the job creation system, not payload

    /// Add metadata to regex payload (stored as JSON in the background job)
    pub fn add_metadata_to_regex_payload(
        mut payload: RegexPatternGenerationWorkflowPayload,
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