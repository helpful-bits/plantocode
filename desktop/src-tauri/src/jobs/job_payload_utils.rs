use serde_json::Value;
use log::{debug, error};

use crate::error::{AppError, AppResult};
use crate::jobs::types::{
    JobPayload,
    PathFinderPayload,
    ImplementationPlanPayload, 
    RegexGenerationPayload,
    GuidanceGenerationPayload,
    PathCorrectionPayload,
    TextImprovementPayload,
    TaskEnhancementPayload,
    GenerateDirectoryTreePayload,
    OpenRouterTranscriptionPayload,
    TextCorrectionPostTranscriptionPayload,
    VoiceCorrectionPayload,
    GenericLlmStreamPayload
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
        .map_err(|e| AppError::JobError(format!("Failed to parse job metadata: {}", e)))?;

    // Extract jobPayloadForWorker field
    let payload_str = metadata_json.get("jobPayloadForWorker").ok_or_else(|| 
        AppError::JobError("jobPayloadForWorker not found in metadata".to_string())
    )?;
    
    // Parse the payload string to JSON (since it's stored as a JSON string)
    let payload_json = if let Value::String(s) = payload_str {
        serde_json::from_str::<Value>(s)
            .map_err(|e| AppError::JobError(format!("Failed to parse jobPayloadForWorker string: {}", e)))?
    } else {
        payload_str.clone()
    };

    // Deserialize based on task type
    match task_type {
        // Match against PathFinder task type
        path_finder if path_finder == TaskType::PathFinder.to_string() => {
            debug!("Deserializing InputPathFinderPayload and converting to PathFinderPayload");
            // Deserialize as InputPathFinderPayload (the command argument struct)
            let input_payload: crate::jobs::types::InputPathFinderPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize InputPathFinderPayload: {}", e)))?;
            
            debug!("Successfully deserialized InputPathFinderPayload, converting to processor payload");
            // Convert input payload to PathFinderPayload for processor
            let processor_payload = PathFinderPayload {
                session_id: input_payload.session_id,
                task_description: input_payload.task_description,
                background_job_id: input_payload.background_job_id,
                project_directory: input_payload.project_directory,
                model_override: input_payload.model_override,
                // Default values will be properly set by the processor
                system_prompt: String::new(),
                temperature: input_payload.temperature_override.unwrap_or(0.7),
                max_output_tokens: input_payload.max_tokens_override,
                // These will be populated by the processor
                directory_tree: String::new(),
                relevant_file_contents: std::collections::HashMap::new(),
                estimated_input_tokens: None,
                options: input_payload.options,
            };
            Ok(JobPayload::PathFinder(processor_payload))
        },
        
        // Match against ImplementationPlan task type
        implementation_plan if implementation_plan == TaskType::ImplementationPlan.to_string() => {
            debug!("Deserializing ImplementationPlanPayload");
            let payload: ImplementationPlanPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize ImplementationPlanPayload: {}", e)))?;
            Ok(JobPayload::ImplementationPlan(payload))
        },
        
        // Match against RegexGeneration task type
        regex_generation if regex_generation == TaskType::RegexGeneration.to_string() => {
            debug!("Deserializing RegexGenerationPayload");
            let payload: RegexGenerationPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize RegexGenerationPayload: {}", e)))?;
            Ok(JobPayload::RegexGeneration(payload))
        },
        
        // Match against GuidanceGeneration task type
        guidance_generation if guidance_generation == TaskType::GuidanceGeneration.to_string() => {
            debug!("Deserializing GuidanceGenerationPayload");
            let payload: GuidanceGenerationPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize GuidanceGenerationPayload: {}", e)))?;
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
        
        // Match against GenerateDirectoryTree task type
        generate_directory_tree if generate_directory_tree == "generate_directory_tree" => {
            debug!("Deserializing GenerateDirectoryTreePayload");
            let payload: GenerateDirectoryTreePayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize GenerateDirectoryTreePayload: {}", e)))?;
            Ok(JobPayload::GenerateDirectoryTree(payload))
        },
        
        // Match against OpenRouterLlm task type (generic LLM streaming)
        openrouter_llm if openrouter_llm == "generic_llm_stream" || openrouter_llm == TaskType::GenericLlmStream.to_string() => {
            debug!("Deserializing GenericLlmStreamPayload");
            let payload: crate::jobs::types::GenericLlmStreamPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize GenericLlmStreamPayload: {}", e)))?;
            Ok(JobPayload::GenericLlmStream(payload))
        },
        
        // Match against VoiceCorrection task type
        voice_correction if voice_correction == TaskType::VoiceCorrection.to_string() => {
            debug!("Deserializing VoiceCorrectionPayload");
            let payload: VoiceCorrectionPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize VoiceCorrectionPayload: {}", e)))?;
            Ok(JobPayload::VoiceCorrection(payload))
        },
        
        // Match against TextCorrectionPostTranscription task type
        text_correction if text_correction == TaskType::TextCorrectionPostTranscription.to_string() => {
            debug!("Deserializing TextCorrectionPostTranscriptionPayload");
            let payload: TextCorrectionPostTranscriptionPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize TextCorrectionPostTranscriptionPayload: {}", e)))?;
            Ok(JobPayload::TextCorrectionPostTranscription(payload))
        },
        
        // Match against OpenRouterTranscription task type
        openrouter_transcription if openrouter_transcription == TaskType::VoiceTranscription.to_string() => {
            debug!("Deserializing OpenRouterTranscriptionPayload");
            let payload: OpenRouterTranscriptionPayload = serde_json::from_value(payload_json.clone())
                .map_err(|e| AppError::JobError(format!("Failed to deserialize OpenRouterTranscriptionPayload: {}", e)))?;
            Ok(JobPayload::OpenRouterTranscription(payload))
        },
        
        // For other task types not yet implemented
        
        // Unsupported task type
        _ => {
            error!("Unsupported task_type for payload deserialization: {}", task_type);
            Err(AppError::JobError(format!("Unsupported task_type for payload deserialization: {}", task_type)))
        }
    }
}