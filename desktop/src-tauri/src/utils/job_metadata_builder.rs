use serde_json::{json, Value, Map};
use std::collections::HashMap;

/// Builder for creating standardized job metadata that builds the `additional_params` field within JobWorkerMetadata
/// This ensures consistency between frontend and backend metadata structures while preserving the core JobWorkerMetadata structure
pub struct JobMetadataBuilder {
    additional_params: Map<String, Value>,
}

impl JobMetadataBuilder {
    /// Create a new metadata builder with empty additional_params
    pub fn new() -> Self {
        Self {
            additional_params: Map::new(),
        }
    }

    /// Create a new builder from existing additional_params Value
    pub fn from_existing_additional_params(additional_params: Option<Value>) -> Self {
        let additional_params_map = additional_params
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_else(Map::new);
        
        Self { 
            additional_params: additional_params_map 
        }
    }

    /// Create a new builder from existing metadata string (for backward compatibility)
    pub fn from_existing(metadata_str: &str) -> Self {
        let metadata = serde_json::from_str::<Value>(metadata_str)
            .ok()
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_else(Map::new);
        
        Self { additional_params: metadata }
    }

    // Common workflow fields
    pub fn workflow_id(mut self, workflow_id: impl Into<String>) -> Self {
        self.additional_params.insert("workflowId".to_string(), json!(workflow_id.into()));
        self
    }

    pub fn workflow_stage(mut self, stage: impl Into<String>) -> Self {
        self.additional_params.insert("workflowStage".to_string(), json!(stage.into()));
        self
    }



    // Streaming fields
    pub fn is_streaming(mut self, is_streaming: bool) -> Self {
        self.additional_params.insert("isStreaming".to_string(), json!(is_streaming));
        self
    }

    pub fn stream_progress(mut self, progress: f64) -> Self {
        self.additional_params.insert("streamProgress".to_string(), json!(progress));
        self
    }

    pub fn response_length(mut self, length: usize) -> Self {
        self.additional_params.insert("responseLength".to_string(), json!(length));
        self
    }

    pub fn estimated_total_length(mut self, length: usize) -> Self {
        self.additional_params.insert("estimatedTotalLength".to_string(), json!(length));
        self
    }

    pub fn last_stream_update_time(mut self, timestamp: u64) -> Self {
        self.additional_params.insert("lastStreamUpdateTime".to_string(), json!(timestamp));
        self
    }

    pub fn stream_start_time(mut self, timestamp: u64) -> Self {
        self.additional_params.insert("streamStartTime".to_string(), json!(timestamp));
        self
    }

    // Task-specific output fields
    pub fn output_path(mut self, path: impl Into<String>) -> Self {
        self.additional_params.insert("outputPath".to_string(), json!(path.into()));
        self
    }

    pub fn target_field(mut self, field: impl Into<String>) -> Self {
        self.additional_params.insert("targetField".to_string(), json!(field.into()));
        self
    }

    pub fn session_name(mut self, name: impl Into<String>) -> Self {
        self.additional_params.insert("sessionName".to_string(), json!(name.into()));
        self
    }

    // Path finder specific data
    pub fn path_finder_data(mut self, data: PathFinderMetadata) -> Self {
        self.additional_params.insert("pathFinderData".to_string(), json!(data));
        self
    }

    // Regex generation specific data
    pub fn regex_data(mut self, data: RegexMetadata) -> Self {
        self.additional_params.insert("regexData".to_string(), json!(data));
        self
    }

    // File finder workflow data
    pub fn file_finder_workflow_data(mut self, data: FileFinderWorkflowMetadata) -> Self {
        self.additional_params.insert("fileFinderWorkflowData".to_string(), json!(data));
        self
    }

    // Model and token information
    pub fn model_used(mut self, model: impl Into<String>) -> Self {
        self.additional_params.insert("modelUsed".to_string(), json!(model.into()));
        self
    }

    pub fn tokens_used(mut self, tokens: u32) -> Self {
        self.additional_params.insert("tokensUsed".to_string(), json!(tokens));
        self
    }

    // Retry and error handling
    pub fn retry_count(mut self, count: u32) -> Self {
        self.additional_params.insert("retryCount".to_string(), json!(count));
        self
    }

    pub fn add_error(mut self, attempt: u32, time: impl Into<String>, message: impl Into<String>) -> Self {
        let error = json!({
            "attempt": attempt,
            "time": time.into(),
            "message": message.into()
        });

        if let Some(errors) = self.additional_params.get_mut("errors") {
            if let Some(errors_array) = errors.as_array_mut() {
                errors_array.push(error);
            }
        } else {
            self.additional_params.insert("errors".to_string(), json!([error]));
        }
        self
    }

    // Legacy fields for backward compatibility
    pub fn path_count(mut self, count: usize) -> Self {
        self.additional_params.insert("pathCount".to_string(), json!(count));
        self
    }

    pub fn path_data(mut self, data: impl Into<String>) -> Self {
        self.additional_params.insert("pathData".to_string(), json!(data.into()));
        self
    }

    pub fn show_pure_content(mut self, show: bool) -> Self {
        self.additional_params.insert("showPureContent".to_string(), json!(show));
        self
    }

    // Custom field support for extensibility
    pub fn custom_field(mut self, key: impl Into<String>, value: Value) -> Self {
        self.additional_params.insert(key.into(), value);
        self
    }

    /// Build the additional_params as a JSON string
    pub fn build(self) -> String {
        Value::Object(self.additional_params).to_string()
    }

    /// Build the additional_params as a serde_json::Value
    pub fn build_value(self) -> Value {
        Value::Object(self.additional_params)
    }
}

impl Default for JobMetadataBuilder {
    fn default() -> Self {
        Self::new()
    }
}

// Structured metadata types for specific tasks

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderMetadata {
    pub paths: Option<Vec<String>>,
    pub count: Option<usize>,
    pub unverified_paths: Option<Vec<String>>,
    pub search_term: Option<String>,
    pub total_found: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexMetadata {
    pub title_regex: Option<String>,
    pub content_regex: Option<String>,
    pub negative_title_regex: Option<String>,
    pub negative_content_regex: Option<String>,
    pub title_regex_description: Option<String>,
    pub content_regex_description: Option<String>,
    pub negative_title_regex_description: Option<String>,
    pub negative_content_regex_description: Option<String>,
    pub regex_summary_explanation: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFinderWorkflowMetadata {
    pub stage: Option<String>,
    pub tree_generated: Option<bool>,
    pub paths_found: Option<usize>,
    pub validated_paths: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_metadata_builder() {
        let metadata = JobMetadataBuilder::new()
            .workflow_id("test-workflow")
            .workflow_stage("processing")
            .model_used("gpt-4")
            .tokens_used(150)
            .build();

        let parsed: Value = serde_json::from_str(&metadata).unwrap();
        assert_eq!(parsed["workflowId"], "test-workflow");
        assert_eq!(parsed["workflowStage"], "processing");
        assert_eq!(parsed["modelUsed"], "gpt-4");
        assert_eq!(parsed["tokensUsed"], 150);
    }

    #[test]
    fn test_path_finder_metadata() {
        let path_data = PathFinderMetadata {
            paths: Some(vec!["src/main.rs".to_string(), "src/lib.rs".to_string()]),
            count: Some(2),
            unverified_paths: None,
            search_term: Some("rust".to_string()),
            total_found: Some(2),
        };

        let metadata = JobMetadataBuilder::new()
            .path_finder_data(path_data)
            .build();

        let parsed: Value = serde_json::from_str(&metadata).unwrap();
        assert!(parsed["pathFinderData"].is_object());
        assert_eq!(parsed["pathFinderData"]["count"], 2);
        assert_eq!(parsed["pathFinderData"]["searchTerm"], "rust");
    }

    #[test]
    fn test_streaming_metadata() {
        let metadata = JobMetadataBuilder::new()
            .is_streaming(true)
            .stream_progress(45.5)
            .response_length(1024)
            .estimated_total_length(2048)
            .build();

        let parsed: Value = serde_json::from_str(&metadata).unwrap();
        assert_eq!(parsed["isStreaming"], true);
        assert_eq!(parsed["streamProgress"], 45.5);
        assert_eq!(parsed["responseLength"], 1024);
        assert_eq!(parsed["estimatedTotalLength"], 2048);
    }

    #[test]
    fn test_error_handling() {
        let metadata = JobMetadataBuilder::new()
            .add_error(1, "2023-12-01T10:00:00Z", "Connection timeout")
            .add_error(2, "2023-12-01T10:05:00Z", "Rate limit exceeded")
            .build();

        let parsed: Value = serde_json::from_str(&metadata).unwrap();
        let errors = parsed["errors"].as_array().unwrap();
        assert_eq!(errors.len(), 2);
        assert_eq!(errors[0]["attempt"], 1);
        assert_eq!(errors[1]["message"], "Rate limit exceeded");
    }

    #[test]
    fn test_from_existing_metadata() {
        let existing = r#"{"workflowId": "existing", "customField": "value"}"#;
        let metadata = JobMetadataBuilder::from_existing(existing)
            .workflow_stage("updated")
            .model_used("gpt-4")
            .build();

        let parsed: Value = serde_json::from_str(&metadata).unwrap();
        assert_eq!(parsed["workflowId"], "existing");
        assert_eq!(parsed["customField"], "value");
        assert_eq!(parsed["workflowStage"], "updated");
        assert_eq!(parsed["modelUsed"], "gpt-4");
    }
}