use crate::clients::usage_extractor::{ProviderUsage, UsageExtractor};
use crate::config::settings::AppSettings;
use crate::error::AppError;
use crate::models::UsageMetadata;
use crate::services::model_mapping_service::ModelWithMapping;
use crate::utils::vision_normalizer::parse_data_url;
use actix_web::web;
use base64::{Engine as _, engine::general_purpose};
use futures_util::{Stream, StreamExt, TryStreamExt};
use reqwest::{Client, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use serde_with::skip_serializing_none;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::Mutex;
use tracing::{debug, error, info, instrument};

// Base URL for Google AI API
const GOOGLE_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";

// Google Chat Completion Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct GoogleChatRequest {
    pub contents: Vec<GoogleContent>,
    pub system_instruction: Option<GoogleSystemInstruction>,
    pub generation_config: Option<GoogleGenerationConfig>,
    pub safety_settings: Option<Vec<GoogleSafetySetting>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct GoogleSystemInstruction {
    pub parts: Vec<GooglePart>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct GoogleContent {
    pub role: String,
    pub parts: Vec<GooglePart>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GoogleVideoMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GooglePart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inline_data: Option<GoogleBlob>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_data: Option<GoogleFileData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_metadata: Option<GoogleVideoMetadata>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct GoogleBlob {
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct GoogleFileData {
    pub mime_type: String,
    pub file_uri: String,
}

#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
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
#[serde(rename_all = "snake_case")]
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

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModalityTokenCount {
    pub modality: String,
    #[serde(rename = "tokenCount")]
    pub token_count: i32,
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
    #[serde(default, rename = "promptTokensDetails")]
    pub prompt_tokens_details: Option<Vec<ModalityTokenCount>>,
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
    pub parts: Option<Vec<GoogleStreamPart>>,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStreamPart {
    pub text: Option<String>,
    pub thought: Option<bool>,
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
        let api_keys = app_settings
            .api_keys
            .google_api_keys
            .clone()
            .ok_or_else(|| {
                crate::error::AppError::Configuration(
                    "Google API keys must be configured".to_string(),
                )
            })?;

        if api_keys.is_empty() {
            return Err(crate::error::AppError::Configuration(
                "Google API keys list cannot be empty".to_string(),
            ));
        }

        let client = crate::utils::http_client::new_api_client();

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

    /// Get the sticky key index for a user using consistent hashing
    fn get_sticky_key_index(&self, user_id: &str) -> usize {
        let mut hasher = DefaultHasher::new();
        user_id.hash(&mut hasher);
        let hash = hasher.finish();
        (hash as usize) % self.api_keys.len()
    }

    fn is_retryable_error(&self, e: &AppError) -> bool {
        match e {
            AppError::External(msg) => {
                msg.contains("status 401")
                    || msg.contains("status 403")
                    || msg.contains("status 429")
                    || msg.contains("status 5")
                    || msg.contains("network error")
                    || msg.contains("timeout")
                    || msg.contains("connection")
            }
            _ => false,
        }
    }

    // Chat Completions
    #[instrument(skip(self, request, model), fields(model = %model.resolved_model_id))]
    pub async fn chat_completion(
        &self,
        request: GoogleChatRequest,
        model: &ModelWithMapping,
        user_id: &str,
    ) -> Result<(GoogleChatResponse, HeaderMap, i32, i32, i32, i32), AppError> {
        let request_id = self.get_next_request_id().await;

        // Use the resolved model ID from the mapping service
        let clean_model_id = &model.resolved_model_id;

        let num_keys = self.api_keys.len();
        let sticky_index = self.get_sticky_key_index(user_id);
        let mut last_error = None;

        debug!(
            "Using sticky key index {} for user {}",
            sticky_index, user_id
        );

        for i in 0..num_keys {
            let key_index = (sticky_index + i) % num_keys;
            let api_key = &self.api_keys[key_index];
            let url = format!(
                "{}/models/{}:generateContent",
                self.base_url, clean_model_id
            );

            debug!(
                "Attempting Google API request with key {} (attempt {} of {})",
                key_index + 1,
                i + 1,
                num_keys
            );

            let response_result = self
                .client
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
                    let app_error =
                        AppError::External(format!("Google request failed: {}", e.to_string()));
                    if self.is_retryable_error(&app_error) {
                        debug!(
                            "Request failed with retryable error, trying next key: {}",
                            e
                        );
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
                let error_text = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                let app_error = AppError::External(format!(
                    "Google request failed with status {}: {}",
                    status, error_text
                ));

                if self.is_retryable_error(&app_error) {
                    debug!(
                        "Request failed with retryable status {}, trying next key",
                        status
                    );
                    last_error = Some(app_error);
                    continue;
                } else {
                    return Err(app_error);
                }
            }

            let response_text = response.text().await.map_err(|e| {
                AppError::Internal(format!("Failed to get response text: {}", e.to_string()))
            })?;

            let result =
                serde_json::from_str::<GoogleChatResponse>(&response_text).map_err(|e| {
                    error!(
                        "Google deserialization failed: {} | Response: {}",
                        e.to_string(),
                        response_text
                    );
                    AppError::Internal(format!("Google deserialization failed: {}", e.to_string()))
                })?;

            // Check if response has usable content - if not, trigger fallback
            if let Some(first_candidate) = result.candidates.first() {
                if first_candidate.content.parts.is_none()
                    || first_candidate
                        .content
                        .parts
                        .as_ref()
                        .map_or(true, |parts| parts.is_empty())
                {
                    let finish_reason = first_candidate
                        .finish_reason
                        .as_deref()
                        .unwrap_or("unknown");
                    return Err(AppError::External(format!(
                        "Google API returned response without content parts (finish_reason: {})",
                        finish_reason
                    )));
                }
            }

            info!(
                "Google API request successful for model: {} with key {}",
                clean_model_id,
                key_index + 1
            );
            debug!("Response candidates count: {}", result.candidates.len());

            let (input_tokens, cache_write_tokens, cache_read_tokens, output_tokens) =
                if let Some(usage) = &result.usage_metadata {
                    // Google's prompt_token_count is already the total input tokens
                    (
                        usage.prompt_token_count,
                        0,
                        usage.cached_content_token_count.unwrap_or(0),
                        usage.candidates_token_count.unwrap_or(0),
                    )
                } else {
                    (0, 0, 0, 0)
                };

            return Ok((
                result,
                headers,
                input_tokens,
                cache_write_tokens,
                cache_read_tokens,
                output_tokens,
            ));
        }

        // If we get here, all keys failed
        Err(last_error
            .unwrap_or_else(|| AppError::External("All Google API keys failed".to_string())))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request, model), fields(model = %model.resolved_model_id, user_id = %user_id))]
    pub async fn stream_chat_completion(
        &self,
        request: GoogleChatRequest,
        model: &ModelWithMapping,
        user_id: String,
    ) -> Result<
        (
            HeaderMap,
            Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>,
        ),
        AppError,
    > {
        // Get the sticky key index for this user
        let num_keys = self.api_keys.len();
        let sticky_index = self.get_sticky_key_index(&user_id);
        debug!(
            "Using sticky key index {} for streaming user {}",
            sticky_index, user_id
        );

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
                let key_index = (sticky_index + i) % num_keys;
                let api_key = &api_keys[key_index];
                let url = format!(
                    "{}/models/{}:streamGenerateContent?alt=sse",
                    base_url, clean_model_id
                );

                let request = request.clone();

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
                        let app_error =
                            AppError::External(format!("Google request failed: {}", e.to_string()));
                        let is_retryable = match &app_error {
                            AppError::External(msg) => {
                                msg.contains("status 401")
                                    || msg.contains("status 403")
                                    || msg.contains("status 429")
                                    || msg.contains("status 5")
                                    || msg.contains("network error")
                                    || msg.contains("timeout")
                                    || msg.contains("connection")
                            }
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
                    let error_text = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "Failed to get error response".to_string());
                    let app_error = AppError::External(format!(
                        "Google streaming request failed with status {}: {}",
                        status, error_text
                    ));

                    let is_retryable = match &app_error {
                        AppError::External(msg) => {
                            msg.contains("status 401")
                                || msg.contains("status 403")
                                || msg.contains("status 429")
                                || msg.contains("status 5")
                                || msg.contains("network error")
                                || msg.contains("timeout")
                                || msg.contains("connection")
                        }
                        _ => false,
                    };

                    if is_retryable {
                        last_error = Some(app_error);
                        continue;
                    } else {
                        return Err(app_error);
                    }
                }

                let stream = response.bytes_stream().map(|result| match result {
                    Ok(bytes) => Ok(web::Bytes::from(bytes)),
                    Err(e) => Err(AppError::External(format!(
                        "Google network error: {}",
                        e.to_string()
                    ))),
                });

                let boxed_stream: Pin<
                    Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>,
                > = Box::pin(stream);
                return Ok((headers, boxed_stream));
            }

            // If we get here, all keys failed
            Err(last_error
                .unwrap_or_else(|| AppError::External("All Google API keys failed".to_string())))
        }
        .await?;

        Ok(result)
    }

    // Convert a generic JSON Value into a GoogleChatRequest
    pub fn convert_to_chat_request(&self, payload: Value) -> Result<GoogleChatRequest, AppError> {
        self.convert_to_chat_request_with_capabilities(payload, None)
    }

    // Convert a generic JSON Value into a GoogleChatRequest with model capabilities
    pub fn convert_to_chat_request_with_capabilities(
        &self,
        payload: Value,
        model_capabilities: Option<&serde_json::Value>,
    ) -> Result<GoogleChatRequest, AppError> {
        // First, try to extract the messages array from the generic payload
        let messages = payload
            .get("messages")
            .and_then(|m| m.as_array())
            .ok_or_else(|| {
                AppError::BadRequest("Request must contain 'messages' array".to_string())
            })?;

        let mut contents = Vec::new();
        let mut system_instruction: Option<GoogleSystemInstruction> = None;

        // Process all messages, extracting system prompts properly
        for message in messages {
            let role = message
                .get("role")
                .and_then(|r| r.as_str())
                .ok_or_else(|| {
                    AppError::BadRequest("Each message must have a 'role' field".to_string())
                })?;

            let content = message.get("content").ok_or_else(|| {
                AppError::BadRequest("Each message must have a 'content' field".to_string())
            })?;

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
            return Err(AppError::BadRequest(
                "Request must contain at least one message".to_string(),
            ));
        }

        // Google API requires conversation to start with user message
        if let Some(first_content) = contents.first() {
            if first_content.role != "user" {
                return Err(AppError::BadRequest(
                    "Conversation must start with a user message for Google API".to_string(),
                ));
            }
        }

        // Validate message sequence - Google requires alternating user/model messages
        let mut last_role = "";
        for content in &contents {
            if content.role == last_role {
                // Found consecutive messages with same role, this might cause issues
                // For now, we'll allow it but log a warning
                debug!(
                    "Warning: Found consecutive {} messages, Google API prefers alternating user/model messages",
                    content.role
                );
            }
            last_role = &content.role;
        }

        // Extract generation config from payload if present
        let mut generation_config = if let Some(config_value) = payload.get("generationConfig") {
            serde_json::from_value(config_value.clone()).unwrap_or_else(|_| {
                GoogleGenerationConfig {
                    temperature: None,
                    top_p: None,
                    top_k: None,
                    max_output_tokens: None,
                    candidate_count: None,
                    stop_sequences: None,
                    thinking_config: None,
                }
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
            stream: None,
        };

        debug!(
            "Converted to Google request with {} contents and system instruction: {}",
            google_request.contents.len(),
            google_request.system_instruction.is_some()
        );

        Ok(google_request)
    }

    // Helper method to parse message content into GooglePart vector
    fn parse_message_content(&self, content: &Value) -> Result<Vec<GooglePart>, AppError> {
        match content {
            Value::String(text) => Ok(vec![GooglePart {
                text: Some(text.clone()),
                ..Default::default()
            }]),
            Value::Array(parts_array) => {
                let mut google_parts = Vec::new();
                for part in parts_array {
                    if let Some(part_type) = part.get("type").and_then(|t| t.as_str()) {
                        match part_type {
                            "text" => {
                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    google_parts.push(GooglePart {
                                        text: Some(text.to_string()),
                                        ..Default::default()
                                    });
                                }
                            }
                            "image_url" => {
                                // Handle OpenAI-style image_url content
                                // Can be: { image_url: { url: "..." } } or { image_url: "..." }
                                let url = if let Some(image_url_obj) = part.get("image_url") {
                                    if let Some(url_str) = image_url_obj.as_str() {
                                        // Direct string URL
                                        Some(url_str.to_string())
                                    } else if let Some(url) = image_url_obj.get("url").and_then(|u| u.as_str()) {
                                        // Object with url property
                                        Some(url.to_string())
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                };

                                if let Some(image_url) = url {
                                    if image_url.starts_with("data:") {
                                        // Parse data URL using the proper parser
                                        let (mime_type, data) = parse_data_url(&image_url)?;

                                        // Reject GIF images - Google Gemini doesn't support them
                                        if mime_type == "image/gif" {
                                            return Err(AppError::BadRequest(
                                                "Google Gemini does not support GIF images. Supported formats: JPEG, PNG, WebP, HEIC, HEIF".to_string()
                                            ));
                                        }

                                        // Validate supported MIME types for Google
                                        let validated_mime_type = match mime_type.as_str() {
                                            "image/jpeg" | "image/jpg" => "image/jpeg",
                                            "image/png" => "image/png",
                                            "image/webp" => "image/webp",
                                            "image/heic" => "image/heic",
                                            "image/heif" => "image/heif",
                                            _ => "image/jpeg", // Default fallback for unknown types
                                        };

                                        google_parts.push(GooglePart {
                                            inline_data: Some(GoogleBlob {
                                                mime_type: validated_mime_type.to_string(),
                                                data,
                                            }),
                                            ..Default::default()
                                        });
                                    } else if image_url.starts_with("gs://") || image_url.contains("generativelanguage.googleapis.com") {
                                        // Google Cloud Storage or Gemini File API URI
                                        let mime_type = if image_url.ends_with(".jpg") || image_url.ends_with(".jpeg") {
                                            "image/jpeg"
                                        } else if image_url.ends_with(".png") {
                                            "image/png"
                                        } else if image_url.ends_with(".webp") {
                                            "image/webp"
                                        } else {
                                            "application/octet-stream"
                                        };

                                        google_parts.push(GooglePart {
                                            file_data: Some(GoogleFileData {
                                                mime_type: mime_type.to_string(),
                                                file_uri: image_url,
                                            }),
                                            ..Default::default()
                                        });
                                    }
                                    // Note: Regular HTTP URLs are not directly supported by Gemini API
                                    // They would need to be fetched and converted to base64 first
                                }
                            }
                            "image" => {
                                // Handle Anthropic-style image content
                                if let Some(source) = part.get("source") {
                                    let source_type = source.get("type").and_then(|t| t.as_str()).unwrap_or("");

                                    match source_type {
                                        "base64" => {
                                            let media_type = source.get("media_type").and_then(|m| m.as_str()).unwrap_or("image/jpeg");
                                            let data = source.get("data").and_then(|d| d.as_str()).unwrap_or("");

                                            // Reject GIF images - Google Gemini doesn't support them
                                            if media_type == "image/gif" {
                                                return Err(AppError::BadRequest(
                                                    "Google Gemini does not support GIF images. Supported formats: JPEG, PNG, WebP, HEIC, HEIF".to_string()
                                                ));
                                            }

                                            // Validate and normalize supported MIME types for Google
                                            let validated_mime_type = match media_type {
                                                "image/jpeg" | "image/jpg" => "image/jpeg",
                                                "image/png" => "image/png",
                                                "image/webp" => "image/webp",
                                                "image/heic" => "image/heic",
                                                "image/heif" => "image/heif",
                                                _ => "image/jpeg", // Default fallback for unknown types
                                            };

                                            if !data.is_empty() {
                                                google_parts.push(GooglePart {
                                                    inline_data: Some(GoogleBlob {
                                                        mime_type: validated_mime_type.to_string(),
                                                        data: data.to_string(),
                                                    }),
                                                    ..Default::default()
                                                });
                                            }
                                        }
                                        "url" => {
                                            // URL images would need to be fetched first
                                            // For now, log a warning
                                            tracing::warn!("URL-based images in Anthropic format not directly supported for Google API");
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            "input_image" => {
                                // Handle OpenAI Responses API style input_image
                                if let Some(image_url) = part.get("image_url").and_then(|u| u.as_str()) {
                                    if image_url.starts_with("data:") {
                                        // Parse data URL using the proper parser
                                        let (mime_type, data) = parse_data_url(image_url)?;

                                        // Reject GIF images - Google Gemini doesn't support them
                                        if mime_type == "image/gif" {
                                            return Err(AppError::BadRequest(
                                                "Google Gemini does not support GIF images. Supported formats: JPEG, PNG, WebP, HEIC, HEIF".to_string()
                                            ));
                                        }

                                        // Validate supported MIME types for Google
                                        let validated_mime_type = match mime_type.as_str() {
                                            "image/jpeg" | "image/jpg" => "image/jpeg",
                                            "image/png" => "image/png",
                                            "image/webp" => "image/webp",
                                            "image/heic" => "image/heic",
                                            "image/heif" => "image/heif",
                                            _ => "image/jpeg", // Default fallback for unknown types
                                        };

                                        google_parts.push(GooglePart {
                                            inline_data: Some(GoogleBlob {
                                                mime_type: validated_mime_type.to_string(),
                                                data,
                                            }),
                                            ..Default::default()
                                        });
                                    }
                                }
                                // Note: file_id references are OpenAI-specific and not supported here
                            }
                            _ => {
                                // Skip unsupported content types
                            }
                        }
                    }
                }
                Ok(google_parts)
            }
            _ => Err(AppError::BadRequest(
                "Content must be a string or array".to_string(),
            )),
        }
    }

    /// Extract usage from parsed JSON (handles Google response format)
    fn extract_usage_from_json(
        &self,
        json_value: &serde_json::Value,
        model_id: &str,
    ) -> Option<ProviderUsage> {
        let usage_metadata = json_value.get("usageMetadata")?;

        // Handle Google format: {"promptTokenCount", "candidatesTokenCount", "cachedContentTokenCount"}
        // promptTokenCount is the total input, and cachedContentTokenCount is the cache read portion
        let prompt_token_count = match usage_metadata
            .get("promptTokenCount")
            .and_then(|v| v.as_i64())
        {
            Some(tokens) => tokens as i32,
            None => {
                tracing::warn!("Missing or invalid promptTokenCount in Google response");
                return None;
            }
        };

        let candidates_token_count = match usage_metadata
            .get("candidatesTokenCount")
            .and_then(|v| v.as_i64())
        {
            Some(tokens) => tokens as i32,
            None => {
                tracing::warn!("Missing or invalid candidatesTokenCount in Google response");
                return None;
            }
        };

        // Extract cached tokens count
        let cached_content_token_count = usage_metadata
            .get("cachedContentTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        let mut usage = ProviderUsage::new(
            prompt_token_count, // Total input tokens (already includes cached)
            candidates_token_count,
            0, // cache_write_tokens should be 0
            cached_content_token_count,
            model_id.to_string(),
        );

        // Extract prompt_tokens_details for modality breakdown
        if let Some(prompt_details) = usage_metadata
            .get("promptTokensDetails")
            .and_then(|v| v.as_array())
        {
            let mut video_tokens: Option<i32> = None;
            let mut text_tokens_input: Option<i32> = None;

            for detail in prompt_details {
                if let (Some(modality), Some(token_count)) = (
                    detail.get("modality").and_then(|m| m.as_str()),
                    detail.get("tokenCount").and_then(|t| t.as_i64()),
                ) {
                    match modality {
                        "VIDEO" => video_tokens = Some(token_count as i32),
                        "TEXT" => text_tokens_input = Some(token_count as i32),
                        _ => {} // Ignore other modalities for now
                    }
                }
            }

            // Create metadata with modality information
            let mut metadata = UsageMetadata::default();
            metadata.video_tokens = video_tokens;
            metadata.text_tokens_input = text_tokens_input;
            usage.metadata = Some(metadata);
        }

        usage.validate().ok()?;

        Some(usage)
    }

    /// Upload a file to Google's File API using resumable upload
    pub async fn upload_file(
        &self,
        video_path: &Path,
        mime_type: &str,
        api_key: &str,
    ) -> Result<(String, String), AppError> {
        use tokio::fs;

        // Read file bytes
        let file_data = fs::read(video_path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to read file: {}", e)))?;

        let display_name = video_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("video.mp4");

        // Step 1: Create resumable upload session
        let upload_url = format!(
            "https://generativelanguage.googleapis.com/upload/v1beta/files?key={}",
            api_key
        );

        let init_body = json!({
            "file": {
                "display_name": display_name
            }
        });

        let init_response = self
            .client
            .post(&upload_url)
            .header("X-Goog-Upload-Protocol", "resumable")
            .header("X-Goog-Upload-Command", "start")
            .header(
                "X-Goog-Upload-Header-Content-Length",
                file_data.len().to_string(),
            )
            .header("X-Goog-Upload-Header-Content-Type", mime_type)
            .header("Content-Type", "application/json")
            .json(&init_body)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Failed to initiate upload: {}", e)))?;

        let init_status = init_response.status();
        if !init_status.is_success() {
            let error_text = init_response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "Upload initiation failed with status {}: {}",
                init_status, error_text
            )));
        }

        // Get upload URL from response header
        let upload_session_url = init_response
            .headers()
            .get("X-Goog-Upload-URL")
            .ok_or_else(|| AppError::External("Missing X-Goog-Upload-URL header".to_string()))?
            .to_str()
            .map_err(|e| AppError::External(format!("Invalid upload URL header: {}", e)))?;

        // Step 2: Upload file data
        let upload_response = self
            .client
            .post(upload_session_url)
            .header("Content-Length", file_data.len().to_string())
            .header("X-Goog-Upload-Offset", "0")
            .header("X-Goog-Upload-Command", "upload, finalize")
            .body(file_data)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Failed to upload file data: {}", e)))?;

        let upload_status = upload_response.status();
        if !upload_status.is_success() {
            let error_text = upload_response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "File upload failed with status {}: {}",
                upload_status, error_text
            )));
        }

        // Parse response to get file URI
        let upload_result: serde_json::Value = upload_response
            .json()
            .await
            .map_err(|e| AppError::External(format!("Failed to parse upload response: {}", e)))?;

        let file_uri = upload_result["file"]["uri"]
            .as_str()
            .ok_or_else(|| AppError::External("Missing file.uri in upload response".to_string()))?;

        info!("Successfully uploaded file to Google: {}", file_uri);

        // Wait for file to become active
        self.wait_for_file_active(&file_uri, api_key).await?;

        Ok((file_uri.to_string(), mime_type.to_string()))
    }

    /// Wait for uploaded file to become active (Google needs time to process it)
    async fn wait_for_file_active(&self, file_uri: &str, api_key: &str) -> Result<(), AppError> {
        use tokio::time::{Duration, sleep};

        let max_attempts = 30; // Max 30 seconds wait
        let mut attempts = 0;

        while attempts < max_attempts {
            // Check file status
            let status_url = format!("{}?key={}", file_uri, api_key);

            let response =
                self.client.get(&status_url).send().await.map_err(|e| {
                    AppError::External(format!("Failed to check file status: {}", e))
                })?;

            if !response.status().is_success() {
                let error_text = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "Failed to check file status: {}",
                    error_text
                )));
            }

            let file_info: serde_json::Value = response.json().await.map_err(|e| {
                AppError::External(format!("Failed to parse file status response: {}", e))
            })?;

            // Check if file is active
            if let Some(state) = file_info.get("state").and_then(|s| s.as_str()) {
                info!("File state: {}", state);
                if state == "ACTIVE" {
                    info!("File is now active and ready to use");
                    return Ok(());
                } else if state == "FAILED" {
                    return Err(AppError::External("File processing failed".to_string()));
                }
            }

            attempts += 1;
            if attempts < max_attempts {
                debug!(
                    "Waiting for file to become active... (attempt {}/{})",
                    attempts, max_attempts
                );
                sleep(Duration::from_secs(1)).await;
            }
        }

        Err(AppError::External(
            "File processing timed out - file did not become active within 30 seconds".to_string(),
        ))
    }

    /// Generate content from multimodal inputs (video + text)
    pub async fn generate_multimodal_content(
        &self,
        model: &str,
        file_uri: &str,
        mime_type: &str,
        prompt: &str,
        system_prompt: Option<String>,
        temperature: f32,
        api_key: &str,
    ) -> Result<GoogleChatResponse, AppError> {
        // NOTE on Video Frame Rate and Processing:
        // The Gemini API processes videos by sampling them at a fixed rate (approximately 1 frame per second),
        // regardless of the source video's original frame rate. The token cost is based on video duration, not frame count.
        // While some Google SDK examples show setting `fps` via `video_metadata`, this applies to the `inline_data`
        // upload method for small files (<20MB). Our implementation uses the File API for resumable uploads of
        // potentially large files, which does not support this parameter. Therefore, we cannot control the FPS sent to Gemini.
        // Create system instruction if provided
        let system_instruction = system_prompt.map(|prompt| GoogleSystemInstruction {
            parts: vec![GooglePart {
                text: Some(prompt),
                ..Default::default()
            }],
        });

        // Create contents with file data and text prompt
        let contents = vec![GoogleContent {
            role: "user".to_string(),
            parts: vec![
                GooglePart {
                    file_data: Some(GoogleFileData {
                        mime_type: mime_type.to_string(),
                        file_uri: file_uri.to_string(),
                    }),
                    ..Default::default()
                },
                GooglePart {
                    text: Some(prompt.to_string()),
                    ..Default::default()
                },
            ],
        }];

        // Create generation config
        let generation_config = Some(GoogleGenerationConfig {
            temperature: Some(temperature),
            top_p: None,
            top_k: None,
            max_output_tokens: None,
            candidate_count: None,
            stop_sequences: None,
            thinking_config: None,
        });

        // Create request
        let request = GoogleChatRequest {
            contents,
            system_instruction,
            generation_config,
            safety_settings: None,
            stream: None,
        };

        // Use the shared helper to execute the request
        self.execute_generate_content(model, request, api_key).await
    }

    /// Generate multimodal content with File API and custom FPS
    pub async fn generate_multimodal_content_with_fps(
        &self,
        model: &str,
        file_uri: &str,
        mime_type: &str,
        fps: u32,
        prompt: &str,
        system_prompt: Option<String>,
        temperature: f32,
        api_key: &str,
    ) -> Result<GoogleChatResponse, AppError> {
        // Create the file part with video metadata including FPS
        let file_part = GooglePart {
            file_data: Some(GoogleFileData {
                file_uri: file_uri.to_string(),
                mime_type: mime_type.to_string(),
            }),
            video_metadata: Some(GoogleVideoMetadata { fps: Some(fps) }),
            ..Default::default()
        };

        let text_part = GooglePart {
            text: Some(prompt.to_string()),
            ..Default::default()
        };

        // Create user content
        let user_content = GoogleContent {
            role: "user".to_string(),
            parts: vec![file_part, text_part],
        };

        let contents = vec![user_content];

        // Create system instruction if provided
        let system_instruction = system_prompt.map(|prompt| GoogleSystemInstruction {
            parts: vec![GooglePart {
                text: Some(prompt),
                ..Default::default()
            }],
        });

        // Create generation config
        let generation_config = Some(GoogleGenerationConfig {
            temperature: Some(temperature),
            max_output_tokens: Some(100000),
            top_p: None,
            top_k: None,
            candidate_count: None,
            stop_sequences: None,
            thinking_config: None,
        });

        let request = GoogleChatRequest {
            contents,
            system_instruction,
            generation_config,
            safety_settings: None,
            stream: None,
        };

        // Use the shared helper to execute the request
        self.execute_generate_content(model, request, api_key).await
    }

    /// Helper function to execute generate content request
    async fn execute_generate_content(
        &self,
        model: &str,
        request_payload: GoogleChatRequest,
        api_key: &str,
    ) -> Result<GoogleChatResponse, AppError> {
        let url = format!("{}/models/{}:generateContent", self.base_url, model);

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", api_key)
            .header("Content-Type", "application/json")
            .json(&request_payload)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Google request failed: {}", e)))?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "Google request failed with status {}: {}",
                status, error_text
            )));
        }

        let response_text = response
            .text()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to get response text: {}", e)))?;

        let result = serde_json::from_str::<GoogleChatResponse>(&response_text).map_err(|e| {
            error!(
                "Google deserialization failed: {} | Response: {}",
                e, response_text
            );
            AppError::Internal(format!("Google deserialization failed: {}", e))
        })?;

        Ok(result)
    }

    /// Generate multimodal content with inline video upload (for small videos < 20MB)
    pub async fn generate_multimodal_content_inline(
        &self,
        model: &str,
        video_data: &[u8],
        mime_type: &str,
        fps: u32,
        prompt_text: &str,
        system_prompt: Option<String>,
        temperature: f32,
        api_key: &str,
    ) -> Result<GoogleChatResponse, AppError> {
        let encoded_video = general_purpose::STANDARD.encode(video_data);

        let video_part = GooglePart {
            inline_data: Some(GoogleBlob {
                mime_type: mime_type.to_string(),
                data: encoded_video,
            }),
            video_metadata: Some(GoogleVideoMetadata { fps: Some(fps) }),
            ..Default::default()
        };

        let text_part = GooglePart {
            text: Some(prompt_text.to_string()),
            ..Default::default()
        };

        // Create system instruction if provided
        let system_instruction = system_prompt.map(|prompt| GoogleSystemInstruction {
            parts: vec![GooglePart {
                text: Some(prompt),
                ..Default::default()
            }],
        });

        // Create generation config
        let generation_config = Some(GoogleGenerationConfig {
            temperature: Some(temperature),
            top_p: None,
            top_k: None,
            max_output_tokens: None,
            candidate_count: None,
            stop_sequences: None,
            thinking_config: None,
        });

        let request_payload = GoogleChatRequest {
            contents: vec![GoogleContent {
                role: "user".to_string(),
                parts: vec![video_part, text_part],
            }],
            system_instruction,
            generation_config,
            safety_settings: None,
            stream: None,
        };

        self.execute_generate_content(model, request_payload, api_key)
            .await
    }
}

impl UsageExtractor for GoogleClient {
    fn extract_usage(&self, raw_json: &serde_json::Value) -> Option<ProviderUsage> {
        self.extract_usage_from_json(raw_json, "")
    }

    /// Extract usage information from Google HTTP response body (non-streaming JSON format)
    /// Supports usageMetadata: {promptTokenCount, candidatesTokenCount, cachedContentTokenCount}
    async fn extract_from_response_body(
        &self,
        body: &[u8],
        model_id: &str,
    ) -> Result<ProviderUsage, AppError> {
        let body_str = std::str::from_utf8(body)
            .map_err(|e| AppError::InvalidArgument(format!("Invalid UTF-8: {}", e)))?;

        // Handle regular JSON response
        let json_value: serde_json::Value = serde_json::from_str(body_str)
            .map_err(|e| AppError::External(format!("Failed to parse JSON: {}", e)))?;

        // Extract usage from parsed JSON
        self.extract_usage_from_json(&json_value, model_id)
            .ok_or_else(|| {
                AppError::External("Failed to extract usage from Google response".to_string())
            })
    }
}

impl Clone for GoogleClient {
    fn clone(&self) -> Self {
        Self {
            client: crate::utils::http_client::new_api_client(),
            api_keys: self.api_keys.clone(),
            current_key_index: AtomicUsize::new(0),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}
