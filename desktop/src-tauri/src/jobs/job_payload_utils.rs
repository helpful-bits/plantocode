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
        JobPayload, RegexPatternGenerationWorkflowPayload, 
        LocalFileFilteringPayload, PathFinderPayload, PathCorrectionPayload, 
        ExtendedPathFinderPayload, ImplementationPlanPayload,
        GuidanceGenerationPayload, TaskEnhancementPayload,
        TextCorrectionPayload, GenericLlmStreamPayload, RegexPatternGenerationPayload,
        OpenRouterLlmPayload, FileRelevanceAssessmentPayload
    };
    use crate::models::TaskType;
    
    match task_type {
        TaskType::RegexPatternGeneration => {
            // Check if this is a workflow stage or standalone regex pattern generation
            // Try workflow payload first, then fallback to standalone
            if let Ok(workflow_payload) = serde_json::from_value::<RegexPatternGenerationWorkflowPayload>(json_value.clone()) {
                Ok(JobPayload::RegexPatternGenerationWorkflow(workflow_payload))
            } else {
                let standalone_payload: RegexPatternGenerationPayload = serde_json::from_value(json_value.clone())
                    .map_err(|e| AppError::JobError(format!("Failed to deserialize RegexPatternGenerationPayload: {}", e)))?;
                Ok(JobPayload::RegexPatternGeneration(standalone_payload))
            }
        }
        TaskType::LocalFileFiltering => {
            let payload: LocalFileFilteringPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize LocalFileFilteringPayload: {}", e)))?;
            Ok(JobPayload::LocalFileFiltering(payload))
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
        TaskType::GuidanceGeneration => {
            let payload: GuidanceGenerationPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize GuidanceGenerationPayload: {}", e)))?;
            Ok(JobPayload::GuidanceGeneration(payload))
        }
        TaskType::TaskEnhancement => {
            let payload: TaskEnhancementPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TaskEnhancementPayload: {}", e)))?;
            Ok(JobPayload::TaskEnhancement(payload))
        }
        TaskType::TextCorrection => {
            let payload: TextCorrectionPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TextCorrectionPayload: {}", e)))?;
            Ok(JobPayload::TextCorrection(payload))
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
        TaskType::SubscriptionLifecycle => {
            let payload: crate::jobs::types::SubscriptionLifecyclePayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize SubscriptionLifecyclePayload: {}", e)))?;
            Ok(JobPayload::SubscriptionLifecycle(payload))
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
