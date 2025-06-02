use async_trait::async_trait;
use log::{debug, error, info};

use tauri::AppHandle;

use crate::api_clients::client_factory;
use crate::api_clients::client_trait::TranscriptionClient;
use crate::error::{AppError, AppResult};
use crate::jobs::job_processor_utils;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};

/// Processor for transcribing audio through the server proxy
pub struct ServerProxyTranscriptionProcessor {
    /// The Tauri app handle for state access
    app_handle: AppHandle,
}

impl ServerProxyTranscriptionProcessor {
    /// Create a new transcription processor
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
    
    /// The processor name
    pub fn processor_name() -> &'static str {
        "ServerProxyTranscriptionProcessor"
    }
}

#[async_trait]
impl JobProcessor for ServerProxyTranscriptionProcessor {
    /// Check if this processor can handle the given job
    fn can_handle(&self, job: &Job) -> bool {
        match &job.payload {
            JobPayload::VoiceTranscription(_) => true,
            _ => false,
        }
    }
    
    /// Get the processor name
    fn name(&self) -> &'static str {
        Self::processor_name()
    }
    
    /// Process the job
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        let job_id = job.id.clone();
        
        // Log job processing start using standardized utility
        job_processor_utils::log_job_start(&job_id, "Voice Transcription");
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::VoiceTranscription(data) => data,
            _ => {
                return Err(AppError::JobError(format!(
                    "Invalid payload for Voice Transcription job {}",
                    job_id
                )));
            }
        };
        
        // Setup job processing and update status to running
        let (repo, _settings_repo, _background_job) = job_processor_utils::setup_job_processing(&job_id, &app_handle).await?;
        
        // Get the transcription client from app state
        let transcription_client = client_factory::get_transcription_client(&self.app_handle)?;
        
        // Call the transcribe method
        let result = transcription_client
            .transcribe(&payload.audio_data, &payload.filename, &payload.model, payload.duration_ms)
            .await;
            
        match result {
            Ok(text) => {
                info!("Voice Transcription job {} completed successfully", job_id);
                debug!("Transcription result: {}", text);
                
                // Finalize job success using standardized utility
                job_processor_utils::finalize_job_success(
                    &job_id,
                    &repo,
                    &text,
                    None, // No LLM usage for transcription
                    &payload.model, // Transcription model used
                    "ServerProxyTranscription", // System prompt ID (processor name for non-LLM)
                    None, // No additional metadata
                ).await?;
                
                Ok(JobProcessResult::success(job_id, text))
            },
            Err(e) => {
                error!("Voice Transcription job {} failed: {}", job_id, e);
                
                // Update job status to failed using standardized utility
                let error_message = format!("Transcription failed: {}", e);
                job_processor_utils::finalize_job_failure(&job_id, &repo, &error_message).await?;
                
                Ok(JobProcessResult::failure(job_id, error_message))
            }
        }
    }
}