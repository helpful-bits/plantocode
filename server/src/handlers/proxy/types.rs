use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Clone)]
pub struct LlmCompletionRequest {
    pub model: String,
    pub messages: Vec<Value>,
    pub stream: Option<bool>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub task_type: Option<String>,
    #[serde(flatten)]
    pub other: HashMap<String, Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResponse {
    pub text: String,
}

/// Request structure for text enhancement
#[derive(Debug, Deserialize)]
pub struct TextEnhancementRequest {
    pub text: String,
    pub enhancement_type: Option<String>, // "improve", "grammar", "clarity", "professional", etc.
    pub context: Option<String>,          // Additional context for enhancement
}

/// Response structure for text enhancement
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextEnhancementResponse {
    pub enhanced_text: String,
    pub enhancement_type: String,
    pub usage: TextEnhancementUsage,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextEnhancementUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
}
