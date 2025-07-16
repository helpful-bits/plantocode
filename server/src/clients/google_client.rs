use crate::error::AppError;
use actix_web::web;
use futures_util::{Stream, StreamExt, TryStreamExt};
use reqwest::{Client, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::Mutex;
use crate::config::settings::AppSettings;
use crate::clients::usage_extractor::{UsageExtractor, ProviderUsage};
use crate::services::model_mapping_service::ModelWithMapping;
use tracing::{debug, info, error, instrument};

// Base URL for Google AI API
const GOOGLE_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";

// Google Chat Completion Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoogleChatRequest {
    pub contents: Vec<GoogleContent>,
    pub system_instruction: Option<GoogleSystemInstruction>,
    pub generation_config: Option<GoogleGenerationConfig>,
    pub safety_settings: Option<Vec<GoogleSafetySetting>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleSystemInstruction {
    pub parts: Vec<GooglePart>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleContent {
    pub role: String,
    pub parts: Vec<GooglePart>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum GooglePart {
    Text { text: String },
    InlineData { 
        inline_data: GoogleInlineData 
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleInlineData {
    pub mime_type: String,
    pub data: String,
}

#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoogleGenerationConfig {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<i32>,
    pub max_output_tokens: Option<i32>,
    pub candidate_count: Option<i32>,
    pub stop_sequences: Option<Vec<String>>,
    pub thinking_config: Option<GoogleThinkingConfig>,
}

#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoogleThinkingConfig {
    pub thinking_budget: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleSafetySetting {
    pub category: String,
    pub threshold: String,
}

// Google Chat Completion Response Structs
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleChatResponse {
    pub candidates: Vec<GoogleCandidate>,
    pub usage_metadata: Option<GoogleUsageMetadata>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleCandidate {
    pub content: GoogleResponseContent,
    pub finish_reason: Option<String>,
    pub index: i32,
    pub safety_ratings: Option<Vec<GoogleSafetyRating>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GoogleResponseContent {
    pub parts: Option<Vec<GoogleResponsePart>>,
    pub role: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GoogleResponsePart {
    pub text: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GoogleSafetyRating {
    pub category: String,
    pub probability: String,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct GoogleUsageMetadata {
    pub prompt_token_count: i32,
    #[serde(default)]
    pub candidates_token_count: Option<i32>,
    pub total_token_count: i32,
    #[serde(rename = "cachedContentTokenCount")]
    pub cached_content_token_count: Option<i32>,
    #[serde(flatten)]
    pub other: Option<serde_json::Value>,
}

// Google Streaming Structs
#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStreamChunk {
    pub candidates: Option<Vec<GoogleStreamCandidate>>,
    pub usage_metadata: Option<GoogleUsageMetadata>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStreamCandidate {
    pub content: Option<GoogleStreamContent>,
    pub finish_reason: Option<String>,
    pub index: i32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GoogleStreamContent {
    pub parts: Vec<GoogleStreamPart>,
    pub role: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GoogleStreamPart {
    pub text: String,
}

// Google Client
pub struct GoogleClient {
    client: Client,
    api_keys: Vec<String>,
    current_key_index: AtomicUsize,
    base_url: String,
    request_id_counter: Arc<Mutex<u64>>,
}

impl GoogleClient {
    pub fn new(app_settings: &AppSettings) -> Result<Self, crate::error::AppError> {
        let api_keys = app_settings.api_keys.google_api_keys.clone()
            .ok_or_else(|| crate::error::AppError::Configuration("Google API keys must be configured".to_string()))?;
        
        if api_keys.is_empty() {
            return Err(crate::error::AppError::Configuration("Google API keys list cannot be empty".to_string()));
        }
        
        let client = crate::clients::http_client::new_api_client();
        
        Ok(Self {
            client,
            api_keys,
            current_key_index: AtomicUsize::new(0),
            base_url: GOOGLE_BASE_URL.to_string(),
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

    fn is_retryable_error(&self, e: &AppError) -> bool {
        match e {
            AppError::External(msg) => {
                msg.contains("status 401") ||
                msg.contains("status 403") ||
                msg.contains("status 429") ||
                msg.contains("status 5") ||
                msg.contains("network error") ||
                msg.contains("timeout") ||
                msg.contains("connection")
            },
            _ => false,
        }
    }

    // Chat Completions
    #[instrument(skip(self, request, model), fields(model = %model.resolved_model_id))]
    pub async fn chat_completion(&self, request: GoogleChatRequest, model: &ModelWithMapping, user_id: &str) -> Result<(GoogleChatResponse, HeaderMap, i32, i32, i32, i32), AppError> {
        let request_id = self.get_next_request_id().await;
        
        // Use the resolved model ID from the mapping service
        let clean_model_id = &model.resolved_model_id;
        
        let num_keys = self.api_keys.len();
        let start_index = self.current_key_index.fetch_add(1, Ordering::Relaxed) % num_keys;
        let mut last_error = None;
        
        for i in 0..num_keys {
            let key_index = (start_index + i) % num_keys;
            let api_key = &self.api_keys[key_index];
            let url = format!("{}/models/{}:generateContent", self.base_url, clean_model_id);
            
            debug!("Attempting Google API request with key {} (attempt {} of {})", key_index + 1, i + 1, num_keys);
            
            let response_result = self.client
                .post(&url)
                .header("x-goog-api-key", api_key)
                .header("Content-Type", "application/json")
                .header("X-Request-ID", request_id.to_string())
                .json(&request)
                .send()
                .await;
            
            let response = match response_result {
                Ok(resp) => resp,
                Err(e) => {
                    let app_error = AppError::External(format!("Google request failed: {}", e.to_string()));
                    if self.is_retryable_error(&app_error) {
                        debug!("Request failed with retryable error, trying next key: {}", e);
                        last_error = Some(app_error);
                        continue;
                    } else {
                        return Err(app_error);
                    }
                }
            };
            
            let status = response.status();
            let headers = response.headers().clone();
            
            if !status.is_success() {
                let error_text = response.text().await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                let app_error = AppError::External(format!(
                    "Google request failed with status {}: {}",
                    status, error_text
                ));
                
                if self.is_retryable_error(&app_error) {
                    debug!("Request failed with retryable status {}, trying next key", status);
                    last_error = Some(app_error);
                    continue;
                } else {
                    return Err(app_error);
                }
            }
            
            let response_text = response.text().await
                .map_err(|e| AppError::Internal(format!("Failed to get response text: {}", e.to_string())))?;
            
            let result = serde_json::from_str::<GoogleChatResponse>(&response_text)
                .map_err(|e| {
                    error!("Google deserialization failed: {} | Response: {}", e.to_string(), response_text);
                    AppError::Internal(format!("Google deserialization failed: {}", e.to_string()))
                })?;
            
            // Check if response has usable content - if not, trigger fallback
            if let Some(first_candidate) = result.candidates.first() {
                if first_candidate.content.parts.is_none() || 
                   first_candidate.content.parts.as_ref().map_or(true, |parts| parts.is_empty()) {
                    let finish_reason = first_candidate.finish_reason.as_deref().unwrap_or("unknown");
                    return Err(AppError::External(format!("Google API returned response without content parts (finish_reason: {})", finish_reason)));
                }
            }
            
            info!("Google API request successful for model: {} with key {}", clean_model_id, key_index + 1);
            debug!("Response candidates count: {}", result.candidates.len());
            
            let (input_tokens, cache_write_tokens, cache_read_tokens, output_tokens) = if let Some(usage) = &result.usage_metadata {
                // Google's prompt_token_count is already the total input tokens
                (usage.prompt_token_count, 0, usage.cached_content_token_count.unwrap_or(0), usage.candidates_token_count.unwrap_or(0))
            } else {
                (0, 0, 0, 0)
            };
                
            return Ok((result, headers, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens));
        }
        
        // If we get here, all keys failed
        Err(last_error.unwrap_or_else(|| AppError::External("All Google API keys failed".to_string())))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request, model), fields(model = %model.resolved_model_id, user_id = %user_id))]
    pub async fn stream_chat_completion(
        &self, 
        request: GoogleChatRequest,
        model: &ModelWithMapping,
        user_id: String
    ) -> Result<(HeaderMap, Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>), AppError> {
        // Get the next key index upfront
        let num_keys = self.api_keys.len();
        let start_index = self.current_key_index.fetch_add(1, Ordering::Relaxed) % num_keys;
        
        // Clone necessary parts for 'static lifetime
        let client = self.client.clone();
        let api_keys = self.api_keys.clone();
        let base_url = self.base_url.clone();
        let request_id_counter = self.request_id_counter.clone();
        let resolved_model_id = model.resolved_model_id.clone();
        
        // Create the stream in an async move block to ensure 'static lifetime
        let result = async move {
            let request_id = {
                let mut counter = request_id_counter.lock().await;
                *counter += 1;
                *counter
            };
            // Use the resolved model ID from the mapping service
            let clean_model_id = &resolved_model_id;
            let mut last_error = None;
            
            for i in 0..num_keys {
                let key_index = (start_index + i) % num_keys;
                let api_key = &api_keys[key_index];
                let url = format!("{}/models/{}:streamGenerateContent?alt=sse", base_url, clean_model_id);
                
                let response_result = client
                    .post(&url)
                    .header("x-goog-api-key", api_key)
                    .header("Content-Type", "application/json")
                    .header("X-Request-ID", request_id.to_string())
                    .json(&request)
                    .send()
                    .await;
                
                let response = match response_result {
                    Ok(resp) => resp,
                    Err(e) => {
                        let app_error = AppError::External(format!("Google request failed: {}", e.to_string()));
                        let is_retryable = match &app_error {
                            AppError::External(msg) => {
                                msg.contains("status 401") || msg.contains("status 403") || 
                                msg.contains("status 429") || msg.contains("status 5") ||
                                msg.contains("network error") || msg.contains("timeout") || msg.contains("connection")
                            },
                            _ => false,
                        };
                        
                        if is_retryable {
                            last_error = Some(app_error);
                            continue;
                        } else {
                            return Err(app_error);
                        }
                    }
                };
                
                let status = response.status();
                let headers = response.headers().clone();
                
                if !status.is_success() {
                    let error_text = response.text().await
                        .unwrap_or_else(|_| "Failed to get error response".to_string());
                    let app_error = AppError::External(format!(
                        "Google streaming request failed with status {}: {}",
                        status, error_text
                    ));
                    
                    let is_retryable = match &app_error {
                        AppError::External(msg) => {
                            msg.contains("status 401") || msg.contains("status 403") || 
                            msg.contains("status 429") || msg.contains("status 5") ||
                            msg.contains("network error") || msg.contains("timeout") || msg.contains("connection")
                        },
                        _ => false,
                    };
                    
                    if is_retryable {
                        last_error = Some(app_error);
                        continue;
                    } else {
                        return Err(app_error);
                    }
                }
                
                let stream = response.bytes_stream()
                    .map(|result| {
                        match result {
                            Ok(bytes) => Ok(web::Bytes::from(bytes)),
                            Err(e) => Err(AppError::External(format!("Google network error: {}", e.to_string()))),
                        }
                    });
                    
                let boxed_stream: Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>> = Box::pin(stream);
                return Ok((headers, boxed_stream));
            }
            
            // If we get here, all keys failed
            Err(last_error.unwrap_or_else(|| AppError::External("All Google API keys failed".to_string())))
        }.await?;
        
        Ok(result)
    }
    
    
    // Convert a generic JSON Value into a GoogleChatRequest
    pub fn convert_to_chat_request(&self, payload: Value) -> Result<GoogleChatRequest, AppError> {
        self.convert_to_chat_request_with_capabilities(payload, None)
    }

    // Convert a generic JSON Value into a GoogleChatRequest with model capabilities
    pub fn convert_to_chat_request_with_capabilities(&self, payload: Value, model_capabilities: Option<&serde_json::Value>) -> Result<GoogleChatRequest, AppError> {
        // First, try to extract the messages array from the generic payload
        let messages = payload
            .get("messages")
            .and_then(|m| m.as_array())
            .ok_or_else(|| AppError::BadRequest("Request must contain 'messages' array".to_string()))?;

        let mut contents = Vec::new();
        let mut system_instruction: Option<GoogleSystemInstruction> = None;

        // Process all messages, extracting system prompts properly
        for message in messages {
            let role = message
                .get("role")
                .and_then(|r| r.as_str())
                .ok_or_else(|| AppError::BadRequest("Each message must have a 'role' field".to_string()))?;

            let content = message
                .get("content")
                .ok_or_else(|| AppError::BadRequest("Each message must have a 'content' field".to_string()))?;

            // Handle different content formats
            let parts = self.parse_message_content(content)?;

            if role == "system" {
                // Properly handle system prompts using systemInstruction field
                if system_instruction.is_none() {
                    system_instruction = Some(GoogleSystemInstruction { parts });
                } else {
                    // Append to existing system instruction
                    if let Some(ref mut sys_inst) = system_instruction {
                        sys_inst.parts.extend(parts);
                    }
                }
            } else {
                // Google API uses "user" and "model" roles
                let google_role = match role {
                    "user" => "user",
                    "assistant" => "model",
                    _ => {
                        return Err(AppError::BadRequest(format!("Unsupported role: {}", role)));
                    }
                };

                contents.push(GoogleContent {
                    role: google_role.to_string(),
                    parts,
                });
            }
        }

        // Validate that we have at least one content item
        if contents.is_empty() {
            return Err(AppError::BadRequest("Request must contain at least one message".to_string()));
        }

        // Google API requires conversation to start with user message
        if let Some(first_content) = contents.first() {
            if first_content.role != "user" {
                return Err(AppError::BadRequest("Conversation must start with a user message for Google API".to_string()));
            }
        }

        // Validate message sequence - Google requires alternating user/model messages
        let mut last_role = "";
        for content in &contents {
            if content.role == last_role {
                // Found consecutive messages with same role, this might cause issues
                // For now, we'll allow it but log a warning
                debug!("Warning: Found consecutive {} messages, Google API prefers alternating user/model messages", content.role);
            }
            last_role = &content.role;
        }

        // Extract generation config from payload if present
        let mut generation_config = if let Some(config_value) = payload.get("generationConfig") {
            serde_json::from_value(config_value.clone()).unwrap_or_else(|_| GoogleGenerationConfig {
                temperature: None,
                top_p: None,
                top_k: None,
                max_output_tokens: None,
                candidate_count: None,
                stop_sequences: None,
                thinking_config: None,
            })
        } else {
            // Create generation config from common parameters
            let mut config = GoogleGenerationConfig {
                temperature: None,
                top_p: None,
                top_k: None,
                max_output_tokens: None,
                candidate_count: None,
                stop_sequences: None,
                thinking_config: None,
            };

            if let Some(temp) = payload.get("temperature").and_then(|t| t.as_f64()) {
                config.temperature = Some(temp as f32);
            }
            if let Some(top_p) = payload.get("top_p").and_then(|t| t.as_f64()) {
                config.top_p = Some(top_p as f32);
            }
            if let Some(max_tokens) = payload.get("max_tokens").and_then(|t| t.as_u64()) {
                config.max_output_tokens = Some(max_tokens as i32);
            }

            config
        };

        // Check if model has thinking capabilities and automatically configure thinking
        if let Some(capabilities) = model_capabilities {
            if let Some(thinking) = capabilities.get("thinking").and_then(|t| t.as_bool()) {
                if thinking && generation_config.thinking_config.is_none() {
                    // Set default thinking budget if not already configured
                    generation_config.thinking_config = Some(GoogleThinkingConfig {
                        thinking_budget: Some(10000), // Default thinking budget
                    });
                    debug!("Automatically enabled thinking configuration with budget: 10000");
                }
            }
        }

        let generation_config = Some(generation_config);

        let google_request = GoogleChatRequest {
            contents,
            system_instruction,
            generation_config,
            safety_settings: None, // Use default safety settings
        };

        debug!("Converted to Google request with {} contents and system instruction: {}", 
               google_request.contents.len(), 
               google_request.system_instruction.is_some());
        
        Ok(google_request)
    }

    // Helper method to parse message content into GooglePart vector
    fn parse_message_content(&self, content: &Value) -> Result<Vec<GooglePart>, AppError> {
        match content {
            Value::String(text) => {
                Ok(vec![GooglePart::Text { text: text.clone() }])
            },
            Value::Array(parts_array) => {
                let mut google_parts = Vec::new();
                for part in parts_array {
                    if let Some(part_type) = part.get("type").and_then(|t| t.as_str()) {
                        match part_type {
                            "text" => {
                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    google_parts.push(GooglePart::Text {
                                        text: text.to_string(),
                                    });
                                }
                            },
                            "image_url" => {
                                // Handle image content if needed
                                if let Some(image_url) = part.get("image_url").and_then(|u| u.get("url")).and_then(|url| url.as_str()) {
                                    // Convert base64 image to inline data format
                                    if image_url.starts_with("data:") {
                                        if let Some(comma_pos) = image_url.find(',') {
                                            let header = &image_url[..comma_pos];
                                            let data = &image_url[comma_pos + 1..];
                                            
                                            // Extract MIME type from data URI
                                            let mime_type = if header.contains("image/jpeg") {
                                                "image/jpeg"
                                            } else if header.contains("image/png") {
                                                "image/png"
                                            } else if header.contains("image/webp") {
                                                "image/webp"
                                            } else {
                                                "image/jpeg" // Default fallback
                                            };

                                            google_parts.push(GooglePart::InlineData {
                                                inline_data: GoogleInlineData {
                                                    mime_type: mime_type.to_string(),
                                                    data: data.to_string(),
                                                },
                                            });
                                        }
                                    }
                                }
                            },
                            _ => {
                                // Skip unsupported content types
                            }
                        }
                    }
                }
                Ok(google_parts)
            },
            _ => {
                Err(AppError::BadRequest("Content must be a string or array".to_string()))
            }
        }
    }
    
    /// Extract usage from Google SSE (Server-Sent Events) streaming body
    /// Processes streaming responses line by line to find usage metadata from final chunks only
    fn extract_usage_from_sse_body(&self, body: &str, model_id: &str) -> Option<ProviderUsage> {
        // Google provides cumulative token counts in streaming responses
        // We need to track the last seen usageMetadata which contains the final totals
        let mut last_usage_metadata: Option<serde_json::Value> = None;
        
        // Process streaming body line by line
        for line in body.lines() {
            if line.starts_with("data: ") {
                let json_str = &line[6..]; // Remove "data: " prefix
                if json_str.trim().is_empty() {
                    continue;
                }
                
                // Try to parse the chunk as JSON
                if let Ok(chunk_json) = serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                    // Check for usage metadata in this chunk
                    if let Some(usage_metadata) = chunk_json.get("usageMetadata") {
                        // Store the last seen usage metadata
                        last_usage_metadata = Some(usage_metadata.clone());
                    }
                }
            } else if !line.trim().is_empty() {
                // Try parsing non-SSE lines as JSON (some Google responses might not use SSE)
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                    // Check if this is a complete response with usage metadata
                    if let Some(usage_metadata) = json.get("usageMetadata") {
                        last_usage_metadata = Some(usage_metadata.clone());
                    }
                }
            }
        }
        
        // Process the last seen usage metadata to get final totals
        if let Some(usage_metadata) = last_usage_metadata {
            // Extract token counts from the final usage metadata
            let prompt_tokens = usage_metadata.get("promptTokenCount")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .unwrap_or(0);
            
            let completion_tokens = usage_metadata.get("candidatesTokenCount")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .unwrap_or(0);
            
            let cached_tokens = usage_metadata.get("cachedContentTokenCount")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .unwrap_or(0);
            
            let mut usage = ProviderUsage::new(
                prompt_tokens,  // Total input tokens (already includes cached)
                completion_tokens,  // Total output tokens
                0,  // cache_write_tokens should be 0
                cached_tokens,
                model_id.to_string()
            );
            
            usage.validate().ok()?;
            
            Some(usage)
        } else {
            None
        }
    }
    
    /// Extract usage from parsed JSON (handles Google response format)
    fn extract_usage_from_json(&self, json_value: &serde_json::Value, model_id: &str) -> Option<ProviderUsage> {
        let usage_metadata = json_value.get("usageMetadata")?;
        
        // Handle Google format: {"promptTokenCount", "candidatesTokenCount", "cachedContentTokenCount"}
        // promptTokenCount is the total input, and cachedContentTokenCount is the cache read portion
        let prompt_token_count = match usage_metadata.get("promptTokenCount").and_then(|v| v.as_i64()) {
            Some(tokens) => tokens as i32,
            None => {
                tracing::warn!("Missing or invalid promptTokenCount in Google response");
                return None;
            }
        };
        
        let candidates_token_count = match usage_metadata.get("candidatesTokenCount").and_then(|v| v.as_i64()) {
            Some(tokens) => tokens as i32,
            None => {
                tracing::warn!("Missing or invalid candidatesTokenCount in Google response");
                return None;
            }
        };
        
        // Extract cached tokens count
        let cached_content_token_count = usage_metadata.get("cachedContentTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        
        let mut usage = ProviderUsage::new(
            prompt_token_count,  // Total input tokens (already includes cached)
            candidates_token_count,
            0, // cache_write_tokens should be 0
            cached_content_token_count,
            model_id.to_string()
        );
        
        usage.validate().ok()?;
        
        Some(usage)
    }
}

impl UsageExtractor for GoogleClient {
    /// Extract usage information from Google HTTP response body (2025-07 format)
    /// Supports usageMetadata: {promptTokenCount, candidatesTokenCount, cachedContentTokenCount}
    async fn extract_from_http_body(&self, body: &[u8], model_id: &str, is_streaming: bool) -> Result<ProviderUsage, AppError> {
        let body_str = std::str::from_utf8(body)
            .map_err(|e| AppError::InvalidArgument(format!("Invalid UTF-8: {}", e)))?;
        
        if is_streaming {
            // Handle streaming SSE format
            if body_str.contains("data: ") {
                return self.extract_usage_from_sse_body(body_str, model_id)
                    .map(|mut usage| {
                        usage.model_id = model_id.to_string();
                        usage
                    })
                    .ok_or_else(|| AppError::External("Failed to extract usage from Google streaming response".to_string()));
            }
        }
        
        // Handle regular JSON response
        let json_value: serde_json::Value = serde_json::from_str(body_str)
            .map_err(|e| AppError::External(format!("Failed to parse JSON: {}", e)))?;
        
        // Extract usage from parsed JSON
        self.extract_usage_from_json(&json_value, model_id)
            .ok_or_else(|| AppError::External("Failed to extract usage from Google response".to_string()))
    }
    
    fn extract_usage(&self, raw_json: &serde_json::Value) -> Option<ProviderUsage> {
        self.extract_usage_from_json(raw_json, "unknown")
    }
    
    fn extract_usage_from_stream_chunk(&self, chunk_json: &serde_json::Value) -> Option<ProviderUsage> {
        debug!("Extracting usage from Google stream chunk");
        
        // For Google streaming, usage info comes in the final chunk
        self.extract_usage_from_json(chunk_json, "unknown")
    }
}

impl Clone for GoogleClient {
    fn clone(&self) -> Self {
        Self {
            client: crate::clients::http_client::new_api_client(),
            api_keys: self.api_keys.clone(),
            current_key_index: AtomicUsize::new(0),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}