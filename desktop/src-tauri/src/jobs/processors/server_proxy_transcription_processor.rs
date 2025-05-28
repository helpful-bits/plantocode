use async_trait::async_trait;
use log::{debug, error, info};
use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::api_clients::client_factory;
use crate::api_clients::client_trait::TranscriptionClient;
use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::jobs::job_helpers;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::JobStatus;

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
            JobPayload::OpenRouterTranscription(_) => true,
            _ => false,
        }
    }
    
    /// Get the processor name
    fn name(&self) -> &'static str {
        Self::processor_name()
    }
    
    /// Process the job
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult> {
        info!("Processing transcription job: {}", job.id());
        
        // Extract the payload
        let payload = match &job.payload {
            JobPayload::OpenRouterTranscription(data) => data,
            _ => return Err(AppError::JobError("Invalid payload type".to_string())),
        };
        
        // Get the job repository
        let job_repo = self.app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        // Update job status to running
        job_helpers::update_job_status_running(&job_repo, job.id()).await?;
        
        // Get the transcription client from app state
        let transcription_client = client_factory::get_transcription_client(&self.app_handle)?;
        
        // Call the transcribe method
        let result = transcription_client
            .transcribe(&payload.audio_data, &payload.filename, &payload.model, payload.duration_ms)
            .await;
            
        match result {
            Ok(text) => {
                info!("Transcription job {} completed successfully", job.id());
                debug!("Transcription result: {}", text);
                
                // Update job status to completed
                let result = JobProcessResult::success(job.id.clone(), text);
                job_helpers::update_job_status_completed(&job_repo, job.id(), &result.response.clone().unwrap_or_default(), None, None, None, None).await?;
                
                Ok(result)
            },
            Err(e) => {
                error!("Transcription job {} failed: {}", job.id(), e);
                
                // Update job status to failed
                let error_message = format!("Transcription failed: {}", e);
                job_helpers::update_job_status_failed(&job_repo, job.id(), &error_message).await?;
                
                Ok(JobProcessResult::failure(job.id.clone(), error_message))
            }
        }
    }
}