use serde_json::Value;
use log::{debug, error};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{
    JobPayload,
    PathFinderPayload,
    ImplementationPlanPayload, 
    GuidanceGenerationPayload,
    PathCorrectionPayload,
    TextImprovementPayload,
    TaskEnhancementPayload,
    VoiceTranscriptionPayload,
    TextCorrectionPayload,
    GenericLlmStreamPayload,
    RegexPatternGenerationPayload,
    DirectoryTreeGenerationPayload,
    LocalFileFilteringPayload,
    ExtendedPathFinderPayload,
    ExtendedPathCorrectionPayload
};
use crate::models::TaskType;

/// Deserialize job payload from metadata based on the task type
pub fn deserialize_job_payload(task_type: &str, metadata_str: Option<&str>) -> AppResult<JobPayload> {
    // Check if metadata is present
    let metadata_str = metadata_str.ok_or_else(|| 
        AppError::JobError("Missing metadata for job payload deserialization".to_string())
    )?;

    // Parse metadata string to JSON
    let metadata_json: Value = serde_json::from_str(metadata_str)
        .map_err(|e| AppError::JobError(format!("Failed to parse job metadata for task_type '{}': {}", task_type, e)))?;

    // Extract jobPayloadForWorker field
    let payload_value = metadata_json.get("jobPayloadForWorker").ok_or_else(|| 
        AppError::JobError(format!("jobPayloadForWorker not found in metadata for task_type '{}'", task_type))
    )?;
    
    // Use the payload value directly (it's now stored as a JSON object)
    let payload_json = payload_value.clone();
    
    debug!("Deserializing payload for task_type: '{}', payload_json snippet: {}", task_type, 
        serde_json::to_string(&payload_json).unwrap_or_default().chars().take(200).collect::<String>());

    // Deserialize based on task type
    match task_type {
        // Match against PathFinder task type
        path_finder if path_finder == TaskType::PathFinder.to_string() => {
            debug!("Deserializing PathFinder payload for task_type: {}", path_finder);
            
            // Try to deserialize as InputPathFinderPayload first (command input struct)
            match serde_json::from_value::<crate::jobs::types::InputPathFinderPayload>(payload_json.clone()) {
                Ok(input_payload) => {
                    debug!("Successfully deserialized InputPathFinderPayload, converting to PathFinderPayload");
                    // Convert input payload to PathFinderPayload for processor
                    // Note: Fields like directory_tree, relevant_file_contents, and system_prompt 
                    // are initialized with empty/default values and will be populated by the processor
                    let processor_payload = PathFinderPayload {
                        session_id: input_payload.session_id,
                        task_description: input_payload.task_description,
                        background_job_id: input_payload.background_job_id,
                        project_directory: input_payload.project_directory,
                        model_override: input_payload.model_override,
                        // Default values will be properly set by the processor
                        system_prompt: String::new(),
                        temperature: match input_payload.temperature_override {
                            Some(temp) => temp,
                            None => crate::config::get_default_temperature_for_task(Some(crate::models::TaskType::PathFinder))
                                .map_err(|e| AppError::ConfigError(format!("Failed to get temperature for PathFinder: {}", e)))?,
                        },
                        max_output_tokens: input_payload.max_tokens_override,
                        // Use provided directory_tree if available, otherwise empty string (processor will generate it)
                        directory_tree: Some(input_payload.directory_tree.unwrap_or_default()),
                        relevant_file_contents: std::collections::HashMap::new(),
                        estimated_input_tokens: None,
                        options: input_payload.options,
                    };
                    Ok(JobPayload::PathFinder(processor_payload))
                },
                Err(input_err) => {
                    debug!("Failed to deserialize as InputPathFinderPayload: {}, trying as PathFinderPayload", input_err);
                    // Try to deserialize as PathFinderPayload directly (processor struct)
                    let processor_payload: PathFinderPayload = serde_json::from_value(payload_json.clone())
                        .map_err(|e| AppError::JobError(format!("Failed to deserialize as both InputPathFinderPayload ({}) and PathFinderPayload ({})", input_err, e)))?;
                    debug!("Successfully deserialized as PathFinderPayload directly");
                    Ok(JobPayload::PathFinder(processor_payload))
                }
            }
        },
        
        // Match against ImplementationPlan task type
        implementation_plan if implementation_plan == TaskType::ImplementationPlan.to_string() => {
            debug!("Deserializing ImplementationPlanPayload for task_type: {}", implementation_plan);
            let payload: ImplementationPlanPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize ImplementationPlanPayload for task_type '{}': {}", implementation_plan, e)))?;
            debug!("Successfully deserialized ImplementationPlanPayload");
            Ok(JobPayload::ImplementationPlan(payload))
        },
        
        
        // Match against GuidanceGeneration task type
        guidance_generation if guidance_generation == TaskType::GuidanceGeneration.to_string() => {
            debug!("Deserializing GuidanceGenerationPayload for task_type: {}", guidance_generation);
            let payload: GuidanceGenerationPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize GuidanceGenerationPayload for task_type '{}': {}", guidance_generation, e)))?;
            debug!("Successfully deserialized GuidanceGenerationPayload");
            Ok(JobPayload::GuidanceGeneration(payload))
        },
        
        // Match against PathCorrection task type
        path_correction if path_correction == TaskType::PathCorrection.to_string() => {
            debug!("Deserializing PathCorrectionPayload");
            let payload: PathCorrectionPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize PathCorrectionPayload: {}", e)))?;
            Ok(JobPayload::PathCorrection(payload))
        },

        // Match against TextImprovement task type
        text_improvement if text_improvement == TaskType::TextImprovement.to_string() => {
            debug!("Deserializing TextImprovementPayload");
            let payload: TextImprovementPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TextImprovementPayload: {}", e)))?;
            Ok(JobPayload::TextImprovement(payload))
        },
        
        // Match against TaskEnhancement task type
        task_enhancement if task_enhancement == TaskType::TaskEnhancement.to_string() => {
            debug!("Deserializing TaskEnhancementPayload");
            let payload: TaskEnhancementPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TaskEnhancementPayload: {}", e)))?;
            Ok(JobPayload::TaskEnhancement(payload))
        },
        
        
        // Match against GenericLlmStream and Streaming task types (both use GenericLlmStreamPayload)
        task_str if task_str == TaskType::GenericLlmStream.to_string() || task_str == TaskType::Streaming.to_string() => {
            debug!("Deserializing GenericLlmStreamPayload for task type: {}", task_str);
            let payload: crate::jobs::types::GenericLlmStreamPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize GenericLlmStreamPayload: {}", e)))?;
            Ok(JobPayload::GenericLlmStream(payload))
        },
        
        // Match against TextCorrection task type (consolidates voice correction and post-transcription correction)
        text_correction if text_correction == TaskType::TextCorrection.to_string() => {
            debug!("Deserializing TextCorrectionPayload");
            let payload: TextCorrectionPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TextCorrectionPayload: {}", e)))?;
            Ok(JobPayload::TextCorrection(payload))
        },
        
        // Match against VoiceTranscription task type
        voice_transcription if voice_transcription == TaskType::VoiceTranscription.to_string() => {
            debug!("Deserializing VoiceTranscriptionPayload");
            let payload: VoiceTranscriptionPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize VoiceTranscriptionPayload: {}", e)))?;
            Ok(JobPayload::VoiceTranscription(payload))
        },
        
        // Match against RegexPatternGeneration task type
        regex_pattern_generation if regex_pattern_generation == TaskType::RegexPatternGeneration.to_string() => {
            debug!("Deserializing RegexPatternGenerationPayload");
            let payload: RegexPatternGenerationPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize RegexPatternGenerationPayload: {}", e)))?;
            Ok(JobPayload::RegexPatternGeneration(payload))
        },
        
        // Match against RegexSummaryGeneration task type
        regex_summary_generation if regex_summary_generation == TaskType::RegexSummaryGeneration.to_string() => {
            debug!("Deserializing RegexSummaryGenerationPayload");
            let payload: crate::jobs::processors::regex_summary_generation_processor::RegexSummaryGenerationPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize RegexSummaryGenerationPayload: {}", e)))?;
            Ok(JobPayload::RegexSummaryGeneration(payload))
        },
        
        // Match against DirectoryTreeGeneration task type
        directory_tree_generation if directory_tree_generation == TaskType::DirectoryTreeGeneration.to_string() => {
            debug!("Deserializing DirectoryTreeGenerationPayload");
            let payload: crate::jobs::types::DirectoryTreeGenerationPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize DirectoryTreeGenerationPayload: {}", e)))?;
            Ok(JobPayload::DirectoryTreeGeneration(payload))
        },
        
        // Match against LocalFileFiltering task type
        local_file_filtering if local_file_filtering == TaskType::LocalFileFiltering.to_string() => {
            debug!("Deserializing LocalFileFilteringPayload");
            let payload: crate::jobs::types::LocalFileFilteringPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize LocalFileFilteringPayload: {}", e)))?;
            Ok(JobPayload::LocalFileFiltering(payload))
        },
        
        // Match against ExtendedPathFinder task type
        extended_path_finder if extended_path_finder == TaskType::ExtendedPathFinder.to_string() => {
            debug!("Deserializing ExtendedPathFinderPayload");
            let payload: crate::jobs::types::ExtendedPathFinderPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize ExtendedPathFinderPayload: {}", e)))?;
            Ok(JobPayload::ExtendedPathFinder(payload))
        },
        
        // Match against ExtendedPathCorrection task type
        extended_path_correction if extended_path_correction == TaskType::ExtendedPathCorrection.to_string() => {
            debug!("Deserializing ExtendedPathCorrectionPayload");
            let payload: crate::jobs::types::ExtendedPathCorrectionPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize ExtendedPathCorrectionPayload: {}", e)))?;
            Ok(JobPayload::ExtendedPathCorrection(payload))
        },
        
        
        
        // Handle Unknown task type
        unknown if unknown == TaskType::Unknown.to_string() => {
            error!("Received Unknown task type");
            Err(AppError::JobError("Unknown task type cannot be processed".to_string()))
        },
        
        // For other task types not yet implemented
        
        // Unsupported task type
        _ => {
            error!("Unsupported task_type for payload deserialization: '{}', payload_json snippet: {}", 
                task_type, 
                serde_json::to_string(&payload_json).unwrap_or_default().chars().take(200).collect::<String>());
            Err(AppError::JobError(format!("Unsupported task_type for payload deserialization: '{}'", task_type)))
        }
    }
}