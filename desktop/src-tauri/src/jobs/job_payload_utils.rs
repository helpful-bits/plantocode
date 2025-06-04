use log::{debug, error, warn};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{JobPayload, JobWorkerMetadata};

/// Deserialize job payload from metadata based on the task type
pub fn deserialize_job_payload(task_type: &str, metadata_str: Option<&str>) -> AppResult<JobPayload> {
    let metadata_str = metadata_str.ok_or_else(|| 
        AppError::JobError("Missing metadata for job payload deserialization".to_string())
    )?;

    match serde_json::from_str::<JobWorkerMetadata>(metadata_str) {
        Ok(worker_metadata) => {
            debug!("Successfully parsed JobWorkerMetadata for task_type: {}", task_type);
            // Validate that the task_type in the deserialized metadata matches the job's task_type.
            // This is a significant inconsistency that could indicate data corruption or version mismatch.
            if worker_metadata.task_type != task_type {
                warn!(
                    "Critical inconsistency: task_type in metadata ('{}') does not match job task_type ('{}'). \
                     This may indicate data corruption or version mismatch. Using payload from metadata as it reflects the actual stored job data.",
                    worker_metadata.task_type, task_type
                );
                // Continue processing using the payload from metadata as it's what was actually stored
                // The task_type parameter is used for context/logging but the payload structure is what matters
            }
            Ok(worker_metadata.job_payload_for_worker)
        }
        Err(e) => {
            // Log the beginning of the metadata string for easier debugging
            let metadata_snippet = metadata_str.chars().take(200).collect::<String>();
            error!(
                "Failed to parse metadata string as JobWorkerMetadata for task_type '{}'. Error: {}. Metadata snippet: '{}'",
                task_type, e, metadata_snippet
            );
            Err(AppError::JobError(format!(
                "Invalid job metadata structure for task_type '{}'. Failed to deserialize JobWorkerMetadata: {}",
                task_type, e
            )))
        }
    }
}

/// Create a default JobPayload for a given task type with minimal default fields
/// This is used when metadata parsing fails and we need to create fallback metadata
pub fn create_default_payload_for_task_type(
    task_type_str: &str, 
    job_id: &str, 
    _session_id: &str, 
    _project_directory: Option<&str>
) -> AppResult<JobPayload> {
    Err(AppError::JobError(format!(
        "Cannot create fallback payload for task type '{}' - job metadata is corrupted for job {}. \
        This indicates a serious issue with job data integrity that requires manual intervention.",
        task_type_str, job_id
    )))
}

/// Convert a JSON value to the appropriate JobPayload variant based on TaskType
/// This is useful for workflow retries and other scenarios where we need to deserialize
/// JSON payloads back into typed JobPayload structs.
pub fn deserialize_value_to_job_payload(json_value: &serde_json::Value, task_type: &crate::models::TaskType) -> AppResult<JobPayload> {
    use crate::jobs::types::{
        JobPayload, RegexPatternGenerationWorkflowPayload, 
        LocalFileFilteringPayload, PathFinderPayload, PathCorrectionPayload, 
        ExtendedPathFinderPayload, ExtendedPathCorrectionPayload, ImplementationPlanPayload,
        GuidanceGenerationPayload, TextImprovementPayload, TaskEnhancementPayload,
        TextCorrectionPayload, GenericLlmStreamPayload, RegexPatternGenerationPayload,
        OpenRouterLlmPayload, VoiceTranscriptionPayload, FileRelevanceAssessmentPayload
    };
    use crate::jobs::processors::regex_summary_generation_processor::RegexSummaryGenerationPayload;
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
        TaskType::ExtendedPathCorrection => {
            let payload: ExtendedPathCorrectionPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize ExtendedPathCorrectionPayload: {}", e)))?;
            Ok(JobPayload::ExtendedPathCorrection(payload))
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
        TaskType::TextImprovement => {
            let payload: TextImprovementPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TextImprovementPayload: {}", e)))?;
            Ok(JobPayload::TextImprovement(payload))
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
        TaskType::RegexSummaryGeneration => {
            let payload: RegexSummaryGenerationPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize RegexSummaryGenerationPayload: {}", e)))?;
            Ok(JobPayload::RegexSummaryGeneration(payload))
        }
        TaskType::VoiceTranscription => {
            let payload: VoiceTranscriptionPayload = serde_json::from_value(json_value.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize VoiceTranscriptionPayload: {}", e)))?;
            Ok(JobPayload::VoiceTranscription(payload))
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
        // Streaming and Unknown are not retryable job types
        TaskType::Streaming | TaskType::Unknown => {
            Err(AppError::JobError(format!("Task type {:?} is not supported for JSON to JobPayload conversion", task_type)))
        }
    }
}
