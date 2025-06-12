use tauri::{command, AppHandle, Manager};
use log::{info, debug};
use serde::Serialize;
use std::sync::Arc;
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use crate::db_utils::BackgroundJobRepository;
use crate::jobs::workflow_orchestrator::get_workflow_orchestrator;
use crate::jobs::workflow_types::{WorkflowStatus, WorkflowStage};

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

// NOTE: The internal workflow functions have been removed as they are now handled 
// by individual stage processors managed by the WorkflowOrchestrator. 
// The file finder workflow now uses a distributed approach where each stage 
// runs as a separate background job, coordinated by the orchestrator.

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
    // Rate limit status requests to prevent infinite polling
    static LAST_REQUEST_TIME: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);
    static LAST_WORKFLOW_ID: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
    
    let current_time = chrono::Utc::now().timestamp_millis();
    let last_time = LAST_REQUEST_TIME.load(std::sync::atomic::Ordering::Relaxed);
    
    {
        let mut last_id = LAST_WORKFLOW_ID.lock().unwrap();
        if *last_id == workflow_id && current_time - last_time < 100 { // 100ms rate limit for same workflow
            return Err("Rate limited: too many status requests".to_string());
        }
        *last_id = workflow_id.clone();
    }
    
    LAST_REQUEST_TIME.store(current_time, std::sync::atomic::Ordering::Relaxed);
    
    debug!("Getting workflow status for: {}", workflow_id);
    
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
        let stage_job = workflow_state.get_stage_job_by_name(&stage.display_name());
        
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
                started_at: job.started_at.map(|t| DateTime::<Utc>::from_timestamp_millis(t).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
                completed_at: job.completed_at.map(|t| DateTime::<Utc>::from_timestamp_millis(t).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
                depends_on: job.depends_on.clone(),
                created_at: Some(DateTime::<Utc>::from_timestamp_millis(job.created_at).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
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
        .map(|stage_job| stage_job.stage_name.clone())
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
    
    // Note: Directory tree content is now handled as part of other stages
    
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
    
    // Extract AI filtered files from FileRelevanceAssessment stage
    if !workflow_result.intermediate_data.ai_filtered_files.is_empty() {
        stage_results.insert(
            "FileRelevanceAssessment".to_string(),
            serde_json::json!({
                "files": workflow_result.intermediate_data.ai_filtered_files,
                "count": workflow_result.intermediate_data.ai_filtered_files.len(),
                "type": "ai_filtered_files"
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
            "PathCorrection".to_string(),
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
            let stage_job = workflow_state.get_stage_job_by_name(&stage.display_name());
            
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
                    started_at: job.started_at.map(|t| DateTime::<Utc>::from_timestamp_millis(t).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
                    completed_at: job.completed_at.map(|t| DateTime::<Utc>::from_timestamp_millis(t).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
                    depends_on: job.depends_on.clone(),
                    created_at: Some(DateTime::<Utc>::from_timestamp_millis(job.created_at).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
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
            .map(|stage_job| stage_job.stage_name.clone())
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

/// Cancel a specific workflow stage
#[command]
pub async fn cancel_workflow_stage_command(
    workflow_id: String,
    stage_job_id: String,
    app_handle: AppHandle
) -> Result<(), String> {
    info!("Cancelling workflow stage for workflow {}, job {}", workflow_id, stage_job_id);
    
    // Validate required fields
    if workflow_id.is_empty() {
        return Err("Workflow ID is required".to_string());
    }
    
    if stage_job_id.is_empty() {
        return Err("Stage job ID is required".to_string());
    }
    
    // Get the workflow orchestrator
    let orchestrator = get_workflow_orchestrator().await
        .map_err(|e| format!("Failed to get workflow orchestrator: {}", e))?;
    
    // Update the job status to Canceled which will trigger the orchestrator's failure handling
    orchestrator.update_job_status(
        &stage_job_id, 
        crate::models::JobStatus::Canceled, 
        Some("Canceled by user".to_string())
    ).await
    .map_err(|e| format!("Failed to cancel workflow stage: {}", e))?;
    
    info!("Successfully cancelled workflow stage {} in workflow {}", stage_job_id, workflow_id);
    Ok(())
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
            let stage_job = workflow_state.get_stage_job_by_name(&stage.display_name());
            
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
                    started_at: job.started_at.map(|t| DateTime::<Utc>::from_timestamp_millis(t).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
                    completed_at: job.completed_at.map(|t| DateTime::<Utc>::from_timestamp_millis(t).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
                    depends_on: job.depends_on.clone(),
                    created_at: Some(DateTime::<Utc>::from_timestamp_millis(job.created_at).map(|dt| dt.to_rfc3339()).unwrap_or_default()),
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
            .map(|stage_job| stage_job.stage_name.clone())
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