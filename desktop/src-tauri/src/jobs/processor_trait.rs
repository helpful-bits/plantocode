use async_trait::async_trait;
use tauri::AppHandle;

use crate::error::AppResult;
use crate::jobs::types::{Job, JobProcessResult, JobPayload};

/// Trait for job processors
#[async_trait]
pub trait JobProcessor: Send + Sync {
    /// Get the processor name
    fn name(&self) -> &str;
    
    /// Check if this processor can handle the given job
    fn can_handle(&self, job: &Job) -> bool;
    
    /// Process a job
    async fn process(&self, job: Job, app_handle: AppHandle) -> AppResult<JobProcessResult>;
}