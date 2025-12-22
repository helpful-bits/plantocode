use crate::config::settings::AppSettings;
use crate::error::AppError;
use actix_web::web;
use futures_util::{Stream, StreamExt};
use reqwest::{Client, header::HeaderMap};
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info, instrument};

use super::polling::*;
use super::streaming::*;
use super::structs::*;
use super::transcription::{
    transcribe_audio, transcribe_audio_streaming, transcribe_from_bytes, transcribe_from_data_uri,
    validate_transcription_model,
};
use super::utils::*;

use crate::clients::usage_extractor::{ProviderUsage, UsageExtractor};

// OpenAI API base URL
const OPENAI_BASE_URL: &str = "https://api.openai.com/v1";

// Helper function to truncate long strings in JSON for logging
fn truncate_long_strings(value: &mut serde_json::Value, max_length: usize) {
    match value {
        serde_json::Value::String(s) => {
            if s.len() > max_length {
                *s = format!("{}... (truncated from {} chars)", &s[..max_length], s.len());
            }
        }
        serde_json::Value::Object(map) => {
            for (_, v) in map.iter_mut() {
                truncate_long_strings(v, max_length);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                truncate_long_strings(v, max_length);
            }
        }
        _ => {}
    }
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

        let client = crate::utils::http_client::new_api_client();
        let base_url = OPENAI_BASE_URL.to_string();

        Ok(Self {
            client,
            api_key,
            base_url,
            request_id_counter: Arc::new(Mutex::new(0)),
        })
    }

    pub fn new_with_base_url(api_key: String, base_url: String) -> Result<Self, AppError> {
        let client = crate::utils::http_client::new_api_client();

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

        let url = format!(
            "{}{}",
            self.base_url.trim_end_matches("/v1"),
            "/v1/responses"
        );
        info!("OpenAI endpoint URL: {}", url);
        // Use responses API for web mode
        let requires_background = model_requires_background(&request.model, web_mode);

        let mut non_streaming_request = request.clone();
        non_streaming_request.stream = Some(false);
        let (_, request_body) =
            prepare_request_body(&non_streaming_request, web_mode, Some(requires_background))?;

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
            wait_until_complete(
                &self.client,
                &self.api_key,
                &self.base_url,
                &responses_response.id,
            )
            .await?
        } else {
            responses_response
        };

        let (prompt_tokens, cache_write, cache_read, completion_tokens) =
            if let Some(usage) = &final_response.usage {
                (usage.input_tokens, 0, 0, usage.output_tokens)
            } else {
                (0, 0, 0, 0)
            };

        let content = extract_content_from_responses(&final_response);

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
        // Create a dedicated HTTP client for this stream to ensure complete isolation
        // This prevents connection-level errors from affecting other concurrent streams
        let stream_client = Client::builder()
            .timeout(std::time::Duration::from_secs(1740)) // 29 minutes for long-running streams
            .connect_timeout(std::time::Duration::from_secs(180)) // 3 minutes for initial connection
            .pool_max_idle_per_host(1) // Limit to 1 connection per host
            .pool_idle_timeout(Some(std::time::Duration::from_secs(0))) // Disable connection reuse
            .tcp_keepalive(std::time::Duration::from_secs(60)) // Keep connection alive during streaming
            .build()
            .map_err(|e| {
                AppError::Internal(format!("Failed to create isolated HTTP client: {}", e))
            })?;

        info!(
            "Created isolated HTTP client for streaming request - Model: {}",
            request.model
        );

        // Clone necessary parts for 'static lifetime
        let api_key = self.api_key.clone();
        let base_url = self.base_url.clone();
        let request_id_counter = self.request_id_counter.clone();

        if model_requires_background(&request.model, web_mode) {
            // For deep research models with web mode, use immediate streaming with progress updates
            tracing::info!(
                "Using immediate synthetic streaming for deep research model: {}",
                request.model
            );

            // Step 1: Create background job (non-blocking)
            let mut background_request = request.clone();
            background_request.stream = Some(false);
            let (_, background_body) =
                prepare_request_body(&background_request, web_mode, Some(true))?;
            let create_url = format!("{}/responses", base_url);

            let create_response = stream_client
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
            let synthetic_stream = create_deep_research_stream(
                stream_client.clone(),
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

            let url = format!("{}{}", base_url.trim_end_matches("/v1"), "/v1/responses");
            info!("OpenAI endpoint URL: {}", url);

            let (_, request_body) = prepare_request_body(&streaming_request, web_mode, None)?;

            let response = stream_client
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

            // Return a stream that can be consumed by actix-web with enhanced error context
            let model_for_error = streaming_request.model.clone();
            let request_id_for_error = request_id;
            let stream = response.bytes_stream().map(move |result| match result {
                Ok(bytes) => Ok(web::Bytes::from(bytes)),
                Err(e) => {
                    // Enhanced error logging with context
                    error!(
                        "OpenAI stream error - Model: {}, RequestID: {}, Error: {}",
                        model_for_error, request_id_for_error, e
                    );

                    // Categorize the error type
                    if e.is_timeout() {
                        Err(AppError::External(format!(
                            "OpenAI stream timeout [Model: {}, Request: {}]",
                            model_for_error, request_id_for_error
                        )))
                    } else if e.is_connect() {
                        Err(AppError::External(format!(
                            "OpenAI connection failed [Model: {}, Request: {}]",
                            model_for_error, request_id_for_error
                        )))
                    } else if e.is_body() {
                        Err(AppError::External(format!(
                            "OpenAI response body error [Model: {}, Request: {}]: {}",
                            model_for_error, request_id_for_error, e
                        )))
                    } else {
                        Err(AppError::External(format!(
                            "OpenAI network error [Model: {}, Request: {}]: {}",
                            model_for_error, request_id_for_error, e
                        )))
                    }
                }
            });

            let boxed_stream: Pin<
                Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>,
            > = Box::pin(stream);
            Ok((headers, boxed_stream, None))
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
        transcribe_audio(
            &self.client,
            &self.api_key,
            &self.base_url,
            audio_data,
            filename,
            model,
            language,
            prompt,
            temperature,
            mime_type,
        )
        .await
    }

    /// Transcribe audio using OpenAI's streaming API with server-side VAD chunking
    /// This is more reliable for large files as it uses stream=true and chunking_strategy
    #[instrument(skip(self, audio_data), fields(filename = %filename))]
    pub async fn transcribe_audio_streaming(
        &self,
        audio_data: &[u8],
        filename: &str,
        model: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
        mime_type: &str,
    ) -> Result<String, AppError> {
        transcribe_audio_streaming(
            &self.client,
            &self.api_key,
            &self.base_url,
            audio_data,
            filename,
            model,
            language,
            prompt,
            temperature,
            mime_type,
        )
        .await
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
        transcribe_from_data_uri(
            &self.client,
            &self.api_key,
            &self.base_url,
            data_uri,
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
        transcribe_from_bytes(
            &self.client,
            &self.api_key,
            &self.base_url,
            audio_data,
            filename,
            language,
            prompt,
            temperature,
            mime_type,
        )
        .await
    }

    /// Validate that the model is a supported transcription model
    pub fn validate_transcription_model(model: &str) -> Result<(), AppError> {
        validate_transcription_model(model)
    }

    // Convert a generic JSON Value into an OpenAIChatRequest
    pub fn convert_to_chat_request(&self, payload: Value) -> Result<OpenAIChatRequest, AppError> {
        let mut request: OpenAIChatRequest = serde_json::from_value(payload).map_err(|e| {
            AppError::BadRequest(format!(
                "Failed to convert payload to OpenAI chat request: {}",
                e
            ))
        })?;

        // Smart parameter mapping for OpenAI API compatibility

        // 1. Handle max_tokens vs max_completion_tokens
        // Always prefer max_completion_tokens over max_tokens for OpenAI requests
        // This handles the API change where newer models require max_completion_tokens
        if request.max_completion_tokens.is_none() && request.max_tokens.is_some() {
            request.max_completion_tokens = request.max_tokens.take();
        }
        // Always clear max_tokens to prevent API errors with newer models
        request.max_tokens = None;

        Ok(request)
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
                model_id.to_string(),
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
                model_id.to_string(),
            );

            usage.validate().ok()?;

            return Some(usage);
        }

        tracing::warn!("Unable to extract usage from OpenAI response: unknown format");
        None
    }
}

impl Clone for OpenAIClient {
    fn clone(&self) -> Self {
        Self {
            client: crate::utils::http_client::new_api_client(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}

impl UsageExtractor for OpenAIClient {
    fn extract_usage(&self, raw_json: &serde_json::Value) -> Option<ProviderUsage> {
        Self::extract_usage_from_json(raw_json, "")
    }

    /// Extract usage information from OpenAI HTTP response body (2025-07 format)
    /// Handles only non-streaming JSON responses - streaming is processed by transformers
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

        // Extract usage from JSON response
        Self::extract_usage_from_json(&json_value, model_id).ok_or_else(|| {
            AppError::External("Failed to extract usage from OpenAI response".to_string())
        })
    }
}
