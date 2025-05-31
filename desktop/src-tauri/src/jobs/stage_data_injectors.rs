use log::{info, debug, warn};
use crate::jobs::types::{
    DirectoryTreeGenerationPayload, LocalFileFilteringPayload,
    ExtendedPathFinderPayload, ExtendedPathCorrectionPayload,
    RegexPatternGenerationWorkflowPayload, PathFinderPayload, PathCorrectionPayload
};
use crate::db_utils::SettingsRepository;
use crate::error::AppResult;
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
    /// Create LocalFileFilteringPayload from RegexPatternGeneration results
    pub async fn create_local_filtering_payload(
        settings_repo: &Arc<SettingsRepository>,
        regex_payload: &RegexPatternGenerationWorkflowPayload,
        regex_patterns: Vec<String>, // Patterns extracted from RegexPatternGeneration job
        next_job_id: String
    ) -> LocalFileFilteringPayload {
        info!("Creating LocalFileFiltering payload from RegexPatternGeneration results");
        
        debug!("Regex workflow_id: {}, next_job_id: {}, patterns_count: {}", 
               regex_payload.workflow_id, next_job_id, regex_patterns.len());
        
        // Get excluded paths from workflow settings
        let excluded_paths_setting = Self::get_workflow_setting(
            settings_repo,
            "FileFinderWorkflow",
            "excludedPaths",
            Some(".git,node_modules,target,dist,build")
        ).await.unwrap_or_else(|| ".git,node_modules,target,dist,build".to_string());
        
        let excluded_paths = Self::parse_excluded_paths(&excluded_paths_setting);
        
        LocalFileFilteringPayload {
            background_job_id: next_job_id.clone(),
            session_id: regex_payload.session_id.clone(),
            task_description: regex_payload.task_description.clone(),
            project_directory: regex_payload.project_directory.clone(),
            directory_tree: regex_payload.directory_tree.clone(), // Passed through from RegexPatternGeneration
            excluded_paths,
            workflow_id: regex_payload.workflow_id.clone(),
            previous_stage_job_id: regex_payload.background_job_id.clone(),
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()), // Pre-generate next stage ID
        }
    }

    /// Create ExtendedPathFinderPayload from LocalFileFiltering results
    pub async fn create_extended_finder_payload(
        settings_repo: &Arc<SettingsRepository>,
        filtering_payload: &LocalFileFilteringPayload,
        filtered_paths: Vec<String>, // Paths extracted from LocalFileFiltering job
        next_job_id: String
    ) -> ExtendedPathFinderPayload {
        info!("Creating ExtendedPathFinder payload from LocalFileFiltering results");
        
        debug!("Filtered paths count: {}, next_job_id: {}", 
               filtered_paths.len(), next_job_id);
        
        // Get model override from workflow settings
        let model_override = Self::get_workflow_setting(
            settings_repo,
            "FileFinderWorkflow",
            "ExtendedPathFinder_model",
            None
        ).await;
        
        // Get max files with content setting
        let max_files_setting = Self::get_workflow_setting(
            settings_repo,
            "FileFinderWorkflow",
            "maxFilesWithContent",
            Some("50")
        ).await.unwrap_or_else(|| "50".to_string());
        
        let _max_files_with_content = Self::parse_max_files(&max_files_setting, 50);
        
        ExtendedPathFinderPayload {
            background_job_id: next_job_id.clone(),
            session_id: filtering_payload.session_id.clone(),
            task_description: filtering_payload.task_description.clone(),
            project_directory: filtering_payload.project_directory.clone(),
            directory_tree: filtering_payload.directory_tree.clone(), // Passed through from LocalFileFiltering
            initial_paths: filtered_paths, // Filtered paths from LocalFileFiltering
            workflow_id: filtering_payload.workflow_id.clone(),
            previous_stage_job_id: filtering_payload.background_job_id.clone(),
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()), // Pre-generate next stage ID
            model_override,
            temperature_override: None, // Could be extended to support temperature settings
            max_tokens_override: None,  // Could be extended to support token settings
        }
    }

    /// Create PathFinderPayload from LocalFileFiltering results
    pub async fn create_initial_path_finder_payload(
        settings_repo: &Arc<SettingsRepository>,
        filtering_payload: &LocalFileFilteringPayload,
        filtered_paths: Vec<String>,
        next_job_id: String
    ) -> PathFinderPayload {
        info!("Creating InitialPathFinder payload from LocalFileFiltering results");
        
        debug!("Filtered paths count: {}, next_job_id: {}", 
               filtered_paths.len(), next_job_id);
        
        // Get model override from workflow settings
        let model_override = Self::get_workflow_setting(
            settings_repo,
            "FileFinderWorkflow",
            "InitialPathFinder_model",
            None
        ).await;
        
        PathFinderPayload {
            session_id: filtering_payload.session_id.clone(),
            task_description: filtering_payload.task_description.clone(),
            background_job_id: next_job_id.clone(),
            project_directory: filtering_payload.project_directory.clone(),
            model_override,
            system_prompt: "You are a file path finder assistant. Help identify relevant files.".to_string(),
            temperature: 0.5,
            max_output_tokens: Some(4000),
            directory_tree: Some(filtering_payload.directory_tree.clone()),
            relevant_file_contents: std::collections::HashMap::new(),
            estimated_input_tokens: None,
            options: Default::default(), // Assuming PathFinderOptions has Default
        }
    }

    /// Create PathCorrectionPayload from PathFinder results
    pub async fn create_initial_path_correction_payload(
        settings_repo: &Arc<SettingsRepository>,
        finder_payload: &PathFinderPayload,
        initial_paths: Vec<String>
    ) -> PathCorrectionPayload {
        info!("Creating InitialPathCorrection payload from PathFinder results");
        
        debug!("Initial paths count: {}", initial_paths.len());
        
        // Get model override from workflow settings
        let model_override = Self::get_workflow_setting(
            settings_repo,
            "FileFinderWorkflow", 
            "InitialPathCorrection_model",
            None
        ).await;
        
        PathCorrectionPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id: finder_payload.session_id.clone(),
            paths_to_correct: initial_paths.join("\n"),
            context_description: finder_payload.task_description.clone(),
            directory_tree: finder_payload.directory_tree.clone(),
            system_prompt_override: None,
            model_override: model_override.or(finder_payload.model_override.clone()),
            temperature: Some(finder_payload.temperature),
            max_output_tokens: finder_payload.max_output_tokens,
        }
    }

    /// Create ExtendedPathCorrectionPayload from ExtendedPathFinder results
    pub fn create_path_correction_payload(
        finder_payload: &ExtendedPathFinderPayload,
        extended_paths: Vec<String> // Paths extracted from ExtendedPathFinder job
    ) -> ExtendedPathCorrectionPayload {
        info!("Creating ExtendedPathCorrection payload from ExtendedPathFinder results");
        
        debug!("Extended paths count: {}", extended_paths.len());
        
        ExtendedPathCorrectionPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id: finder_payload.session_id.clone(),
            task_description: finder_payload.task_description.clone(),
            project_directory: finder_payload.project_directory.clone(),
            directory_tree: finder_payload.directory_tree.clone(), // Passed through from ExtendedPathFinder
            extended_paths, // Extended paths from ExtendedPathFinder
            workflow_id: finder_payload.workflow_id.clone(),
            previous_stage_job_id: finder_payload.background_job_id.clone(),
            model_override: finder_payload.model_override.clone(),
            temperature_override: finder_payload.temperature_override,
            max_tokens_override: finder_payload.max_tokens_override,
        }
    }

    /// Create RegexPatternGenerationWorkflowPayload from DirectoryTreeGeneration results
    pub fn create_regex_generation_payload(
        base_payload: &DirectoryTreeGenerationPayload,
        directory_tree: String, // Directory tree extracted from DirectoryTreeGeneration job
        next_job_id: String
    ) -> RegexPatternGenerationWorkflowPayload {
        info!("Creating RegexPatternGeneration payload from DirectoryTreeGeneration results");
        
        debug!("Base workflow_id: {}, next_job_id: {}", 
               base_payload.workflow_id, next_job_id);
        
        RegexPatternGenerationWorkflowPayload {
            background_job_id: next_job_id.clone(),
            session_id: base_payload.session_id.clone(),
            task_description: base_payload.task_description.clone(),
            project_directory: base_payload.project_directory.clone(),
            directory_tree, // Raw directory tree string from DirectoryTreeGeneration
            workflow_id: base_payload.workflow_id.clone(),
            previous_stage_job_id: Some(base_payload.background_job_id.clone()),
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()), // Pre-generate next stage ID
            model_override: None,       // Use default model
            temperature_override: None, // Use default temperature
            max_tokens_override: None,  // Use default max tokens
        }
    }

    /// Create DirectoryTreeGeneration payload for starting a new workflow
    pub fn create_directory_tree_payload(
        session_id: String,
        task_description: String,
        project_directory: String,
        excluded_paths: Vec<String>,
        workflow_id: Option<String>
    ) -> DirectoryTreeGenerationPayload {
        info!("Creating DirectoryTreeGeneration payload for new workflow");
        
        let workflow_id = workflow_id.unwrap_or_else(|| {
            format!("workflow_{}", uuid::Uuid::new_v4())
        });
        
        debug!("New workflow_id: {}, project_directory: {}", 
               workflow_id, project_directory);
        
        DirectoryTreeGenerationPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id,
            task_description,
            project_directory,
            excluded_paths,
            workflow_id,
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()),
        }
    }

    /// Update payload with specific model configuration
    pub fn with_model_config(
        mut payload: ExtendedPathFinderPayload,
        model_override: Option<String>,
        temperature_override: Option<f32>,
        max_tokens_override: Option<u32>
    ) -> ExtendedPathFinderPayload {
        payload.model_override = model_override;
        payload.temperature_override = temperature_override;
        payload.max_tokens_override = max_tokens_override;
        payload
    }

    /// Update correction payload with specific model configuration
    pub fn with_correction_model_config(
        mut payload: ExtendedPathCorrectionPayload,
        model_override: Option<String>,
        temperature_override: Option<f32>,
        max_tokens_override: Option<u32>
    ) -> ExtendedPathCorrectionPayload {
        payload.model_override = model_override;
        payload.temperature_override = temperature_override;
        payload.max_tokens_override = max_tokens_override;
        payload
    }

    /// Clone payload with new job ID (for retry scenarios)
    pub fn clone_with_new_job_id(
        original: &DirectoryTreeGenerationPayload
    ) -> DirectoryTreeGenerationPayload {
        DirectoryTreeGenerationPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id: original.session_id.clone(),
            task_description: original.task_description.clone(),
            project_directory: original.project_directory.clone(),
            excluded_paths: original.excluded_paths.clone(),
            workflow_id: original.workflow_id.clone(),
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()),
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
            directory_tree: original.directory_tree.clone(),
            excluded_paths: original.excluded_paths.clone(),
            workflow_id: original.workflow_id.clone(),
            previous_stage_job_id: original.previous_stage_job_id.clone(),
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()),
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
            directory_tree: original.directory_tree.clone(),
            initial_paths: original.initial_paths.clone(),
            workflow_id: original.workflow_id.clone(),
            previous_stage_job_id: original.previous_stage_job_id.clone(),
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()),
            model_override: original.model_override.clone(),
            temperature_override: original.temperature_override,
            max_tokens_override: original.max_tokens_override,
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
            directory_tree: original.directory_tree.clone(),
            extended_paths: original.extended_paths.clone(),
            workflow_id: original.workflow_id.clone(),
            previous_stage_job_id: original.previous_stage_job_id.clone(),
            model_override: original.model_override.clone(),
            temperature_override: original.temperature_override,
            max_tokens_override: original.max_tokens_override,
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

    /// Add metadata to payload (stored as JSON in the background job)
    pub fn add_metadata_to_directory_payload(
        mut payload: DirectoryTreeGenerationPayload,
        metadata_key: &str,
        metadata_value: serde_json::Value
    ) -> (DirectoryTreeGenerationPayload, serde_json::Value) {
        let metadata = serde_json::json!({
            metadata_key: metadata_value,
            "workflow_stage": "DirectoryTreeGeneration",
            "created_at": chrono::Utc::now().timestamp_millis()
        });
        
        (payload, metadata)
    }

    /// Validate payload before injection
    pub fn validate_directory_tree_payload(
        payload: &DirectoryTreeGenerationPayload
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

    /// Validate filtering payload
    pub fn validate_filtering_payload(
        payload: &LocalFileFilteringPayload
    ) -> Result<(), String> {
        if payload.session_id.trim().is_empty() {
            return Err("Session ID cannot be empty".to_string());
        }
        
        if payload.directory_tree.trim().is_empty() {
            return Err("Directory tree cannot be empty".to_string());
        }
        
        if payload.workflow_id.trim().is_empty() {
            return Err("Workflow ID cannot be empty".to_string());
        }
        
        if payload.previous_stage_job_id.trim().is_empty() {
            return Err("Previous stage job ID cannot be empty".to_string());
        }
        
        Ok(())
    }

    /// Validate finder payload
    pub fn validate_finder_payload(
        payload: &ExtendedPathFinderPayload
    ) -> Result<(), String> {
        if payload.session_id.trim().is_empty() {
            return Err("Session ID cannot be empty".to_string());
        }
        
        if payload.directory_tree.trim().is_empty() {
            return Err("Directory tree cannot be empty".to_string());
        }
        
        if payload.workflow_id.trim().is_empty() {
            return Err("Workflow ID cannot be empty".to_string());
        }
        
        if payload.previous_stage_job_id.trim().is_empty() {
            return Err("Previous stage job ID cannot be empty".to_string());
        }
        
        // Note: initial_paths can be empty for some finder scenarios
        Ok(())
    }

    /// Validate correction payload
    pub fn validate_correction_payload(
        payload: &ExtendedPathCorrectionPayload
    ) -> Result<(), String> {
        if payload.session_id.trim().is_empty() {
            return Err("Session ID cannot be empty".to_string());
        }
        
        if payload.directory_tree.trim().is_empty() {
            return Err("Directory tree cannot be empty".to_string());
        }
        
        if payload.workflow_id.trim().is_empty() {
            return Err("Workflow ID cannot be empty".to_string());
        }
        
        if payload.previous_stage_job_id.trim().is_empty() {
            return Err("Previous stage job ID cannot be empty".to_string());
        }
        
        if payload.extended_paths.is_empty() {
            return Err("Extended paths cannot be empty for correction".to_string());
        }
        
        Ok(())
    }

    /// Create a minimal payload for testing/fallback scenarios
    pub fn create_minimal_directory_payload(
        session_id: String,
        project_directory: String
    ) -> DirectoryTreeGenerationPayload {
        DirectoryTreeGenerationPayload {
            background_job_id: uuid::Uuid::new_v4().to_string(),
            session_id,
            task_description: "File finder workflow".to_string(),
            project_directory,
            excluded_paths: vec![
                "node_modules".to_string(),
                ".git".to_string(),
                "target".to_string(),
                "dist".to_string(),
                "build".to_string()
            ],
            workflow_id: format!("workflow_{}", uuid::Uuid::new_v4()),
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()),
        }
    }

    /// Extract common workflow information from any payload
    pub fn extract_workflow_info(
        payload: &DirectoryTreeGenerationPayload
    ) -> (String, String, String, String) {
        (
            payload.workflow_id.clone(),
            payload.session_id.clone(),
            payload.task_description.clone(),
            payload.project_directory.clone()
        )
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
        
        if payload.directory_tree.trim().is_empty() {
            return Err("Directory tree cannot be empty".to_string());
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
            directory_tree: original.directory_tree.clone(),
            workflow_id: original.workflow_id.clone(),
            previous_stage_job_id: original.previous_stage_job_id.clone(),
            next_stage_job_id: Some(uuid::Uuid::new_v4().to_string()),
            model_override: original.model_override.clone(),
            temperature_override: original.temperature_override,
            max_tokens_override: original.max_tokens_override,
        }
    }

    /// Update regex payload with specific model configuration
    pub fn with_regex_model_config(
        mut payload: RegexPatternGenerationWorkflowPayload,
        model_override: Option<String>,
        temperature_override: Option<f32>,
        max_tokens_override: Option<u32>
    ) -> RegexPatternGenerationWorkflowPayload {
        payload.model_override = model_override;
        payload.temperature_override = temperature_override;
        payload.max_tokens_override = max_tokens_override;
        payload
    }

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