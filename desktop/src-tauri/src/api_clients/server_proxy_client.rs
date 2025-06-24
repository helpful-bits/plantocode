use async_trait::async_trait;
use std::pin::Pin;
use std::sync::Arc;
use futures::{Stream, StreamExt};
use reqwest::{Client, header, multipart};
use reqwest_eventsource::{EventSource, Event};
use serde_json::{json, Value};
use log::{debug, error, info, trace, warn};
use tauri::{AppHandle, Manager};

use crate::auth::TokenManager;
use crate::constants::{SERVER_API_URL, APP_HTTP_REFERER, APP_X_TITLE};
use crate::error::{AppError, AppResult};
use crate::models::{
    OpenRouterRequest, OpenRouterRequestMessage, OpenRouterContent,
    OpenRouterResponse, OpenRouterStreamChunk
};
use super::client_trait::{ApiClient, ApiClientOptions, TranscriptionClient};
use super::error_handling::map_server_proxy_error;

/// Server proxy API client for LLM requests
pub struct ServerProxyClient {
    http_client: Client,
    app_handle: AppHandle,
    server_url: String,
    token_manager: Arc<TokenManager>,
}

impl ServerProxyClient {
    /// Create a new server proxy client
    pub fn new(app_handle: AppHandle, server_url: String, token_manager: Arc<TokenManager>) -> Self {
        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 minute timeout
            .build()
            .expect("Failed to create HTTP client");
            
        Self {
            http_client,
            app_handle,
            server_url,
            token_manager,
        }
    }
    
    /// Create a new server proxy client with a custom HTTP client
    pub fn new_with_client(
        app_handle: AppHandle, 
        server_url: String, 
        token_manager: Arc<TokenManager>,
        http_client: Client
    ) -> Self {
        Self {
            http_client,
            app_handle,
            server_url,
            token_manager,
        }
    }
    
    /// Get the server URL
    pub fn server_url(&self) -> &str {
        &self.server_url
    }
    
    /// Get runtime AI configuration from the server
    pub async fn get_runtime_ai_config(&self) -> AppResult<Value> {
        info!("Fetching runtime AI configuration from server");
        
        // Create the config endpoint URL - this is a public endpoint, no auth required
        let config_url = format!("{}/config/desktop-runtime-config", self.server_url);
        
        let response = self.http_client
            .get(&config_url)
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .send()
            .await
            .map_err(|e| AppError::HttpError(format!("Failed to fetch runtime AI config: {}", e)))?;
            
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            error!("Server runtime config API error: {} - {}", status, error_text);
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
        }
        
        // Parse the response
        let config: Value = response.json().await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse runtime AI config response: {}", e)))?;
            
        info!("Successfully fetched runtime AI configuration from server");
        trace!("Runtime AI config: {:?}", config);
        
        Ok(config)
    }
    
    /// Get all default system prompts from the server
    pub async fn get_default_system_prompts(&self) -> AppResult<Vec<crate::models::DefaultSystemPrompt>> {
        info!("Fetching all default system prompts from server");
        
        let prompts = self.try_fetch_default_system_prompts_from_server().await?;
        info!("Successfully fetched {} default system prompts from server", prompts.len());
        Ok(prompts)
    }
    
    /// Try to fetch default system prompts from server (can fail)
    async fn try_fetch_default_system_prompts_from_server(&self) -> AppResult<Vec<crate::models::DefaultSystemPrompt>> {
        // Create the prompts endpoint URL - this is a public endpoint, no auth required
        let prompts_url = format!("{}/system-prompts/defaults", self.server_url);
        
        let response = self.http_client
            .get(&prompts_url)
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .send()
            .await
            .map_err(|e| AppError::HttpError(format!("Failed to fetch default system prompts: {}", e)))?;
            
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            error!("Server default system prompts API error: {} - {}", status, error_text);
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
        }
        
        // Parse the response directly into DefaultSystemPrompt structs
        let prompts: Vec<crate::models::DefaultSystemPrompt> = response.json().await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse default system prompts response: {}", e)))?;
            
        Ok(prompts)
    }
    
    
    /// Get a specific default system prompt by task type from server
    pub async fn get_default_system_prompt(&self, task_type: &str) -> AppResult<Option<serde_json::Value>> {
        info!("Fetching default system prompt for task type '{}' from server", task_type);
        
        self.try_fetch_default_system_prompt_from_server(task_type).await
    }
    
    /// Try to fetch a specific default system prompt from server (can fail)
    async fn try_fetch_default_system_prompt_from_server(&self, task_type: &str) -> AppResult<Option<serde_json::Value>> {
        
        // Create the specific prompt endpoint URL - this is a public endpoint, no auth required
        let prompt_url = format!("{}/system-prompts/defaults/{}", self.server_url, task_type);
        
        let response = self.http_client
            .get(&prompt_url)
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .send()
            .await
            .map_err(|e| AppError::HttpError(format!("Failed to fetch default system prompt: {}", e)))?;
            
        if response.status() == 404 {
            info!("No default system prompt found for task type '{}'", task_type);
            return Ok(None);
        }
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            error!("Server default system prompt API error: {} - {}", status, error_text);
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
        }
        
        // Parse the response
        let prompt: serde_json::Value = response.json().await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse default system prompt response: {}", e)))?;
            
        info!("Successfully fetched default system prompt for task type '{}'", task_type);
        
        Ok(Some(prompt))
    }
    
    /// Initialize system prompts cache from server
    /// This method validates that system prompts are available from the server
    pub async fn populate_default_system_prompts_cache(&self, _settings_repo: &crate::db_utils::SettingsRepository) -> AppResult<()> {
        info!("Validating default system prompts availability from server");
        
        let server_prompts = self.get_default_system_prompts().await?;
        let prompt_count = server_prompts.len();
        
        if prompt_count > 0 {
            info!("Successfully validated {} default system prompts from server", prompt_count);
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
        model_id: Option<&str>
    ) -> AppResult<R> {
        let auth_token = self.get_auth_token().await?;
        
        let proxy_url = format!("{}/api/ai-proxy/{}", self.server_url, endpoint);
        
        let mut request_builder = self.http_client
            .post(&proxy_url)
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("Bearer {}", auth_token))
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
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }
        
        response.json::<R>().await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse response: {}", e)))
    }
    
    /// Get MIME type from file extension
    fn get_mime_type_from_filename(filename: &str) -> AppResult<&'static str> {
        let extension = std::path::Path::new(filename)
            .extension()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or("").to_lowercase();
            
        match extension.as_str() {
            "mp3" => Ok("audio/mpeg"),
            "wav" => Ok("audio/wav"),
            "m4a" => Ok("audio/x-m4a"),
            "ogg" => Ok("audio/ogg"),
            "webm" => Ok("audio/webm"),
            "flac" => Ok("audio/flac"),
            "aac" => Ok("audio/aac"),
            "mp4" => Ok("audio/mp4"),
            "" => Err(AppError::ValidationError("Audio file has no extension".to_string())),
            _ => Err(AppError::ValidationError(format!("Unsupported audio file extension for transcription: .{}", extension))),
        }
    }
    
    /// Get auth token from TokenManager with refresh attempt on failure
    async fn get_auth_token(&self) -> AppResult<String> {
        match self.token_manager.get().await {
            Some(token) => {
                debug!("Using auth token from TokenManager");
                Ok(token)
            },
            None => {
                debug!("No auth token found in TokenManager");
                Err(AppError::AuthError("Authentication token not found. Please re-authenticate.".to_string()))
            }
        }
    }
    
    /// Handle authentication error by suggesting token refresh
    async fn handle_auth_error(&self, status_code: u16, error_text: &str) -> AppError {
        if status_code == 401 {
            warn!("Received 401 Unauthorized. Token may be expired. User needs to refresh token manually.");
            // Clear the invalid token
            if let Err(e) = self.token_manager.set(None).await {
                error!("Failed to clear invalid token: {}", e);
            }
            AppError::AuthError("Authentication token expired. Please use refresh_app_jwt_auth0 command to refresh your token or re-authenticate.".to_string())
        } else {
            map_server_proxy_error(status_code, error_text)
        }
    }
    
    /// Log detailed API request information to debug files
    async fn log_api_request_details(&self, request: &OpenRouterRequest, endpoint_url: &str, is_streaming: bool) {
        use chrono;
        
        let base_dir = std::path::Path::new("/Users/kirylkazlovich/dev/vibe-manager/tmp");
        let api_logs_dir = base_dir.join("api_requests");
        
        if let Err(_) = tokio::fs::create_dir_all(&api_logs_dir).await {
            // Silently fail if can't create directory
            return;
        }
        
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S%.3f");
        let request_type = if is_streaming { "streaming" } else { "non_streaming" };
        let filename = format!("api_request_{}_{}.txt", request_type, timestamp);
        let filepath = api_logs_dir.join(filename);
        
        // Extract message content for logging
        let mut message_summary = String::new();
        for (i, message) in request.messages.iter().enumerate() {
            message_summary.push_str(&format!("Message {}: Role: {}\n", i + 1, message.role));
            for (j, content) in message.content.iter().enumerate() {
                match content {
                    OpenRouterContent::Text { text, .. } => {
                        let preview = if text.len() > 500 {
                            format!("{}... ({} total chars)", &text[..500], text.len())
                        } else {
                            text.clone()
                        };
                        message_summary.push_str(&format!("  Content {}: {}\n", j + 1, preview));
                    }
                    OpenRouterContent::Image { .. } => {
                        message_summary.push_str(&format!("  Content {}: [Image]\n", j + 1));
                    }
                }
            }
            message_summary.push('\n');
        }
        
        // Serialize request for complete details
        let request_json = match serde_json::to_string_pretty(request) {
            Ok(json) => json,
            Err(_) => "Failed to serialize request".to_string(),
        };
        
        let log_content = format!(
            "=== API REQUEST LOG ===\n\
            Timestamp: {}\n\
            Request Type: {}\n\
            Endpoint URL: {}\n\
            Server URL: {}\n\n\
            === REQUEST PARAMETERS ===\n\
            Model: {}\n\
            Max Tokens: {:?}\n\
            Temperature: {:?}\n\
            Stream: {}\n\
            Total Messages: {}\n\n\
            === MESSAGE SUMMARY ===\n\
            {}\n\
            === COMPLETE REQUEST JSON ===\n\
            {}\n\n\
            === END API REQUEST LOG ===\n",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            request_type,
            endpoint_url,
            self.server_url,
            request.model,
            request.max_tokens,
            request.temperature,
            request.stream,
            request.messages.len(),
            message_summary,
            request_json
        );
        
        let _ = tokio::fs::write(&filepath, log_content).await;
        info!("API request details logged to: {:?}", filepath);
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
        };
        
        // Create the server proxy endpoint URL for LLM chat completions
        let proxy_url = format!("{}/api/llm/chat/completions", self.server_url);
        
        // Log detailed API request information before sending
        self.log_api_request_details(&request, &proxy_url, false).await;
        
        // Record start time for actual duration measurement
        let start_time = std::time::Instant::now();
        
        // Make the HTTP request with estimated duration
        let response = self.http_client
            .post(&proxy_url)
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;
        
        // Record actual duration
        let actual_duration = start_time.elapsed();
        let actual_duration_ms = actual_duration.as_millis() as i64;
        debug!("LLM API call duration: {}ms (estimated: {}ms)", actual_duration_ms, estimated_duration_ms);
            
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            
            // Check if error is specifically about duration_ms parameter
            if error_text.contains("Duration-based models require duration_ms parameter") {
                warn!("Retrying request with actual measured duration: {}ms", actual_duration_ms);
                
                // Retry with actual measured duration
                request.duration_ms = Some(actual_duration_ms);
                
                let retry_response = self.http_client
                    .post(&proxy_url)
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("Authorization", format!("Bearer {}", auth_token))
                    .header("HTTP-Referer", APP_HTTP_REFERER)
                    .header("X-Title", APP_X_TITLE)
                    .json(&request)
                    .send()
                    .await
                    .map_err(|e| AppError::HttpError(e.to_string()))?;
                
                if !retry_response.status().is_success() {
                    let retry_status = retry_response.status();
                    let retry_error_text = retry_response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
                    return Err(self.handle_auth_error(retry_status.as_u16(), &retry_error_text).await);
                }
                
                let server_response: OpenRouterResponse = retry_response.json().await
                    .map_err(|e| AppError::ServerProxyError(format!("Failed to parse server proxy response: {}", e)))?;
                
                trace!("Server proxy chat completion response (after retry): {:?}", server_response);
                return Ok(server_response);
            }
            
            // Use enhanced auth error handling for other errors
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }
        
        let server_response: OpenRouterResponse = response.json().await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse server proxy response: {}", e)))?;
            
        trace!("Server proxy chat completion response: {:?}", server_response);
        Ok(server_response)
    }
    
    /// Estimate request duration based on message content and model
    /// This provides a reasonable duration estimate for initial requests
    fn estimate_request_duration(&self, messages: &[crate::models::OpenRouterRequestMessage], model: &str) -> i64 {
        // Calculate total content length
        let total_chars: usize = messages.iter()
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
    ) -> AppResult<Pin<Box<dyn Stream<Item = AppResult<OpenRouterStreamChunk>> + Send>>> {
        // Ensure streaming is enabled
        let mut options = options;
        options.stream = true;
        
        // Estimate duration for the streaming request
        let estimated_duration_ms = self.estimate_request_duration(&messages, &options.model);
        
        // Create request with estimated duration
        let request = OpenRouterRequest {
            model: options.model.clone(),
            messages,
            stream: options.stream,
            max_tokens: Some(options.max_tokens),
            temperature: Some(options.temperature),
            duration_ms: Some(estimated_duration_ms),
        };
        
        // Create the server proxy endpoint URL for streaming LLM chat completions
        let proxy_url = format!("{}/api/llm/chat/completions", self.server_url);
        
        // Log detailed API request information before sending
        self.log_api_request_details(&request, &proxy_url, true).await;
        
        debug!("Starting streaming request with estimated duration: {}ms", estimated_duration_ms);
        
        let request_builder = self.http_client
            .post(&proxy_url)
            .header(header::CONTENT_TYPE, "application/json")
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .json(&request);
        
        let event_source = EventSource::new(request_builder)
            .map_err(|e| AppError::HttpError(format!("Failed to create EventSource: {}", e)))?;
        
        // Track stream start time for actual duration measurement
        let stream_start_time = std::time::Instant::now();
        
        let stream = futures::stream::unfold((event_source, stream_start_time, false), move |(mut event_source, start_time, mut stream_ended)| async move {
            loop {
                match event_source.next().await {
                    Some(Ok(Event::Message(message))) => {
                        if message.data == "[DONE]" {
                            if !stream_ended {
                                let actual_duration = start_time.elapsed();
                                let actual_duration_ms = actual_duration.as_millis() as i64;
                                debug!("Streaming completed in {}ms (estimated: {}ms)", actual_duration_ms, estimated_duration_ms);
                                stream_ended = true;
                            }
                            debug!("Received [DONE] signal, ending stream");
                            return None;
                        }
                        
                        match serde_json::from_str::<OpenRouterStreamChunk>(&message.data) {
                            Ok(chunk) => {
                                trace!("Successfully parsed stream chunk");
                                return Some((Ok(chunk), (event_source, start_time, stream_ended)));
                            },
                            Err(e) => {
                                debug!("Failed to parse streaming chunk: {} - Data: '{}'", e, message.data);
                                return Some((Err(AppError::InvalidResponse(format!("Invalid streaming JSON: {}", e))), (event_source, start_time, stream_ended)));
                            }
                        }
                    },
                    Some(Ok(Event::Open)) => {
                        debug!("EventSource stream opened");
                        continue;
                    },
                    Some(Err(e)) => {
                        error!("EventSource error: {}", e);
                        return Some((Err(AppError::NetworkError(format!("EventSource error: {}", e))), (event_source, start_time, stream_ended)));
                    },
                    None => {
                        if !stream_ended {
                            let actual_duration = start_time.elapsed();
                            let actual_duration_ms = actual_duration.as_millis() as i64;
                            debug!("Streaming ended in {}ms (estimated: {}ms)", actual_duration_ms, estimated_duration_ms);
                        }
                        debug!("EventSource stream ended");
                        return None;
                    }
                }
            }
        });
        
        Ok(Box::pin(stream))
    }
}

#[async_trait]
impl TranscriptionClient for ServerProxyClient {
    async fn transcribe(&self, audio_data: &[u8], filename: &str, model: &str, duration_ms: i64, language: Option<&str>) -> AppResult<String> {
        info!("Sending transcription request through server proxy with model: {}", model);
        debug!("Audio file: {}, size: {} bytes", filename, audio_data.len());

        // Get auth token
        let auth_token = self.get_auth_token().await?;
        
        // Use the audio transcriptions endpoint
        let transcription_url = format!("{}/api/audio/transcriptions", self.server_url);

        let mime_type_str = Self::get_mime_type_from_filename(filename)?;

        let mut form = multipart::Form::new()
            .text("model", model.to_string())
            .text("duration_ms", duration_ms.to_string())
            .part("file", multipart::Part::bytes(audio_data.to_vec())
                .file_name(filename.to_string())
                .mime_str(mime_type_str).map_err(|e| AppError::InternalError(format!("Invalid mime type: {}", e)))?); 

        // Add language parameter if provided
        if let Some(lang) = language {
            form = form.text("language", lang.to_string());
        }

        let response = self.http_client
            .post(&transcription_url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("HTTP-Referer", APP_HTTP_REFERER)
            .header("X-Title", APP_X_TITLE)
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            error!("Server proxy transcription API error: {} - {}", status, error_text);
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }

        // Parse the response
        let transcription_response: serde_json::Value = response.json().await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse transcription response: {}", e)))?;
        
        let text = transcription_response["text"].as_str().unwrap_or_default().to_string();

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
        options: ApiClientOptions
    ) -> AppResult<OpenRouterResponse> {
        info!("Sending chat completion request to server proxy with model: {}", options.model);
        debug!("Proxy options: {:?}", options);
        
        // Get auth token
        let auth_token = self.get_auth_token().await?;
        
        // Perform the API call with duration measurement using internal helper
        self.execute_chat_completion_with_duration(messages, options, auth_token).await
    }
    
    
    /// Send a streaming completion request with messages and get a stream of chunks
    async fn chat_completion_stream(
        &self,
        messages: Vec<crate::models::OpenRouterRequestMessage>,
        options: ApiClientOptions,
    ) -> AppResult<Pin<Box<dyn Stream<Item = AppResult<OpenRouterStreamChunk>> + Send>>> {
        info!("Sending streaming chat completion request to server proxy with model: {}", options.model);
        debug!("Proxy options: {:?}", options);
        
        // Get auth token
        let auth_token = self.get_auth_token().await?;
        
        // Execute streaming with duration measurement using internal helper
        self.execute_chat_completion_stream_with_duration(messages, options, auth_token).await
    }
}