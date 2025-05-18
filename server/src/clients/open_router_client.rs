use crate::error::AppError;
use bytes::Bytes;
use actix_web::{web, HttpResponse};
use futures_util::{Stream, StreamExt, TryStreamExt};
use reqwest::{Client, Body, multipart, Response, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::io::Cursor;
use tokio_util::codec::{BytesCodec, FramedRead};
use uuid::Uuid;
use crate::config::settings::AppSettings;
use crate::db::repositories::model_repository::{ModelRepository, ApiUsageCreateDto};
use tracing::{debug, info, warn, error, instrument};
use chrono::Utc;

// Base URL for OpenRouter API
const OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";

// OpenRouter Chat Completion Request Structs
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterChatRequest {
    pub model: String,
    pub messages: Vec<OpenRouterMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterMessage {
    pub role: String,
    pub content: OpenRouterContent,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum OpenRouterContent {
    Text(String),
    Parts(Vec<OpenRouterContentPart>),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterContentPart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: Option<String>,
    pub image_url: Option<OpenRouterImageUrl>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterImageUrl {
    pub url: String,
}

// OpenRouter Chat Completion Response Structs
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterChatResponse {
    pub id: String,
    pub model: String,
    pub choices: Vec<OpenRouterChoice>,
    pub usage: OpenRouterUsage,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterChoice {
    pub message: OpenRouterResponseMessage,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterResponseMessage {
    pub role: String,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenRouterUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
}

// OpenRouter Streaming Structs
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterStreamChunk {
    pub id: String,
    pub model: String,
    pub choices: Vec<OpenRouterStreamChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<OpenRouterUsage>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterStreamChoice {
    pub delta: OpenRouterStreamDelta,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterStreamDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}

// OpenRouter Transcription Response
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterTranscriptionResponse {
    pub text: String,
    #[serde(default)]
    pub usage: Option<OpenRouterUsage>,
}

// OpenRouter Client
pub struct OpenRouterClient {
    client: Client,
    api_key: String,
    base_url: String,
    request_id_counter: Arc<Mutex<u64>>,
    model_repository: Option<Arc<ModelRepository>>,
}

impl OpenRouterClient {
    pub fn new(app_settings: &AppSettings) -> Self {
        let api_key = app_settings.api_keys.openrouter_api_key.clone()
            .expect("OpenRouter API key must be configured");
        
        let client = Client::new();
        
        Self {
            client,
            api_key,
            base_url: OPENROUTER_BASE_URL.to_string(),
            request_id_counter: Arc::new(Mutex::new(0)),
            model_repository: None,
        }
    }

    pub fn with_base_url(mut self, base_url: String) -> Self {
        self.base_url = base_url;
        self
    }

    pub fn with_model_repository(mut self, repository: Arc<ModelRepository>) -> Self {
        self.model_repository = Some(repository);
        self
    }

    async fn get_next_request_id(&self) -> u64 {
        let mut counter = self.request_id_counter.lock().await;
        *counter += 1;
        *counter
    }

    // Chat Completions
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn chat_completion(&self, request: OpenRouterChatRequest, user_id: &str) -> Result<OpenRouterChatResponse, AppError> {
        let request_id = self.get_next_request_id().await;
        let url = format!("{}/chat/completions", self.base_url);
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("HTTP-Referer", "https://vibe-manager.app")
            .header("X-Title", "Vibe Manager")
            .header("Content-Type", "application/json")
            .header("X-Request-ID", request_id.to_string())
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenRouter request failed: {}", e.to_string())))?;
        
        let status = response.status();
        let headers = response.headers().clone();
        
        if !status.is_success() {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "OpenRouter request failed with status {}: {}",
                status, error_text
            )));
        }
        
        let result = response.json::<OpenRouterChatResponse>().await
            .map_err(|e| AppError::Internal(format!("OpenRouter deserialization failed: {}", e.to_string())))?;
            
        // Track token usage
        self.record_usage(&headers, &result, user_id, &request.model).await;
        
        Ok(result)
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn stream_chat_completion(
        &self, 
        request: OpenRouterChatRequest,
        user_id: &str
    ) -> Result<impl Stream<Item = Result<web::Bytes, AppError>>, AppError> {
        let request_id = self.get_next_request_id().await;
        let url = format!("{}/chat/completions", self.base_url);
        
        // Ensure stream is set to true
        let mut streaming_request = request.clone();
        streaming_request.stream = Some(true);
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("HTTP-Referer", "https://vibe-manager.app")
            .header("X-Title", "Vibe Manager")
            .header("Content-Type", "application/json")
            .header("X-Request-ID", request_id.to_string())
            .json(&streaming_request)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenRouter request failed: {}", e.to_string())))?;
        
        let status = response.status();
        let headers = response.headers().clone();
        
        if !status.is_success() {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "OpenRouter streaming request failed with status {}: {}",
                status, error_text
            )));
        }
        
        // Track the streaming request usage (async)
        let model_id = request.model.clone();
        let user_id = user_id.to_string();
        let model_repo = self.model_repository.clone();
        
        // Capture the usage data from headers for streaming requests
        if let Some(repo) = model_repo {
            tokio::spawn(async move {
                if let Err(e) = Self::record_streaming_usage_from_headers(&headers, &user_id, &model_id, repo).await {
                    error!("Failed to record streaming usage: {}", e);
                }
            });
        }
        
        // Return a stream that can be consumed by actix-web
        let stream = response.bytes_stream()
            .map(|result| {
                match result {
                    Ok(bytes) => Ok(web::Bytes::from(bytes)),
                    Err(e) => Err(AppError::External(format!("OpenRouter network error: {}", e.to_string()))),
                }
            });
            
        Ok(stream)
    }
    
    // Helper method to parse usage from a stream
    pub fn extract_usage_from_stream_chunk(chunk_str: &str) -> Option<OpenRouterUsage> {
        if chunk_str.trim().is_empty() || chunk_str.trim() == "[DONE]" {
            return None;
        }
        
        match serde_json::from_str::<OpenRouterStreamChunk>(chunk_str.trim()) {
            Ok(parsed) => parsed.usage,
            Err(_) => None,
        }
    }
    
    // Helper method to extract tokens from a stream chunk
    pub fn extract_tokens_from_stream_chunk(chunk_str: &str) -> Option<(i32, i32)> {
        Self::extract_usage_from_stream_chunk(chunk_str).map(|usage| 
            (usage.prompt_tokens, usage.completion_tokens)
        )
    }
    
    // Helper method to extract cost from a stream chunk
    pub fn extract_cost_from_stream_chunk(chunk_str: &str) -> Option<f64> {
        Self::extract_usage_from_stream_chunk(chunk_str).and_then(|usage| usage.cost)
    }

    // Audio Transcription
    #[instrument(skip(self, audio_data), fields(model = %model, filename = %filename))]
    pub async fn transcribe(
        &self,
        audio_data: &[u8],
        filename: &str,
        model: &str,
        user_id: &str,
    ) -> Result<OpenRouterTranscriptionResponse, AppError> {
        let request_id = self.get_next_request_id().await;
        let url = format!("{}/audio/transcriptions", self.base_url);
        
        // Create file part
        let file_part = {
            // Create a stream from the audio data
            let cursor = Cursor::new(audio_data.to_vec());
            let stream = FramedRead::new(cursor, BytesCodec::new())
                .map_ok(|bytes_mut| bytes_mut.freeze()) // Convert BytesMut to Bytes
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync + 'static>); // Box the error
            let body = Body::wrap_stream(stream);
            
            // Create the file part with content type based on file extension
            let content_type = match filename.split('.').last() {
                Some("mp3") => "audio/mpeg",
                Some("mp4") => "audio/mp4",
                Some("mpeg") => "audio/mpeg",
                Some("mpga") => "audio/mpeg",
                Some("m4a") => "audio/mp4",
                Some("wav") => "audio/wav",
                Some("webm") => "audio/webm",
                _ => "application/octet-stream",
            };
            
            multipart::Part::stream(body)
                .file_name(filename.to_string())
                .mime_str(content_type)
                .map_err(|e| AppError::Internal(format!("OpenRouter request preparation failed: {}", e.to_string())))?
        };
        
        // Create model part
        let model_part = multipart::Part::text(model.to_string());
        
        // Create the multipart form
        let form = multipart::Form::new()
            .part("file", file_part)
            .part("model", model_part);
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("HTTP-Referer", "https://vibe-manager.app")
            .header("X-Title", "Vibe Manager")
            .header("X-Request-ID", request_id.to_string())
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenRouter request failed: {}", e.to_string())))?;
        
        let status = response.status();
        let headers = response.headers().clone();
        
        if !status.is_success() {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "OpenRouter transcription request failed with status {}: {}",
                status, error_text
            )));
        }
        
        let result = response.json::<OpenRouterTranscriptionResponse>().await
            .map_err(|e| AppError::Internal(format!("OpenRouter deserialization failed: {}", e.to_string())))?;
         
        // Track token usage
        self.record_transcription_usage(&headers, &result, user_id, model).await;
            
        Ok(result)
    }
    
    // Convert a generic JSON Value into an OpenRouterChatRequest
    pub fn convert_to_chat_request(&self, payload: Value) -> Result<OpenRouterChatRequest, AppError> {
        serde_json::from_value(payload)
            .map_err(|e| AppError::Internal(format!("OpenRouter deserialization failed: Failed to convert payload to chat request: {}", e)))
    }
    
    // Helper functions for token and usage tracking
    pub fn extract_tokens_from_response(&self, response: &OpenRouterChatResponse) -> (i32, i32) {
        (response.usage.prompt_tokens, response.usage.completion_tokens)
    }
    
    pub fn extract_cost_from_response(&self, response: &OpenRouterChatResponse) -> Option<f64> {
        response.usage.cost
    }
    
    pub fn extract_tokens_from_transcription(&self, response: &OpenRouterTranscriptionResponse) -> (i32, i32) {
        match &response.usage {
            Some(usage) => (usage.prompt_tokens, usage.completion_tokens),
            None => (0, 0),
        }
    }
    
    pub fn extract_cost_from_transcription(&self, response: &OpenRouterTranscriptionResponse) -> Option<f64> {
        response.usage.as_ref().and_then(|usage| usage.cost)
    }
    
    // Record usage from response headers and body
    #[instrument(skip(self, headers, response), fields(user_id = %user_id, model_id = %model_id))]
    async fn record_usage(&self, headers: &HeaderMap, response: &OpenRouterChatResponse, user_id: &str, model_id: &str) {
        if let Some(repo) = &self.model_repository {
            // Extract token usage from response
            let (input_tokens, output_tokens) = self.extract_tokens_from_response(response);
            let total_tokens = input_tokens + output_tokens;
            
            // Extract cost from response or calculate from model price
            let cost = response.usage.cost.unwrap_or_else(|| {
                // If cost is not provided, we'll need to calculate it later
                0.0
            });
            
            // Extract processing time from headers
            let processing_ms = headers
                .get("openai-processing-ms")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<i32>().ok());
            
            // Create usage record
            let usage = ApiUsageCreateDto {
                user_id: user_id.to_string(),
                model_id: model_id.to_string(),
                input_tokens,
                output_tokens,
                total_tokens,
                cost,
                processing_ms,
            };
            
            // Record usage in database
            match repo.record_usage(usage).await {
                Ok(_) => debug!("Recorded API usage for user {}: {} tokens", user_id, total_tokens),
                Err(e) => error!("Failed to record API usage: {}", e),
            }
        }
    }
    
    // Record transcription usage
    #[instrument(skip(self, headers, response), fields(user_id = %user_id, model_id = %model_id))]
    async fn record_transcription_usage(&self, headers: &HeaderMap, response: &OpenRouterTranscriptionResponse, user_id: &str, model_id: &str) {
        if let Some(repo) = &self.model_repository {
            // Extract token usage from response
            let (input_tokens, output_tokens) = self.extract_tokens_from_transcription(response);
            let total_tokens = input_tokens + output_tokens;
            
            // Extract cost from response or calculate from model price
            let cost = self.extract_cost_from_transcription(response).unwrap_or(0.0);
            
            // Extract processing time from headers
            let processing_ms = headers
                .get("openai-processing-ms")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<i32>().ok());
            
            // Create usage record
            let usage = ApiUsageCreateDto {
                user_id: user_id.to_string(),
                model_id: model_id.to_string(),
                input_tokens,
                output_tokens,
                total_tokens,
                cost,
                processing_ms,
            };
            
            // Record usage in database
            match repo.record_usage(usage).await {
                Ok(_) => debug!("Recorded transcription usage for user {}: {} tokens", user_id, total_tokens),
                Err(e) => error!("Failed to record transcription usage: {}", e),
            }
        }
    }
    
    // Record streaming usage from headers (for streaming requests)
    #[instrument(skip(headers, repository), fields(user_id = %user_id, model_id = %model_id))]
    async fn record_streaming_usage_from_headers(
        headers: &HeaderMap, 
        user_id: &str, 
        model_id: &str,
        repository: Arc<ModelRepository>
    ) -> Result<(), AppError> {
        // Extract usage from x-ratelimit-limit-tokens and x-ratelimit-reset-tokens headers
        let ratelimit_usage = headers
            .get("x-ratelimit-usage")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_string());
            
        // Extract tokens from headers if available
        let (input_tokens, output_tokens) = if let Some(usage) = ratelimit_usage {
            // Parse usage string like "prompt_tokens=15,completion_tokens=10"
            let mut prompt_tokens = 0;
            let mut completion_tokens = 0;
            
            for part in usage.split(',') {
                if let Some((key, value)) = part.split_once('=') {
                    match key.trim() {
                        "prompt_tokens" => {
                            if let Ok(tokens) = value.trim().parse::<i32>() {
                                prompt_tokens = tokens;
                            }
                        },
                        "completion_tokens" => {
                            if let Ok(tokens) = value.trim().parse::<i32>() {
                                completion_tokens = tokens;
                            }
                        },
                        _ => {},
                    }
                }
            }
            
            (prompt_tokens, completion_tokens)
        } else {
            // Default values if headers are not available
            (0, 0)
        };
        
        let total_tokens = input_tokens + output_tokens;
        
        // Extract processing time
        let processing_ms = headers
            .get("openai-processing-ms")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<i32>().ok());
            
        // Create usage record with cost calculated later
        let usage = ApiUsageCreateDto {
            user_id: user_id.to_string(),
            model_id: model_id.to_string(),
            input_tokens,
            output_tokens,
            total_tokens,
            cost: 0.0, // We'll calculate this based on model prices later
            processing_ms,
        };
        
        // Record usage in database
        match repository.record_usage(usage).await {
            Ok(_) => {
                debug!("Recorded streaming API usage for user {}: {} tokens", user_id, total_tokens);
                Ok(())
            },
            Err(e) => {
                error!("Failed to record streaming API usage: {}", e);
                Err(AppError::Internal(format!("Failed to record streaming API usage: {}", e)))
            }
        }
    }
}

impl Clone for OpenRouterClient {
    fn clone(&self) -> Self {
        Self {
            client: Client::new(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
            model_repository: self.model_repository.clone(),
        }
    }
}