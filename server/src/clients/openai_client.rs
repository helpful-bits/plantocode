// Step 3: Cached Token Pricing Implementation
// This file implements cached token counting for OpenAI API.
// Token extraction functions return: (uncached_input, cache_write, cache_read, output)
// For OpenAI: cache_write=0 (writes same price as uncached), cache_read=cached_tokens
use reqwest::{Client, multipart::{Form, Part}, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use crate::config::settings::AppSettings;
use crate::error::AppError;
use base64::Engine;
use tracing::{debug, info, instrument};
use actix_web::web;
use futures_util::{Stream, StreamExt};
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use chrono;
use uuid;

// OpenAI API base URL
const OPENAI_BASE_URL: &str = "https://api.openai.com/v1";

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAITranscriptionResponse {
    pub text: String,
}

// OpenAI Chat Completion Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIChatRequest {
    pub model: String,
    pub messages: Vec<OpenAIMessage>,
    pub stream: Option<bool>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub max_completion_tokens: Option<u32>,
    pub top_p: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub stop: Option<Vec<String>>,
    pub user: Option<String>,
}

// OpenAI Responses API Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesRequest {
    pub model: String,
    pub input: Vec<OpenAIResponsesInputItem>,
    pub stream: Option<bool>,
    pub background: Option<bool>,
    pub temperature: Option<f32>,
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
pub struct OpenAIResponsesTool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub user_location: Option<OpenAIResponsesUserLocation>,
    pub search_context_size: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIResponsesUserLocation {
    #[serde(rename = "type")]
    pub location_type: String,
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

#[derive(Debug)]
pub struct OpenAIClient {
    client: Client,
    api_key: String,
    base_url: String,
    request_id_counter: Arc<Mutex<u64>>,
}

impl OpenAIClient {
    pub fn new(app_settings: &AppSettings) -> Result<Self, AppError> {
        let api_key = app_settings
            .api_keys
            .openai_api_key
            .as_ref()
            .ok_or_else(|| AppError::Configuration("OPENAI_API_KEY must be set".to_string()))?
            .clone();

        let client = Client::new();
        let base_url = OPENAI_BASE_URL.to_string();

        Ok(Self {
            client,
            api_key,
            base_url,
            request_id_counter: Arc::new(Mutex::new(0)),
        })
    }

    async fn get_next_request_id(&self) -> u64 {
        let mut counter = self.request_id_counter.lock().await;
        *counter += 1;
        *counter
    }

    fn endpoint_for_model(model: &str) -> &'static str {
        if model.contains(":web") || model.contains("deep-research") {
            return "responses";
        }
        if model.contains("codex") 
            || model.contains("transcribe") 
            || model.ends_with("-preview")
            || model.starts_with("o4-")
            || model.contains("o4-mini")
            || model.contains("computer-use") {
            "responses"
        } else {
            "chat/completions"
        }
    }

    fn convert_messages_to_responses_input(messages: &[OpenAIMessage]) -> Vec<OpenAIResponsesInputItem> {
        messages.iter().map(|message| {
            let content = match &message.content {
                OpenAIContent::Text(text) => {
                    vec![OpenAIResponsesContentPart {
                        part_type: "input_text".to_string(),
                        text: Some(text.clone()),
                        image_url: None,
                    }]
                },
                OpenAIContent::Parts(parts) => {
                    parts.iter().map(|part| {
                        let part_type = match part.part_type.as_str() {
                            "text" => "input_text",
                            "image_url" => "input_image",
                            _ => "input_text", // fallback
                        };
                        OpenAIResponsesContentPart {
                            part_type: part_type.to_string(),
                            text: part.text.clone(),
                            image_url: part.image_url.clone(),
                        }
                    }).collect()
                }
            };

            OpenAIResponsesInputItem {
                item_type: "message".to_string(),
                role: Some(message.role.clone()),
                content: Some(content),
            }
        }).collect()
    }

    fn model_requires_tools(model: &str) -> Option<Vec<OpenAIResponsesTool>> {
        if model.contains("deep-research") || model.contains(":web") {
            // Enhanced web search tool for :web models, basic for deep-research
            let tool = if model.contains(":web") {
                OpenAIResponsesTool {
                    tool_type: "web_search_preview".to_string(),
                    user_location: Some(OpenAIResponsesUserLocation {
                        location_type: "approximate".to_string(),
                    }),
                    search_context_size: Some("medium".to_string()),
                }
            } else {
                OpenAIResponsesTool {
                    tool_type: "web_search_preview".to_string(),
                    user_location: None,
                    search_context_size: None,
                }
            };
            Some(vec![tool])
        } else {
            None
        }
    }

    fn model_requires_background(model: &str) -> bool {
        model.contains("deep-research") || model.contains(":web")
    }

    fn create_deep_research_stream(
        client: Client,
        api_key: String,
        base_url: String,
        response_id: String,
        model: String,
        token_counter: Arc<Mutex<Option<(i32, i32)>>>,
    ) -> impl Stream<Item = Result<web::Bytes, AppError>> + Send + 'static {
        use futures_util::stream::{self, StreamExt};
        use tokio::time::{sleep, Duration, Instant};
        
        // State for the streaming process
        #[derive(Debug)]
        enum StreamState {
            Starting,
            Polling { last_update: Instant, poll_count: u32 },
            ContentReady { content: String, usage: Option<OpenAIResponsesUsage> },
            ContentStreaming { remaining: String, chunk_size: usize, usage: Option<OpenAIResponsesUsage> },
            Completed,
        }
        
        stream::unfold(
            StreamState::Starting,
            move |state| {
                let client = client.clone();
                let api_key = api_key.clone();
                let base_url = base_url.clone();
                let response_id = response_id.clone();
                let model = model.clone();
                let token_counter = token_counter.clone();
                
                async move {
                    match state {
                        StreamState::Starting => {
                            // Send initial chunk
                            let initial_chunk = Self::create_chat_completion_chunk(
                                &response_id,
                                &model,
                                "Deep research analysis starting...",
                                false,
                                None,
                            );
                            Some((
                                Ok(web::Bytes::from(initial_chunk)),
                                StreamState::Polling { last_update: Instant::now(), poll_count: 0 }
                            ))
                        },
                        
                        StreamState::Polling { last_update, poll_count } => {
                            // Wait between polls
                            if last_update.elapsed() < Duration::from_secs(3) {
                                sleep(Duration::from_millis(500)).await;
                                return Some((
                                    Ok(web::Bytes::from("")), // Empty chunk to keep connection alive
                                    StreamState::Polling { last_update, poll_count }
                                ));
                            }
                            
                            // Poll the background job
                            let poll_url = format!("{}/responses/{}", base_url, response_id);
                            match client.get(&poll_url).bearer_auth(&api_key).send().await {
                                Ok(poll_response) => {
                                    if let Ok(response_text) = poll_response.text().await {
                                        if let Ok(responses_response) = serde_json::from_str::<OpenAIResponsesResponse>(&response_text) {
                                            match responses_response.status.as_str() {
                                                "completed" => {
                                                    // Extract content and prepare for streaming
                                                    let content = Self::extract_content_from_responses(&responses_response);
                                                    
                                                    // Update token counter
                                                    if let Some(usage) = &responses_response.usage {
                                                        if let Ok(mut counter) = token_counter.try_lock() {
                                                            *counter = Some((usage.input_tokens, usage.output_tokens));
                                                        }
                                                    }
                                                    
                                                    Some((
                                                        Ok(web::Bytes::from("")), // Transition chunk
                                                        StreamState::ContentReady { 
                                                            content, 
                                                            usage: responses_response.usage 
                                                        }
                                                    ))
                                                },
                                                "failed" | "cancelled" => {
                                                    let error_chunk = Self::create_chat_completion_chunk(
                                                        &response_id,
                                                        &model,
                                                        &format!("Research failed: {}", responses_response.status),
                                                        true,
                                                        None,
                                                    );
                                                    Some((
                                                        Ok(web::Bytes::from(error_chunk)),
                                                        StreamState::Completed
                                                    ))
                                                },
                                                _ => {
                                                    // Still in progress, send progress update
                                                    let progress_messages = [
                                                        "Conducting web research...",
                                                        "Analyzing information...", 
                                                        "Processing research findings...",
                                                        "Synthesizing comprehensive response...",
                                                    ];
                                                    let message_idx = (poll_count / 3) as usize % progress_messages.len();
                                                    let progress_chunk = Self::create_chat_completion_chunk(
                                                        &response_id,
                                                        &model,
                                                        progress_messages[message_idx],
                                                        false,
                                                        None,
                                                    );
                                                    Some((
                                                        Ok(web::Bytes::from(progress_chunk)),
                                                        StreamState::Polling { 
                                                            last_update: Instant::now(), 
                                                            poll_count: poll_count + 1 
                                                        }
                                                    ))
                                                }
                                            }
                                        } else {
                                            // Parsing error, continue polling
                                            Some((
                                                Ok(web::Bytes::from("")),
                                                StreamState::Polling { last_update, poll_count }
                                            ))
                                        }
                                    } else {
                                        // Response read error, continue polling
                                        Some((
                                            Ok(web::Bytes::from("")),
                                            StreamState::Polling { last_update, poll_count }
                                        ))
                                    }
                                },
                                Err(_) => {
                                    // Network error, continue polling
                                    Some((
                                        Ok(web::Bytes::from("")),
                                        StreamState::Polling { last_update, poll_count }
                                    ))
                                }
                            }
                        },
                        
                        StreamState::ContentReady { content, usage } => {
                            // Start streaming the actual content
                            Some((
                                Ok(web::Bytes::from("")), // Transition chunk
                                StreamState::ContentStreaming { 
                                    remaining: content, 
                                    chunk_size: 50, // Characters per chunk
                                    usage 
                                }
                            ))
                        },
                        
                        StreamState::ContentStreaming { remaining, chunk_size, usage } => {
                            if remaining.is_empty() {
                                // Send final completion chunk with usage
                                let usage_info = usage.map(|u| (u.input_tokens, u.output_tokens));
                                let final_chunk = Self::create_chat_completion_chunk(
                                    &response_id,
                                    &model,
                                    "",
                                    true,
                                    usage_info,
                                );
                                Some((
                                    Ok(web::Bytes::from(final_chunk)),
                                    StreamState::Completed
                                ))
                            } else {
                                // Send next content chunk
                                let chunk_text = if remaining.chars().count() <= chunk_size {
                                    remaining.clone()
                                } else {
                                    // Find a good break point (space, newline, etc.)
                                    let mut end_pos = chunk_size.min(remaining.chars().count());
                                    let remaining_chars: Vec<char> = remaining.chars().collect();
                                    
                                    // Look for whitespace within the chunk size
                                    for i in (chunk_size / 2..end_pos).rev() {
                                        if i < remaining_chars.len() && remaining_chars[i].is_whitespace() {
                                            end_pos = i + 1;
                                            break;
                                        }
                                    }
                                    
                                    remaining_chars[..end_pos].iter().collect()
                                };
                                
                                let new_remaining = remaining.chars().skip(chunk_text.chars().count()).collect::<String>();
                                let content_chunk = Self::create_chat_completion_chunk(
                                    &response_id,
                                    &model,
                                    &chunk_text,
                                    false,
                                    None,
                                );
                                
                                // Small delay to simulate natural typing
                                sleep(Duration::from_millis(50)).await;
                                
                                Some((
                                    Ok(web::Bytes::from(content_chunk)),
                                    StreamState::ContentStreaming { 
                                        remaining: new_remaining, 
                                        chunk_size, 
                                        usage 
                                    }
                                ))
                            }
                        },
                        
                        StreamState::Completed => {
                            None // End the stream
                        }
                    }
                }
            }
        )
    }

    async fn wait_until_complete(&self, response_id: &str) -> Result<OpenAIResponsesResponse, AppError> {
        use tokio::time::{sleep, Duration};
        
        loop {
            let url = format!("{}/responses/{}", self.base_url, response_id);
            let response = self.client
                .get(&url)
                .bearer_auth(&self.api_key)
                .send()
                .await
                .map_err(|e| AppError::External(format!("Failed to poll response: {}", e)))?;

            let status = response.status();
            if !status.is_success() {
                let error_text = response.text().await
                    .unwrap_or_else(|_| "Failed to get polling error response".to_string());
                return Err(AppError::External(format!(
                    "Polling failed with status {}: {}",
                    status, error_text
                )));
            }

            // Debug: log the raw response before parsing
            let response_text = response.text().await
                .map_err(|e| AppError::Internal(format!("Failed to read polling response: {}", e)))?;
            
            tracing::debug!("Polling response body: {}", response_text);
            
            let responses_response: OpenAIResponsesResponse = serde_json::from_str(&response_text)
                .map_err(|e| AppError::Internal(format!("Failed to parse polling response: {} - Body: {}", e, response_text)))?;

            match responses_response.status.as_str() {
                "completed" => return Ok(responses_response),
                "failed" | "cancelled" => {
                    return Err(AppError::External(format!("Response job failed with status: {}", responses_response.status)));
                },
                "queued" | "in_progress" => {
                    sleep(Duration::from_secs(2)).await;
                    continue;
                },
                _ => {
                    sleep(Duration::from_secs(2)).await;
                    continue;
                }
            }
        }
    }

    fn transform_responses_chunk_to_chat_format(chunk_str: &str) -> Result<String, AppError> {
        let mut transformed_lines = Vec::new();
        
        for line in chunk_str.lines() {
            if line.starts_with("data: ") {
                let json_str = &line[6..]; // Remove "data: " prefix
                if json_str.trim() == "[DONE]" {
                    transformed_lines.push(line.to_string());
                    continue;
                }
                
                match serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                    Ok(parsed) => {
                        // Transform Responses API chunk to Chat Completions format
                        if let Some(chunk_type) = parsed.get("type").and_then(|t| t.as_str()) {
                            match chunk_type {
                                "response.created" => {
                                    // Initial response creation - transform to chat completion chunk
                                    if let Some(response) = parsed.get("response") {
                                        let transformed_chunk = serde_json::json!({
                                            "id": response.get("id").unwrap_or(&serde_json::Value::String("chatcmpl-unknown".to_string())),
                                            "object": "chat.completion.chunk",
                                            "created": response.get("created_at").unwrap_or(&serde_json::json!(chrono::Utc::now().timestamp())),
                                            "model": response.get("model").unwrap_or(&serde_json::Value::String("unknown".to_string())),
                                            "choices": [{
                                                "index": 0,
                                                "delta": {},
                                                "finish_reason": null
                                            }]
                                        });
                                        let transformed_json = serde_json::to_string(&transformed_chunk)?;
                                        transformed_lines.push(format!("data: {}", transformed_json));
                                    }
                                },
                                "response.output_text.delta" => {
                                    // Text delta - transform to chat completion delta
                                    let delta_text = parsed.get("delta").and_then(|d| d.as_str()).unwrap_or("");
                                    let transformed_chunk = serde_json::json!({
                                        "id": "chatcmpl-unknown",
                                        "object": "chat.completion.chunk",
                                        "created": chrono::Utc::now().timestamp(),
                                        "model": "unknown",
                                        "choices": [{
                                            "index": 0,
                                            "delta": {
                                                "content": delta_text
                                            },
                                            "finish_reason": null
                                        }]
                                    });
                                    let transformed_json = serde_json::to_string(&transformed_chunk)?;
                                    transformed_lines.push(format!("data: {}", transformed_json));
                                },
                                "response.completed" | "response.done" => {
                                    // Response completion - transform to final chunk with usage
                                    if let Some(response) = parsed.get("response") {
                                        let usage = response.get("usage");
                                        let transformed_chunk = serde_json::json!({
                                            "id": response.get("id").unwrap_or(&serde_json::Value::String("chatcmpl-unknown".to_string())),
                                            "object": "chat.completion.chunk",
                                            "created": response.get("created_at").unwrap_or(&serde_json::json!(chrono::Utc::now().timestamp())),
                                            "model": response.get("model").unwrap_or(&serde_json::Value::String("unknown".to_string())),
                                            "choices": [{
                                                "index": 0,
                                                "delta": {},
                                                "finish_reason": "stop"
                                            }],
                                            "usage": usage
                                        });
                                        let transformed_json = serde_json::to_string(&transformed_chunk)?;
                                        transformed_lines.push(format!("data: {}", transformed_json));
                                    }
                                },
                                _ => {
                                    // Pass through other event types as-is
                                    transformed_lines.push(line.to_string());
                                }
                            }
                        } else {
                            // No type field, pass through as-is
                            transformed_lines.push(line.to_string());
                        }
                    },
                    Err(_) => {
                        // If parsing fails, pass through as-is
                        transformed_lines.push(line.to_string());
                    }
                }
            } else {
                // Non-data lines, pass through as-is
                transformed_lines.push(line.to_string());
            }
        }
        
        Ok(transformed_lines.join("\n"))
    }

    fn prepare_request_body(request: &OpenAIChatRequest, force_background: Option<bool>) -> Result<(String, serde_json::Value), AppError> {
        let endpoint = Self::endpoint_for_model(&request.model);
        let request_body = if endpoint == "responses" {
            let max_output_tokens = request.max_completion_tokens
                .or(request.max_tokens)
                .or(Some(512)); // Default for deep-research models since 26 Jun 2025
            let input = Self::convert_messages_to_responses_input(&request.messages);
            let tools = Self::model_requires_tools(&request.model);
            
            // Only use background when explicitly forced (don't auto-set for :web and deep-research)
            let background = force_background;
            
            // Use cleaned model ID for API call (strip provider prefix and :web suffix)
            let api_model_id = if request.model.contains(":web") {
                let cleaned = request.model.replace(":web", "");
                // Strip provider prefix (e.g., "openai/" -> "")
                cleaned.split('/').last().unwrap_or(&cleaned).to_string()
            } else {
                // Strip provider prefix for regular models too
                request.model.split('/').last().unwrap_or(&request.model).to_string()
            };
            
            // Only add web search specific fields for :web models
            let (text_format, reasoning_config, store_config) = if request.model.contains(":web") {
                (
                    Some(OpenAIResponsesTextFormat {
                        format: OpenAIResponsesFormatType {
                            format_type: "text".to_string(),
                        },
                    }),
                    Some(OpenAIResponsesReasoning {
                        effort: "medium".to_string(),
                        summary: "auto".to_string(),
                    }),
                    Some(true), // Must be true when using background processing
                )
            } else {
                (None, None, None)
            };
            
            // Ensure request uniqueness to prevent OpenAI response ID deduplication
            let unique_user_id = if background.unwrap_or(false) {
                // For background requests, append unique timestamp and UUID to prevent deduplication
                let timestamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
                let unique_suffix = format!("_{}_{}", timestamp, uuid::Uuid::new_v4());
                match &request.user {
                    Some(existing_user) => {
                        // Truncate original user ID to ensure total length stays under 100 chars
                        let max_base_len = 100 - unique_suffix.len();
                        let truncated_user = if existing_user.len() > max_base_len {
                            &existing_user[..max_base_len]
                        } else {
                            existing_user
                        };
                        format!("{}{}", truncated_user, unique_suffix)
                    },
                    None => unique_suffix,
                }
            } else {
                request.user.clone().unwrap_or_default()
            };

            let responses_request = OpenAIResponsesRequest {
                model: api_model_id,
                input,
                stream: request.stream,
                background,
                temperature: if request.model.contains("o3") && request.model.contains(":web") {
                    None // o3:web models still don't support temperature parameter
                } else {
                    request.temperature
                },
                max_output_tokens,
                top_p: request.top_p,
                frequency_penalty: request.frequency_penalty,
                presence_penalty: request.presence_penalty,
                stop: request.stop.clone(),
                user: Some(unique_user_id),
                tools,
                text: text_format,
                reasoning: reasoning_config,
                store: store_config,
            };
            serde_json::to_value(responses_request)?
        } else {
            // Use cleaned model ID for chat completions API call (strip :web suffix)
            let mut chat_request = request.clone();
            if chat_request.model.contains(":web") {
                chat_request.model = chat_request.model.replace(":web", "");
            }
            serde_json::to_value(chat_request)?
        };
        Ok((endpoint.to_string(), request_body))
    }

    // Chat Completions
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn chat_completion(
        &self, 
        request: OpenAIChatRequest
    ) -> Result<(OpenAIChatResponse, HeaderMap, i32, i32, i32, i32), AppError> {
        let request_id = self.get_next_request_id().await;
        let endpoint = Self::endpoint_for_model(&request.model);
        
        // For deep research models, use wait-then-complete pattern
        if endpoint == "responses" && Self::model_requires_background(&request.model) {
            // Step 1: Create background job
            let mut background_request = request.clone();
            background_request.stream = Some(false);
            let (_, request_body) = Self::prepare_request_body(&background_request, Some(true))?;
            let url = format!("{}/{}", self.base_url, endpoint);
            
            let response = self.client
                .post(&url)
                .bearer_auth(&self.api_key)
                .header("Content-Type", "application/json")
                .header("X-Request-ID", request_id.to_string())
                .json(&request_body)
                .send()
                .await
                .map_err(|e| AppError::External(format!("OpenAI request failed: {}", e)))?;
            
            let status = response.status();
            let headers = response.headers().clone();
            
            if !status.is_success() {
                let error_text = response.text().await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "OpenAI request failed with status {}: {}",
                    status, error_text
                )));
            }
            
            let background_response: OpenAIResponsesResponse = response.json().await
                .map_err(|e| AppError::Internal(format!("OpenAI deserialization failed: {}", e)))?;
            
            // Step 2: Wait for completion
            let completed_response = self.wait_until_complete(&background_response.id).await?;
            
            // Step 3: Convert to chat completion format
            let (prompt_tokens, cache_write, cache_read, completion_tokens) = if let Some(usage) = &completed_response.usage {
                // Responses API doesn't currently support cached tokens
                (usage.input_tokens, 0, 0, usage.output_tokens)
            } else {
                (0, 0, 0, 0)
            };
            
            // Extract text content from output
            let content = completed_response.output
                .as_ref()
                .and_then(|outputs| {
                    // Find message output type with content
                    outputs.iter().find_map(|output| {
                        if output.get("type").and_then(|t| t.as_str()) == Some("message") {
                            output.get("content")
                                .and_then(|content_array| content_array.as_array())
                                .and_then(|array| {
                                    array.iter().find_map(|content_item| {
                                        if content_item.get("type").and_then(|t| t.as_str()) == Some("output_text") {
                                            content_item.get("text").and_then(|text| text.as_str())
                                        } else {
                                            None
                                        }
                                    })
                                })
                        } else {
                            None
                        }
                    })
                })
                .unwrap_or("")
                .to_string();
            
            // Convert Responses usage to Chat Completions usage format
            let chat_usage = completed_response.usage.map(|responses_usage| OpenAIUsage {
                prompt_tokens: responses_usage.input_tokens,
                completion_tokens: responses_usage.output_tokens,
                total_tokens: responses_usage.total_tokens,
                prompt_tokens_details: None, // Responses API doesn't provide cached token details
            });
            
            let chat_response = OpenAIChatResponse {
                id: completed_response.id,
                choices: vec![OpenAIChoice {
                    message: OpenAIResponseMessage {
                        role: "assistant".to_string(),
                        content: Some(content),
                    },
                    index: 0,
                    finish_reason: Some("stop".to_string()),
                }],
                created: completed_response.created_at,
                model: completed_response.model,
                object: Some("chat.completion".to_string()),
                usage: chat_usage,
            };
            
            return Ok((chat_response, headers, prompt_tokens, cache_write, cache_read, completion_tokens));
        }
        
        // Standard flow for non-background models
        let (_, request_body) = Self::prepare_request_body(&request, None)?;
        let url = format!("{}/{}", self.base_url, endpoint);
        
        let response = self.client
            .post(&url)
            .bearer_auth(&self.api_key)
            .header("Content-Type", "application/json")
            .header("X-Request-ID", request_id.to_string())
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenAI request failed: {}", e)))?;
        
        let status = response.status();
        let headers = response.headers().clone();
        
        if !status.is_success() {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "OpenAI request failed with status {}: {}",
                status, error_text
            )));
        }
        
        let result = response.json::<OpenAIChatResponse>().await
            .map_err(|e| AppError::Internal(format!("OpenAI deserialization failed: {}", e)))?;
            
        let (prompt_tokens, cache_write, cache_read, completion_tokens) = if let Some(usage) = &result.usage {
            let cached = usage.prompt_tokens_details
                .as_ref()
                .and_then(|details| details.cached_tokens)
                .unwrap_or(0);
            // Format: (uncached_input, cache_write, cache_read, output)
            (usage.prompt_tokens, 0, cached, usage.completion_tokens)
        } else {
            (0, 0, 0, 0)
        };
        
        Ok((result, headers, prompt_tokens, cache_write, cache_read, completion_tokens))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn stream_chat_completion(
        &self, 
        request: OpenAIChatRequest
    ) -> Result<(HeaderMap, Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>, Arc<Mutex<Option<(i32, i32)>>>), AppError> {
        // Clone necessary parts for 'static lifetime
        let client = self.client.clone();
        let api_key = self.api_key.clone();
        let base_url = self.base_url.clone();
        let request_id_counter = self.request_id_counter.clone();
        
        let endpoint = Self::endpoint_for_model(&request.model);
        
        // Shared token counter for streaming
        let token_counter = Arc::new(Mutex::new(None::<(i32, i32)>));
        let token_counter_clone = token_counter.clone();
        
        // For deep research models, use immediate streaming with progress updates
        if endpoint == "responses" && Self::model_requires_background(&request.model) {
            tracing::info!("Using immediate synthetic streaming for deep research model: {}", request.model);
            
            // Step 1: Create background job (non-blocking)
            let mut background_request = request.clone();
            background_request.stream = Some(false);
            let (_, background_body) = Self::prepare_request_body(&background_request, Some(true))?;
            let create_url = format!("{}/{}", base_url, endpoint);
            
            let create_response = client
                .post(&create_url)
                .bearer_auth(&api_key)
                .header("Content-Type", "application/json")
                .json(&background_body)
                .send()
                .await
                .map_err(|e| AppError::External(format!("OpenAI background request failed: {}", e)))?;
                
            let create_status = create_response.status();
            if !create_status.is_success() {
                let error_text = create_response.text().await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "OpenAI background request failed with status {}: {}",
                    create_status, error_text
                )));
            }
            
            let create_response_text = create_response.text().await
                .map_err(|e| AppError::Internal(format!("Failed to read background response: {}", e)))?;
            
            let background_response: OpenAIResponsesResponse = serde_json::from_str(&create_response_text)
                .map_err(|e| AppError::Internal(format!("Failed to parse background response: {} - Body: {}", e, create_response_text)))?;
                
            let response_id = background_response.id.clone();
            let response_model = request.model.clone();
            
            // Step 2: Create immediate streaming response with progress updates
            let synthetic_stream = Self::create_deep_research_stream(
                client,
                api_key,
                base_url,
                response_id,
                response_model,
                token_counter_clone,
            );
            
            let headers = HeaderMap::new(); // Default headers for synthetic stream
            let boxed_stream: Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>> = Box::pin(synthetic_stream);
            return Ok((headers, boxed_stream, token_counter));
        }
        
        // Standard streaming flow for non-background models
        let mut streaming_request = request.clone();
        streaming_request.stream = Some(true);
        let (_, request_body) = Self::prepare_request_body(&streaming_request, None)?;
        
        // Create the stream in an async move block to ensure 'static lifetime
        let result = async move {
            let request_id = {
                let mut counter = request_id_counter.lock().await;
                *counter += 1;
                *counter
            };
            let url = format!("{}/{}", base_url, endpoint);
            
            let response = client
                .post(&url)
                .bearer_auth(&api_key)
                .header("Content-Type", "application/json")
                .header("X-Request-ID", request_id.to_string())
                .json(&request_body)
                .send()
                .await
                .map_err(|e| AppError::External(format!("OpenAI request failed: {}", e)))?;
            
            let status = response.status();
            let headers = response.headers().clone();
            
            if !status.is_success() {
                let error_text = response.text().await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "OpenAI streaming request failed with status {}: {}",
                    status, error_text
                )));
            }
            
            // Return a stream that can be consumed by actix-web
            let stream = response.bytes_stream()
                .map(move |result| {
                    match result {
                        Ok(bytes) => {
                            if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                                // Transform Responses API format to Chat Completions format if needed
                                if endpoint == "responses" {
                                    match Self::transform_responses_chunk_to_chat_format(chunk_str) {
                                        Ok(transformed) => {
                                            // Try to extract token information from transformed chunk
                                            if let Some((prompt_tokens, _cache_write, _cache_read, completion_tokens)) = Self::extract_tokens_from_chat_stream_chunk(&transformed) {
                                                if let Ok(mut counter) = token_counter_clone.try_lock() {
                                                    *counter = Some((prompt_tokens, completion_tokens));
                                                }
                                            }
                                            return Ok(web::Bytes::from(transformed));
                                        },
                                        Err(_) => {
                                            // If transformation fails, pass through original
                                            return Ok(web::Bytes::from(bytes));
                                        }
                                    }
                                } else {
                                    // Try to extract token information from chunk
                                    if let Some((prompt_tokens, _cache_write, _cache_read, completion_tokens)) = Self::extract_tokens_from_chat_stream_chunk(chunk_str) {
                                        if let Ok(mut counter) = token_counter_clone.try_lock() {
                                            *counter = Some((prompt_tokens, completion_tokens));
                                        }
                                    }
                                }
                            }
                            Ok(web::Bytes::from(bytes))
                        },
                        Err(e) => Err(AppError::External(format!("OpenAI network error: {}", e))),
                    }
                });
                
            let boxed_stream: Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>> = Box::pin(stream);
            Ok((headers, boxed_stream))
        }.await?;
        
        Ok((result.0, result.1, token_counter))
    }

    /// Transcribe audio using OpenAI's direct API with GPT-4o-transcribe
    #[instrument(skip(self, audio_data), fields(filename = %filename))]
    pub async fn transcribe_audio(
        &self,
        audio_data: &[u8],
        filename: &str,
        model: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
        mime_type: &str,
    ) -> Result<String, AppError> {
        let url = format!("{}/audio/transcriptions", self.base_url);

        // Validate transcription model is supported
        Self::validate_transcription_model(model)?;

        // Validate audio data
        if audio_data.is_empty() {
            return Err(AppError::Validation("Audio data cannot be empty".to_string()));
        }

        // Validate minimum size to filter out malformed chunks
        const MIN_FILE_SIZE: usize = 1000; // 1KB minimum
        if audio_data.len() < MIN_FILE_SIZE {
            return Err(AppError::Validation(format!(
                "Audio file too small ({}B < 1KB) - likely malformed",
                audio_data.len()
            )));
        }

        // Validate file size (25MB limit for OpenAI)
        const MAX_FILE_SIZE: usize = 25 * 1024 * 1024; // 25MB
        if audio_data.len() > MAX_FILE_SIZE {
            return Err(AppError::Validation(format!(
                "Audio file too large ({}MB > 25MB)",
                audio_data.len() / (1024 * 1024)
            )));
        }

        // Basic WebM header validation
        if filename.ends_with(".webm") && audio_data.len() >= 4 {
            // WebM files should start with EBML header (0x1A, 0x45, 0xDF, 0xA3)
            if audio_data[0] != 0x1A || audio_data[1] != 0x45 || audio_data[2] != 0xDF || audio_data[3] != 0xA3 {
                debug!("WebM header validation failed for {}: {:02X} {:02X} {:02X} {:02X}", 
                       filename, audio_data[0], audio_data[1], audio_data[2], audio_data[3]);
                return Err(AppError::Validation("Invalid WebM file format - missing EBML header".to_string()));
            }
        }

        // Create multipart form with proper filename - this is critical!
        let file_part = Part::bytes(audio_data.to_vec())
            .file_name(filename.to_string())  // Critical: GPT-4o needs the .webm extension
            .mime_str(mime_type)           // Keep MIME simple, no codec parameters
            .map_err(|e| AppError::Validation(format!("Invalid audio mime type: {}", e)))?;

        let mut form = Form::new()
            .part("file", file_part)
            .text("model", model.to_string());

        // Add optional parameters
        if let Some(lang) = language {
            form = form.text("language", lang.to_string());
        }
        if let Some(p) = prompt {
            form = form.text("prompt", p.to_string());
        }
        if let Some(temp) = temperature {
            form = form.text("temperature", temp.to_string());
        }

        info!("Sending transcription request to OpenAI: {} ({} bytes)", filename, audio_data.len());
        debug!("Using model: {}, language: {:?}, prompt: {:?}, temperature: {:?}, mime_type: {}", 
               model, language, prompt, temperature, mime_type);
        debug!("Audio data header (first 16 bytes): {:02X?}", &audio_data[..audio_data.len().min(16)]);
        debug!("Multipart form will be sent with filename: {} and mime_type: {}", filename, mime_type);

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenAI transcription request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "OpenAI transcription error ({}): {}",
                status,
                error_text
            )));
        }

        let transcription: OpenAITranscriptionResponse = response
            .json()
            .await
            .map_err(|e| AppError::External(format!("Failed to parse OpenAI transcription response: {}", e)))?;

        info!("Transcription successful: {} characters", transcription.text.len());
        Ok(transcription.text)
    }

    /// Transcribe audio from base64 data URI
    #[instrument(skip(self, data_uri))]
    pub async fn transcribe_from_data_uri(
        &self,
        data_uri: &str,
        filename: &str,
        model: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
        mime_type: &str,
    ) -> Result<String, AppError> {
        // Extract base64 data from data URI
        let b64 = data_uri
            .split(',')
            .nth(1)
            .ok_or_else(|| AppError::Validation("Invalid data URI format".to_string()))?;

        // Decode base64 to bytes
        let audio_data = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| AppError::Validation(format!("Failed to decode base64 audio data: {}", e)))?;

        // Use the main transcription method
        self.transcribe_audio(&audio_data, filename, model, language, prompt, temperature, mime_type).await
    }

    /// Transcribe audio from raw bytes
    pub async fn transcribe_from_bytes(
        &self,
        audio_data: &[u8],
        filename: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
        mime_type: &str,
    ) -> Result<String, AppError> {
        // Use gpt-4o-mini-transcribe as default (cheaper option)
        self.transcribe_audio(
            audio_data,
            filename,
            "gpt-4o-mini-transcribe",
            language,
            prompt,
            temperature,
            mime_type,
        ).await
    }

    /// Validate that the model is a supported transcription model
    pub fn validate_transcription_model(model: &str) -> Result<(), AppError> {
        const SUPPORTED_MODELS: &[&str] = &[
            "gpt-4o-transcribe",
            "gpt-4o-mini-transcribe",
        ];

        if !SUPPORTED_MODELS.contains(&model) {
            return Err(AppError::Validation(format!(
                "Unsupported transcription model: {}. Supported: {}",
                model,
                SUPPORTED_MODELS.join(", ")
            )));
        }

        Ok(())
    }

    // Helper method to parse usage from a chat completion stream chunk
    // Returns (uncached_input, cache_write, cache_read, output)
    // 
    // Example OpenAI usage JSON with cached tokens:
    // {"usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150, 
    //  "prompt_tokens_details": {"cached_tokens": 20}}}
    // Note: For OpenAI, cached_tokens represents cache reads. Cache writes use same pricing as uncached.
    pub fn extract_usage_from_chat_stream_chunk(chunk_str: &str) -> Option<(i32, i32, i32, i32)> {
        // OpenAI streams are Server-Sent Events format
        for line in chunk_str.lines() {
            if line.starts_with("data: ") {
                let json_str = &line[6..]; // Remove "data: " prefix
                if json_str.trim() == "[DONE]" {
                    continue;
                }
                
                match serde_json::from_str::<OpenAIStreamChunk>(json_str.trim()) {
                    Ok(parsed) => {
                        if let Some(usage) = parsed.usage {
                            let cached_tokens = usage.prompt_tokens_details
                                .and_then(|details| details.cached_tokens)
                                .unwrap_or(0);
                            // Return format: (uncached_input, cache_write, cache_read, output)
                            // For OpenAI: cached_tokens are reads, no separate write tracking
                            return Some((usage.prompt_tokens, 0, cached_tokens, usage.completion_tokens));
                        }
                    },
                    Err(_) => continue,
                }
            }
        }
        None
    }
    
    // Helper method to extract tokens from a chat completion stream chunk
    // Returns (uncached_input, cache_write, cache_read, output)
    // Note: For OpenAI, cached_tokens represents cache reads. Cache writes use same pricing as uncached.
    pub fn extract_tokens_from_chat_stream_chunk(chunk_str: &str) -> Option<(i32, i32, i32, i32)> {
        Self::extract_usage_from_chat_stream_chunk(chunk_str)
    }

    // Convert a generic JSON Value into an OpenAIChatRequest
    pub fn convert_to_openai_request(&self, payload: Value) -> Result<OpenAIChatRequest, AppError> {
        let mut request: OpenAIChatRequest = serde_json::from_value(payload)
            .map_err(|e| AppError::BadRequest(format!("Failed to convert payload to OpenAI chat request: {}", e)))?;
        
        if Self::endpoint_for_model(&request.model) == "chat/completions" {
            // Smart parameter mapping for OpenAI API compatibility
            
            // 1. Handle max_tokens vs max_completion_tokens
            if request.max_completion_tokens.is_none() && request.max_tokens.is_some() {
                request.max_completion_tokens = request.max_tokens.take();
            }
            
            // Temperature is now supported by o3 models, so pass it through
        }
        
        Ok(request)
    }
    
    // Helper functions for token and usage tracking
    // Returns (uncached_input, cache_write, cache_read, output)
    pub fn extract_tokens_from_chat_response(&self, response: &OpenAIChatResponse) -> (i32, i32, i32, i32) {
        if let Some(usage) = &response.usage {
            let cached_tokens = usage.prompt_tokens_details
                .as_ref()
                .and_then(|details| details.cached_tokens)
                .unwrap_or(0);
            // Return format: (uncached_input, cache_write, cache_read, output)
            (usage.prompt_tokens, 0, cached_tokens, usage.completion_tokens)
        } else {
            (0, 0, 0, 0)
        }
    }

    /// Creates a Chat Completions format SSE chunk for streaming
    fn create_chat_completion_chunk(
        response_id: &str,
        model: &str,
        content: &str,
        is_final: bool,
        usage: Option<(i32, i32)>,
    ) -> String {
        let chunk = if is_final {
            serde_json::json!({
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": chrono::Utc::now().timestamp(),
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }],
                "usage": usage.map(|(input, output)| serde_json::json!({
                    "prompt_tokens": input,
                    "completion_tokens": output,
                    "total_tokens": input + output
                }))
            })
        } else {
            serde_json::json!({
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": chrono::Utc::now().timestamp(),
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": {
                        "content": content
                    },
                    "finish_reason": null
                }]
            })
        };

        format!("data: {}\n\n", serde_json::to_string(&chunk).unwrap_or_default())
    }

    /// Extracts content from OpenAI Responses API output structure
    fn extract_content_from_responses(response: &OpenAIResponsesResponse) -> String {
        response.output
            .as_ref()
            .and_then(|outputs| {
                // Find message output type with content
                outputs.iter().find_map(|output| {
                    if output.get("type").and_then(|t| t.as_str()) == Some("message") {
                        output.get("content")
                            .and_then(|content_array| content_array.as_array())
                            .and_then(|array| {
                                array.iter().find_map(|content_item| {
                                    if content_item.get("type").and_then(|t| t.as_str()) == Some("output_text") {
                                        content_item.get("text").and_then(|text| text.as_str())
                                    } else {
                                        None
                                    }
                                })
                            })
                    } else {
                        None
                    }
                })
            })
            .unwrap_or("")
            .to_string()
    }
}

impl Clone for OpenAIClient {
    fn clone(&self) -> Self {
        Self {
            client: Client::new(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}