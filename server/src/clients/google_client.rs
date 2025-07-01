// Step 3: Cached Token Pricing Implementation
// This file implements cached token counting for Google API.
// Token extraction functions return: (uncached_input, cache_write, cache_read, output)
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
    pub parts: Vec<GoogleResponsePart>,
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
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoogleUsageMetadata {
    pub prompt_token_count: i32,
    pub candidates_token_count: i32,
    pub total_token_count: i32,
    #[serde(rename = "cachedContentTokenCount")]
    pub cached_content_token_count: Option<i32>,
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
    api_key: String,
    base_url: String,
    request_id_counter: Arc<Mutex<u64>>,
}

impl GoogleClient {
    pub fn new(app_settings: &AppSettings) -> Result<Self, crate::error::AppError> {
        let api_key = app_settings.api_keys.google_api_key.clone()
            .ok_or_else(|| crate::error::AppError::Configuration("Google API key must be configured".to_string()))?;
        
        let client = Client::new();
        
        Ok(Self {
            client,
            api_key,
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

    // Chat Completions
    #[instrument(skip(self, request, model_id), fields(model = %model_id))]
    pub async fn chat_completion(&self, request: GoogleChatRequest, model_id: &str, user_id: &str) -> Result<(GoogleChatResponse, HeaderMap, i32, i32, i32, i32), AppError> {
        let request_id = self.get_next_request_id().await;
        
        // Clean up model name - remove any provider prefix if present
        let clean_model_id = if model_id.starts_with("google/") {
            model_id.strip_prefix("google/").unwrap()
        } else {
            model_id
        };
        
        let url = format!("{}/models/{}:generateContent?key={}", self.base_url, clean_model_id, self.api_key);
        
        debug!("Sending Google API request to: {}", url.replace(&self.api_key, "[REDACTED]"));
        debug!("Request contents count: {}", request.contents.len());
        
        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("X-Request-ID", request_id.to_string())
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Google request failed: {}", e.to_string())))?;
        
        let status = response.status();
        let headers = response.headers().clone();
        
        if !status.is_success() {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            error!("Google API request failed with status {}: {}", status, error_text);
            debug!("Request URL: {}", url);
            debug!("Request payload: {:?}", serde_json::to_string(&request).unwrap_or("Failed to serialize".to_string()));
            return Err(AppError::External(format!(
                "Google request failed with status {}: {}",
                status, error_text
            )));
        }
        
        let result = response.json::<GoogleChatResponse>().await
            .map_err(|e| AppError::Internal(format!("Google deserialization failed: {}", e.to_string())))?;
        
        info!("Google API request successful for model: {}", clean_model_id);
        debug!("Response candidates count: {}", result.candidates.len());
        
        let (input_tokens, cache_write_tokens, cache_read_tokens, output_tokens) = if let Some(usage) = &result.usage_metadata {
            let cached = usage.cached_content_token_count.unwrap_or(0);
            (usage.prompt_token_count, 0, cached, usage.candidates_token_count)
        } else {
            (0, 0, 0, 0)
        };
            
        Ok((result, headers, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request, model_id), fields(model = %model_id, user_id = %user_id))]
    pub async fn stream_chat_completion(
        &self, 
        request: GoogleChatRequest,
        model_id: String,
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
            // Clean up model name - remove any provider prefix if present
            let clean_model_id = if model_id.starts_with("google/") {
                model_id.strip_prefix("google/").unwrap()
            } else {
                &model_id
            };
            
            let url = format!("{}/models/{}:streamGenerateContent?key={}&alt=sse", base_url, clean_model_id, api_key);
            
            let response = client
                .post(&url)
                .header("Content-Type", "application/json")
                .header("X-Request-ID", request_id.to_string())
                .json(&request)
                .send()
                .await
                .map_err(|e| AppError::External(format!("Google request failed: {}", e.to_string())))?;
            
            let status = response.status();
            let headers = response.headers().clone();
            
            if !status.is_success() {
                let error_text = response.text().await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                error!("Google streaming API request failed with status {}: {}", status, error_text);
                debug!("Request URL: {}", url);
                debug!("Request payload: {:?}", serde_json::to_string(&request).unwrap_or("Failed to serialize".to_string()));
                return Err(AppError::External(format!(
                    "Google streaming request failed with status {}: {}",
                    status, error_text
                )));
            }
            
            // Return a stream that can be consumed by actix-web
            let stream = response.bytes_stream()
                .map(|result| {
                    match result {
                        Ok(bytes) => Ok(web::Bytes::from(bytes)),
                        Err(e) => Err(AppError::External(format!("Google network error: {}", e.to_string()))),
                    }
                });
                
            let boxed_stream: Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>> = Box::pin(stream);
            Ok((headers, boxed_stream))
        }.await?;
        
        Ok(result)
    }
    
    // Helper method to parse usage from a stream
    // Returns (input_tokens, cache_write_tokens, cache_read_tokens, output_tokens)
    pub fn extract_usage_from_stream_chunk(chunk_str: &str) -> Option<(i32, i32, i32, i32)> {
        if chunk_str.trim().is_empty() {
            return None;
        }
        
        match serde_json::from_str::<GoogleStreamChunk>(chunk_str.trim()) {
            Ok(parsed) => {
                if let Some(usage) = parsed.usage_metadata {
                    let cached = usage.cached_content_token_count.unwrap_or(0);
                    Some((usage.prompt_token_count, 0, cached, usage.candidates_token_count))
                } else {
                    None
                }
            },
            Err(_) => None,
        }
    }
    
    // Helper method to extract tokens from a stream chunk
    // Returns (input_tokens, cache_write_tokens, cache_read_tokens, output_tokens)
    pub fn extract_tokens_from_stream_chunk(chunk_str: &str) -> Option<(i32, i32, i32, i32)> {
        Self::extract_usage_from_stream_chunk(chunk_str)
    }

    // Extract cost from streaming chunk - prioritizes usage.cost field
    pub fn extract_cost_from_stream_chunk(chunk_str: &str, model: &str) -> Option<f64> {
        if chunk_str.trim().is_empty() {
            return None;
        }
        
        match serde_json::from_str::<GoogleStreamChunk>(chunk_str.trim()) {
            Ok(parsed) => {
                if let Some(usage) = parsed.usage_metadata {
                    if let Ok(usage_value) = serde_json::to_value(&usage) {
                        if let Some(cost) = usage_value.get("cost").and_then(|c| c.as_f64()) {
                            return Some(cost);
                        }
                    }
                    
                    let cached = usage.cached_content_token_count.unwrap_or(0);
                    let cost = Self::calculate_cost_from_tokens(
                        usage.prompt_token_count,
                        cached,
                        usage.candidates_token_count,
                        model
                    );
                    return Some(cost);
                }
            },
            Err(_) => {}
        }
        None
    }

    // Calculate cost from token counts using Google pricing
    fn calculate_cost_from_tokens(input_tokens: i32, cached_tokens: i32, output_tokens: i32, model: &str) -> f64 {
        let (input_price_per_1k, output_price_per_1k, cache_discount) = Self::get_model_pricing(model);
        
        let uncached_input_tokens = input_tokens - cached_tokens;
        let input_cost = (uncached_input_tokens as f64 / 1000.0) * input_price_per_1k;
        let cached_cost = (cached_tokens as f64 / 1000.0) * input_price_per_1k * cache_discount;
        let output_cost = (output_tokens as f64 / 1000.0) * output_price_per_1k;
        
        input_cost + cached_cost + output_cost
    }

    // Get model pricing - returns (input_per_1k, output_per_1k, cache_discount_factor)
    fn get_model_pricing(model: &str) -> (f64, f64, f64) {
        match model {
            m if m.contains("gemini-1.5-pro") => (0.00125, 0.005, 0.125),
            m if m.contains("gemini-1.5-flash") => (0.000075, 0.0003, 0.125),
            m if m.contains("gemini-2.0-flash") => (0.000075, 0.0003, 0.125),
            m if m.contains("gemini-pro") => (0.0005, 0.0015, 0.125),
            _ => (0.0005, 0.0015, 0.125),
        }
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
    
    // Helper functions for token and usage tracking
    // Returns (input_tokens, cache_write_tokens, cache_read_tokens, output_tokens)
    pub fn extract_tokens_from_response(&self, response: &GoogleChatResponse) -> (i32, i32, i32, i32) {
        if let Some(usage) = &response.usage_metadata {
            let cached = usage.cached_content_token_count.unwrap_or(0);
            (usage.prompt_token_count, 0, cached, usage.candidates_token_count)
        } else {
            (0, 0, 0, 0)
        }
    }

    // Extract cost from response - prioritizes usage.cost field
    pub fn extract_cost_from_response(&self, response: &GoogleChatResponse, model: &str) -> f64 {
        if let Some(usage) = &response.usage_metadata {
            if let Ok(usage_value) = serde_json::to_value(usage) {
                if let Some(cost) = usage_value.get("cost").and_then(|c| c.as_f64()) {
                    return cost;
                }
            }
            
            let cached = usage.cached_content_token_count.unwrap_or(0);
            return Self::calculate_cost_from_tokens(
                usage.prompt_token_count,
                cached,
                usage.candidates_token_count,
                model
            );
        }
        0.0
    }
}

impl Clone for GoogleClient {
    fn clone(&self) -> Self {
        Self {
            client: Client::new(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}