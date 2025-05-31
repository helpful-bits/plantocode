use tauri::{command, AppHandle, Manager, Emitter};
use log::{debug, error, info, warn};
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use std::path::Path;
use std::str::FromStr;
use std::collections::HashMap;
use regex::Regex;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::error::{AppError, AppResult};
use crate::models::{TaskType, OpenRouterRequestMessage, OpenRouterContent, JobCommandResponse};
use crate::db_utils::{SessionRepository, SettingsRepository, BackgroundJobRepository};
use crate::utils::{directory_tree::{generate_directory_tree, DirectoryTreeOptions}};
use crate::utils::unified_prompt_system::{UnifiedPromptProcessor, UnifiedPromptContextBuilder, ComposedPrompt as UnifiedComposedPrompt};
use crate::utils::{fs_utils, path_utils};
use crate::constants::EXCLUDED_DIRS_FOR_SCAN;
use crate::api_clients::client_trait::ApiClientOptions;
use crate::jobs::workflow_orchestrator::get_workflow_orchestrator;
use crate::jobs::workflow_types::{WorkflowStatus, WorkflowStage};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFinderWorkflowArgs {
    pub session_id: String,
    pub task_description: String,
    pub project_directory: String,
    pub excluded_paths: Option<Vec<String>>,
    pub timeout_ms: Option<u64>,
}

// New response types for workflow commands
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowCommandResponse {
    pub workflow_id: String,
    pub first_stage_job_id: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageStatus {
    pub stage_name: String,
    pub job_id: Option<String>, // Must be populated from WorkflowStageJob.job_id
    pub status: String,
    pub progress_percentage: f32,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub depends_on: Option<String>,
    pub created_at: Option<String>,
    pub error_message: Option<String>,
    pub execution_time_ms: Option<i64>,
    pub sub_status_message: Option<String>, // Detailed stage progress message
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStatusResponse {
    pub workflow_id: String,
    pub status: String,
    pub progress_percentage: f32,
    pub current_stage: String,
    pub stage_statuses: Vec<StageStatus>,
    pub error_message: Option<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub total_execution_time_ms: Option<i64>,
    pub session_id: Option<String>,
    pub task_description: Option<String>,
    pub project_directory: Option<String>,
    pub excluded_paths: Option<Vec<String>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowResultsResponse {
    pub workflow_id: String,
    pub final_paths: Vec<String>,
    pub stage_results: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowProgress {
    pub workflow_id: String,
    pub stage: String,
    pub status: String,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

// WorkflowStage enum is now imported from workflow_types module

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFinderWorkflowResult {
    pub success: bool,
    pub selected_files: Vec<String>,
    pub intermediate_data: WorkflowIntermediateData,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowIntermediateData {
    pub directory_tree_content: Option<String>,
    pub raw_regex_patterns: Option<serde_json::Value>,
    pub locally_filtered_files: Vec<String>,
    pub initial_verified_paths: Vec<String>,
    pub initial_unverified_paths: Vec<String>,
    pub initial_corrected_paths: Vec<String>,
    pub extended_verified_paths: Vec<String>,
    pub extended_unverified_paths: Vec<String>,
    pub extended_corrected_paths: Vec<String>,
}

// emit_progress_event function removed - WorkflowOrchestrator handles event emission

// NOTE: The internal workflow functions have been removed as they are now handled 
// by individual stage processors managed by the WorkflowOrchestrator. 
// The file finder workflow now uses a distributed approach where each stage 
// runs as a separate background job, coordinated by the orchestrator.

pub async fn generate_directory_tree_internal(project_directory: &str) -> AppResult<String> {
    let options = DirectoryTreeOptions {
        max_depth: None,
        include_ignored: false,
        respect_gitignore: true,
        exclude_patterns: Some(EXCLUDED_DIRS_FOR_SCAN.iter().map(|&s| s.to_string()).collect()),
        include_files: true,
        include_dirs: true,
        include_hidden: false,
    };
    let path = Path::new(project_directory);
    generate_directory_tree(path, options).await
}

pub async fn generate_regex_patterns_internal(
    session_id: &str,
    project_directory: &str,
    task_description: &str,
    directory_tree: &str,
    app_handle: &AppHandle
) -> AppResult<serde_json::Value> {
    info!("Generating regex patterns for task description");
    
    // Get model configuration
    let model = crate::config::get_model_for_task_with_project(TaskType::RegexPatternGeneration, project_directory, app_handle).await?;
    let temperature = crate::config::get_temperature_for_task_with_project(TaskType::RegexPatternGeneration, project_directory, app_handle).await?;
    let max_tokens = crate::config::get_max_tokens_for_task_with_project(TaskType::RegexPatternGeneration, project_directory, app_handle).await?;
    
    // Get settings repository for UnifiedPromptProcessor
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create unified prompt context
    let context = UnifiedPromptContextBuilder::new(
        session_id.to_string(),
        TaskType::RegexPatternGeneration,
        task_description.to_string(),
    )
    .project_directory(Some(project_directory.to_string()))
    .codebase_structure(Some(directory_tree.to_string()))
    .build();

    // Use UnifiedPromptProcessor to generate the complete prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &settings_repo)
        .await?;

    // Get LLM client
    let llm_client = crate::api_clients::client_factory::get_api_client(app_handle)?;
    
    // Create messages for the LLM
    let messages = vec![
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: composed_prompt.final_prompt,
            }],
        },
    ];
    
    // Create API client options
    let api_options = ApiClientOptions {
        model: model.clone(),
        max_tokens: max_tokens,
        temperature: temperature,
        stream: false,
    };
    
    // Call LLM
    info!("Calling LLM for regex pattern generation with model {}", &model);
    let llm_response = llm_client.chat_completion(messages, api_options).await?;
    
    // Extract the response content
    let response_content = llm_response.choices[0].message.content.clone();
    debug!("LLM response content: {}", response_content);
    
    // Attempt to parse the content as JSON
    match serde_json::from_str::<serde_json::Value>(&response_content) {
        Ok(parsed_json) => {
            debug!("Successfully parsed JSON response");
            Ok(parsed_json)
        },
        Err(e) => {
            warn!("Failed to parse LLM response as JSON: {}. Using fallback patterns.", e);
            // Return default empty patterns
            Ok(serde_json::json!({
                "titleRegex": "",
                "contentRegex": "",
                "negativeTitleRegex": "",
                "negativeContentRegex": ""
            }))
        }
    }
}

pub async fn perform_local_filtering_internal(
    regex_patterns: &serde_json::Value,
    project_directory: &str
) -> AppResult<Vec<String>> {
    info!("Performing local filtering with regex patterns");
    
    // Get project files
    let project_dir_path = Path::new(project_directory);
    let file_entries = fs_utils::list_directory(project_dir_path).await?;
    
    let mut matching_paths = Vec::new();
    
    // Extract regex patterns from JSON
    let title_regex = regex_patterns.get("titleRegex")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let negative_title_regex = regex_patterns.get("negativeTitleRegex")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    
    for entry in file_entries {
        if entry.is_dir {
            continue;
        }
        
        // Make path relative to project directory
        let relative_path = match Path::new(&entry.path).strip_prefix(project_dir_path) {
            Ok(rel_path) => rel_path.to_string_lossy().to_string(),
            Err(_) => continue,
        };
        
        let mut is_match = false;
        
        // Apply positive title regex
        if !title_regex.is_empty() {
            match Regex::new(title_regex) {
                Ok(regex) => {
                    is_match = regex.is_match(&relative_path);
                },
                Err(_) => {
                    // Fallback to string contains
                    is_match = relative_path.to_lowercase().contains(&title_regex.to_lowercase());
                }
            }
        } else {
            // If no positive regex, include all files by default
            is_match = true;
        }
        
        // Apply negative title regex (exclusion)
        if is_match && !negative_title_regex.is_empty() {
            match Regex::new(negative_title_regex) {
                Ok(negative_regex) => {
                    if negative_regex.is_match(&relative_path) {
                        is_match = false;
                    }
                },
                Err(_) => {
                    // Fallback to string contains
                    if relative_path.to_lowercase().contains(&negative_title_regex.to_lowercase()) {
                        is_match = false;
                    }
                }
            }
        }
        
        if is_match {
            matching_paths.push(relative_path);
        }
    }
    
    info!("Local filtering found {} matching files", matching_paths.len());
    Ok(matching_paths)
}

async fn run_path_finder_internal(
    session_id: &str,
    project_directory: &str,
    task_description: &str,
    directory_tree: &str,
    included_files: &[String],
    excluded_files: &[String],
    task_type: TaskType,
    app_handle: &AppHandle
) -> AppResult<(Vec<String>, Vec<String>)> {
    info!("Running path finder with {} included files", included_files.len());
    
    // Get model configuration
    let model = crate::config::get_model_for_task_with_project(task_type, project_directory, app_handle).await?;
    let temperature = crate::config::get_temperature_for_task_with_project(task_type, project_directory, app_handle).await?;
    let max_tokens = crate::config::get_max_tokens_for_task_with_project(task_type, project_directory, app_handle).await?;
    
    // Get settings repository for UnifiedPromptProcessor
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create unified prompt context
    let context = UnifiedPromptContextBuilder::new(
        session_id.to_string(),
        task_type,
        task_description.to_string(),
    )
    .project_directory(Some(project_directory.to_string()))
    .codebase_structure(Some(directory_tree.to_string()))
    .build();

    // Use UnifiedPromptProcessor to generate the complete prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &settings_repo)
        .await?;

    // Extract system and user prompts from the composed result
    let parts: Vec<&str> = composed_prompt.final_prompt.splitn(2, "\n\n").collect();
    let system_prompt = parts.get(0).unwrap_or(&"").to_string();
    let user_prompt = parts.get(1).unwrap_or(&"").to_string();

    // Get LLM client
    let llm_client = crate::api_clients::client_factory::get_api_client(app_handle)?;
    
    // Create messages for the LLM
    let messages = vec![
        OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: system_prompt,
            }],
        },
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: user_prompt,
            }],
        },
    ];
    
    // Create API client options
    let api_options = ApiClientOptions {
        model: model.clone(),
        max_tokens: max_tokens,
        temperature: temperature,
        stream: false,
    };
    
    // Call LLM
    info!("Calling LLM for path finding with model {}", &model);
    let llm_response = llm_client.chat_completion(messages, api_options).await?;
    
    // Extract the response content
    let response_content = llm_response.choices[0].message.content.clone();
    
    // Parse paths from the LLM response
    let raw_paths = parse_paths_from_text_response(&response_content, project_directory)?;
    
    // Validate paths against the file system
    info!("Validating {} parsed paths against filesystem...", raw_paths.len());
    let mut validated_paths = Vec::new();
    let mut unverified_paths = Vec::new();

    for relative_path in raw_paths {
        // Construct absolute path
        let absolute_path = Path::new(project_directory).join(&relative_path);
        
        // Check if file exists and is a file
        match tokio::fs::metadata(&absolute_path).await {
            Ok(metadata) if metadata.is_file() => {
                validated_paths.push(relative_path);
            },
            _ => {
                debug!("Path doesn't exist or isn't a regular file: {}", absolute_path.display());
                unverified_paths.push(relative_path);
            }
        }
    }
    
    info!("Path finder found {} verified and {} unverified paths", validated_paths.len(), unverified_paths.len());
    Ok((validated_paths, unverified_paths))
}

pub async fn run_initial_path_finder_internal(
    session_id: &str,
    project_directory: &str,
    task_description: &str,
    directory_tree: &str,
    included_files: &[String],
    excluded_files: &[String],
    app_handle: &AppHandle
) -> AppResult<(Vec<String>, Vec<String>)> {
    run_path_finder_internal(
        session_id,
        project_directory,
        task_description,
        directory_tree,
        included_files,
        excluded_files,
        TaskType::PathFinder,
        app_handle
    ).await
}

pub async fn run_extended_path_finder_internal(
    session_id: &str,
    project_directory: &str,
    task_description: &str,
    directory_tree: &str,
    current_verified: &[String],
    excluded_files: &[String],
    app_handle: &AppHandle
) -> AppResult<(Vec<String>, Vec<String>)> {
    run_path_finder_internal(
        session_id,
        project_directory,
        task_description,
        directory_tree,
        current_verified,
        excluded_files,
        TaskType::PathFinder,
        app_handle
    ).await
}

pub async fn run_path_correction_internal(
    session_id: &str,
    project_directory: &str,
    paths_to_correct: &[String],
    task_description: &str,
    directory_tree: &str,
    app_handle: &AppHandle
) -> AppResult<Vec<String>> {
    if paths_to_correct.is_empty() {
        return Ok(vec![]);
    }
    
    info!("Running path correction for {} paths", paths_to_correct.len());
    
    // Get model configuration
    let model = crate::config::get_model_for_task_with_project(TaskType::PathCorrection, project_directory, app_handle).await?;
    let temperature = crate::config::get_temperature_for_task_with_project(TaskType::PathCorrection, project_directory, app_handle).await?;
    let max_tokens = crate::config::get_max_tokens_for_task_with_project(TaskType::PathCorrection, project_directory, app_handle).await?;
    
    // Get settings repository for UnifiedPromptProcessor
    let settings_repo = app_handle.state::<Arc<SettingsRepository>>().inner().clone();
    
    // Create unified prompt context with paths as task description
    let paths_description = paths_to_correct.join("\n");
    let context = UnifiedPromptContextBuilder::new(
        session_id.to_string(),
        TaskType::PathCorrection,
        paths_description.clone(),
    )
    .project_directory(Some(project_directory.to_string()))
    .codebase_structure(Some(directory_tree.to_string()))
    .build();

    // Use UnifiedPromptProcessor to generate the complete prompt
    let prompt_processor = UnifiedPromptProcessor::new();
    let composed_prompt = prompt_processor
        .compose_prompt(&context, &settings_repo)
        .await?;

    // Extract system and user prompts from the composed result
    let parts: Vec<&str> = composed_prompt.final_prompt.splitn(2, "\n\n").collect();
    let system_prompt = parts.get(0).unwrap_or(&"").to_string();
    let user_prompt = parts.get(1).unwrap_or(&"").to_string();

    // Get LLM client
    let llm_client = crate::api_clients::client_factory::get_api_client(app_handle)?;
    
    // Create messages for the LLM
    let messages = vec![
        OpenRouterRequestMessage {
            role: "system".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: system_prompt,
            }],
        },
        OpenRouterRequestMessage {
            role: "user".to_string(),
            content: vec![OpenRouterContent::Text {
                content_type: "text".to_string(),
                text: user_prompt,
            }],
        },
    ];
    
    // Create API client options
    let api_options = ApiClientOptions {
        model: model.clone(),
        max_tokens: max_tokens,
        temperature: temperature,
        stream: false,
    };
    
    // Call LLM
    info!("Calling LLM for path correction with model {}", &model);
    let llm_response = llm_client.chat_completion(messages, api_options).await?;
    
    // Extract the response content
    let response_content = llm_response.choices[0].message.content.clone();
    
    // Parse corrected paths from XML response
    let corrected_paths = parse_corrected_paths_from_xml(&response_content)?;
    
    info!("Path correction returned {} corrected paths", corrected_paths.len());
    Ok(corrected_paths)
}

// Helper function to parse paths from simple text response (one path per line)
fn parse_paths_from_text_response(response_text: &str, project_directory: &str) -> AppResult<Vec<String>> {
    debug!("Parsing paths from text response");
    let mut paths = Vec::new();
    
    // Split by newlines and process each line
    for line in response_text.lines() {
        let line = line.trim();
        
        // Filter out empty lines or lines that are clearly not paths
        if line.is_empty() || 
           line.starts_with("//") || 
           line.starts_with("#") ||
           line.starts_with("Note:") ||
           line.starts_with("Analysis:") ||
           line.len() < 2 {
            continue;
        }
        
        // Clean the line of potential prefixes/suffixes
        let cleaned_path = line
            .trim_matches(|c| c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == '-' || c == '*')
            .trim();
        
        if cleaned_path.is_empty() {
            continue;
        }
        
        // Normalize the path and make it relative to project directory
        let normalized_path = if Path::new(cleaned_path).is_absolute() {
            match path_utils::make_relative_to(cleaned_path, project_directory) {
                Ok(rel_path) => rel_path.to_string_lossy().to_string(),
                Err(e) => {
                    debug!("Failed to make path relative, skipping: {} - {}", cleaned_path, e);
                    continue;
                }
            }
        } else {
            // Normalize relative path
            let normalized = path_utils::normalize_path(cleaned_path);
            normalized.to_string_lossy().to_string()
        };
        
        paths.push(normalized_path);
    }
    
    // Remove duplicates while preserving order
    let mut unique_paths = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in paths {
        if seen.insert(path.clone()) {
            unique_paths.push(path);
        }
    }
    
    Ok(unique_paths)
}

// Helper function to parse corrected paths from XML response
fn parse_corrected_paths_from_xml(xml_response: &str) -> AppResult<Vec<String>> {
    // Extract corrected paths using regex
    let path_regex = Regex::new(r#"<path[^>]+original="([^"]*)"[^>]+corrected="([^"]*)"[^>]*>([^<]*)</path>"#)
        .map_err(|e| AppError::JobError(format!("Failed to create regex: {}", e)))?;
    
    let mut corrected_paths = Vec::new();
    
    for captures in path_regex.captures_iter(xml_response) {
        let corrected = captures.get(2).map_or("", |m| m.as_str()).trim();
        if !corrected.is_empty() {
            corrected_paths.push(corrected.to_string());
        }
    }
    
    // If no paths were found, try fallback parsing
    if corrected_paths.is_empty() {
        // Look for any corrected="..." attributes
        let fallback_regex = Regex::new(r#"corrected="([^"]*)""#)
            .map_err(|e| AppError::JobError(format!("Failed to create fallback regex: {}", e)))?;
        
        for captures in fallback_regex.captures_iter(xml_response) {
            if let Some(corrected) = captures.get(1) {
                let path = corrected.as_str().trim();
                if !path.is_empty() {
                    corrected_paths.push(path.to_string());
                }
            }
        }
    }
    
    Ok(corrected_paths)
}

/// Start a new file finder workflow using WorkflowOrchestrator
#[command]
pub async fn start_file_finder_workflow(
    session_id: String,
    task_description: String,
    project_directory: String,
    excluded_paths: Vec<String>,
    timeout_ms: Option<u64>,
    app_handle: AppHandle
) -> Result<WorkflowCommandResponse, String> {
    info!("Starting file finder workflow for task: {}", task_description);
    
    // Validate required fields
    if session_id.is_empty() {
        return Err("Session ID is required".to_string());
    }
    
    if task_description.trim().len() < 10 {
        return Err("Task description must be at least 10 characters".to_string());
    }
    
    if project_directory.is_empty() {
        return Err("Project directory is required".to_string());
    }
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Start the workflow via the orchestrator using the FileFinderWorkflow definition
    let workflow_id = orchestrator.start_workflow(
        "FileFinderWorkflow".to_string(),
        session_id,
        task_description,
        project_directory,
        excluded_paths,
        timeout_ms
    ).await.map_err(|e| format!("Failed to start workflow: {}", e))?;
    
    info!("Started file finder workflow: {}", workflow_id);
    
    Ok(WorkflowCommandResponse {
        workflow_id: workflow_id.clone(),
        first_stage_job_id: "N/A".to_string(), // Orchestrator manages job IDs internally
        status: "started".to_string(),
    })
}

/// Get workflow status and progress using WorkflowOrchestrator
#[command]
pub async fn get_file_finder_workflow_status(
    workflow_id: String,
    app_handle: AppHandle
) -> Result<WorkflowStatusResponse, String> {
    info!("Getting workflow status for: {}", workflow_id);
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Get workflow state from orchestrator
    let workflow_state = orchestrator.get_workflow_status(&workflow_id).await
        .map_err(|e| format!("Failed to get workflow status: {}", e))?;
    
    // Convert workflow state to response format
    let mut stage_statuses = Vec::new();
    let all_stages = WorkflowStage::all_stages();
    
    for stage in &all_stages {
        let stage_job = workflow_state.get_stage_job_by_stage(stage);
        
        let stage_status = if let Some(job) = stage_job {
            let progress = match job.status {
                crate::models::JobStatus::Completed => 100.0,
                crate::models::JobStatus::Failed => 0.0,
                crate::models::JobStatus::Running | crate::models::JobStatus::ProcessingStream => 50.0,
                _ => 0.0,
            };
            
            StageStatus {
                stage_name: stage.display_name().to_string(),
                job_id: Some(job.job_id.clone()), // Correctly populated from WorkflowStageJob.job_id
                status: job.status.to_string(),
                progress_percentage: progress,
                started_at: job.started_at.map(|t| t.to_string()),
                completed_at: job.completed_at.map(|t| t.to_string()),
                depends_on: job.depends_on.clone(),
                created_at: Some(job.created_at.to_string()),
                error_message: job.error_message.clone(),
                execution_time_ms: job.completed_at.and_then(|completed| 
                    job.started_at.map(|started| (completed - started))
                ),
                sub_status_message: job.sub_status_message.clone(),
            }
        } else {
            StageStatus {
                stage_name: stage.display_name().to_string(),
                job_id: None, // No job created yet for pending stages
                status: "pending".to_string(),
                progress_percentage: 0.0,
                started_at: None,
                completed_at: None,
                depends_on: None,
                created_at: None,
                error_message: None,
                execution_time_ms: None,
                sub_status_message: None,
            }
        };
        
        stage_statuses.push(stage_status);
    }
    
    // Calculate overall progress
    let progress = workflow_state.calculate_progress();
    
    // Get current stage
    let current_stage = workflow_state.current_stage()
        .map(|stage_job| stage_job.stage.display_name().to_string())
        .unwrap_or_else(|| {
            match workflow_state.status {
                WorkflowStatus::Completed => "Completed".to_string(),
                WorkflowStatus::Failed => "Failed".to_string(),
                WorkflowStatus::Canceled => "Canceled".to_string(),
                WorkflowStatus::Paused => "Paused".to_string(),
                _ => "Unknown".to_string(),
            }
        });
    
    let status = match workflow_state.status {
        WorkflowStatus::Running => "running".to_string(),
        WorkflowStatus::Paused => "paused".to_string(),
        WorkflowStatus::Completed => "completed".to_string(),
        WorkflowStatus::Failed => "failed".to_string(),
        WorkflowStatus::Canceled => "canceled".to_string(),
        WorkflowStatus::Created => "created".to_string(),
    };
    
    Ok(WorkflowStatusResponse {
        workflow_id,
        status,
        progress_percentage: progress,
        current_stage,
        stage_statuses,
        error_message: workflow_state.error_message.clone(),
        created_at: Some(workflow_state.created_at),
        updated_at: Some(workflow_state.updated_at),
        completed_at: workflow_state.completed_at,
        total_execution_time_ms: workflow_state.completed_at
            .map(|completed| completed - workflow_state.created_at),
        session_id: Some(workflow_state.session_id.clone()),
        task_description: Some(workflow_state.task_description.clone()),
        project_directory: Some(workflow_state.project_directory.clone()),
        excluded_paths: Some(workflow_state.excluded_paths.clone()),
        timeout_ms: workflow_state.timeout_ms,
    })
}

/// Cancel entire workflow using WorkflowOrchestrator
#[command]
pub async fn cancel_file_finder_workflow(
    workflow_id: String,
    app_handle: AppHandle
) -> Result<(), String> {
    info!("Cancelling workflow: {}", workflow_id);
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Cancel the workflow via the orchestrator
    orchestrator.cancel_workflow(&workflow_id).await
        .map_err(|e| format!("Failed to cancel workflow: {}", e))?;
    
    info!("Successfully cancelled workflow: {}", workflow_id);
    Ok(())
}

/// Pause a workflow - prevents new stages from starting
#[command]
pub async fn pause_file_finder_workflow(
    workflow_id: String,
    app_handle: AppHandle
) -> Result<(), String> {
    info!("Pausing workflow: {}", workflow_id);
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Pause the workflow via the orchestrator
    orchestrator.pause_workflow(&workflow_id).await
        .map_err(|e| format!("Failed to pause workflow: {}", e))?;
    
    info!("Successfully paused workflow: {}", workflow_id);
    Ok(())
}

/// Resume a paused workflow - allows new stages to start
#[command]
pub async fn resume_file_finder_workflow(
    workflow_id: String,
    app_handle: AppHandle
) -> Result<(), String> {
    info!("Resuming workflow: {}", workflow_id);
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Resume the workflow via the orchestrator
    orchestrator.resume_workflow(&workflow_id).await
        .map_err(|e| format!("Failed to resume workflow: {}", e))?;
    
    info!("Successfully resumed workflow: {}", workflow_id);
    Ok(())
}

/// Get final workflow results using WorkflowOrchestrator
#[command]
pub async fn get_file_finder_workflow_results(
    workflow_id: String,
    app_handle: AppHandle
) -> Result<WorkflowResultsResponse, String> {
    info!("Getting workflow results for: {}", workflow_id);
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Get workflow results from orchestrator
    let workflow_result = orchestrator.get_workflow_results(&workflow_id).await
        .map_err(|e| format!("Failed to get workflow results: {}", e))?;
    
    // Convert to response format - extract stage results from intermediate data
    let mut stage_results = HashMap::new();
    
    // Extract directory tree content
    if let Some(directory_tree) = &workflow_result.intermediate_data.directory_tree_content {
        stage_results.insert(
            "GeneratingDirTree".to_string(),
            serde_json::json!({
                "content": directory_tree,
                "type": "directory_tree"
            })
        );
    }
    
    // Extract regex patterns
    if let Some(regex_patterns) = &workflow_result.intermediate_data.raw_regex_patterns {
        stage_results.insert(
            "GeneratingRegex".to_string(),
            serde_json::json!({
                "patterns": regex_patterns,
                "type": "regex_patterns"
            })
        );
    }
    
    // Extract locally filtered files
    if !workflow_result.intermediate_data.locally_filtered_files.is_empty() {
        stage_results.insert(
            "LocalFiltering".to_string(),
            serde_json::json!({
                "files": workflow_result.intermediate_data.locally_filtered_files,
                "count": workflow_result.intermediate_data.locally_filtered_files.len(),
                "type": "filtered_files"
            })
        );
    }
    
    // Extract initial path finder results
    if !workflow_result.intermediate_data.initial_verified_paths.is_empty() || 
       !workflow_result.intermediate_data.initial_unverified_paths.is_empty() {
        stage_results.insert(
            "InitialPathFinder".to_string(),
            serde_json::json!({
                "verified_paths": workflow_result.intermediate_data.initial_verified_paths,
                "unverified_paths": workflow_result.intermediate_data.initial_unverified_paths,
                "verified_count": workflow_result.intermediate_data.initial_verified_paths.len(),
                "unverified_count": workflow_result.intermediate_data.initial_unverified_paths.len(),
                "type": "path_finder_results"
            })
        );
    }
    
    // Extract initial path correction results
    if !workflow_result.intermediate_data.initial_corrected_paths.is_empty() {
        stage_results.insert(
            "InitialPathCorrection".to_string(),
            serde_json::json!({
                "corrected_paths": workflow_result.intermediate_data.initial_corrected_paths,
                "count": workflow_result.intermediate_data.initial_corrected_paths.len(),
                "type": "path_correction_results"
            })
        );
    }
    
    // Extract extended path finder results
    if !workflow_result.intermediate_data.extended_verified_paths.is_empty() || 
       !workflow_result.intermediate_data.extended_unverified_paths.is_empty() {
        stage_results.insert(
            "ExtendedPathFinder".to_string(),
            serde_json::json!({
                "verified_paths": workflow_result.intermediate_data.extended_verified_paths,
                "unverified_paths": workflow_result.intermediate_data.extended_unverified_paths,
                "verified_count": workflow_result.intermediate_data.extended_verified_paths.len(),
                "unverified_count": workflow_result.intermediate_data.extended_unverified_paths.len(),
                "type": "path_finder_results"
            })
        );
    }
    
    // Extract extended path correction results
    if !workflow_result.intermediate_data.extended_corrected_paths.is_empty() {
        stage_results.insert(
            "ExtendedPathCorrection".to_string(),
            serde_json::json!({
                "corrected_paths": workflow_result.intermediate_data.extended_corrected_paths,
                "count": workflow_result.intermediate_data.extended_corrected_paths.len(),
                "type": "path_correction_results"
            })
        );
    }
    
    Ok(WorkflowResultsResponse {
        workflow_id,
        final_paths: workflow_result.selected_files,
        stage_results,
    })
}

/// Retry a specific failed stage within a workflow
#[command]
pub async fn retry_workflow_stage_command(
    workflow_id: String,
    failed_stage_job_id: String,
    app_handle: AppHandle
) -> Result<String, String> {
    info!("Retrying workflow stage for workflow {}, job {}", workflow_id, failed_stage_job_id);
    
    // Validate required fields
    if workflow_id.is_empty() {
        return Err("Workflow ID is required".to_string());
    }
    
    if failed_stage_job_id.is_empty() {
        return Err("Failed stage job ID is required".to_string());
    }
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Get the workflow error handler
    let error_handler = crate::jobs::workflow_error_handler::WorkflowErrorHandler::new(
        app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone(),
        app_handle.clone()
    );
    
    // Call the retry_failed_stage method
    let new_job_id = error_handler.retry_failed_stage(&workflow_id, &failed_stage_job_id).await
        .map_err(|e| format!("Failed to retry workflow stage: {}", e))?;
    
    info!("Successfully started retry for workflow {} with new job {}", workflow_id, new_job_id);
    Ok(new_job_id)
}

/// Get all workflows (active and recent)
#[command]
pub async fn get_all_workflows_command(
    app_handle: AppHandle
) -> Result<Vec<WorkflowStatusResponse>, String> {
    info!("Getting all workflows");
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Get all workflow states
    let workflow_states = orchestrator.get_all_workflow_states().await
        .map_err(|e| format!("Failed to get all workflow states: {}", e))?;
    
    // Convert each workflow state to response format
    let mut workflow_responses = Vec::new();
    
    for workflow_state in workflow_states {
        // Convert workflow state to response format (similar to get_file_finder_workflow_status)
        let mut stage_statuses = Vec::new();
        let all_stages = WorkflowStage::all_stages();
        
        for stage in &all_stages {
            let stage_job = workflow_state.get_stage_job_by_stage(stage);
            
            let stage_status = if let Some(job) = stage_job {
                let progress = match job.status {
                    crate::models::JobStatus::Completed => 100.0,
                    crate::models::JobStatus::Failed => 0.0,
                    crate::models::JobStatus::Running | crate::models::JobStatus::ProcessingStream => 50.0,
                    _ => 0.0,
                };
                
                StageStatus {
                    stage_name: stage.display_name().to_string(),
                    job_id: Some(job.job_id.clone()), // Correctly populated from WorkflowStageJob.job_id
                    status: job.status.to_string(),
                    progress_percentage: progress,
                    started_at: job.started_at.map(|t| DateTime::<Utc>::from_timestamp(t, 0).unwrap_or_default().to_rfc3339()),
                    completed_at: job.completed_at.map(|t| DateTime::<Utc>::from_timestamp(t, 0).unwrap_or_default().to_rfc3339()),
                    depends_on: job.depends_on.clone(),
                    created_at: Some(DateTime::<Utc>::from_timestamp(job.created_at, 0).unwrap_or_default().to_rfc3339()),
                    error_message: job.error_message.clone(),
                    execution_time_ms: job.completed_at.and_then(|completed| 
                        job.started_at.map(|started| (completed - started))
                    ),
                    sub_status_message: job.sub_status_message.clone(),
                }
            } else {
                StageStatus {
                    stage_name: stage.display_name().to_string(),
                    job_id: None, // No job created yet for pending stages
                    status: "pending".to_string(),
                    progress_percentage: 0.0,
                    started_at: None,
                    completed_at: None,
                    depends_on: None,
                    created_at: None,
                    error_message: None,
                    execution_time_ms: None,
                    sub_status_message: None,
                }
            };
            
            stage_statuses.push(stage_status);
        }
        
        // Calculate overall progress
        let progress = workflow_state.calculate_progress();
        
        // Get current stage
        let current_stage = workflow_state.current_stage()
            .map(|stage_job| stage_job.stage.display_name().to_string())
            .unwrap_or_else(|| {
                match workflow_state.status {
                    WorkflowStatus::Completed => "Completed".to_string(),
                    WorkflowStatus::Failed => "Failed".to_string(),
                    WorkflowStatus::Canceled => "Canceled".to_string(),
                    WorkflowStatus::Paused => "Paused".to_string(),
                    _ => "Unknown".to_string(),
                }
            });
        
        let status = match workflow_state.status {
            WorkflowStatus::Running => "running".to_string(),
            WorkflowStatus::Paused => "paused".to_string(),
            WorkflowStatus::Completed => "completed".to_string(),
            WorkflowStatus::Failed => "failed".to_string(),
            WorkflowStatus::Canceled => "canceled".to_string(),
            WorkflowStatus::Created => "created".to_string(),
        };
        
        workflow_responses.push(WorkflowStatusResponse {
            workflow_id: workflow_state.workflow_id.clone(),
            status,
            progress_percentage: progress,
            current_stage,
            stage_statuses,
            error_message: workflow_state.error_message.clone(),
            created_at: Some(workflow_state.created_at),
            updated_at: Some(workflow_state.updated_at),
            completed_at: workflow_state.completed_at,
            total_execution_time_ms: workflow_state.completed_at.map(|completed| completed - workflow_state.created_at),
            session_id: Some(workflow_state.session_id.clone()),
            task_description: Some(workflow_state.task_description.clone()),
            project_directory: Some(workflow_state.project_directory.clone()),
            excluded_paths: Some(workflow_state.excluded_paths.clone()),
            timeout_ms: workflow_state.timeout_ms,
        });
    }
    
    info!("Retrieved {} workflows", workflow_responses.len());
    Ok(workflow_responses)
}

/// Get workflow details by ID
#[command]
pub async fn get_workflow_details_command(
    workflow_id: String,
    app_handle: AppHandle
) -> Result<Option<WorkflowStatusResponse>, String> {
    info!("Getting workflow details for: {}", workflow_id);
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Get workflow state by ID
    let workflow_state_opt = orchestrator.get_workflow_state_by_id(&workflow_id).await
        .map_err(|e| format!("Failed to get workflow state: {}", e))?;
    
    if let Some(workflow_state) = workflow_state_opt {
        // Convert workflow state to response format (reuse logic from get_file_finder_workflow_status)
        let mut stage_statuses = Vec::new();
        let all_stages = WorkflowStage::all_stages();
        
        for stage in &all_stages {
            let stage_job = workflow_state.get_stage_job_by_stage(stage);
            
            let stage_status = if let Some(job) = stage_job {
                let progress = match job.status {
                    crate::models::JobStatus::Completed => 100.0,
                    crate::models::JobStatus::Failed => 0.0,
                    crate::models::JobStatus::Running | crate::models::JobStatus::ProcessingStream => 50.0,
                    _ => 0.0,
                };
                
                StageStatus {
                    stage_name: stage.display_name().to_string(),
                    job_id: Some(job.job_id.clone()), // Correctly populated from WorkflowStageJob.job_id
                    status: job.status.to_string(),
                    progress_percentage: progress,
                    started_at: job.started_at.map(|t| DateTime::<Utc>::from_timestamp(t, 0).unwrap_or_default().to_rfc3339()),
                    completed_at: job.completed_at.map(|t| DateTime::<Utc>::from_timestamp(t, 0).unwrap_or_default().to_rfc3339()),
                    depends_on: job.depends_on.clone(),
                    created_at: Some(DateTime::<Utc>::from_timestamp(job.created_at, 0).unwrap_or_default().to_rfc3339()),
                    error_message: job.error_message.clone(),
                    execution_time_ms: job.completed_at.and_then(|completed| 
                        job.started_at.map(|started| (completed - started))
                    ),
                    sub_status_message: job.sub_status_message.clone(),
                }
            } else {
                StageStatus {
                    stage_name: stage.display_name().to_string(),
                    job_id: None, // No job created yet for pending stages
                    status: "pending".to_string(),
                    progress_percentage: 0.0,
                    started_at: None,
                    completed_at: None,
                    depends_on: None,
                    created_at: None,
                    error_message: None,
                    execution_time_ms: None,
                    sub_status_message: None,
                }
            };
            
            stage_statuses.push(stage_status);
        }
        
        // Calculate overall progress
        let progress = workflow_state.calculate_progress();
        
        // Get current stage
        let current_stage = workflow_state.current_stage()
            .map(|stage_job| stage_job.stage.display_name().to_string())
            .unwrap_or_else(|| {
                match workflow_state.status {
                    WorkflowStatus::Completed => "Completed".to_string(),
                    WorkflowStatus::Failed => "Failed".to_string(),
                    WorkflowStatus::Canceled => "Canceled".to_string(),
                    WorkflowStatus::Paused => "Paused".to_string(),
                    _ => "Unknown".to_string(),
                }
            });
        
        let status = match workflow_state.status {
            WorkflowStatus::Running => "running".to_string(),
            WorkflowStatus::Paused => "paused".to_string(),
            WorkflowStatus::Completed => "completed".to_string(),
            WorkflowStatus::Failed => "failed".to_string(),
            WorkflowStatus::Canceled => "canceled".to_string(),
            WorkflowStatus::Created => "created".to_string(),
        };
        
        Ok(Some(WorkflowStatusResponse {
            workflow_id: workflow_id.clone(),
            status,
            progress_percentage: progress,
            current_stage,
            stage_statuses,
            error_message: workflow_state.error_message.clone(),
            created_at: Some(workflow_state.created_at),
            updated_at: Some(workflow_state.updated_at),
            completed_at: workflow_state.completed_at,
            total_execution_time_ms: workflow_state.completed_at.map(|completed| completed - workflow_state.created_at),
            session_id: Some(workflow_state.session_id.clone()),
            task_description: Some(workflow_state.task_description.clone()),
            project_directory: Some(workflow_state.project_directory.clone()),
            excluded_paths: Some(workflow_state.excluded_paths.clone()),
            timeout_ms: workflow_state.timeout_ms,
        }))
    } else {
        Ok(None)
    }
}

// Legacy command removed - use the new workflow commands instead