// Anthropic API client implementation with proper token counting
// Handles both cached and uncached tokens according to the 2025-07 API specification
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

use crate::clients::usage_extractor::{ProviderUsage, UsageExtractor};
use crate::services::model_mapping_service::ModelWithMapping;
use bigdecimal::BigDecimal;
use std::str::FromStr;

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
    pub cache_creation_input_tokens: Option<i32>,
    pub cache_read_input_tokens: Option<i32>,
    /// Cost field available in Anthropic v2024-06 API
    pub cost: Option<f64>,
    #[serde(flatten)]
    pub other: Option<serde_json::Value>,
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
        
        let client = crate::utils::http_client::new_api_client();
        
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
    #[instrument(skip(self, request, model), fields(model = %model.resolved_model_id))]
    pub async fn chat_completion(&self, mut request: AnthropicChatRequest, model: &ModelWithMapping, user_id: &str) -> Result<(AnthropicChatResponse, HeaderMap, i32, i32, i32, i32), AppError> {
        let request_id = self.get_next_request_id().await;
        let url = format!("{}/messages", self.base_url);
        
        // Use the resolved model ID from the mapping service
        request.model = model.resolved_model_id.clone();
        
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
        
        let body = response.bytes().await
            .map_err(|e| AppError::Internal(format!("Failed to read response body: {}", e)))?;
        
        let result: AnthropicChatResponse = serde_json::from_slice(&body)
            .map_err(|e| AppError::Internal(format!("Anthropic deserialization failed: {}", e.to_string())))?;
        
        let usage = self.extract_from_response_body(&body, &request.model).await?;
            
        Ok((result, headers, usage.prompt_tokens, usage.cache_write_tokens, usage.cache_read_tokens, usage.completion_tokens))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request, model), fields(model = %model.resolved_model_id, user_id = %user_id))]
    pub async fn stream_chat_completion(
        &self, 
        mut request: AnthropicChatRequest,
        model: &ModelWithMapping,
        user_id: String
    ) -> Result<(HeaderMap, Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>), AppError> {
        // Use the resolved model ID from the mapping service
        request.model = model.resolved_model_id.clone();
        
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
}

impl UsageExtractor for AnthropicClient {
    fn extract_usage(&self, raw_json: &serde_json::Value) -> Option<ProviderUsage> {
        let usage = raw_json.get("usage")?;
        
        let input_tokens = usage.get("input_tokens")?.as_i64()? as i32;
        let output_tokens = usage.get("output_tokens")?.as_i64()? as i32;
        let cache_write_tokens = usage.get("cache_creation_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let cache_read_tokens = usage.get("cache_read_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        
        let usage = ProviderUsage::new(
            input_tokens + cache_write_tokens + cache_read_tokens, // Total prompt tokens
            output_tokens,
            cache_write_tokens,
            cache_read_tokens,
            String::new(), // model_id will be empty for trait method
        );
        
        usage.validate().ok()?;
        Some(usage)
    }

    /// Extract usage information from Anthropic API HTTP response body (2025-07 format)
    /// Handles only non-streaming JSON responses - streaming is processed by transformers
    async fn extract_from_response_body(&self, body: &[u8], model_id: &str) -> Result<ProviderUsage, AppError> {
        let body_str = std::str::from_utf8(body)
            .map_err(|e| AppError::InvalidArgument(format!("Invalid UTF-8: {}", e)))?;
        
        // Handle non-streaming JSON response
        let json: serde_json::Value = serde_json::from_str(body_str)
            .map_err(|e| AppError::External(format!("Failed to parse JSON: {}", e)))?;
        
        self.extract_usage_from_json(&json, model_id)
            .map(|mut usage| {
                usage.model_id = model_id.to_string();
                usage
            })
            .ok_or_else(|| AppError::External("Failed to extract usage from Anthropic response".to_string()))
    }
    
}

impl AnthropicClient {
    /// Extract usage information from Anthropic response JSON
    fn extract_usage_from_json(&self, json_value: &serde_json::Value, model_id: &str) -> Option<ProviderUsage> {
        // Extract usage from parsed JSON
        let usage = json_value.get("usage")?;
        
        // Anthropic's input_tokens is the base input tokens (not including cache tokens)
        let input_tokens = match usage.get("input_tokens").and_then(|v| v.as_i64()) {
            Some(tokens) => tokens as i32,
            None => {
                tracing::warn!("Missing or invalid input_tokens in Anthropic response");
                return None;
            }
        };
        
        let output_tokens = match usage.get("output_tokens").and_then(|v| v.as_i64()) {
            Some(tokens) => tokens as i32,
            None => {
                tracing::warn!("Missing or invalid output_tokens in Anthropic response");
                return None;
            }
        };
        
        // Extract cache tokens with proper error handling
        let cache_creation_input_tokens = usage.get("cache_creation_input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        let cache_read_input_tokens = usage.get("cache_read_input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        
        // Calculate total prompt tokens as sum of all input token types
        let total_prompt_tokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens;
        
        // Extract optional cost field
        let cost = usage.get("cost")
            .and_then(|v| v.as_f64())
            .map(|f| BigDecimal::from_str(&f.to_string()).ok())
            .flatten();
        
        let mut usage = if let Some(cost_val) = cost {
            ProviderUsage::with_cost(
                total_prompt_tokens,
                output_tokens,
                cache_creation_input_tokens,
                cache_read_input_tokens,
                model_id.to_string(),
                cost_val
            )
        } else {
            ProviderUsage::new(
                total_prompt_tokens,
                output_tokens,
                cache_creation_input_tokens,
                cache_read_input_tokens,
                model_id.to_string()
            )
        };
        
        usage.validate().ok()?;
        
        Some(usage)
    }
    
    /// Extract usage information from Anthropic streaming chunk
    fn extract_usage_from_stream_chunk(&self, chunk_json: &serde_json::Value) -> Option<ProviderUsage> {
        // For Anthropic streaming, usage info comes in message_start and message_delta events
        let chunk_type = chunk_json.get("type")?.as_str()?;
        
        match chunk_type {
            "message_start" => {
                // Extract initial usage from message_start event
                if let Some(message) = chunk_json.get("message") {
                    if let Some(usage) = message.get("usage") {
                        let input_tokens = usage.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        let output_tokens = usage.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        
                        let cache_creation_input_tokens = usage.get("cache_creation_input_tokens")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0) as i32;
                        let cache_read_input_tokens = usage.get("cache_read_input_tokens")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0) as i32;
                        
                        // Calculate total prompt tokens as sum of all input token types
                        let total_prompt_tokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens;
                        
                        let mut usage = ProviderUsage::new(
                            total_prompt_tokens,
                            output_tokens,
                            cache_creation_input_tokens,
                            cache_read_input_tokens,
                            "unknown".to_string()
                        );
                        
                        usage.validate().ok()?;
                        
                        return Some(usage);
                    }
                }
                None
            },
            "message_delta" => {
                // Track cumulative usage from message_delta events
                if let Some(usage) = chunk_json.get("usage") {
                    let input_tokens = usage.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let output_tokens = usage.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    
                    // Extract cache tokens with proper error handling
                    let cache_creation_input_tokens = usage.get("cache_creation_input_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32;
                    let cache_read_input_tokens = usage.get("cache_read_input_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32;
                    
                    // Calculate total prompt tokens as sum of all input token types
                    let total_prompt_tokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens;
                    
                    if input_tokens > 0 || output_tokens > 0 {
                        let mut usage = ProviderUsage::new(
                            total_prompt_tokens,
                            output_tokens,
                            cache_creation_input_tokens,
                            cache_read_input_tokens,
                            "unknown".to_string()
                        );
                        
                        usage.validate().ok()?;
                        
                        return Some(usage);
                    }
                }
                None
            },
            _ => None
        }
    }
}

impl Clone for AnthropicClient {
    fn clone(&self) -> Self {
        Self {
            client: crate::utils::http_client::new_api_client(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}