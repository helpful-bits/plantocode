use async_trait::async_trait;
use std::pin::Pin;
use std::sync::Arc;
use futures::{Stream, StreamExt};
use reqwest::{Client, header, multipart};
use serde_json::{json, Value};
use log::{debug, error, info, trace};
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
    
    /// Helper method to invoke AI requests via the server proxy
    pub async fn invoke_ai_request<T: serde::Serialize, R: serde::de::DeserializeOwned>(
        &self, 
        endpoint: &str, 
        payload: &T,
        model_id: Option<&str>
    ) -> AppResult<R> {
        let auth_token = self.get_auth_token().await?;
        
        let proxy_url = format!("{}/v1/ai-proxy/{}", self.server_url, endpoint);
        
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
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
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
    
    /// Get auth token from TokenManager
    async fn get_auth_token(&self) -> AppResult<String> {
        match self.token_manager.get().await {
            Some(token) => {
                debug!("Using auth token from TokenManager");
                Ok(token)
            },
            None => {
                debug!("No auth token found in TokenManager");
                Err(AppError::AuthError("Authentication token not found".to_string()))
            }
        }
    }
}

#[async_trait]
impl TranscriptionClient for ServerProxyClient {
    async fn transcribe(&self, audio_data: &[u8], filename: &str, model: &str) -> AppResult<String> {
        info!("Sending transcription request through server proxy with model: {}", model);
        debug!("Audio file: {}, size: {} bytes", filename, audio_data.len());

        // Get auth token
        let auth_token = self.get_auth_token().await?;
        
        // Use the OpenRouter audio transcriptions endpoint
        let transcription_url = format!("{}/api/proxy/openrouter/audio/transcriptions", self.server_url);

        let mime_type_str = Self::get_mime_type_from_filename(filename)?;

        let form = multipart::Form::new()
            .text("model", model.to_string())
            .part("file", multipart::Part::bytes(audio_data.to_vec())
                .file_name(filename.to_string())
                .mime_str(mime_type_str).map_err(|e| AppError::InternalError(format!("Invalid mime type: {}", e)))?); 

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
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
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
            
            // Use map_server_proxy_error to handle server proxy errors
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
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
            max_tokens: options.max_tokens,
            temperature: options.temperature,
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
            
            // Use map_server_proxy_error to handle server proxy errors
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
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
            
            // Use map_server_proxy_error to handle server proxy errors
            return Err(map_server_proxy_error(status.as_u16(), &error_text));
        }
        
        // Get the stream and process it
        let stream = response.bytes_stream().map(move |result| {
            match result {
                Ok(bytes) => {
                    // Parse the bytes as SSE (Server-Sent Events)
                    let text = String::from_utf8_lossy(&bytes);
                    let lines = text.split('\n').collect::<Vec<&str>>();
                    
                    // Process each line
                    let mut chunks = Vec::new();
                    for line in lines {
                        if line.is_empty() || !line.starts_with("data: ") {
                            continue;
                        }
                        
                        let data = &line[6..]; // Remove "data: " prefix
                        
                        // Check for [DONE] message
                        if data == "[DONE]" {
                            continue;
                        }
                        
                        // Parse as JSON
                        match serde_json::from_str::<OpenRouterStreamChunk>(data) {
                            Ok(chunk) => {
                                chunks.push(Ok(chunk));
                            },
                            Err(e) => {
                                error!("Failed to parse streaming chunk: {}", e);
                                chunks.push(Err(AppError::ServerProxyError(format!("Failed to parse chunk: {}", e))));
                            }
                        }
                    }
                    
                    futures::stream::iter(chunks)
                },
                Err(e) => {
                    futures::stream::iter(vec![Err(AppError::HttpError(e.to_string()))])
                }
            }
        }).flatten();
        
        Ok(Box::pin(stream))
    }
}