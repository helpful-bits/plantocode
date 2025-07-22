use crate::error::AppResult;
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::{Job, JobProcessResult};
use async_trait::async_trait;
use tauri::AppHandle;

/// Base processor that provides common functionality for all job processors
///
/// Note: For reducing boilerplate, processors should use utility functions from
/// `job_processor_utils.rs` for common tasks like:
/// - `setup_job_processing()` for initialization and marking jobs as running
/// - `check_job_canceled()` for cancellation checks
/// - `finalize_job_success()` and `finalize_job_failure()` for completion
/// - `LlmTaskRunner` for complex LLM-based processing workflows
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
