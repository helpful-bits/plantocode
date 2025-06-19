use crate::error::AppError;
use actix_web::{web, HttpResponse};
use futures_util::{Stream, StreamExt, TryStreamExt};
use reqwest::{Client, Response, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::config::settings::AppSettings;
use tracing::{debug, info, warn, error, instrument};

// Base URL for Anthropic API
const ANTHROPIC_BASE_URL: &str = "https://api.anthropic.com/v1";

// Anthropic Chat Completion Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnthropicChatRequest {
    pub model: String,
    pub messages: Vec<AnthropicMessage>,
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnthropicMessage {
    pub role: String,
    pub content: AnthropicContent,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum AnthropicContent {
    Text(String),
    Parts(Vec<AnthropicContentPart>),
}

#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnthropicContentPart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: Option<String>,
    pub source: Option<AnthropicImageSource>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnthropicImageSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub media_type: String,
    pub data: String,
}

// Anthropic Chat Completion Response Structs
#[derive(Debug, Deserialize, Serialize)]
pub struct AnthropicChatResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub response_type: String,
    pub role: String,
    pub content: Vec<AnthropicResponseContent>,
    pub model: String,
    pub stop_reason: Option<String>,
    pub stop_sequence: Option<String>,
    pub usage: AnthropicUsage,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AnthropicResponseContent {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AnthropicUsage {
    pub input_tokens: i32,
    pub output_tokens: i32,
}

// Anthropic Streaming Structs
#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct AnthropicStreamChunk {
    #[serde(rename = "type")]
    pub chunk_type: String,
    pub message: Option<AnthropicStreamMessage>,
    pub content_block: Option<AnthropicStreamContentBlock>,
    pub delta: Option<AnthropicStreamDelta>,
    pub usage: Option<AnthropicUsage>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AnthropicStreamMessage {
    pub id: String,
    #[serde(rename = "type")]
    pub message_type: String,
    pub role: String,
    pub content: Vec<Value>,
    pub model: String,
    pub stop_reason: Option<String>,
    pub stop_sequence: Option<String>,
    pub usage: AnthropicUsage,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AnthropicStreamContentBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub text: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct AnthropicStreamDelta {
    #[serde(rename = "type")]
    pub delta_type: String,
    pub text: Option<String>,
    pub stop_reason: Option<String>,
}

// Anthropic Client
pub struct AnthropicClient {
    client: Client,
    api_key: String,
    base_url: String,
    request_id_counter: Arc<Mutex<u64>>,
}

impl AnthropicClient {
    pub fn new(app_settings: &AppSettings) -> Result<Self, crate::error::AppError> {
        let api_key = app_settings.api_keys.anthropic_api_key.clone()
            .ok_or_else(|| crate::error::AppError::Configuration("Anthropic API key must be configured".to_string()))?;
        
        let client = Client::new();
        
        Ok(Self {
            client,
            api_key,
            base_url: ANTHROPIC_BASE_URL.to_string(),
            request_id_counter: Arc::new(Mutex::new(0)),
        })
    }

    pub fn with_base_url(mut self, base_url: String) -> Self {
        self.base_url = base_url;
        self
    }

    async fn get_next_request_id(&self) -> u64 {
        let mut counter = self.request_id_counter.lock().await;
        *counter += 1;
        *counter
    }

    // Chat Completions
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn chat_completion(&self, request: AnthropicChatRequest, user_id: &str) -> Result<(AnthropicChatResponse, HeaderMap), AppError> {
        let request_id = self.get_next_request_id().await;
        let url = format!("{}/messages", self.base_url);
        
        let response = self.client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .header("X-Request-ID", request_id.to_string())
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Anthropic request failed: {}", e.to_string())))?;
        
        let status = response.status();
        let headers = response.headers().clone();
        
        if !status.is_success() {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "Anthropic request failed with status {}: {}",
                status, error_text
            )));
        }
        
        let result = response.json::<AnthropicChatResponse>().await
            .map_err(|e| AppError::Internal(format!("Anthropic deserialization failed: {}", e.to_string())))?;
            
        Ok((result, headers))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request), fields(model = %request.model, user_id = %user_id))]
    pub async fn stream_chat_completion(
        &self, 
        request: AnthropicChatRequest,
        user_id: String
    ) -> Result<(HeaderMap, Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>), AppError> {
        // Clone necessary parts for 'static lifetime
        let client = self.client.clone();
        let api_key = self.api_key.clone();
        let base_url = self.base_url.clone();
        let request_id_counter = self.request_id_counter.clone();
        
        // Create the stream in an async move block to ensure 'static lifetime
        let result = async move {
            let request_id = {
                let mut counter = request_id_counter.lock().await;
                *counter += 1;
                *counter
            };
            let url = format!("{}/messages", base_url);
            
            // Ensure stream is set to true
            let mut streaming_request = request.clone();
            streaming_request.stream = Some(true);
            
            let response = client
                .post(&url)
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .header("X-Request-ID", request_id.to_string())
                .json(&streaming_request)
                .send()
                .await
                .map_err(|e| AppError::External(format!("Anthropic request failed: {}", e.to_string())))?;
            
            let status = response.status();
            let headers = response.headers().clone();
            
            if !status.is_success() {
                let error_text = response.text().await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "Anthropic streaming request failed with status {}: {}",
                    status, error_text
                )));
            }
            
            // Return a stream that can be consumed by actix-web
            let stream = response.bytes_stream()
                .map(|result| {
                    match result {
                        Ok(bytes) => Ok(web::Bytes::from(bytes)),
                        Err(e) => Err(AppError::External(format!("Anthropic network error: {}", e.to_string()))),
                    }
                });
                
            let boxed_stream: Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>> = Box::pin(stream);
            Ok((headers, boxed_stream))
        }.await?;
        
        Ok(result)
    }
    
    // Helper method to parse usage from a stream
    pub fn extract_usage_from_stream_chunk(chunk_str: &str) -> Option<AnthropicUsage> {
        if chunk_str.trim().is_empty() {
            return None;
        }
        
        match serde_json::from_str::<AnthropicStreamChunk>(chunk_str.trim()) {
            Ok(parsed) => parsed.usage,
            Err(_) => None,
        }
    }
    
    // Helper method to extract tokens from a stream chunk
    pub fn extract_tokens_from_stream_chunk(chunk_str: &str) -> Option<(i32, i32)> {
        Self::extract_usage_from_stream_chunk(chunk_str).map(|usage| 
            (usage.input_tokens, usage.output_tokens)
        )
    }
    
    // Convert a generic JSON Value into an AnthropicChatRequest
    pub fn convert_to_chat_request(&self, payload: Value) -> Result<AnthropicChatRequest, AppError> {
        // First, try to deserialize as a generic request to extract messages
        let mut request: AnthropicChatRequest = serde_json::from_value(payload)
            .map_err(|e| AppError::BadRequest(format!("Failed to convert payload to Anthropic chat request: {}", e)))?;
        
        // Transform model name to remove provider prefix if present
        // This ensures correct model names are sent to Anthropic API:
        // "anthropic/claude-4-sonnet" -> "claude-4-sonnet"
        // "anthropic/claude-4-opus" -> "claude-4-opus"
        // "claude-4-sonnet" -> "claude-4-sonnet" (unchanged)
        if request.model.starts_with("anthropic/") {
            let original_model = request.model.clone();
            request.model = request.model.strip_prefix("anthropic/").unwrap().to_string();
            
            // Validate that we don't have an empty model name after transformation
            if request.model.is_empty() {
                return Err(AppError::BadRequest("Invalid model name: empty after removing provider prefix".to_string()));
            }
            
            debug!("Transformed model name: {} -> {}", original_model, request.model);
        } else {
            debug!("Using model name as-is: {}", request.model);
        }
        
        // Extract system messages from the messages array and combine them
        let mut system_messages = Vec::new();
        let mut non_system_messages = Vec::new();
        
        for message in request.messages {
            if message.role == "system" {
                // Extract text content from system messages
                match message.content {
                    AnthropicContent::Text(text) => {
                        system_messages.push(text);
                    },
                    AnthropicContent::Parts(parts) => {
                        for part in parts {
                            if part.part_type == "text" {
                                if let Some(text) = part.text {
                                    system_messages.push(text);
                                }
                            }
                        }
                    }
                }
            } else if message.role == "user" || message.role == "assistant" {
                non_system_messages.push(message);
            }
            // Skip any other roles that aren't supported by Anthropic
        }
        
        // Combine system messages into a single system parameter
        if !system_messages.is_empty() {
            let combined_system = system_messages.join("\n\n");
            request.system = Some(combined_system);
        }
        
        // Update messages array to only contain user and assistant messages
        request.messages = non_system_messages;
        
        // Validate that we have at least one message after filtering
        if request.messages.is_empty() {
            return Err(AppError::BadRequest("Request must contain at least one user or assistant message".to_string()));
        }
        
        Ok(request)
    }
    
    // Helper functions for token and usage tracking
    pub fn extract_tokens_from_response(&self, response: &AnthropicChatResponse) -> (i32, i32) {
        (response.usage.input_tokens, response.usage.output_tokens)
    }
}

impl Clone for AnthropicClient {
    fn clone(&self) -> Self {
        Self {
            client: Client::new(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}