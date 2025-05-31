use async_trait::async_trait;
use tauri::AppHandle;
use crate::error::AppResult;
use crate::jobs::types::{Job, JobProcessResult};
use crate::jobs::processor_trait::JobProcessor;

/// Base processor that provides common functionality for all job processors
pub struct BaseProcessor;

impl BaseProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl JobProcessor for BaseProcessor {
    fn name(&self) -> &str {
        "BaseProcessor"
    }

    fn can_handle(&self, _job: &Job) -> bool {
        // Base processor doesn't handle any specific jobs
        false
    }

    async fn process(&self, _job: Job, _app_handle: AppHandle) -> AppResult<JobProcessResult> {
        // Base processor doesn't process any jobs directly
        unreachable!("BaseProcessor should not process jobs directly")
    }
}