use crate::config::settings::AppSettings;
use crate::error::AppError;
use actix_web::web;
use base64::Engine;
use chrono;
use futures_util::{Stream, StreamExt};
use rand;
use reqwest::{
    Client,
    header::HeaderMap,
    multipart::{Form, Part},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_with::skip_serializing_none;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, error, info, instrument, warn};
use uuid;

// OpenAI API base URL
const OPENAI_BASE_URL: &str = "https://api.openai.com/v1";

use crate::clients::usage_extractor::{ProviderUsage, UsageExtractor};

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

        let client = crate::clients::http_client::new_api_client();
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

    fn endpoint_for_model(_model: &str) -> &'static str {
        "responses"
    }

    fn convert_messages_to_responses_input(
        messages: &[OpenAIMessage],
    ) -> Vec<OpenAIResponsesInputItem> {
        messages
            .iter()
            .map(|message| {
                let content = match &message.content {
                    OpenAIContent::Text(text) => {
                        vec![OpenAIResponsesContentPart {
                            part_type: "input_text".to_string(),
                            text: Some(text.clone()),
                            image_url: None,
                        }]
                    }
                    OpenAIContent::Parts(parts) => {
                        parts
                            .iter()
                            .map(|part| {
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
                            })
                            .collect()
                    }
                };

                OpenAIResponsesInputItem {
                    item_type: "message".to_string(),
                    role: Some(if message.role == "system" {
                        "developer".to_string()
                    } else {
                        message.role.clone()
                    }),
                    content: Some(content),
                }
            })
            .collect()
    }

    fn model_requires_tools(model: &str, web_mode: bool) -> Option<Vec<OpenAIResponsesTool>> {
        if model.contains("deep-research") || web_mode {
            // Web search tool with location and context configuration
            Some(vec![OpenAIResponsesTool::WebSearch {
                tool_type: "web_search_preview".to_string(),
                user_location: Some(serde_json::json!({
                    "type": "approximate"
                })),
                search_context_size: Some("low".to_string()),
            }])
        } else {
            None
        }
    }

    fn model_requires_background(model: &str, web_mode: bool) -> bool {
        model.contains("deep-research") || web_mode
    }

    fn create_deep_research_stream(
        client: Client,
        api_key: String,
        base_url: String,
        response_id: String,
        model: String,
    ) -> impl Stream<Item = Result<web::Bytes, AppError>> + Send + 'static {
        use futures_util::stream::{self, StreamExt};
        use tokio::time::{Duration, Instant, sleep};

        // State for the streaming process
        #[derive(Debug)]
        enum StreamState {
            Starting,
            Polling {
                last_update: Instant,
                poll_count: u32,
                start_time: Instant,
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

        stream::unfold(StreamState::Starting, move |state| {
            let client = client.clone();
            let api_key = api_key.clone();
            let base_url = base_url.clone();
            let response_id = response_id.clone();
            let model = model.clone();

            async move {
                match state {
                    StreamState::Starting => {
                        // Log the start of web search polling
                        info!(
                            "Starting web search polling for response_id: {}",
                            response_id
                        );

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
                            StreamState::Polling {
                                last_update: Instant::now(),
                                poll_count: 0,
                                start_time: Instant::now(),
                                consecutive_queued: 0,
                            },
                        ))
                    }

                    StreamState::Polling {
                        last_update,
                        poll_count,
                        start_time,
                        consecutive_queued,
                    } => {
                        // Check for early timeout (10 minutes) if stuck in queued
                        if start_time.elapsed() > Duration::from_secs(600)
                            && consecutive_queued > 150
                        {
                            error!(
                                "Request appears stuck in queued state after 10 minutes: response_id={}",
                                response_id
                            );

                            // Try to cancel the stuck request
                            let cancel_url =
                                format!("{}/responses/{}/cancel", base_url, response_id);
                            let _ = client.post(&cancel_url).bearer_auth(&api_key).send().await;

                            let error_chunk = Self::create_chat_completion_chunk(
                                &response_id,
                                &model,
                                "Search request appears stuck. This may be due to high API load or rate limits. The request has been cancelled - please try again.",
                                true,
                                None,
                            );
                            return Some((
                                Ok(web::Bytes::from(error_chunk)),
                                StreamState::Completed,
                            ));
                        }

                        // Check for maximum polling duration (30 minutes)
                        if start_time.elapsed() > Duration::from_secs(1800) {
                            error!(
                                "Web search polling timeout after 30 minutes for response_id: {}",
                                response_id
                            );
                            let error_chunk = Self::create_chat_completion_chunk(
                                &response_id,
                                &model,
                                "Web search timeout: The search took longer than the maximum allowed time. Please try a more specific query.",
                                true,
                                None,
                            );
                            return Some((
                                Ok(web::Bytes::from(error_chunk)),
                                StreamState::Completed,
                            ));
                        }

                        // Send keep-alive comment every 500ms
                        if last_update.elapsed() < Duration::from_secs(3) {
                            sleep(Duration::from_millis(500)).await;
                            // Send SSE comment for keep-alive
                            return Some((
                                Ok(web::Bytes::from(": keepalive\n\n")),
                                StreamState::Polling {
                                    last_update,
                                    poll_count,
                                    start_time,
                                    consecutive_queued,
                                },
                            ));
                        }

                        // Poll the background job
                        let poll_url = format!("{}/responses/{}", base_url, response_id);
                        match client.get(&poll_url).bearer_auth(&api_key).send().await {
                            Ok(poll_response) => {
                                if let Ok(response_text) = poll_response.text().await {
                                    if let Ok(responses_response) =
                                        serde_json::from_str::<OpenAIResponsesResponse>(
                                            &response_text,
                                        )
                                    {
                                        match responses_response.status.as_str() {
                                            "completed" => {
                                                // Extract content and prepare for streaming
                                                let content = Self::extract_content_from_responses(
                                                    &responses_response,
                                                );

                                                Some((
                                                    Ok(web::Bytes::from("")), // Transition chunk
                                                    StreamState::ContentReady {
                                                        content,
                                                        usage: responses_response.usage,
                                                    },
                                                ))
                                            }
                                            "failed" | "cancelled" => {
                                                let error_chunk =
                                                    Self::create_chat_completion_chunk(
                                                        &response_id,
                                                        &model,
                                                        &format!(
                                                            "Research failed: {}",
                                                            responses_response.status
                                                        ),
                                                        true,
                                                        None,
                                                    );
                                                Some((
                                                    Ok(web::Bytes::from(error_chunk)),
                                                    StreamState::Completed,
                                                ))
                                            }
                                            _ => {
                                                // Still in progress, send progress update
                                                // Enhanced progress messages with timing info
                                                let elapsed_mins = (poll_count * 3) / 60;
                                                let progress_messages = if elapsed_mins > 5 {
                                                    vec![
                                                        format!(
                                                            "Deep research in progress ({} minutes)...",
                                                            elapsed_mins
                                                        ),
                                                        format!(
                                                            "Complex web search ongoing ({} minutes)...",
                                                            elapsed_mins
                                                        ),
                                                        format!(
                                                            "Extensive analysis running ({} minutes)...",
                                                            elapsed_mins
                                                        ),
                                                        format!(
                                                            "Comprehensive search active ({} minutes)...",
                                                            elapsed_mins
                                                        ),
                                                    ]
                                                } else if elapsed_mins > 2 {
                                                    vec![
                                                        "Searching multiple sources...".to_string(),
                                                        "Analyzing search results...".to_string(),
                                                        "Processing web content...".to_string(),
                                                        "Gathering comprehensive data..."
                                                            .to_string(),
                                                    ]
                                                } else {
                                                    vec![
                                                        "Conducting web research...".to_string(),
                                                        "Analyzing information...".to_string(),
                                                        "Processing research findings..."
                                                            .to_string(),
                                                        "Synthesizing comprehensive response..."
                                                            .to_string(),
                                                    ]
                                                };
                                                let message_idx = (poll_count / 3) as usize
                                                    % progress_messages.len();
                                                let progress_chunk =
                                                    Self::create_chat_completion_chunk(
                                                        &response_id,
                                                        &model,
                                                        &progress_messages[message_idx],
                                                        false,
                                                        None,
                                                    );

                                                // Log polling status
                                                if poll_count % 10 == 0 {
                                                    info!(
                                                        "Web search polling: response_id={}, attempt={}, elapsed_mins={}",
                                                        response_id, poll_count, elapsed_mins
                                                    );
                                                }
                                                Some((
                                                    Ok(web::Bytes::from(progress_chunk)),
                                                    StreamState::Polling {
                                                        last_update: Instant::now(),
                                                        poll_count: poll_count + 1,
                                                        start_time,
                                                        consecutive_queued,
                                                    },
                                                ))
                                            }
                                        }
                                    } else {
                                        // Parsing error, continue polling
                                        Some((
                                            Ok(web::Bytes::from(": parsing error, continuing\n\n")),
                                            StreamState::Polling {
                                                last_update,
                                                poll_count,
                                                start_time,
                                                consecutive_queued,
                                            },
                                        ))
                                    }
                                } else {
                                    // Response read error, continue polling
                                    Some((
                                        Ok(web::Bytes::from(": response error, continuing\n\n")),
                                        StreamState::Polling {
                                            last_update,
                                            poll_count,
                                            start_time,
                                            consecutive_queued,
                                        },
                                    ))
                                }
                            }
                            Err(_) => {
                                // Network error, continue polling
                                Some((
                                    Ok(web::Bytes::from(": network error, retrying\n\n")),
                                    StreamState::Polling {
                                        last_update,
                                        poll_count,
                                        start_time,
                                        consecutive_queued,
                                    },
                                ))
                            }
                        }
                    }

                    StreamState::ContentReady { content, usage } => {
                        // Start streaming the actual content
                        Some((
                            Ok(web::Bytes::from("")), // Transition chunk
                            StreamState::ContentStreaming {
                                remaining: content,
                                chunk_size: 50, // Characters per chunk
                                usage,
                            },
                        ))
                    }

                    StreamState::ContentStreaming {
                        remaining,
                        chunk_size,
                        usage,
                    } => {
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
                            Some((Ok(web::Bytes::from(final_chunk)), StreamState::Completed))
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
                                    if i < remaining_chars.len()
                                        && remaining_chars[i].is_whitespace()
                                    {
                                        end_pos = i + 1;
                                        break;
                                    }
                                }

                                remaining_chars[..end_pos].iter().collect()
                            };

                            let new_remaining = remaining
                                .chars()
                                .skip(chunk_text.chars().count())
                                .collect::<String>();
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
                                    usage,
                                },
                            ))
                        }
                    }

                    StreamState::Completed => {
                        None // End the stream
                    }
                }
            }
        })
    }

    async fn wait_until_complete(
        &self,
        response_id: &str,
    ) -> Result<OpenAIResponsesResponse, AppError> {
        use tokio::time::{Duration, Instant, sleep};

        let start_time = Instant::now();
        let max_duration = Duration::from_secs(1800); // 30 minutes total
        let early_timeout = Duration::from_secs(600); // 10 minutes for detecting stuck requests
        let mut retry_count = 0;
        let max_retries = 900; // 30 minutes / 2 seconds = 900 attempts
        let mut consecutive_queued_count = 0;

        loop {
            // Check if we've exceeded maximum duration
            if start_time.elapsed() > max_duration {
                error!(
                    "Web search polling timeout after 30 minutes for response_id: {}",
                    response_id
                );
                return Err(AppError::External(format!(
                    "Web search timeout after 30 minutes. The search is taking longer than expected."
                )));
            }

            // Check retry count
            if retry_count >= max_retries {
                error!(
                    "Web search polling exceeded maximum retries ({}) for response_id: {}",
                    max_retries, response_id
                );
                return Err(AppError::External(format!(
                    "Web search exceeded maximum polling attempts. Please try again."
                )));
            }
            let url = format!("{}/responses/{}", self.base_url, response_id);
            let response = self
                .client
                .get(&url)
                .bearer_auth(&self.api_key)
                .send()
                .await
                .map_err(|e| AppError::External(format!("Failed to poll response: {}", e)))?;

            let status = response.status();
            if !status.is_success() {
                let error_text = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Failed to get polling error response".to_string());

                // Provide helpful error messages based on status code
                let error_message = match status.as_u16() {
                    429 => format!(
                        "Rate limit exceeded during web search polling.\n\n\
                        Details: {}\n\n\
                        The search request is queued but cannot proceed due to rate limits.\n\
                        Please wait a few minutes and try again.",
                        error_text
                    ),
                    503 => format!(
                        "OpenAI service temporarily unavailable during web search.\n\n\
                        Details: {}\n\n\
                        The service is experiencing high load. Please try again in a few minutes.",
                        error_text
                    ),
                    _ => format!(
                        "Web search polling failed (status {}).\n\n\
                        Details: {}",
                        status, error_text
                    ),
                };

                return Err(AppError::External(error_message));
            }

            // Debug: log the raw response before parsing
            let response_text = response.text().await.map_err(|e| {
                AppError::Internal(format!("Failed to read polling response: {}", e))
            })?;

            let responses_response: OpenAIResponsesResponse = serde_json::from_str(&response_text)
                .map_err(|e| {
                    AppError::Internal(format!(
                        "Failed to parse polling response: {} - Body: {}",
                        e, response_text
                    ))
                })?;

            // Log polling status periodically
            if retry_count % 30 == 0 && retry_count > 0 {
                let elapsed_mins = start_time.elapsed().as_secs() / 60;
                info!(
                    "Web search still polling: response_id={}, status={}, elapsed_mins={}, attempts={}",
                    response_id, responses_response.status, elapsed_mins, retry_count
                );
            }

            match responses_response.status.as_str() {
                "completed" => {
                    let elapsed_secs = start_time.elapsed().as_secs();
                    info!(
                        "Web search completed: response_id={}, elapsed_secs={}, attempts={}",
                        response_id, elapsed_secs, retry_count
                    );
                    return Ok(responses_response);
                }
                "failed" | "cancelled" => {
                    return Err(AppError::External(format!(
                        "Response job failed with status: {}",
                        responses_response.status
                    )));
                }
                "queued" => {
                    consecutive_queued_count += 1;

                    // Check for early timeout - if still queued after 10 minutes, likely stuck
                    if start_time.elapsed() > early_timeout && consecutive_queued_count > 150 {
                        warn!(
                            "Request appears stuck in queued state after 2 minutes: response_id={}",
                            response_id
                        );

                        // Try to cancel the stuck request
                        let cancel_url =
                            format!("{}/responses/{}/cancel", self.base_url, response_id);
                        let _ = self
                            .client
                            .post(&cancel_url)
                            .bearer_auth(&self.api_key)
                            .send()
                            .await;

                        return Err(AppError::External(format!(
                            "Web search request appears stuck (queued for {} minutes). This may be due to:\n\n\
                            • High API load - Please try again in a few minutes\n\
                            • Rate limits on your account\n\
                            • Service degradation\n\n\
                            The request has been cancelled. Please retry your search.",
                            start_time.elapsed().as_secs() / 60
                        )));
                    }
                    // Use exponential backoff with jitter, capped at 5 seconds
                    let base_delay: f64 = 2.0;
                    let backoff_factor: f64 = 1.1;
                    let max_delay: f64 = 5.0;
                    let jitter: f64 = 0.5;

                    let delay = (base_delay
                        * backoff_factor.powi((retry_count / 10).min(5) as i32))
                    .min(max_delay)
                        + (rand::random::<f64>() * jitter);

                    sleep(Duration::from_secs_f64(delay)).await;
                    retry_count += 1;
                    continue;
                }
                "in_progress" => {
                    // Reset queued counter when we see progress
                    consecutive_queued_count = 0;
                }
                _ => {
                    warn!(
                        "Unexpected response status '{}' for response_id: {}",
                        responses_response.status, response_id
                    );
                    sleep(Duration::from_secs(2)).await;
                    retry_count += 1;
                    continue;
                }
            }
        }
    }

    fn prepare_request_body(
        request: &OpenAIChatRequest,
        web_mode: bool,
        force_background: Option<bool>,
    ) -> Result<(String, serde_json::Value), AppError> {
        let max_output_tokens = if web_mode {
            None // Don't set max_output_tokens for web search models
        } else {
            request
                .max_completion_tokens
                .or(request.max_tokens)
                .or(Some(512))
        };

        // Extract system/developer message and user messages
        let (instructions, user_messages): (Option<String>, Vec<&OpenAIMessage>) = {
            let mut instructions = None;
            let mut user_msgs = Vec::new();

            for msg in &request.messages {
                if msg.role == "system" || msg.role == "developer" {
                    // Combine system messages into instructions
                    let text = match &msg.content {
                        OpenAIContent::Text(t) => t.clone(),
                        OpenAIContent::Parts(parts) => parts
                            .iter()
                            .filter_map(|p| p.text.as_ref())
                            .cloned()
                            .collect::<Vec<_>>()
                            .join("\n"),
                    };
                    instructions = Some(match instructions {
                        Some(existing) => format!("{} {}", existing, text),
                        None => text,
                    });
                } else {
                    user_msgs.push(msg);
                }
            }
            (instructions, user_msgs)
        };

        // For web search, input is typically just the user's query as a string
        // For regular requests, it's the conversation array (excluding system/developer messages)
        let input = if web_mode {
            // Extract just the last user message for web search
            user_messages.last().and_then(|msg| match &msg.content {
                OpenAIContent::Text(text) => Some(serde_json::Value::String(text.clone())),
                OpenAIContent::Parts(parts) => {
                    let text = parts
                        .iter()
                        .filter_map(|p| p.text.as_ref())
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(" ");
                    Some(serde_json::Value::String(text))
                }
            })
        } else {
            // For non-web requests, convert only non-system messages to the input array format
            let non_system_messages: Vec<OpenAIMessage> = request
                .messages
                .iter()
                .filter(|msg| msg.role != "system" && msg.role != "developer")
                .cloned()
                .collect();
            Some(serde_json::to_value(
                Self::convert_messages_to_responses_input(&non_system_messages),
            )?)
        };

        let tools = Self::model_requires_tools(&request.model, web_mode);

        // Only use background when explicitly forced
        let background = force_background;

        // Use model ID directly as it's already resolved by the mapping service
        let resolved_model_id = request.model.clone();

        // Web search specific configurations
        let (
            text_format,
            reasoning_config,
            store_config,
            tool_choice,
            parallel_tool_calls,
            truncation,
        ) = if web_mode {
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
                Some(true), // Store is typically true for web search
                Some("auto".to_string()),
                Some(true),
                Some("disabled".to_string()),
            )
        } else {
            (None, None, None, None, None, None)
        };

        // Ensure request uniqueness to prevent OpenAI response ID deduplication
        let unique_user_id = if background.unwrap_or(false) || web_mode {
            // For background requests and web mode, append unique timestamp and UUID to prevent deduplication
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
                }
                None => format!("user{}", unique_suffix),
            }
        } else {
            request.user.clone().unwrap_or_default()
        };

        let responses_request = OpenAIResponsesRequest {
            model: resolved_model_id,
            input,
            instructions,
            stream: request.stream,
            background,
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
            tool_choice,
            parallel_tool_calls,
            truncation,
        };
        let request_body = serde_json::to_value(responses_request)?;
        Ok(("responses".to_string(), request_body))
    }

    // Chat Completions
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn chat_completion(
        &self,
        request: OpenAIChatRequest,
        web_mode: bool,
    ) -> Result<
        (
            OpenAIChatResponse,
            HeaderMap,
            i32,
            i32,
            i32,
            i32,
            Option<String>,
        ),
        AppError,
    > {
        let request_id = self.get_next_request_id().await;

        // Determine endpoint based on web_mode
        let (endpoint, use_responses_api) = if web_mode {
            ("/v1/responses", true)
        } else {
            ("/v1/chat/completions", false)
        };

        let url = format!("{}{}", self.base_url.trim_end_matches("/v1"), endpoint);

        if use_responses_api {
            // Use responses API for web mode
            let requires_background = Self::model_requires_background(&request.model, web_mode);

            let mut non_streaming_request = request.clone();
            non_streaming_request.stream = Some(false);
            let (_, request_body) = Self::prepare_request_body(
                &non_streaming_request,
                web_mode,
                Some(requires_background),
            )?;

            let response = self
                .client
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
                let error_text = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "OpenAI request failed with status {}: {}",
                    status, error_text
                )));
            }

            let responses_response: OpenAIResponsesResponse = response
                .json()
                .await
                .map_err(|e| AppError::Internal(format!("OpenAI deserialization failed: {}", e)))?;

            let final_response = if requires_background {
                self.wait_until_complete(&responses_response.id).await?
            } else {
                responses_response
            };

            let (prompt_tokens, cache_write, cache_read, completion_tokens) =
                if let Some(usage) = &final_response.usage {
                    (usage.input_tokens, 0, 0, usage.output_tokens)
                } else {
                    (0, 0, 0, 0)
                };

            let content = Self::extract_content_from_responses(&final_response);

            let chat_usage = final_response.usage.map(|responses_usage| OpenAIUsage {
                prompt_tokens: responses_usage.input_tokens,
                completion_tokens: responses_usage.output_tokens,
                total_tokens: responses_usage.total_tokens,
                prompt_tokens_details: None,
                other: None,
            });

            let response_id = final_response.id.clone();
            let chat_response = OpenAIChatResponse {
                id: final_response.id,
                choices: vec![OpenAIChoice {
                    message: OpenAIResponseMessage {
                        role: "assistant".to_string(),
                        content: Some(content),
                    },
                    index: 0,
                    finish_reason: Some("stop".to_string()),
                }],
                created: final_response.created_at,
                model: final_response.model,
                object: Some("chat.completion".to_string()),
                usage: chat_usage,
            };

            Ok((
                chat_response,
                headers,
                prompt_tokens,
                cache_write,
                cache_read,
                completion_tokens,
                Some(response_id),
            ))
        } else {
            // Use chat completions API for non-web mode
            let mut non_streaming_request = request.clone();
            non_streaming_request.stream = Some(false);

            let response = self
                .client
                .post(&url)
                .bearer_auth(&self.api_key)
                .header("Content-Type", "application/json")
                .header("X-Request-ID", request_id.to_string())
                .json(&non_streaming_request)
                .send()
                .await
                .map_err(|e| AppError::External(format!("OpenAI request failed: {}", e)))?;

            let status = response.status();
            let headers = response.headers().clone();

            if !status.is_success() {
                let error_text = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "OpenAI request failed with status {}: {}",
                    status, error_text
                )));
            }

            let chat_response: OpenAIChatResponse = response
                .json()
                .await
                .map_err(|e| AppError::Internal(format!("OpenAI deserialization failed: {}", e)))?;

            // Extract usage data from UsageExtractor
            let response_body = serde_json::to_string(&chat_response)
                .map_err(|e| AppError::Internal(format!("Failed to serialize response: {}", e)))?;
            let usage = self
                .extract_from_http_body(response_body.as_bytes(), &request.model, false)
                .await?;

            Ok((
                chat_response,
                headers,
                usage.prompt_tokens,
                usage.cache_write_tokens,
                usage.cache_read_tokens,
                usage.completion_tokens,
                None,
            ))
        }
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn stream_chat_completion(
        &self,
        request: OpenAIChatRequest,
        web_mode: bool,
    ) -> Result<
        (
            HeaderMap,
            Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>,
            Option<String>,
        ),
        AppError,
    > {
        // Clone necessary parts for 'static lifetime
        let client = self.client.clone();
        let api_key = self.api_key.clone();
        let base_url = self.base_url.clone();
        let request_id_counter = self.request_id_counter.clone();

        // Determine endpoint based on web_mode
        let (endpoint, use_responses_api) = if web_mode {
            ("/v1/responses", true)
        } else {
            ("/v1/chat/completions", false)
        };

        if use_responses_api && Self::model_requires_background(&request.model, web_mode) {
            // For deep research models with web mode, use immediate streaming with progress updates
            tracing::info!(
                "Using immediate synthetic streaming for deep research model: {}",
                request.model
            );

            // Step 1: Create background job (non-blocking)
            let mut background_request = request.clone();
            background_request.stream = Some(false);
            let (_, background_body) =
                Self::prepare_request_body(&background_request, web_mode, Some(true))?;
            let create_url = format!("{}/responses", base_url);

            let create_response = client
                .post(&create_url)
                .bearer_auth(&api_key)
                .header("Content-Type", "application/json")
                .json(&background_body)
                .send()
                .await
                .map_err(|e| {
                    AppError::External(format!("OpenAI background request failed: {}", e))
                })?;

            let create_status = create_response.status();
            if !create_status.is_success() {
                let error_text = create_response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "OpenAI background request failed with status {}: {}",
                    create_status, error_text
                )));
            }

            let create_response_text = create_response.text().await.map_err(|e| {
                AppError::Internal(format!("Failed to read background response: {}", e))
            })?;

            let background_response: OpenAIResponsesResponse =
                serde_json::from_str(&create_response_text).map_err(|e| {
                    AppError::Internal(format!(
                        "Failed to parse background response: {} - Body: {}",
                        e, create_response_text
                    ))
                })?;

            let response_id = background_response.id.clone();
            let response_model = request.model.clone();

            // Step 2: Create immediate streaming response with progress updates
            let synthetic_stream = Self::create_deep_research_stream(
                client,
                api_key,
                base_url,
                response_id.clone(),
                response_model,
            );

            let headers = HeaderMap::new(); // Default headers for synthetic stream
            let boxed_stream: Pin<
                Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>,
            > = Box::pin(synthetic_stream);
            return Ok((headers, boxed_stream, Some(response_id)));
        }

        // Standard streaming flow
        let mut streaming_request = request.clone();
        streaming_request.stream = Some(true);
        streaming_request.stream_options = Some(StreamOptions {
            include_usage: true,
        });

        // Create the stream in an async move block to ensure 'static lifetime
        let result = async move {
            let request_id = {
                let mut counter = request_id_counter.lock().await;
                *counter += 1;
                *counter
            };

            let url = format!("{}{}", base_url.trim_end_matches("/v1"), endpoint);

            if use_responses_api {
                // Use responses API for web mode streaming
                let (_, request_body) = Self::prepare_request_body(&streaming_request, true, None)?;

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
                    let error_text = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "Failed to get error response".to_string());
                    return Err(AppError::External(format!(
                        "OpenAI streaming request failed with status {}: {}",
                        status, error_text
                    )));
                }

                // Return a stream that can be consumed by actix-web
                let stream = response.bytes_stream().map(|result| match result {
                    Ok(bytes) => Ok(web::Bytes::from(bytes)),
                    Err(e) => Err(AppError::External(format!("OpenAI network error: {}", e))),
                });

                let boxed_stream: Pin<
                    Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>,
                > = Box::pin(stream);
                Ok((headers, boxed_stream, None))
            } else {
                // Use chat completions API for non-web mode streaming
                let response = client
                    .post(&url)
                    .bearer_auth(&api_key)
                    .header("Content-Type", "application/json")
                    .header("X-Request-ID", request_id.to_string())
                    .json(&streaming_request)
                    .send()
                    .await
                    .map_err(|e| AppError::External(format!("OpenAI request failed: {}", e)))?;

                let status = response.status();
                let headers = response.headers().clone();

                if !status.is_success() {
                    let error_text = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "Failed to get error response".to_string());
                    return Err(AppError::External(format!(
                        "OpenAI streaming request failed with status {}: {}",
                        status, error_text
                    )));
                }

                // Return a stream that can be consumed by actix-web
                let stream = response.bytes_stream().map(|result| match result {
                    Ok(bytes) => Ok(web::Bytes::from(bytes)),
                    Err(e) => Err(AppError::External(format!("OpenAI network error: {}", e))),
                });

                let boxed_stream: Pin<
                    Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>,
                > = Box::pin(stream);
                Ok((headers, boxed_stream, None))
            }
        }
        .await?;
        
        Ok(result)
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
            return Err(AppError::Validation(
                "Audio data cannot be empty".to_string(),
            ));
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
            if audio_data[0] != 0x1A
                || audio_data[1] != 0x45
                || audio_data[2] != 0xDF
                || audio_data[3] != 0xA3
            {
                debug!(
                    "WebM header validation failed for {}: {:02X} {:02X} {:02X} {:02X}",
                    filename, audio_data[0], audio_data[1], audio_data[2], audio_data[3]
                );
                return Err(AppError::Validation(
                    "Invalid WebM file format - missing EBML header".to_string(),
                ));
            }
        }

        // Create multipart form with proper filename - this is critical!
        // Ensure filename has correct extension
        let filename_with_ext = if !filename.contains('.') {
            // Add extension based on mime type if missing
            match mime_type {
                "audio/webm" => format!("{}.webm", filename),
                "audio/mpeg" => format!("{}.mp3", filename),
                "audio/wav" => format!("{}.wav", filename),
                _ => filename.to_string(),
            }
        } else {
            filename.to_string()
        };

        let file_part = Part::bytes(audio_data.to_vec())
            .file_name(filename_with_ext.clone()) // Critical: GPT-4o needs the correct extension
            .mime_str(mime_type) // Keep MIME simple, no codec parameters
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

        info!(
            "Sending transcription request to OpenAI: {} ({} bytes)",
            filename_with_ext,
            audio_data.len()
        );
        debug!(
            "Using model: {}, language: {:?}, prompt: {:?}, temperature: {:?}, mime_type: {}",
            model, language, prompt, temperature, mime_type
        );
        debug!(
            "Audio data header (first 16 bytes): {:02X?}",
            &audio_data[..audio_data.len().min(16)]
        );
        debug!(
            "Multipart form will be sent with filename: {} and mime_type: {}",
            filename_with_ext, mime_type
        );

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| {
                AppError::External(format!("OpenAI transcription request failed: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "OpenAI transcription error ({}): {}",
                status, error_text
            )));
        }

        let transcription: OpenAITranscriptionResponse = response.json().await.map_err(|e| {
            AppError::External(format!(
                "Failed to parse OpenAI transcription response: {}",
                e
            ))
        })?;

        info!(
            "Transcription successful: {} characters",
            transcription.text.len()
        );
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
            .map_err(|e| {
                AppError::Validation(format!("Failed to decode base64 audio data: {}", e))
            })?;

        // Use the main transcription method
        self.transcribe_audio(
            &audio_data,
            filename,
            model,
            language,
            prompt,
            temperature,
            mime_type,
        )
        .await
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
        )
        .await
    }

    /// Validate that the model is a supported transcription model
    pub fn validate_transcription_model(model: &str) -> Result<(), AppError> {
        const SUPPORTED_MODELS: &[&str] = &["gpt-4o-transcribe", "gpt-4o-mini-transcribe"];

        if !SUPPORTED_MODELS.contains(&model) {
            return Err(AppError::Validation(format!(
                "Unsupported transcription model: {}. Supported: {}",
                model,
                SUPPORTED_MODELS.join(", ")
            )));
        }

        Ok(())
    }

    // Convert a generic JSON Value into an OpenAIChatRequest
    pub fn convert_to_openai_request(&self, payload: Value) -> Result<OpenAIChatRequest, AppError> {
        let mut request: OpenAIChatRequest = serde_json::from_value(payload).map_err(|e| {
            AppError::BadRequest(format!(
                "Failed to convert payload to OpenAI chat request: {}",
                e
            ))
        })?;

        // Smart parameter mapping for OpenAI API compatibility

        // 1. Handle max_tokens vs max_completion_tokens based on model
        // Map max_tokens to max_completion_tokens for newer models
        let is_new_model = request.model.contains("gpt-4o")
            || request.model.contains("gpt-4-turbo")
            || request.model.contains("gpt-3.5-turbo-0125");

        if is_new_model && request.max_completion_tokens.is_none() && request.max_tokens.is_some() {
            request.max_completion_tokens = request.max_tokens.take();
        }

        Ok(request)
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

        format!(
            "data: {}\n\n",
            serde_json::to_string(&chunk).unwrap_or_default()
        )
    }

    /// Extracts content from OpenAI Responses API output structure
    fn extract_content_from_responses(response: &OpenAIResponsesResponse) -> String {
        // Log built-in tool calls for debugging
        if let Some(tool_calls) = &response.built_in_tool_calls {
            tracing::debug!("Built-in tool calls: {:?}", tool_calls);
        }

        // Log reasoning for debugging
        if let Some(reasoning) = &response.reasoning {
            // Check if reasoning summary is empty and log appropriately
            if let Some(summary_value) = reasoning.get("summary") {
                if let Some(summary_array) = summary_value.as_array() {
                    if summary_array.is_empty() {
                        tracing::warn!(
                            "Reasoning summary is empty array - model may not be populating reasoning correctly"
                        );
                    } else {
                        tracing::debug!("Reasoning summary contains {} items", summary_array.len());
                    }
                } else {
                    tracing::debug!("Reasoning: {:?}", reasoning);
                }
            } else {
                tracing::debug!("Reasoning: {:?}", reasoning);
            }
        }

        response
            .output
            .as_ref()
            .and_then(|outputs| {
                // Find message output type with content
                outputs.iter().find_map(|output| {
                    if output.get("type").and_then(|t| t.as_str()) == Some("message") {
                        output
                            .get("content")
                            .and_then(|content_array| content_array.as_array())
                            .and_then(|array| {
                                array.iter().find_map(|content_item| {
                                    if content_item.get("type").and_then(|t| t.as_str())
                                        == Some("output_text")
                                    {
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
            client: crate::clients::http_client::new_api_client(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}

impl UsageExtractor for OpenAIClient {
    /// Extract usage information from OpenAI HTTP response body (2025-07 format)
    /// Supports both streaming and non-streaming responses with provider cost extraction
    async fn extract_from_http_body(
        &self,
        body: &[u8],
        model_id: &str,
        is_streaming: bool,
    ) -> Result<ProviderUsage, AppError> {
        let body_str = std::str::from_utf8(body)
            .map_err(|e| AppError::InvalidArgument(format!("Invalid UTF-8: {}", e)))?;

        if is_streaming {
            // Handle streaming SSE format
            if body_str.contains("data: ") {
                return Self::extract_usage_from_sse_body(body_str, model_id)
                    .map(|mut usage| {
                        usage.model_id = model_id.to_string();
                        usage
                    })
                    .ok_or_else(|| {
                        AppError::External(
                            "Failed to extract usage from OpenAI streaming response".to_string(),
                        )
                    });
            }
        }

        // Handle regular JSON response
        let json_value: serde_json::Value = serde_json::from_str(body_str)
            .map_err(|e| AppError::External(format!("Failed to parse JSON: {}", e)))?;

        // Extract usage from JSON response
        Self::extract_usage_from_json(&json_value, model_id).ok_or_else(|| {
            AppError::External("Failed to extract usage from OpenAI response".to_string())
        })
    }

    fn extract_usage(&self, raw_json: &serde_json::Value) -> Option<ProviderUsage> {
        Self::extract_usage_from_json(raw_json, "unknown")
    }

    /// Extract usage information from OpenAI streaming chunk
    fn extract_usage_from_stream_chunk(
        &self,
        chunk_json: &serde_json::Value,
    ) -> Option<ProviderUsage> {
        // For OpenAI streaming, usage info comes in the final chunk
        Self::extract_usage_from_json(chunk_json, "unknown")
    }
}

impl OpenAIClient {
    /// Extract usage from OpenAI SSE (Server-Sent Events) streaming body
    /// Processes streaming responses line by line to find final usage chunk
    fn extract_usage_from_sse_body(body: &str, model_id: &str) -> Option<ProviderUsage> {
        // Process streaming body line by line to find usage information
        // OpenAI sends usage in the final chunk that has usage field
        let mut final_usage: Option<ProviderUsage> = None;

        for line in body.lines() {
            if line.starts_with("data: ") {
                let json_str = &line[6..]; // Remove "data: " prefix
                if json_str.trim() == "[DONE]" {
                    continue;
                }

                // Try to parse the chunk as JSON
                if let Ok(chunk_json) = serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                    // Check if this chunk has usage information
                    if chunk_json.get("usage").is_some() {
                        // Extract usage from this chunk - this is typically the final chunk
                        if let Some(usage) = Self::extract_usage_from_json(&chunk_json, model_id) {
                            final_usage = Some(usage);
                        }
                    }
                }
            }
        }

        final_usage
    }

    /// Extract usage from parsed JSON (handles all OpenAI response formats)
    fn extract_usage_from_json(
        json_value: &serde_json::Value,
        model_id: &str,
    ) -> Option<ProviderUsage> {
        let usage = json_value.get("usage")?;

        // Handle Chat Completions API format: {"prompt_tokens", "completion_tokens", "prompt_tokens_details": {"cached_tokens"}}
        if let (Some(prompt_tokens), Some(completion_tokens)) = (
            usage.get("prompt_tokens").and_then(|v| v.as_i64()),
            usage.get("completion_tokens").and_then(|v| v.as_i64()),
        ) {
            // Extract cached tokens from prompt_tokens_details if available
            let cache_read_tokens = usage
                .get("prompt_tokens_details")
                .and_then(|details| details.get("cached_tokens"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            let mut usage = ProviderUsage::new(
                prompt_tokens as i32, // Total input tokens
                completion_tokens as i32,
                0, // cache_write_tokens is 0 for OpenAI
                cache_read_tokens,
                model_id.to_string()
            );

            usage.validate().ok()?;

            return Some(usage);
        }

        // Handle Responses API format: {"input_tokens", "output_tokens", "input_tokens_details", "total_tokens"}
        if let (Some(input_tokens), Some(output_tokens)) = (
            usage.get("input_tokens").and_then(|v| v.as_i64()),
            usage.get("output_tokens").and_then(|v| v.as_i64()),
        ) {
            // Extract cached tokens from input_tokens_details if available
            let cache_read_tokens = usage
                .get("input_tokens_details")
                .and_then(|details| details.get("cached_tokens"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            let mut usage = ProviderUsage::new(
                input_tokens as i32, // Total input tokens
                output_tokens as i32,
                0, // Responses API doesn't provide cache write details
                cache_read_tokens,
                model_id.to_string()
            );

            usage.validate().ok()?;

            return Some(usage);
        }

        tracing::warn!("Unable to extract usage from OpenAI response: unknown format");
        None
    }
}
