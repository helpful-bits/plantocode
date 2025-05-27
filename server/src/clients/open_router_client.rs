use crate::error::AppError;
use bytes::Bytes;
use actix_web::{web, HttpResponse};
use futures_util::{Stream, StreamExt, TryStreamExt};
use reqwest::{Client, Body, multipart, Response, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::io::Cursor;
use tokio_util::codec::{BytesCodec, FramedRead};
use uuid::Uuid;
use crate::config::settings::AppSettings;
use tracing::{debug, info, warn, error, instrument};
use chrono::Utc;

// Base URL for OpenRouter API
const OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";

// OpenRouter Chat Completion Request Structs
#[skip_serializing_none]
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

#[skip_serializing_none]
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

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterChoice {
    pub message: OpenRouterResponseMessage,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterResponseMessage {
    pub role: String,
    pub content: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenRouterUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub cost: Option<f64>,
}

// OpenRouter Streaming Structs
#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterStreamChunk {
    pub id: String,
    pub model: String,
    pub choices: Vec<OpenRouterStreamChoice>,
    pub usage: Option<OpenRouterUsage>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterStreamChoice {
    pub delta: OpenRouterStreamDelta,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenRouterStreamDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}


// OpenRouter Client
pub struct OpenRouterClient {
    client: Client,
    api_key: String,
    base_url: String,
    request_id_counter: Arc<Mutex<u64>>,
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
        }
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
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn chat_completion(&self, request: OpenRouterChatRequest, user_id: &str) -> Result<(OpenRouterChatResponse, HeaderMap), AppError> {
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
            
        
        Ok((result, headers))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request), fields(model = %request.model, user_id = %user_id))]
    pub async fn stream_chat_completion(
        &self, 
        request: OpenRouterChatRequest,
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
            let url = format!("{}/chat/completions", base_url);
            
            // Ensure stream is set to true
            let mut streaming_request = request.clone();
            streaming_request.stream = Some(true);
            
            let response = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
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
            
            // Return a stream that can be consumed by actix-web
            let stream = response.bytes_stream()
                .map(|result| {
                    match result {
                        Ok(bytes) => Ok(web::Bytes::from(bytes)),
                        Err(e) => Err(AppError::External(format!("OpenRouter network error: {}", e.to_string()))),
                    }
                });
                
            let boxed_stream: Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>> = Box::pin(stream);
            Ok((headers, boxed_stream))
        }.await?;
        
        Ok(result)
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

    
    // Convert a generic JSON Value into an OpenRouterChatRequest
    pub fn convert_to_chat_request(&self, payload: Value) -> Result<OpenRouterChatRequest, AppError> {
        serde_json::from_value(payload)
            .map_err(|e| AppError::BadRequest(format!("Failed to convert payload to chat request: {}", e)))
    }
    
    // Helper functions for token and usage tracking
    pub fn extract_tokens_from_response(&self, response: &OpenRouterChatResponse) -> (i32, i32) {
        (response.usage.prompt_tokens, response.usage.completion_tokens)
    }
    
    pub fn extract_cost_from_response(&self, response: &OpenRouterChatResponse) -> Option<f64> {
        response.usage.cost
    }
    
    
    
    
}

impl Clone for OpenRouterClient {
    fn clone(&self) -> Self {
        Self {
            client: Client::new(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}