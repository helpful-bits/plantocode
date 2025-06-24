use crate::error::{AppError, AppResult};
use crate::jobs::types::{JobPayload, JobUIMetadata, Job};
use crate::models::{TaskType, BackgroundJob};
use std::str::FromStr;

/// Convert BackgroundJob from database to Job for retries
pub fn convert_db_job_to_job(db_job: &BackgroundJob) -> AppResult<Job> {
    let metadata_str = db_job.metadata.as_ref()
        .ok_or_else(|| AppError::JobError("Job metadata is missing".to_string()))?;
    
    let ui_metadata: JobUIMetadata = serde_json::from_str(metadata_str)
        .map_err(|e| AppError::JobError(format!("Failed to parse JobUIMetadata: {}", e)))?;
    
    let task_type = TaskType::from_str(&db_job.task_type)
        .map_err(|e| AppError::JobError(format!("Failed to parse task type '{}': {}", db_job.task_type, e)))?;
    
    Ok(Job {
        id: db_job.id.clone(),
        job_type: task_type,
        payload: ui_metadata.job_payload_for_worker,
        session_id: db_job.session_id.clone(),
        process_after: None,
        created_at: db_job.created_at,
    })
}

/// Convert a JSON value to the appropriate JobPayload variant based on TaskType
/// This is useful for workflow retries and other scenarios where we need to deserialize
/// JSON payloads back into typed JobPayload structs.
pub fn deserialize_value_to_job_payload(json_value: &serde_json::Value, task_type: &crate::models::TaskType) -> AppResult<JobPayload> {
    use crate::jobs::types::{
        JobPayload, RegexFileFilterPayload, 
        PathFinderPayload, PathCorrectionPayload, 
        ExtendedPathFinderPayload, ImplementationPlanPayload,
        TaskRefinementPayload,
        TextImprovementPayload, GenericLlmStreamPayload,
        OpenRouterLlmPayload, FileRelevanceAssessmentPayload
    };
    use crate::models::TaskType;
    
    match task_type {
        TaskType::RegexFileFilter => {
            let workflow_payload: RegexFileFilterPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize RegexFileFilterPayload: {}", e)))?;
            Ok(JobPayload::RegexFileFilter(workflow_payload))
        }
        TaskType::PathFinder => {
            let payload: PathFinderPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize PathFinderPayload: {}", e)))?;
            Ok(JobPayload::PathFinder(payload))
        }
        TaskType::PathCorrection => {
            let payload: PathCorrectionPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize PathCorrectionPayload: {}", e)))?;
            Ok(JobPayload::PathCorrection(payload))
        }
        TaskType::ExtendedPathFinder => {
            let payload: ExtendedPathFinderPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize ExtendedPathFinderPayload: {}", e)))?;
            Ok(JobPayload::ExtendedPathFinder(payload))
        }
        TaskType::ImplementationPlan => {
            let payload: ImplementationPlanPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize ImplementationPlanPayload: {}", e)))?;
            Ok(JobPayload::ImplementationPlan(payload))
        }
        TaskType::TaskRefinement => {
            let payload: TaskRefinementPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TaskRefinementPayload: {}", e)))?;
            Ok(JobPayload::TaskRefinement(payload))
        }
        TaskType::TextImprovement => {
            let payload: TextImprovementPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TextImprovementPayload: {}", e)))?;
            Ok(JobPayload::TextImprovement(payload))
        }
        TaskType::GenericLlmStream => {
            let payload: GenericLlmStreamPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize GenericLlmStreamPayload: {}", e)))?;
            Ok(JobPayload::GenericLlmStream(payload))
        }
        TaskType::FileRelevanceAssessment => {
            let payload: FileRelevanceAssessmentPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize FileRelevanceAssessmentPayload: {}", e)))?;
            Ok(JobPayload::FileRelevanceAssessment(payload))
        }
        // FileFinderWorkflow is handled by workflow orchestrator, not individual payload deserialization
        TaskType::FileFinderWorkflow => {
            Err(AppError::JobError("FileFinderWorkflow should be handled by WorkflowOrchestrator, not individual payload deserialization".to_string()))
        }
        // VoiceTranscription uses direct API calls, not background jobs
        TaskType::VoiceTranscription => {
            Err(AppError::JobError("VoiceTranscription uses direct API calls instead of background job system".to_string()))
        }
        // Streaming and Unknown are not retryable job types
        TaskType::Streaming | TaskType::Unknown => {
            Err(AppError::JobError(format!("Task type {:?} is not supported for JSON to JobPayload conversion", task_type)))
        }
    }
}
