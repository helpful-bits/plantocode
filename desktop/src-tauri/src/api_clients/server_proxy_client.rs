use async_trait::async_trait;
use futures::{Stream, StreamExt};
use log::{debug, error, info, trace, warn};
use reqwest::{Client, header, multipart};
use serde_json::{Value, json};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use uuid;

use super::client_trait::{ApiClient, ApiClientOptions, TranscriptionClient};
use super::error_handling::{handle_api_error, map_server_proxy_error};
use crate::auth::{TokenManager, header_utils};
use crate::auth::token_refresh::{ensure_fresh_token, refresh_with_dedup, contains_device_binding_mismatch};
use crate::constants::{APP_HTTP_REFERER, APP_X_TITLE, SERVER_API_URL};
use crate::error::{AppError, AppResult};
use crate::models::stream_event::StreamEvent;
use crate::models::{
    OpenRouterContent, OpenRouterRequest, OpenRouterRequestMessage, OpenRouterResponse,
    OpenRouterStreamChunk, ServerOpenRouterResponse,
};

#[derive(Debug, serde::Deserialize)]
pub struct VideoAnalysisResponse {
    pub analysis: String,
    pub usage: VideoAnalysisUsage,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoAnalysisUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub cached_tokens: Option<i32>,
}
use crate::utils::stream_debug_logger::StreamDebugLogger;
use reqwest_eventsource::{Event, EventSource};

/// Server proxy API client for LLM requests
#[derive(Debug)]
pub struct ServerProxyClient {
    http_client: Client,
    app_handle: AppHandle,
    server_url: String,
    token_manager: Arc<TokenManager>,
}

impl ServerProxyClient {
    /// Create a new server proxy client
    pub fn new(
        app_handle: AppHandle,
        server_url: String,
        token_manager: Arc<TokenManager>,
    ) -> Self {
        let http_client = crate::api_clients::client_factory::create_http_client();
        Self {
            http_client,
            app_handle,
            server_url,
            token_manager,
        }
    }

    /// Apply API versioning to endpoints
    fn versioned(endpoint: &str, enable_v1: bool) -> String {
        if enable_v1 && endpoint.starts_with("/api/") {
            endpoint.replacen("/api/", "/api/v1/", 1)
        } else {
            endpoint.to_string()
        }
    }

    /// Get the base server URL
    pub fn base_url(&self) -> &str {
        &self.server_url
    }

    /// Get the server URL
    pub fn server_url(&self) -> &str {
        &self.server_url
    }

    /// Helper method to add auth headers with device ID to request builders
    fn with_auth_headers(
        &self,
        builder: reqwest::RequestBuilder,
        auth_token: &str,
    ) -> AppResult<reqwest::RequestBuilder> {
        header_utils::apply_auth_headers(builder, auth_token, &self.app_handle)
    }

    /// Get runtime AI configuration from the server
    pub async fn get_runtime_ai_config(&self) -> AppResult<Value> {
        info!("Fetching runtime AI configuration from server");

        // Proactively ensure token is fresh (5 min TTL)
        ensure_fresh_token(&self.app_handle, 300).await?;

        // Get authentication token
        let auth_token = self.get_auth_token().await?;

        // Create the config endpoint URL
        let config_url = format!("{}/api/config/desktop-runtime-config", self.server_url);

        let req = self.with_auth_headers(self.http_client.get(&config_url), &auth_token)?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .send()
            .await
            .map_err(|e| {
                AppError::HttpError(format!("Failed to fetch runtime AI config: {}", e))
            })?;

        // Handle 401 with refresh-and-retry
        if response.status() == 401 {
            let body = response.text().await.unwrap_or_default();

            if contains_device_binding_mismatch(&body) {
                return Err(AppError::AuthError(format!("Device binding mismatch: {}", body)));
            }

            // Refresh token and retry once
            refresh_with_dedup(&self.app_handle).await?;
            let new_token = self.get_auth_token().await?;

            let retry_req = self.with_auth_headers(self.http_client.get(&config_url), &new_token)?;
            let retry_response = retry_req
                .header("HTTP-Referer", APP_HTTP_REFERER)
                .header("X-Title", APP_X_TITLE)
                .send()
                .await
                .map_err(|e| {
                    AppError::HttpError(format!("Failed to fetch runtime AI config after retry: {}", e))
                })?;

            if !retry_response.status().is_success() {
                let status = retry_response.status();
                let error_text = retry_response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Failed to get error text".to_string());
                error!("Server runtime config API error after retry: {} - {}", status, error_text);
                return Err(map_server_proxy_error(status.as_u16(), &error_text));
            }

            let config: Value = retry_response.json().await.map_err(|e| {
                AppError::SerializationError(format!("Failed to parse runtime AI config response: {}", e))
            })?;

            info!("Successfully fetched runtime AI configuration from server after retry");
            return Ok(config);
        }

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!("Server runtime config API error: {} - {}", status, error_text);
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
        }

        let config: Value = response.json().await.map_err(|e| {
            AppError::SerializationError(format!("Failed to parse runtime AI config response: {}", e))
        })?;

        info!("Successfully fetched runtime AI configuration from server");
        trace!("Runtime AI config: {:?}", config);

        Ok(config)
    }

    /// Get all default system prompts from the server
    pub async fn get_default_system_prompts(
        &self,
    ) -> AppResult<Vec<crate::models::DefaultSystemPrompt>> {
        info!("Fetching all default system prompts from server");

        let prompts = self.try_fetch_default_system_prompts_from_server().await?;
        info!(
            "Successfully fetched {} default system prompts from server",
            prompts.len()
        );
        Ok(prompts)
    }

    /// Try to fetch default system prompts from server (can fail)
    async fn try_fetch_default_system_prompts_from_server(
        &self,
    ) -> AppResult<Vec<crate::models::DefaultSystemPrompt>> {
        let prompts_url = format!("{}/api/system-prompts/defaults", self.server_url);

        let response = self.authenticated_get_with_retry(&prompts_url).await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!("Server default system prompts API error: {} - {}", status, error_text);
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
        }

        let prompts: Vec<crate::models::DefaultSystemPrompt> =
            response.json().await.map_err(|e| {
                AppError::ServerProxyError(format!(
                    "Failed to parse default system prompts response: {}",
                    e
                ))
            })?;

        Ok(prompts)
    }

    /// Get a specific default system prompt by task type from server
    pub async fn get_default_system_prompt(
        &self,
        task_type: &str,
    ) -> AppResult<Option<crate::models::DefaultSystemPrompt>> {
        info!(
            "Fetching default system prompt for task type '{}' from server",
            task_type
        );

        self.try_fetch_default_system_prompt_from_server(task_type)
            .await
    }

    /// Try to fetch a specific default system prompt from server (can fail)
    async fn try_fetch_default_system_prompt_from_server(
        &self,
        task_type: &str,
    ) -> AppResult<Option<crate::models::DefaultSystemPrompt>> {
        let prompt_url = format!(
            "{}/api/system-prompts/defaults/{}",
            self.server_url, task_type
        );

        let response = self.authenticated_get_with_retry(&prompt_url).await?;

        if response.status() == 404 {
            info!("No default system prompt found for task type '{}'", task_type);
            return Ok(None);
        }

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!("Server default system prompt API error: {} - {}", status, error_text);
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
        }

        let prompt: crate::models::DefaultSystemPrompt = response.json().await.map_err(|e| {
            AppError::ServerProxyError(format!(
                "Failed to parse default system prompt response: {}",
                e
            ))
        })?;

        info!("Successfully fetched default system prompt for task type '{}'", task_type);
        Ok(Some(prompt))
    }

    /// Initialize system prompts cache from server
    /// This method validates that system prompts are available from the server
    pub async fn populate_default_system_prompts_cache(
        &self,
        _settings_repo: &crate::db_utils::SettingsRepository,
    ) -> AppResult<()> {
        info!("Validating default system prompts availability from server");

        let server_prompts = self.get_default_system_prompts().await?;
        let prompt_count = server_prompts.len();

        if prompt_count > 0 {
            info!(
                "Successfully validated {} default system prompts from server",
                prompt_count
            );
        } else {
            warn!("No default system prompts returned from server");
        }

        Ok(())
    }

    /// Helper method to invoke AI requests via the server proxy
    pub async fn invoke_ai_request<T: serde::Serialize, R: serde::de::DeserializeOwned>(
        &self,
        endpoint: &str,
        payload: &T,
        model_id: Option<&str>,
    ) -> AppResult<R> {
        let auth_token = self.get_auth_token().await?;

        let proxy_url = format!("{}/api/ai-proxy/{}", self.server_url, endpoint);

        let mut request_builder = self
            .with_auth_headers(
                self.http_client
                    .post(&proxy_url)
                    .header(header::CONTENT_TYPE, "application/json"),
                &auth_token,
            )?
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE);

        // Add model ID header if provided
        if let Some(model) = model_id {
            request_builder = request_builder.header("X-Model-Id", model);
        }

        let response = request_builder
            .json(payload)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        response
            .json::<R>()
            .await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse response: {}", e)))
    }

    /// Get MIME type from file extension
    fn get_mime_type_from_filename(filename: &str) -> AppResult<&'static str> {
        let extension = std::path::Path::new(filename)
            .extension()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or("")
            .to_lowercase();

        match extension.as_str() {
            "mp3" => Ok("audio/mpeg"),
            "wav" => Ok("audio/wav"),
            "m4a" => Ok("audio/x-m4a"),
            "ogg" => Ok("audio/ogg"),
            "webm" => Ok("audio/webm"),
            "flac" => Ok("audio/flac"),
            "aac" => Ok("audio/aac"),
            "mp4" => Ok("audio/mp4"),
            "" => Err(AppError::ValidationError(
                "Audio file has no extension".to_string(),
            )),
            _ => Err(AppError::ValidationError(format!(
                "Unsupported audio file extension for transcription: .{}",
                extension
            ))),
        }
    }

    /// Get video MIME type from filename
    fn get_video_mime_type_from_filename(filename: &str) -> AppResult<&'static str> {
        let extension = std::path::Path::new(filename)
            .extension()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or("")
            .to_lowercase();

        match extension.as_str() {
            "mp4" => Ok("video/mp4"),
            "mov" => Ok("video/quicktime"),
            "mpeg" | "mpg" => Ok("video/mpeg"),
            "avi" => Ok("video/x-msvideo"),
            "wmv" => Ok("video/x-ms-wmv"),
            "mpegps" => Ok("video/mpeg"),
            "flv" => Ok("video/x-flv"),
            "webm" => Ok("video/webm"),
            "mkv" => Ok("video/x-matroska"),
            "" => Err(AppError::ValidationError(
                "Video file has no extension".to_string(),
            )),
            _ => Err(AppError::ValidationError(format!(
                "Unsupported video file extension: .{}",
                extension
            ))),
        }
    }

    /// Get auth token from TokenManager with refresh attempt on failure
    async fn get_auth_token(&self) -> AppResult<String> {
        match self.token_manager.get().await {
            Some(token) => {
                debug!("Using auth token from TokenManager");
                Ok(token)
            }
            None => {
                debug!("No auth token found in TokenManager");
                Err(AppError::AuthError(
                    "Authentication token not found. Please re-authenticate.".to_string(),
                ))
            }
        }
    }

    /// Handle authentication error by suggesting token refresh
    async fn handle_auth_error(&self, status_code: u16, error_text: &str) -> AppError {
        handle_api_error(status_code, error_text, &self.token_manager).await
    }

    /// Make an authenticated GET request with proactive refresh and 401 retry
    async fn authenticated_get_with_retry(
        &self,
        url: &str,
    ) -> AppResult<reqwest::Response> {
        // Proactively ensure token is fresh
        ensure_fresh_token(&self.app_handle, 300).await?;

        let auth_token = self.get_auth_token().await?;
        let req = self.with_auth_headers(self.http_client.get(url), &auth_token)?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .send()
            .await
            .map_err(|e| AppError::HttpError(format!("Request failed: {}", e)))?;

        // Handle 401 with refresh-and-retry
        if response.status() == 401 {
            let body = response.text().await.unwrap_or_default();

            if contains_device_binding_mismatch(&body) {
                return Err(AppError::AuthError(format!("Device binding mismatch: {}", body)));
            }

            // Refresh and retry once
            refresh_with_dedup(&self.app_handle).await?;
            let new_token = self.get_auth_token().await?;

            let retry_req = self.with_auth_headers(self.http_client.get(url), &new_token)?;
            retry_req
                .header("HTTP-Referer", APP_HTTP_REFERER)
                .header("X-Title", APP_X_TITLE)
                .send()
                .await
                .map_err(|e| AppError::HttpError(format!("Request failed after retry: {}", e)))
        } else {
            Ok(response)
        }
    }

    /// Execute chat completion with duration measurement and retry logic
    /// For duration-based models, we make two attempts: first with estimated duration,
    /// then retry with actual measured duration if the first fails
    async fn execute_chat_completion_with_duration(
        &self,
        messages: Vec<crate::models::OpenRouterRequestMessage>,
        options: ApiClientOptions,
        auth_token: String,
    ) -> AppResult<OpenRouterResponse> {
        // Create request with estimated duration (used for initial attempt)
        let estimated_duration_ms = self.estimate_request_duration(&messages, &options.model);

        let mut request = OpenRouterRequest {
            model: options.model.clone(),
            messages: messages.clone(),
            stream: options.stream,
            max_tokens: Some(options.max_tokens),
            temperature: Some(options.temperature),
            duration_ms: Some(estimated_duration_ms),
            request_id: options.request_id.clone(),
            task_type: options.task_type.clone(),
        };

        // Create the server proxy endpoint URL for LLM chat completions
        let proxy_url = format!("{}/api/llm/chat/completions", self.server_url);

        // Record start time for actual duration measurement
        let start_time = std::time::Instant::now();

        // Make the HTTP request with estimated duration
        let req = self.with_auth_headers(
            self.http_client
                .post(&proxy_url)
                .header(header::CONTENT_TYPE, "application/json"),
            &auth_token,
        )?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to send request to {}: {}", proxy_url, e);

                // Use e.to_string() to capture full error details from reqwest
                let error_msg = e.to_string();

                AppError::HttpError(error_msg)
            })?;

        // Record actual duration
        let actual_duration = start_time.elapsed();
        let actual_duration_ms = actual_duration.as_millis() as i64;
        debug!(
            "LLM API call duration: {}ms (estimated: {}ms)",
            actual_duration_ms, estimated_duration_ms
        );

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());

            // Check if error is specifically about duration_ms parameter
            if error_text.contains("Duration-based models require duration_ms parameter") {
                warn!(
                    "Retrying request with actual measured duration: {}ms",
                    actual_duration_ms
                );

                // Retry with actual measured duration
                request.duration_ms = Some(actual_duration_ms);

                let retry_req = self.with_auth_headers(
                    self.http_client
                        .post(&proxy_url)
                        .header(header::CONTENT_TYPE, "application/json"),
                    &auth_token,
                )?;
                let retry_response = retry_req
                    .header("HTTP-Referer", APP_HTTP_REFERER)
                    .header("X-Title", APP_X_TITLE)
                    .json(&request)
                    .send()
                    .await
                    .map_err(|e| AppError::HttpError(e.to_string()))?;

                if !retry_response.status().is_success() {
                    let retry_status = retry_response.status();
                    let retry_error_text = retry_response
                        .text()
                        .await
                        .unwrap_or_else(|_| "Failed to get error text".to_string());
                    return Err(self
                        .handle_auth_error(retry_status.as_u16(), &retry_error_text)
                        .await);
                }

                let server_response: ServerOpenRouterResponse =
                    retry_response.json().await.map_err(|e| {
                        AppError::ServerProxyError(format!(
                            "Failed to parse server proxy response: {}",
                            e
                        ))
                    })?;
                let server_response: OpenRouterResponse = server_response.into();

                trace!(
                    "Server proxy chat completion response (after retry): {:?}",
                    server_response
                );
                return Ok(server_response);
            }

            // Use enhanced auth error handling for other errors
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        let server_response: ServerOpenRouterResponse = response.json().await.map_err(|e| {
            AppError::ServerProxyError(format!("Failed to parse server proxy response: {}", e))
        })?;
        let server_response: OpenRouterResponse = server_response.into();

        trace!(
            "Server proxy chat completion response: {:?}",
            server_response
        );
        Ok(server_response)
    }

    /// Estimate request duration based on message content and model
    /// This provides a reasonable duration estimate for initial requests
    fn estimate_request_duration(
        &self,
        messages: &[crate::models::OpenRouterRequestMessage],
        model: &str,
    ) -> i64 {
        // Calculate total content length
        let total_chars: usize = messages
            .iter()
            .flat_map(|msg| &msg.content)
            .map(|content| match content {
                crate::models::OpenRouterContent::Text { text, .. } => text.len(),
                crate::models::OpenRouterContent::Image { .. } => 100, // Estimate for image processing
            })
            .sum();

        // Base duration estimation based on content length and model type
        let base_duration = if total_chars < 1000 {
            2000 // 2 seconds for short requests
        } else if total_chars < 5000 {
            5000 // 5 seconds for medium requests
        } else {
            10000 // 10 seconds for long requests
        };

        // Adjust based on model (some models are slower)
        let model_multiplier = if model.contains("gpt-4") || model.contains("claude") {
            1.5 // Slower, more capable models
        } else {
            1.0 // Standard models
        };

        (base_duration as f64 * model_multiplier) as i64
    }

    /// Execute streaming chat completion with duration measurement
    /// For streaming requests, we estimate duration and include it in the initial request
    async fn execute_chat_completion_stream_with_duration(
        &self,
        messages: Vec<crate::models::OpenRouterRequestMessage>,
        options: ApiClientOptions,
        auth_token: String,
    ) -> AppResult<
        Pin<Box<dyn Stream<Item = AppResult<crate::models::stream_event::StreamEvent>> + Send>>,
    > {
        // Ensure streaming is enabled
        let mut options = options;
        options.stream = true;

        // Estimate duration for the streaming request
        let estimated_duration_ms = self.estimate_request_duration(&messages, &options.model);

        // Create request with estimated duration and request ID from options (may be None)
        let request = OpenRouterRequest {
            model: options.model.clone(),
            messages,
            stream: options.stream,
            max_tokens: Some(options.max_tokens),
            temperature: Some(options.temperature),
            duration_ms: Some(estimated_duration_ms),
            request_id: options.request_id.clone(),
            task_type: options.task_type.clone(),
        };

        // Create the server proxy endpoint URL for streaming LLM chat completions
        let proxy_url = format!("{}/api/llm/chat/completions", self.server_url);

        debug!(
            "Starting streaming request with estimated duration: {}ms",
            estimated_duration_ms
        );

        // Build the request but don't send it yet - EventSource will handle that
        let request_builder = self
            .with_auth_headers(
                self.http_client
                    .post(&proxy_url)
                    .header(header::CONTENT_TYPE, "application/json"),
                &auth_token,
            )?
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&request);

        // Track stream start time for actual duration measurement
        let stream_start_time = std::time::Instant::now();

        // Create stream debug logger with provider name
        let request_id_for_logger = options
            .request_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let mut stream_logger = StreamDebugLogger::new("desktop", &request_id_for_logger);
        stream_logger.log_stream_start();

        // Before SSE creation, ensure fresh token
        ensure_fresh_token(&self.app_handle, 300).await?;

        // Try to create event source
        let mut event_source = EventSource::new(request_builder)
            .map_err(|e| AppError::StreamError(format!("Failed to create SSE event source: {:?}", e)))?;

        // Clone app_handle for use in stream error handling
        let app_handle_for_stream = self.app_handle.clone();

        // Create a stream that converts SSE events to our StreamEvent type
        let stream = futures::stream::unfold(
            (event_source, stream_logger, app_handle_for_stream),
            move |(mut event_source, mut stream_logger, app_handle)| async move {
                loop {
                    match event_source.next().await {
                        Some(Ok(Event::Open)) => {
                            debug!("SSE connection opened");
                            continue;
                        }
                        Some(Ok(Event::Message(message))) => {
                            // Log the raw message
                            stream_logger.log_chunk(message.data.as_bytes());

                            // Enhanced debug logging
                            debug!(
                                "SSE event received - type: '{}', data length: {} bytes",
                                if message.event.is_empty() {
                                    "message"
                                } else {
                                    &message.event
                                },
                                message.data.len()
                            );

                            // Handle [DONE] marker - skip it as the actual completion will come from stream_completed event
                            if message.data == "[DONE]" {
                                debug!(
                                    "Received [DONE] marker - waiting for stream_completed event"
                                );
                                continue;
                            }

                            // Parse the message based on event type
                            let event_type = if message.event.is_empty() {
                                "message"
                            } else {
                                &message.event
                            };

                            debug!("Processing SSE event type: '{}'", event_type);

                            let stream_event = match event_type {
                                "usage_update" => {
                                    debug!("Parsing usage_update event");
                                    match serde_json::from_str::<
                                        crate::models::usage_update::UsageUpdate,
                                    >(&message.data)
                                    {
                                        Ok(usage) => {
                                            debug!(
                                                "Successfully parsed usage_update: input={}, output={}, cost={}",
                                                usage.tokens_input,
                                                usage.tokens_output,
                                                usage.estimated_cost
                                            );
                                            Ok(StreamEvent::UsageUpdate(usage))
                                        }
                                        Err(e) => {
                                            error!(
                                                "Failed to parse usage_update: {} - Data: '{}'",
                                                e, message.data
                                            );
                                            Err(AppError::InvalidResponse(format!(
                                                "Failed to parse usage_update: {}",
                                                e
                                            )))
                                        }
                                    }
                                }
                                "stream_started" => {
                                    debug!("Parsing stream_started event");
                                    match serde_json::from_str::<serde_json::Value>(&message.data) {
                                        Ok(data) => {
                                            if let Some(request_id) =
                                                data.get("request_id").and_then(|v| v.as_str())
                                            {
                                                debug!(
                                                    "Successfully parsed stream_started with request_id: {}",
                                                    request_id
                                                );
                                                Ok(StreamEvent::StreamStarted {
                                                    request_id: request_id.to_string(),
                                                })
                                            } else {
                                                error!("stream_started missing request_id");
                                                Err(AppError::InvalidResponse(
                                                    "stream_started event missing request_id"
                                                        .to_string(),
                                                ))
                                            }
                                        }
                                        Err(e) => {
                                            error!(
                                                "Failed to parse stream_started: {} - Data: '{}'",
                                                e, message.data
                                            );
                                            Err(AppError::InvalidResponse(format!(
                                                "Failed to parse stream_started: {}",
                                                e
                                            )))
                                        }
                                    }
                                }
                                "stream_cancelled" => {
                                    match serde_json::from_str::<serde_json::Value>(&message.data) {
                                        Ok(data) => {
                                            let request_id = data
                                                .get("request_id")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("unknown")
                                                .to_string();
                                            let reason = data
                                                .get("reason")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("Unknown reason")
                                                .to_string();
                                            Ok(StreamEvent::StreamCancelled { request_id, reason })
                                        }
                                        Err(e) => {
                                            error!(
                                                "Failed to parse stream_cancelled: {} - Data: '{}'",
                                                e, message.data
                                            );
                                            Err(AppError::InvalidResponse(format!(
                                                "Failed to parse stream_cancelled: {}",
                                                e
                                            )))
                                        }
                                    }
                                }
                                "error_details" => {
                                    match serde_json::from_str::<serde_json::Value>(&message.data) {
                                        Ok(data) => {
                                            let request_id = data
                                                .get("request_id")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("unknown")
                                                .to_string();

                                            if let Some(error_data) = data.get("error") {
                                                match serde_json::from_value::<
                                                    crate::models::error_details::ErrorDetails,
                                                >(
                                                    error_data.clone()
                                                ) {
                                                    Ok(error) => Ok(StreamEvent::ErrorDetails {
                                                        request_id,
                                                        error,
                                                    }),
                                                    Err(e) => {
                                                        error!(
                                                            "Failed to parse error_details.error: {} - Error: {}",
                                                            error_data, e
                                                        );
                                                        Err(AppError::InvalidResponse(format!(
                                                            "Failed to parse error_details: {}",
                                                            e
                                                        )))
                                                    }
                                                }
                                            } else {
                                                error!("error_details event missing 'error' field");
                                                Err(AppError::InvalidResponse(
                                                    "error_details event missing 'error' field"
                                                        .to_string(),
                                                ))
                                            }
                                        }
                                        Err(e) => {
                                            error!(
                                                "Failed to parse error_details: {} - Data: '{}'",
                                                e, message.data
                                            );
                                            Err(AppError::InvalidResponse(format!(
                                                "Failed to parse error_details: {}",
                                                e
                                            )))
                                        }
                                    }
                                }
                                "stream_completed" => {
                                    debug!("Received stream_completed event: {}", message.data);
                                    match serde_json::from_str::<serde_json::Value>(&message.data) {
                                        Ok(data) => {
                                            // Extract the fields from the JSON data
                                            let request_id = data
                                                .get("request_id")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_string();
                                            let final_cost = data
                                                .get("final_cost")
                                                .and_then(|v| v.as_f64())
                                                .unwrap_or(0.0);
                                            let tokens_input = data
                                                .get("tokens_input")
                                                .and_then(|v| v.as_i64())
                                                .unwrap_or(0);
                                            let tokens_output = data
                                                .get("tokens_output")
                                                .and_then(|v| v.as_i64())
                                                .unwrap_or(0);
                                            let cache_read_tokens = data
                                                .get("cache_read_tokens")
                                                .and_then(|v| v.as_i64())
                                                .unwrap_or(0);
                                            let cache_write_tokens = data
                                                .get("cache_write_tokens")
                                                .and_then(|v| v.as_i64())
                                                .unwrap_or(0);

                                            Ok(StreamEvent::StreamCompleted {
                                                request_id,
                                                final_cost,
                                                tokens_input,
                                                tokens_output,
                                                cache_read_tokens,
                                                cache_write_tokens,
                                            })
                                        }
                                        Err(e) => {
                                            error!(
                                                "Failed to parse stream_completed data: {} - Data: '{}'",
                                                e, message.data
                                            );
                                            Err(AppError::InvalidResponse(format!(
                                                "Failed to parse stream_completed: {}",
                                                e
                                            )))
                                        }
                                    }
                                }
                                _ => {
                                    // Default: try to parse as content chunk
                                    debug!(
                                        "Parsing unknown event type '{}' as content chunk",
                                        event_type
                                    );
                                    match serde_json::from_str::<OpenRouterStreamChunk>(
                                        &message.data,
                                    ) {
                                        Ok(chunk) => {
                                            let content_len: usize = chunk
                                                .choices
                                                .iter()
                                                .filter_map(|c| c.delta.content.as_ref())
                                                .map(|s| s.len())
                                                .sum();
                                            debug!(
                                                "Successfully parsed content chunk with {} bytes of content",
                                                content_len
                                            );
                                            Ok(StreamEvent::ContentChunk(chunk))
                                        }
                                        Err(e) => {
                                            error!(
                                                "Failed to parse as content chunk: {} - Data: '{}'",
                                                e, message.data
                                            );
                                            Err(AppError::InvalidResponse(format!(
                                                "Failed to parse stream data: {}",
                                                e
                                            )))
                                        }
                                    }
                                }
                            };

                            match stream_event {
                                Ok(event) => {
                                    debug!("Parsed StreamEvent: {:?}", event);
                                    // Log stream end for usage updates
                                    if matches!(event, StreamEvent::UsageUpdate(_)) {
                                        stream_logger.log_stream_end();
                                    }
                                    return Some((Ok(event), (event_source, stream_logger, app_handle)));
                                }
                                Err(e) => {
                                    stream_logger
                                        .log_error(&format!("Failed to parse event: {}", e));
                                    return Some((Err(e), (event_source, stream_logger, app_handle)));
                                }
                            }
                        }
                        Some(Err(e)) => {
                            // Check if this is just a "Stream ended" error, which can happen when
                            // the server closes the connection after sending all data.
                            // This is a known race condition where the SSE connection closes before
                            // the final StreamCompleted event can be fully transmitted. We treat this
                            // as a normal stream end rather than an error, as the stream content has
                            // been successfully received.
                            if e.to_string() == "Stream ended" {
                                debug!(
                                    "EventSource stream ended (via error) - treating as normal completion"
                                );
                                stream_logger.log_stream_end();
                                return None;
                            }

                            error!("EventSource error: {}", e);
                            stream_logger.log_error(&format!("EventSource error: {}", e));
                            let app_error = match e {
                                reqwest_eventsource::Error::Transport(e) => {
                                    AppError::HttpError(format!("Transport error: {}", e))
                                }
                                reqwest_eventsource::Error::InvalidStatusCode(code, _response) => {
                                    if code == 401 {
                                        // Token expired during streaming - attempt refresh for next request
                                        warn!("SSE stream received 401 Unauthorized - attempting token refresh");
                                        if let Err(refresh_err) = refresh_with_dedup(&app_handle).await {
                                            error!("Failed to refresh token after 401: {:?}", refresh_err);
                                            AppError::AuthError(format!(
                                                "Stream authentication failed and token refresh failed: {:?}",
                                                refresh_err
                                            ))
                                        } else {
                                            info!("Token refreshed after 401 - retry the request");
                                            AppError::AuthError(
                                                "Stream authentication failed - token has been refreshed, please retry".to_string()
                                            )
                                        }
                                    } else {
                                        AppError::HttpError(format!("Invalid status code: {}", code))
                                    }
                                }
                                reqwest_eventsource::Error::InvalidContentType(mime, _response) => {
                                    AppError::InvalidResponse(format!(
                                        "Invalid content type: {:?}",
                                        mime
                                    ))
                                }
                                _ => AppError::NetworkError(format!("SSE error: {}", e)),
                            };
                            return Some((Err(app_error), (event_source, stream_logger, app_handle)));
                        }
                        None => {
                            debug!("EventSource stream ended");
                            stream_logger.log_stream_end();
                            return None;
                        }
                    }
                }
            },
        );

        Ok(Box::pin(stream))
    }

    /// Estimate cost for a given model and token usage using server-side calculation
    pub async fn estimate_cost(
        &self,
        model_id: &str,
        input_tokens: i64,
        output_tokens: i64,
        cache_write_tokens: Option<i64>,
        cache_read_tokens: Option<i64>,
        duration_ms: Option<i64>,
    ) -> AppResult<serde_json::Value> {
        info!("Estimating cost for model {} via server proxy", model_id);

        // Get auth token
        let auth_token = self.get_auth_token().await?;

        let estimation_url = format!("{}/api/models/estimate-cost", self.server_url);

        let request_body = json!({
            "modelId": model_id,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "cacheWriteTokens": cache_write_tokens,
            "cacheReadTokens": cache_read_tokens,
            "durationMs": duration_ms
        });

        let req = self.with_auth_headers(
            self.http_client
                .post(&estimation_url)
                .header("Content-Type", "application/json"),
            &auth_token,
        )?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!(
                "Server proxy cost estimation API error: {} - {}",
                status, error_text
            );
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        let cost_response: serde_json::Value = response.json().await.map_err(|e| {
            AppError::ServerProxyError(format!("Failed to parse cost estimation response: {}", e))
        })?;

        info!("Cost estimation through server proxy successful");
        Ok(cost_response)
    }

    /// Estimate costs for multiple models/requests in batch using server-side calculation
    pub async fn estimate_batch_cost(
        &self,
        requests: Vec<serde_json::Value>,
    ) -> AppResult<serde_json::Value> {
        info!(
            "Estimating batch cost for {} requests via server proxy",
            requests.len()
        );

        // Get auth token
        let auth_token = self.get_auth_token().await?;

        let estimation_url = format!("{}/api/models/estimate-batch-cost", self.server_url);

        let request_body = json!({
            "requests": requests
        });

        let req = self.with_auth_headers(
            self.http_client
                .post(&estimation_url)
                .header("Content-Type", "application/json"),
            &auth_token,
        )?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!(
                "Server proxy batch cost estimation API error: {} - {}",
                status, error_text
            );
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        let cost_response: serde_json::Value = response.json().await.map_err(|e| {
            AppError::ServerProxyError(format!(
                "Failed to parse batch cost estimation response: {}",
                e
            ))
        })?;

        info!("Batch cost estimation through server proxy successful");
        Ok(cost_response)
    }

    /// Get user info using app JWT
    pub async fn get_user_info(&self) -> AppResult<crate::models::FrontendUser> {
        info!("Fetching user info via server proxy");

        let auth_token = self.get_auth_token().await?;
        let url = format!("{}/api/auth/userinfo", self.server_url);

        let req = self.with_auth_headers(self.http_client.get(&url), &auth_token)?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        let user_info: crate::models::FrontendUser = response.json().await.map_err(|e| {
            AppError::ServerProxyError(format!("Failed to parse user info response: {}", e))
        })?;

        info!("Successfully fetched user info for: {}", user_info.email);
        Ok(user_info)
    }

    /// Cancel an LLM request that's in progress
    pub async fn cancel_llm_request(&self, request_id: &str) -> AppResult<()> {
        info!("Cancelling LLM request: request_id={}", request_id);

        let auth_token = self.get_auth_token().await?;
        let url = format!("{}/api/llm/cancel", self.server_url);

        let cancel_payload = json!({
            "request_id": request_id
        });

        let req = self.with_auth_headers(
            self.http_client
                .post(&url)
                .header(header::CONTENT_TYPE, "application/json"),
            &auth_token,
        )?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&cancel_payload)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());

            if status == 404 {
                // Request not found or already completed
                info!("Request {} not found or already completed", request_id);
                return Ok(());
            }

            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        let cancel_response: serde_json::Value = response.json().await.map_err(|e| {
            AppError::ServerProxyError(format!("Failed to parse cancel response: {}", e))
        })?;

        if cancel_response
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            info!("Successfully cancelled request: {}", request_id);
        } else {
            let message = cancel_response
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error");
            warn!("Cancel request returned success=false: {}", message);
        }

        Ok(())
    }

    /// Analyze video content using LLM
    pub async fn analyze_video(
        &self,
        video_data: Vec<u8>,
        filename: &str,
        prompt: &str,
        model: &str,
        temperature: f32,
        system_prompt: Option<String>,
        duration_ms: i64,
        framerate: u32,
        request_id: Option<String>,
    ) -> AppResult<VideoAnalysisResponse> {
        info!("Sending video analysis request through server proxy");
        debug!("Video file: {}, size: {} bytes", filename, video_data.len());

        // Get auth token
        let auth_token = self.get_auth_token().await?;

        // Get video MIME type from filename
        let video_mime_type = Self::get_video_mime_type_from_filename(filename)?;

        // Use the video analysis endpoint
        let analysis_url = format!("{}/api/llm/video/analyze", self.server_url);

        // Create multipart form
        let mut form = multipart::Form::new()
            .text("prompt", prompt.to_string())
            .text("model", model.to_string())
            .text("temperature", temperature.to_string())
            .text("duration_ms", duration_ms.to_string())
            .text("framerate", framerate.to_string());

        // Add system prompt if provided
        if let Some(system_prompt) = system_prompt {
            form = form.text("system_prompt", system_prompt);
        }

        // Add request_id if provided
        if let Some(request_id) = request_id {
            form = form.text("request_id", request_id);
        }

        // Add video file
        form = form.part(
            "video",
            multipart::Part::bytes(video_data)
                .file_name(filename.to_string())
                .mime_str(video_mime_type)
                .map_err(|e| AppError::InternalError(format!("Invalid mime type: {}", e)))?,
        );

        let req = self.with_auth_headers(self.http_client.post(&analysis_url), &auth_token)?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!(
                "Server proxy video analysis API error: {} - {}",
                status, error_text
            );
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        // Parse the response
        let analysis_response: VideoAnalysisResponse = response.json().await.map_err(|e| {
            AppError::ServerProxyError(format!("Failed to parse video analysis response: {}", e))
        })?;

        info!("Video analysis through server proxy successful");
        Ok(analysis_response)
    }
}

#[async_trait]
impl TranscriptionClient for ServerProxyClient {
    async fn transcribe(
        &self,
        audio_data: &[u8],
        filename: &str,
        model: &str,
        duration_ms: i64,
        language: Option<&str>,
    ) -> AppResult<String> {
        info!(
            "Sending transcription request through server proxy with model: {}",
            model
        );
        debug!("Audio file: {}, size: {} bytes", filename, audio_data.len());

        // Get auth token
        let auth_token = self.get_auth_token().await?;

        // Use the audio transcriptions endpoint
        let transcription_url = format!("{}/api/audio/transcriptions", self.server_url);

        let mime_type_str = Self::get_mime_type_from_filename(filename)?;

        let mut form = multipart::Form::new()
            .text("model", model.to_string())
            .text("duration_ms", duration_ms.to_string())
            .part(
                "file",
                multipart::Part::bytes(audio_data.to_vec())
                    .file_name(filename.to_string())
                    .mime_str(mime_type_str)
                    .map_err(|e| AppError::InternalError(format!("Invalid mime type: {}", e)))?,
            );

        // Add language parameter if provided
        if let Some(lang) = language {
            form = form.text("language", lang.to_string());
        }

        let req = self.with_auth_headers(self.http_client.post(&transcription_url), &auth_token)?;
        let response = req
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!(
                "Server proxy transcription API error: {} - {}",
                status, error_text
            );
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        // Parse the response
        let transcription_response: serde_json::Value = response.json().await.map_err(|e| {
            AppError::ServerProxyError(format!("Failed to parse transcription response: {}", e))
        })?;

        let text = transcription_response["text"]
            .as_str()
            .unwrap_or_default()
            .to_string();

        info!("Transcription through server proxy successful");
        Ok(text)
    }
}

#[async_trait]
impl ApiClient for ServerProxyClient {
    /// Send a chat completion request with messages and get a response
    async fn chat_completion(
        &self,
        messages: Vec<crate::models::OpenRouterRequestMessage>,
        options: ApiClientOptions,
    ) -> AppResult<OpenRouterResponse> {
        info!(
            "Sending chat completion request to server proxy with model: {}",
            options.model
        );
        debug!("Proxy options: {:?}", options);

        // Get auth token
        let auth_token = self.get_auth_token().await?;

        // Perform the API call with duration measurement using internal helper
        self.execute_chat_completion_with_duration(messages, options, auth_token)
            .await
    }

    /// Send a streaming completion request with messages and get a stream of events
    async fn chat_completion_stream(
        &self,
        messages: Vec<crate::models::OpenRouterRequestMessage>,
        options: ApiClientOptions,
    ) -> AppResult<
        Pin<Box<dyn Stream<Item = AppResult<crate::models::stream_event::StreamEvent>> + Send>>,
    > {
        info!(
            "Sending streaming chat completion request to server proxy with model: {}",
            options.model
        );
        debug!("Proxy options: {:?}", options);

        // Get auth token
        let auth_token = self.get_auth_token().await?;

        // Execute streaming with duration measurement using internal helper
        self.execute_chat_completion_stream_with_duration(messages, options, auth_token)
            .await
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

impl ServerProxyClient {
    /// Send job completion notification to server
    pub async fn send_job_completed_notification(
        &self,
        payload: serde_json::Value,
    ) -> AppResult<()> {
        info!("Sending job completion notification to server");

        let auth_token = self.get_auth_token().await?;
        let notification_url = format!("{}/api/notifications/job-completed", self.server_url);

        let req = self.with_auth_headers(self.http_client.post(&notification_url), &auth_token)?;

        let response = req
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&payload)
            .send()
            .await
            .map_err(|e| {
                AppError::HttpError(format!("Failed to send job completion notification: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!(
                "Job completion notification API error: {} - {}",
                status, error_text
            );
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        info!("Job completion notification sent successfully");
        Ok(())
    }

    /// Send job failure notification to server
    pub async fn send_job_failed_notification(&self, payload: serde_json::Value) -> AppResult<()> {
        info!("Sending job failure notification to server");

        let auth_token = self.get_auth_token().await?;
        let notification_url = format!("{}/api/notifications/job-failed", self.server_url);

        let req = self.with_auth_headers(self.http_client.post(&notification_url), &auth_token)?;

        let response = req
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&payload)
            .send()
            .await
            .map_err(|e| {
                AppError::HttpError(format!("Failed to send job failure notification: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            error!(
                "Job failure notification API error: {} - {}",
                status, error_text
            );
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        info!("Job failure notification sent successfully");
        Ok(())
    }

    /// Send job progress notification to server (silent notification)
    pub async fn send_job_progress_notification(
        &self,
        payload: serde_json::Value,
    ) -> AppResult<()> {
        debug!("Sending job progress notification to server");

        let auth_token = self.get_auth_token().await?;
        let notification_url = format!("{}/api/notifications/job-progress", self.server_url);

        let req = self.with_auth_headers(self.http_client.post(&notification_url), &auth_token)?;

        let response = req
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&payload)
            .send()
            .await
            .map_err(|e| {
                AppError::HttpError(format!("Failed to send job progress notification: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error text".to_string());
            debug!(
                "Job progress notification API error: {} - {}",
                status, error_text
            );
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        debug!("Job progress notification sent successfully");
        Ok(())
    }

    /// Extract cost from response - uses server-authoritative cost from usage.cost field
    fn extract_cost_from_response(&self, response: &OpenRouterResponse) -> f64 {
        response
            .usage
            .as_ref()
            .and_then(|usage| usage.cost)
            .unwrap_or(0.0)
    }
}
