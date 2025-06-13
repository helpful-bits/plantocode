use async_trait::async_trait;
use std::pin::Pin;
use std::sync::Arc;
use futures::{Stream, StreamExt};
use reqwest::{Client, header, multipart};
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
use super::proxy_request_helper;

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
    pub async fn get_default_system_prompts(&self) -> AppResult<Vec<serde_json::Value>> {
        info!("Fetching all default system prompts from server");
        
        let prompts = self.try_fetch_default_system_prompts_from_server().await?;
        info!("Successfully fetched {} default system prompts from server", prompts.len());
        Ok(prompts)
    }
    
    /// Try to fetch default system prompts from server (can fail)
    async fn try_fetch_default_system_prompts_from_server(&self) -> AppResult<Vec<serde_json::Value>> {
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
        
        // Parse the response
        let prompts: Vec<serde_json::Value> = response.json().await
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
}

#[async_trait]
impl TranscriptionClient for ServerProxyClient {
    async fn transcribe(&self, audio_data: &[u8], filename: &str, model: &str, duration_ms: i64, language: Option<&str>) -> AppResult<String> {
        info!("Sending transcription request through server proxy with model: {}", model);
        debug!("Audio file: {}, size: {} bytes", filename, audio_data.len());

        // Get auth token
        let auth_token = self.get_auth_token().await?;
        
        // Use the audio transcriptions endpoint
        let transcription_url = format!("{}/api/proxy/audio/transcriptions", self.server_url);

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
    /// Send a completion request and get a response
    async fn complete(&self, prompt: &str, options: ApiClientOptions) -> AppResult<OpenRouterResponse> {
        info!("Sending completion request to server proxy with model: {}", options.model);
        debug!("Proxy options: {:?}", options);
        
        // Get auth token
        let auth_token = self.get_auth_token().await?;
        
        // Create the request payload using the helper
        let request = proxy_request_helper::create_open_router_request(prompt, &options);
        
        // Create the server proxy endpoint URL for OpenRouter
        let proxy_url = format!("{}/api/proxy/openrouter/chat/completions", self.server_url);
        
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
            
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            
            // Use enhanced auth error handling
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }
        
        let server_response: OpenRouterResponse = response.json().await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse server proxy response: {}", e)))?;
            
        trace!("Server proxy response: {:?}", server_response);
        Ok(server_response)
    }
    
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
        
        // Create request with the provided messages
        let request = OpenRouterRequest {
            model: options.model.clone(),
            messages,
            stream: options.stream,
            max_tokens: Some(options.max_tokens),
            temperature: Some(options.temperature),
        };
        
        // Create the server proxy endpoint URL for OpenRouter
        let proxy_url = format!("{}/api/proxy/openrouter/chat/completions", self.server_url);
        
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
            
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            
            // Use enhanced auth error handling
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }
        
        let server_response: OpenRouterResponse = response.json().await
            .map_err(|e| AppError::ServerProxyError(format!("Failed to parse server proxy response: {}", e)))?;
            
        trace!("Server proxy chat completion response: {:?}", server_response);
        Ok(server_response)
    }
    
    /// Send a streaming completion request and get a stream of chunks
    async fn stream_complete(
        &self,
        prompt: &str,
        options: ApiClientOptions,
    ) -> AppResult<Pin<Box<dyn Stream<Item = AppResult<OpenRouterStreamChunk>> + Send>>> {
        info!("Sending streaming completion request to server proxy with model: {}", options.model);
        debug!("Proxy options: {:?}", options);
        
        // Get auth token
        let auth_token = self.get_auth_token().await?;
        
        // Ensure streaming is enabled
        let mut options = options;
        options.stream = true;
        
        // Create the request payload using the helper
        let request = proxy_request_helper::create_open_router_request(prompt, &options);
        
        // Create the server proxy endpoint URL for streaming OpenRouter chat
        let proxy_url = format!("{}/api/proxy/openrouter/chat/completions", self.server_url);
        
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
            
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            
            // Use enhanced auth error handling
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }
        
        // Get the stream and process it with enhanced SSE parsing
        let mut buffer = String::new();
        let stream = response.bytes_stream().map(move |result| {
            match result {
                Ok(bytes) => {
                    // Convert bytes to string with enhanced UTF-8 handling
                    match String::from_utf8(bytes.to_vec()) {
                        Ok(new_text) => {
                            buffer.push_str(&new_text);
                        },
                        Err(_) => {
                            // Handle potential UTF-8 issues in streamed data
                            let new_text = String::from_utf8_lossy(&bytes);
                            buffer.push_str(&new_text);
                            debug!("UTF-8 conversion issue in stream, using lossy conversion");
                        }
                    }
                    
                    let mut chunks = Vec::new();
                    let mut lines_to_keep = String::new();
                    
                    // Split by double newlines to handle complete SSE events
                    // Handle both \n\n and \r\n\r\n patterns
                    let events: Vec<&str> = if buffer.contains("\r\n\r\n") {
                        buffer.split("\r\n\r\n").collect()
                    } else {
                        buffer.split("\n\n").collect()
                    };
                    
                    // Process all complete events (all but the last)
                    for (i, event) in events.iter().enumerate() {
                        if i == events.len() - 1 {
                            // Keep the last (potentially incomplete) event in buffer
                            lines_to_keep = event.to_string();
                            continue;
                        }
                        
                        // Process each line in the event
                        for line in event.lines() {
                            let line = line.trim();
                            
                            // Skip empty lines
                            if line.is_empty() {
                                continue;
                            }
                            
                            // Handle different SSE line types
                            if line.starts_with("data: ") {
                                let data = &line[6..]; // Remove "data: " prefix
                                
                                // Check for [DONE] message
                                if data.trim() == "[DONE]" {
                                    debug!("Received [DONE] signal, ending stream");
                                    continue;
                                }
                                
                                // Skip empty data lines
                                if data.trim().is_empty() {
                                    continue;
                                }
                                
                                // Parse as JSON with enhanced error handling
                                match serde_json::from_str::<OpenRouterStreamChunk>(data) {
                                    Ok(chunk) => {
                                        trace!("Successfully parsed stream chunk");
                                        chunks.push(Ok(chunk));
                                    },
                                    Err(e) => {
                                        // Log the parsing error but continue processing other chunks
                                        debug!("Failed to parse streaming chunk: {} - Data: '{}'", e, data);
                                        // Only push error for non-trivial parsing failures
                                        if !data.trim().is_empty() && data.len() > 2 {
                                            chunks.push(Err(AppError::InvalidResponse(format!("Invalid streaming JSON: {}", e))));
                                        }
                                    }
                                }
                            } else if line.starts_with("event: ") {
                                // Handle SSE event types
                                debug!("SSE event type: {}", &line[7..]);
                            } else if line.starts_with("id: ") {
                                // Handle SSE event IDs
                                trace!("SSE event ID: {}", &line[4..]);
                            } else if line.starts_with("retry: ") {
                                // Handle SSE retry directives
                                debug!("SSE retry directive: {}", &line[7..]);
                            }
                            // Ignore other line types like comments (starting with :)
                        }
                    }
                    
                    // Update buffer with remaining incomplete data
                    buffer = lines_to_keep;
                    
                    futures::stream::iter(chunks)
                },
                Err(e) => {
                    error!("HTTP error in streaming response: {}", e);
                    futures::stream::iter(vec![Err(AppError::NetworkError(format!("Stream network error: {}", e)))])
                }
            }
        }).flatten();
        
        Ok(Box::pin(stream))
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
        
        // Ensure streaming is enabled
        let mut options = options;
        options.stream = true;
        
        // Create request with the provided messages
        let request = OpenRouterRequest {
            model: options.model.clone(),
            messages,
            stream: options.stream,
            max_tokens: Some(options.max_tokens),
            temperature: Some(options.temperature),
        };
        
        // Create the server proxy endpoint URL for streaming OpenRouter chat
        let proxy_url = format!("{}/api/proxy/openrouter/chat/completions", self.server_url);
        
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
            
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Failed to get error text".to_string());
            
            // Use enhanced auth error handling
            return Err(self.handle_auth_error(status.as_u16(), &error_text).await);
        }
        
        // Get the stream and process it with enhanced SSE parsing
        let mut buffer = String::new();
        let stream = response.bytes_stream().map(move |result| {
            match result {
                Ok(bytes) => {
                    // Convert bytes to string with enhanced UTF-8 handling
                    match String::from_utf8(bytes.to_vec()) {
                        Ok(new_text) => {
                            buffer.push_str(&new_text);
                        },
                        Err(_) => {
                            // Handle potential UTF-8 issues in streamed data
                            let new_text = String::from_utf8_lossy(&bytes);
                            buffer.push_str(&new_text);
                            debug!("UTF-8 conversion issue in stream, using lossy conversion");
                        }
                    }
                    
                    let mut chunks = Vec::new();
                    let mut lines_to_keep = String::new();
                    
                    // Split by double newlines to handle complete SSE events
                    // Handle both \n\n and \r\n\r\n patterns
                    let events: Vec<&str> = if buffer.contains("\r\n\r\n") {
                        buffer.split("\r\n\r\n").collect()
                    } else {
                        buffer.split("\n\n").collect()
                    };
                    
                    // Process all complete events (all but the last)
                    for (i, event) in events.iter().enumerate() {
                        if i == events.len() - 1 {
                            // Keep the last (potentially incomplete) event in buffer
                            lines_to_keep = event.to_string();
                            continue;
                        }
                        
                        // Process each line in the event
                        for line in event.lines() {
                            let line = line.trim();
                            
                            // Skip empty lines
                            if line.is_empty() {
                                continue;
                            }
                            
                            // Handle different SSE line types
                            if line.starts_with("data: ") {
                                let data = &line[6..]; // Remove "data: " prefix
                                
                                // Check for [DONE] message
                                if data.trim() == "[DONE]" {
                                    debug!("Received [DONE] signal, ending stream");
                                    continue;
                                }
                                
                                // Skip empty data lines
                                if data.trim().is_empty() {
                                    continue;
                                }
                                
                                // Parse as JSON with enhanced error handling
                                match serde_json::from_str::<OpenRouterStreamChunk>(data) {
                                    Ok(chunk) => {
                                        trace!("Successfully parsed stream chunk");
                                        chunks.push(Ok(chunk));
                                    },
                                    Err(e) => {
                                        // Log the parsing error but continue processing other chunks
                                        debug!("Failed to parse streaming chunk: {} - Data: '{}'", e, data);
                                        // Only push error for non-trivial parsing failures
                                        if !data.trim().is_empty() && data.len() > 2 {
                                            chunks.push(Err(AppError::InvalidResponse(format!("Invalid streaming JSON: {}", e))));
                                        }
                                    }
                                }
                            } else if line.starts_with("event: ") {
                                // Handle SSE event types
                                debug!("SSE event type: {}", &line[7..]);
                            } else if line.starts_with("id: ") {
                                // Handle SSE message IDs
                                debug!("SSE message ID: {}", &line[4..]);
                            } else {
                                // Log unexpected line formats for debugging
                                debug!("Unexpected SSE line format: '{}'", line);
                            }
                        }
                    }
                    
                    // Update buffer with remaining incomplete event
                    buffer = lines_to_keep;
                    
                    // Return the processed chunks
                    if chunks.is_empty() {
                        futures::stream::iter(vec![]).left_stream()
                    } else {
                        futures::stream::iter(chunks).right_stream()
                    }
                },
                Err(e) => {
                    error!("HTTP error in streaming response: {}", e);
                    futures::stream::iter(vec![Err(AppError::NetworkError(format!("Stream network error: {}", e)))]).left_stream()
                }
            }
        }).flatten();
        
        Ok(Box::pin(stream))
    }
}