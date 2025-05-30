use async_trait::async_trait;
use log::{debug, error, info, warn};
use serde_json;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Emitter};

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, FileFinderWorkflowPayload, JobProcessResult};
use crate::models::{JobStatus, TaskType};
use crate::db_utils::BackgroundJobRepository;
use crate::commands::file_finder_workflow_commands::{
    FileFinderWorkflowArgs, FileFinderWorkflowResult, WorkflowStage, WorkflowProgress
};

pub struct FileFinderWorkflowProcessor;

impl FileFinderWorkflowProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Emit job status change event for background jobs UI
    fn emit_job_status_change(app_handle: &AppHandle, job_id: &str, status: &str, message: Option<&str>) {
        let status_event = serde_json::json!({
            "jobId": job_id,
            "status": status,
            "message": message
        });
        
        if let Err(e) = app_handle.emit("job_status_change", &status_event) {
            warn!("Failed to emit job status change event: {}", e);
        }
    }

    /// Update job with stage progress and metadata
    async fn update_workflow_progress(
        repository: &BackgroundJobRepository,
        app_handle: &AppHandle,
        job_id: &str,
        stage: WorkflowStage,
        message: &str,
        data: Option<serde_json::Value>,
    ) -> AppResult<()> {
        // Create metadata with stage progress
        let metadata = serde_json::json!({
            "workflowStage": format!("{:?}", stage),
            "stageMessage": message,
            "stageData": data,
            "lastUpdateTime": crate::utils::get_timestamp()
        });

        // Update job status with metadata
        repository
            .update_job_status_with_metadata(
                job_id,
                &JobStatus::Running.to_string(),
                Some(message),
                metadata.to_string(),
            )
            .await?;

        // Emit job status change event for UI
        Self::emit_job_status_change(app_handle, job_id, "running", Some(message));

        Ok(())
    }
}

#[async_trait]
impl JobProcessor for FileFinderWorkflowProcessor {
    fn name(&self) -> &str {
        "FileFinderWorkflowProcessor"
    }

    fn can_handle(&self, job: &Job) -> bool {
        job.job_type == TaskType::FileFinderWorkflow
    }

    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Extract payload
        let workflow_payload = match job.payload {
            JobPayload::FileFinderWorkflow(payload) => payload,
            _ => return Err(AppError::ValidationError("Expected FileFinderWorkflow payload".to_string())),
        };

        let job_id = &job.id;
        
        info!("Starting file finder workflow processor for job: {}", job_id);

        // Get repository from app handle
        let repository = app_handle.state::<Arc<BackgroundJobRepository>>();

        // Update job status to running
        repository
            .update_job_status_running(job_id, Some("Starting file finder workflow..."))
            .await?;
        
        Self::emit_job_status_change(&app_handle, job_id, "running", Some("Starting file finder workflow..."));

        // Convert payload to workflow args
        let workflow_args = FileFinderWorkflowArgs {
            session_id: workflow_payload.session_id.clone(),
            task_description: workflow_payload.task_description.clone(),
            project_directory: workflow_payload.project_directory.clone(),
            excluded_paths: workflow_payload.excluded_paths.clone(),
            timeout_ms: workflow_payload.timeout_ms,
        };

        // Execute the workflow with progress tracking
        match Self::execute_workflow_with_tracking(&repository, &app_handle, job_id, workflow_args).await {
            Ok(result) => {
                // Store the workflow result in the job response
                let response_json = serde_json::to_string(&result)
                    .map_err(|e| AppError::SerializationError(format!("Failed to serialize workflow result: {}", e)))?;

                // Update job as completed with result
                repository
                    .update_job_response_with_system_prompt(
                        job_id,
                        &response_json,
                        Some(JobStatus::Completed),
                        None, // metadata will be preserved from progress updates
                        None, // tokens_sent
                        None, // tokens_received
                        None, // total_tokens
                        Some(response_json.len() as i32), // chars_received
                        None, // system_prompt_id
                    )
                    .await?;

                Self::emit_job_status_change(&app_handle, job_id, "completed", Some(&format!("Workflow completed with {} files", result.selected_files.len())));

                Ok(JobProcessResult::success(job_id.clone(), response_json))
            }
            Err(e) => {
                error!("File finder workflow failed for job {}: {}", job_id, e);
                
                // Update job as failed
                repository
                    .update_job_status_failed(job_id, &e.to_string())
                    .await?;

                Self::emit_job_status_change(&app_handle, job_id, "failed", Some(&e.to_string()));

                Ok(JobProcessResult::failure(job_id.clone(), e.to_string()))
            }
        }
    }
}

impl FileFinderWorkflowProcessor {
    /// Execute the file finder workflow with progress tracking
    async fn execute_workflow_with_tracking(
        repository: &BackgroundJobRepository,
        app_handle: &AppHandle,
        job_id: &str,
        args: FileFinderWorkflowArgs,
    ) -> AppResult<FileFinderWorkflowResult> {
        use crate::commands::file_finder_workflow_commands::*;
        
        // Initialize workflow state
        let mut intermediate_data = WorkflowIntermediateData::default();
        let excluded_paths = args.excluded_paths.unwrap_or_default();

        // Stage 1: Generate directory tree
        Self::update_workflow_progress(
            repository,
            app_handle,
            job_id,
            WorkflowStage::GeneratingDirTree,
            "Generating directory tree...",
            None,
        ).await?;

        let directory_tree = match generate_directory_tree_internal(&args.project_directory).await {
            Ok(tree) => {
                intermediate_data.directory_tree_content = Some(tree.clone());
                tree
            }
            Err(e) => {
                return Err(AppError::JobError(format!("Directory tree generation failed: {}", e)));
            }
        };

        // Stage 2: Generate regex patterns
        Self::update_workflow_progress(
            repository,
            app_handle,
            job_id,
            WorkflowStage::GeneratingRegex,
            "Generating regex patterns...",
            None,
        ).await?;

        let regex_patterns = match generate_regex_patterns_internal(
            &args.session_id,
            &args.project_directory,
            &args.task_description,
            &directory_tree,
            app_handle,
        ).await {
            Ok(patterns) => {
                intermediate_data.raw_regex_patterns = Some(patterns.clone());
                patterns
            }
            Err(e) => {
                return Err(AppError::JobError(format!("Regex pattern generation failed: {}", e)));
            }
        };

        // Stage 3: Local filtering
        Self::update_workflow_progress(
            repository,
            app_handle,
            job_id,
            WorkflowStage::LocalFiltering,
            "Filtering files locally...",
            None,
        ).await?;

        let locally_filtered_files = match perform_local_filtering_internal(&regex_patterns, &args.project_directory).await {
            Ok(files) => {
                intermediate_data.locally_filtered_files = files.clone();
                files
            }
            Err(e) => {
                return Err(AppError::JobError(format!("Local filtering failed: {}", e)));
            }
        };

        // Stage 4: Initial path finder
        Self::update_workflow_progress(
            repository,
            app_handle,
            job_id,
            WorkflowStage::InitialPathFinder,
            "Finding relevant files...",
            None,
        ).await?;

        let (initial_verified, initial_unverified) = match run_initial_path_finder_internal(
            &args.session_id,
            &args.project_directory,
            &args.task_description,
            &directory_tree,
            &locally_filtered_files,
            &excluded_paths,
            app_handle,
        ).await {
            Ok((verified, unverified)) => {
                intermediate_data.initial_verified_paths = verified.clone();
                intermediate_data.initial_unverified_paths = unverified.clone();
                (verified, unverified)
            }
            Err(e) => {
                return Err(AppError::JobError(format!("Initial path finder failed: {}", e)));
            }
        };

        let mut all_verified_paths = initial_verified.clone();

        // Stage 5: Initial path correction (if needed)
        if !initial_unverified.is_empty() {
            Self::update_workflow_progress(
                repository,
                app_handle,
                job_id,
                WorkflowStage::InitialPathCorrection,
                "Correcting invalid paths...",
                None,
            ).await?;

            match run_path_correction_internal(
                &args.session_id,
                &args.project_directory,
                &initial_unverified,
                &args.task_description,
                &directory_tree,
                app_handle,
            ).await {
                Ok(corrected_paths) => {
                    intermediate_data.initial_corrected_paths = corrected_paths.clone();
                    all_verified_paths.extend(corrected_paths);
                }
                Err(e) => {
                    warn!("Initial path correction failed (continuing): {}", e);
                }
            }
        }

        // Stage 6: Extended path finder
        Self::update_workflow_progress(
            repository,
            app_handle,
            job_id,
            WorkflowStage::ExtendedPathFinder,
            "Finding additional relevant files...",
            None,
        ).await?;

        let (extended_verified, extended_unverified) = match run_extended_path_finder_internal(
            &args.session_id,
            &args.project_directory,
            &args.task_description,
            &directory_tree,
            &all_verified_paths,
            &excluded_paths,
            app_handle,
        ).await {
            Ok((verified, unverified)) => {
                intermediate_data.extended_verified_paths = verified.clone();
                intermediate_data.extended_unverified_paths = unverified.clone();
                (verified, unverified)
            }
            Err(e) => {
                warn!("Extended path finder failed (continuing): {}", e);
                (vec![], vec![])
            }
        };

        all_verified_paths.extend(extended_verified);

        // Stage 7: Extended path correction (if needed)
        if !extended_unverified.is_empty() {
            Self::update_workflow_progress(
                repository,
                app_handle,
                job_id,
                WorkflowStage::ExtendedPathCorrection,
                "Correcting additional paths...",
                None,
            ).await?;

            match run_path_correction_internal(
                &args.session_id,
                &args.project_directory,
                &extended_unverified,
                &args.task_description,
                &directory_tree,
                app_handle,
            ).await {
                Ok(corrected_paths) => {
                    intermediate_data.extended_corrected_paths = corrected_paths.clone();
                    all_verified_paths.extend(corrected_paths);
                }
                Err(e) => {
                    warn!("Extended path correction failed (continuing): {}", e);
                }
            }
        }

        // Final completion
        all_verified_paths.sort();
        all_verified_paths.dedup();

        Self::update_workflow_progress(
            repository,
            app_handle,
            job_id,
            WorkflowStage::Completed,
            &format!("Workflow completed successfully with {} files", all_verified_paths.len()),
            Some(serde_json::json!({
                "selectedFilesCount": all_verified_paths.len(),
                "selectedFiles": all_verified_paths
            })),
        ).await?;

        Ok(FileFinderWorkflowResult {
            success: true,
            selected_files: all_verified_paths,
            intermediate_data,
            error_message: None,
        })
    }
}

// Re-export the internal functions from the workflow commands module
// Note: These functions would need to be made public in the commands module
use crate::commands::file_finder_workflow_commands::{
    generate_directory_tree_internal,
    generate_regex_patterns_internal,
    perform_local_filtering_internal,
    run_initial_path_finder_internal,
    run_path_correction_internal,
    run_extended_path_finder_internal,
    WorkflowIntermediateData,
};