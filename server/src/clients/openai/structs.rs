use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_with::skip_serializing_none;

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAITranscriptionResponse {
    pub text: String,
}

// Stream Options for including usage in streaming responses
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamOptions {
    pub include_usage: bool,
}

// OpenAI Chat Completion Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIChatRequest {
    pub model: String,
    pub messages: Vec<OpenAIMessage>,
    pub stream: Option<bool>,
    pub max_tokens: Option<u32>,
    pub max_completion_tokens: Option<u32>,
    pub top_p: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub stop: Option<Vec<String>>,
    pub user: Option<String>,
    pub stream_options: Option<StreamOptions>,
}

// OpenAI Responses API Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesRequest {
    pub model: String,
    pub input: Option<serde_json::Value>, // Can be string or array
    pub instructions: Option<String>,     // System/developer message
    pub stream: Option<bool>,
    pub background: Option<bool>,
    pub max_output_tokens: Option<u32>,
    pub top_p: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub stop: Option<Vec<String>>,
    pub user: Option<String>,
    pub tools: Option<Vec<OpenAIResponsesTool>>,
    pub text: Option<OpenAIResponsesTextFormat>,
    pub reasoning: Option<OpenAIResponsesReasoning>,
    pub store: Option<bool>,
    pub tool_choice: Option<String>, // Usually "auto"
    pub parallel_tool_calls: Option<bool>,
    pub truncation: Option<String>, // "auto" or "disabled"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesResponse {
    pub id: String,
    pub object: String,
    pub status: String,
    pub created_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub model: String,
    pub output: Option<Vec<serde_json::Value>>,
    pub built_in_tool_calls: Option<Vec<serde_json::Value>>,
    pub reasoning: Option<serde_json::Value>,
    pub usage: Option<OpenAIResponsesUsage>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenAIResponsesUsage {
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub total_tokens: i32,
    pub input_tokens_details: Option<serde_json::Value>,
    pub output_tokens_details: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum OpenAIResponsesTool {
    WebSearch {
        #[serde(rename = "type")]
        tool_type: String, // "web_search_preview"
        #[serde(skip_serializing_if = "Option::is_none")]
        user_location: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        search_context_size: Option<String>,
    },
    Function {
        #[serde(rename = "type")]
        tool_type: String, // "function"
        function: serde_json::Value,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesTextFormat {
    pub format: OpenAIResponsesFormatType,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesFormatType {
    #[serde(rename = "type")]
    pub format_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesReasoning {
    pub effort: String,
    pub summary: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesInputItem {
    #[serde(rename = "type")]
    pub item_type: String,
    pub role: Option<String>,
    pub content: Option<Vec<OpenAIResponsesContentPart>>,
}

#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesContentPart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: Option<String>,
    pub image_url: Option<OpenAIImageUrl>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIMessage {
    pub role: String,
    pub content: OpenAIContent,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum OpenAIContent {
    Text(String),
    Parts(Vec<OpenAIContentPart>),
}

#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIContentPart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: Option<String>,
    pub image_url: Option<OpenAIImageUrl>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIImageUrl {
    pub url: String,
    pub detail: Option<String>,
}

// OpenAI Chat Completion Response Structs
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIChatResponse {
    pub id: String,
    pub choices: Vec<OpenAIChoice>,
    pub created: Option<i64>,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<OpenAIUsage>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIChoice {
    pub message: OpenAIResponseMessage,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIResponseMessage {
    pub role: String,
    pub content: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenAIUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub prompt_tokens_details: Option<OpenAIPromptTokensDetails>,
    #[serde(flatten)]
    pub other: Option<serde_json::Value>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenAIPromptTokensDetails {
    pub cached_tokens: Option<i32>,
}

// OpenAI Streaming Structs
#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIStreamChunk {
    pub id: String,
    pub choices: Vec<OpenAIStreamChoice>,
    pub created: Option<i64>,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<OpenAIUsage>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIStreamChoice {
    pub delta: OpenAIStreamDelta,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIStreamDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIStreamOptions {
    pub include_usage: bool,
}

#[derive(Debug, Deserialize)]
pub struct OpenAIError {
    pub error: OpenAIErrorDetails,
}

#[derive(Debug, Deserialize)]
pub struct OpenAIErrorDetails {
    pub message: String,
    pub r#type: String,
    pub param: Option<String>,
    pub code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIFunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ContentItem {
    Text(String),
    Parts(Vec<OpenAIContentPart>),
}

// OpenAI Responses API SSE Event Structs (2025 format)
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIResponsesSSEEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub sequence_number: Option<i64>,
    pub item_id: Option<String>,
    pub output_index: Option<i32>,
    pub content_index: Option<i32>,
    pub delta: Option<String>,
    pub output_text: Option<String>,
    pub response: Option<serde_json::Value>,
    pub logprobs: Option<Vec<serde_json::Value>>,
    pub obfuscation: Option<String>,
}

// State for the streaming process
#[derive(Debug)]
pub enum StreamState {
    Starting,
    Polling {
        last_update: tokio::time::Instant,
        poll_count: u32,
        start_time: tokio::time::Instant,
        consecutive_queued: u32,
    },
    ContentReady {
        content: String,
        usage: Option<OpenAIResponsesUsage>,
    },
    ContentStreaming {
        remaining: String,
        chunk_size: usize,
        usage: Option<OpenAIResponsesUsage>,
    },
    Completed,
}
