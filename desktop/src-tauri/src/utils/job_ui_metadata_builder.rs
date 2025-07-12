use serde_json::{json, Value};
use crate::jobs::types::{JobUIMetadata, JobPayload};

pub struct JobUIMetadataBuilder {
    job_payload: JobPayload,
    workflow_id: Option<String>,
    task_data: Value,
    display_name: Option<String>,
}

impl JobUIMetadataBuilder {
    pub fn new(job_payload: JobPayload) -> Self {
        Self {
            job_payload,
            workflow_id: None,
            task_data: json!({}),
            display_name: None,
        }
    }

    pub fn workflow_id(mut self, workflow_id: Option<String>) -> Self {
        self.workflow_id = workflow_id;
        self
    }

    pub fn task_data(mut self, task_data: Value) -> Self {
        self.task_data = task_data;
        self
    }

    pub fn retry_info(mut self, retry_count: u32, error_info: Option<Value>) -> Self {
        if let Value::Object(ref mut map) = self.task_data {
            map.insert("retry_count".to_string(), json!(retry_count));
            if let Some(error) = error_info {
                map.insert("retry_error_info".to_string(), error);
            }
        } else {
            let mut retry_data = json!({
                "retry_count": retry_count
            });
            if let Some(error) = error_info {
                retry_data["retry_error_info"] = error;
            }
            self.task_data = retry_data;
        }
        self
    }

    pub fn streaming_progress(mut self, progress: f64, is_active: bool) -> Self {
        if let Value::Object(ref mut map) = self.task_data {
            map.insert("streaming_progress".to_string(), json!(progress));
            map.insert("is_streaming".to_string(), json!(is_active));
        } else {
            self.task_data = json!({
                "streaming_progress": progress,
                "is_streaming": is_active
            });
        }
        self
    }
    
    pub fn display_name(mut self, display_name: Option<String>) -> Self {
        self.display_name = display_name;
        self
    }

    pub fn build(self) -> JobUIMetadata {
        JobUIMetadata {
            job_payload_for_worker: self.job_payload,
            workflow_id: self.workflow_id,
            task_data: self.task_data,
            display_name: self.display_name,
        }
    }
}

pub fn create_simple_job_ui_metadata(job_payload: JobPayload) -> JobUIMetadata {
    JobUIMetadataBuilder::new(job_payload).build()
}

pub fn create_workflow_job_ui_metadata(
    job_payload: JobPayload,
    workflow_id: String,
) -> JobUIMetadata {
    JobUIMetadataBuilder::new(job_payload)
        .workflow_id(Some(workflow_id))
        .build()
}

pub fn create_streaming_job_ui_metadata(
    job_payload: JobPayload,
    progress: f64,
) -> JobUIMetadata {
    JobUIMetadataBuilder::new(job_payload)
        .streaming_progress(progress, true)
        .build()
}