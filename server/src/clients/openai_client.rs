use reqwest::{Client, multipart::{Form, Part}, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use crate::config::settings::AppSettings;
use crate::error::AppError;
use base64::Engine;
use tracing::{debug, info, instrument};
use actix_web::web;
use futures_util::{Stream, StreamExt};
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Mutex;

// OpenAI API base URL
const OPENAI_BASE_URL: &str = "https://api.openai.com/v1";

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAITranscriptionResponse {
    pub text: String,
}

// OpenAI Chat Completion Request Structs
#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIChatRequest {
    pub model: String,
    pub messages: Vec<OpenAIMessage>,
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
pub struct OpenAIMessage {
    pub role: String,
    pub content: OpenAIContent,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum OpenAIContent {
    Text(String),
    Parts(Vec<OpenAIContentPart>),
}

#[skip_serializing_none]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIContentPart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: Option<String>,
    pub image_url: Option<OpenAIImageUrl>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIImageUrl {
    pub url: String,
    pub detail: Option<String>,
}

// OpenAI Chat Completion Response Structs
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIChatResponse {
    pub id: String,
    pub choices: Vec<OpenAIChoice>,
    pub created: Option<i64>,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<OpenAIUsage>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIChoice {
    pub message: OpenAIResponseMessage,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIResponseMessage {
    pub role: String,
    pub content: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OpenAIUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
}

// OpenAI Streaming Structs
#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIStreamChunk {
    pub id: String,
    pub choices: Vec<OpenAIStreamChoice>,
    pub created: Option<i64>,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<OpenAIUsage>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIStreamChoice {
    pub delta: OpenAIStreamDelta,
    pub index: i32,
    pub finish_reason: Option<String>,
}

#[skip_serializing_none]
#[derive(Debug, Deserialize, Serialize)]
pub struct OpenAIStreamDelta {
    pub role: Option<String>,
    pub content: Option<String>,
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

        let client = Client::new();
        let base_url = OPENAI_BASE_URL.to_string();

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
        request: OpenAIChatRequest
    ) -> Result<(OpenAIChatResponse, HeaderMap, i32, i32), AppError> {
        let request_id = self.get_next_request_id().await;
        let url = format!("{}/chat/completions", self.base_url);
        
        let response = self.client
            .post(&url)
            .bearer_auth(&self.api_key)
            .header("Content-Type", "application/json")
            .header("X-Request-ID", request_id.to_string())
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenAI request failed: {}", e)))?;
        
        let status = response.status();
        let headers = response.headers().clone();
        
        if !status.is_success() {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to get error response".to_string());
            return Err(AppError::External(format!(
                "OpenAI request failed with status {}: {}",
                status, error_text
            )));
        }
        
        let result = response.json::<OpenAIChatResponse>().await
            .map_err(|e| AppError::Internal(format!("OpenAI deserialization failed: {}", e)))?;
            
        let (prompt_tokens, completion_tokens) = if let Some(usage) = &result.usage {
            (usage.prompt_tokens, usage.completion_tokens)
        } else {
            (0, 0)
        };
        
        Ok((result, headers, prompt_tokens, completion_tokens))
    }

    // Streaming Chat Completions for actix-web compatibility
    #[instrument(skip(self, request), fields(model = %request.model))]
    pub async fn stream_chat_completion(
        &self, 
        request: OpenAIChatRequest
    ) -> Result<(HeaderMap, Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>>, Arc<Mutex<Option<(i32, i32)>>>), AppError> {
        // Clone necessary parts for 'static lifetime
        let client = self.client.clone();
        let api_key = self.api_key.clone();
        let base_url = self.base_url.clone();
        let request_id_counter = self.request_id_counter.clone();
        
        // Shared token counter for streaming
        let token_counter = Arc::new(Mutex::new(None::<(i32, i32)>));
        let token_counter_clone = token_counter.clone();
        
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
                .bearer_auth(&api_key)
                .header("Content-Type", "application/json")
                .header("X-Request-ID", request_id.to_string())
                .json(&streaming_request)
                .send()
                .await
                .map_err(|e| AppError::External(format!("OpenAI request failed: {}", e)))?;
            
            let status = response.status();
            let headers = response.headers().clone();
            
            if !status.is_success() {
                let error_text = response.text().await
                    .unwrap_or_else(|_| "Failed to get error response".to_string());
                return Err(AppError::External(format!(
                    "OpenAI streaming request failed with status {}: {}",
                    status, error_text
                )));
            }
            
            // Return a stream that can be consumed by actix-web
            let stream = response.bytes_stream()
                .map(move |result| {
                    match result {
                        Ok(bytes) => {
                            // Try to extract token information from chunk
                            if let Ok(chunk_str) = std::str::from_utf8(&bytes) {
                                if let Some((prompt_tokens, completion_tokens)) = Self::extract_tokens_from_chat_stream_chunk(chunk_str) {
                                    if let Ok(mut counter) = token_counter_clone.try_lock() {
                                        *counter = Some((prompt_tokens, completion_tokens));
                                    }
                                }
                            }
                            Ok(web::Bytes::from(bytes))
                        },
                        Err(e) => Err(AppError::External(format!("OpenAI network error: {}", e))),
                    }
                });
                
            let boxed_stream: Pin<Box<dyn Stream<Item = Result<web::Bytes, AppError>> + Send + 'static>> = Box::pin(stream);
            Ok((headers, boxed_stream))
        }.await?;
        
        Ok((result.0, result.1, token_counter))
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
    ) -> Result<String, AppError> {
        let url = format!("{}/audio/transcriptions", self.base_url);

        // Validate audio data
        if audio_data.is_empty() {
            return Err(AppError::Validation("Audio data cannot be empty".to_string()));
        }

        // Validate minimum size to filter out malformed chunks
        const MIN_FILE_SIZE: usize = 1000; // 1KB minimum
        if audio_data.len() < MIN_FILE_SIZE {
            return Err(AppError::Validation(format!(
                "Audio file too small ({}B < 1KB) - likely malformed",
                audio_data.len()
            )));
        }

        // Validate file size (25MB limit for OpenAI)
        const MAX_FILE_SIZE: usize = 25 * 1024 * 1024; // 25MB
        if audio_data.len() > MAX_FILE_SIZE {
            return Err(AppError::Validation(format!(
                "Audio file too large ({}MB > 25MB)",
                audio_data.len() / (1024 * 1024)
            )));
        }

        // Basic WebM header validation
        if filename.ends_with(".webm") && audio_data.len() >= 4 {
            // WebM files should start with EBML header (0x1A, 0x45, 0xDF, 0xA3)
            if audio_data[0] != 0x1A || audio_data[1] != 0x45 || audio_data[2] != 0xDF || audio_data[3] != 0xA3 {
                debug!("WebM header validation failed for {}: {:02X} {:02X} {:02X} {:02X}", 
                       filename, audio_data[0], audio_data[1], audio_data[2], audio_data[3]);
                return Err(AppError::Validation("Invalid WebM file format - missing EBML header".to_string()));
            }
        }

        // Create multipart form with proper filename - this is critical!
        let file_part = Part::bytes(audio_data.to_vec())
            .file_name(filename.to_string())  // Critical: GPT-4o needs the .webm extension
            .mime_str("audio/webm")           // Keep MIME simple, no codec parameters
            .map_err(|e| AppError::Validation(format!("Invalid audio mime type: {}", e)))?;

        let mut form = Form::new()
            .part("file", file_part)
            .text("model", model.to_string());

        // Add optional parameters
        if let Some(lang) = language {
            form = form.text("language", lang.to_string());
        }
        if let Some(p) = prompt {
            form = form.text("prompt", p.to_string());
        }
        if let Some(temp) = temperature {
            form = form.text("temperature", temp.to_string());
        }

        info!("Sending transcription request to OpenAI: {} ({} bytes)", filename, audio_data.len());
        debug!("Using model: {}, language: {:?}, prompt: {:?}, temperature: {:?}", 
               model, language, prompt, temperature);
        debug!("Audio data header (first 16 bytes): {:02X?}", &audio_data[..audio_data.len().min(16)]);

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| AppError::External(format!("OpenAI transcription request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::External(format!(
                "OpenAI transcription error ({}): {}",
                status,
                error_text
            )));
        }

        let transcription: OpenAITranscriptionResponse = response
            .json()
            .await
            .map_err(|e| AppError::External(format!("Failed to parse OpenAI transcription response: {}", e)))?;

        info!("Transcription successful: {} characters", transcription.text.len());
        Ok(transcription.text)
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
    ) -> Result<String, AppError> {
        // Extract base64 data from data URI
        let b64 = data_uri
            .split(',')
            .nth(1)
            .ok_or_else(|| AppError::Validation("Invalid data URI format".to_string()))?;

        // Decode base64 to bytes
        let audio_data = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| AppError::Validation(format!("Failed to decode base64 audio data: {}", e)))?;

        // Use the main transcription method
        self.transcribe_audio(&audio_data, filename, model, language, prompt, temperature).await
    }

    /// Transcribe audio from raw bytes
    pub async fn transcribe_from_bytes(
        &self,
        audio_data: &[u8],
        filename: &str,
        language: Option<&str>,
        prompt: Option<&str>,
        temperature: Option<f32>,
    ) -> Result<String, AppError> {
        // Use gpt-4o-mini-transcribe as default (cheaper option)
        self.transcribe_audio(
            audio_data,
            filename,
            "gpt-4o-mini-transcribe",
            language,
            prompt,
            temperature,
        ).await
    }

    /// Validate that the model is a supported transcription model
    pub fn validate_transcription_model(model: &str) -> Result<(), AppError> {
        const SUPPORTED_MODELS: &[&str] = &[
            "gpt-4o-transcribe",
            "gpt-4o-mini-transcribe",
        ];

        if !SUPPORTED_MODELS.contains(&model) {
            return Err(AppError::Validation(format!(
                "Unsupported transcription model: {}. Supported: {}",
                model,
                SUPPORTED_MODELS.join(", ")
            )));
        }

        Ok(())
    }

    // Helper method to parse usage from a chat completion stream chunk
    pub fn extract_usage_from_chat_stream_chunk(chunk_str: &str) -> Option<OpenAIUsage> {
        // OpenAI streams are Server-Sent Events format
        for line in chunk_str.lines() {
            if line.starts_with("data: ") {
                let json_str = &line[6..]; // Remove "data: " prefix
                if json_str.trim() == "[DONE]" {
                    continue;
                }
                
                match serde_json::from_str::<OpenAIStreamChunk>(json_str.trim()) {
                    Ok(parsed) => {
                        if let Some(usage) = parsed.usage {
                            return Some(usage);
                        }
                    },
                    Err(_) => continue,
                }
            }
        }
        None
    }
    
    // Helper method to extract tokens from a chat completion stream chunk
    pub fn extract_tokens_from_chat_stream_chunk(chunk_str: &str) -> Option<(i32, i32)> {
        Self::extract_usage_from_chat_stream_chunk(chunk_str).map(|usage| 
            (usage.prompt_tokens, usage.completion_tokens)
        )
    }

    // Convert a generic JSON Value into an OpenAIChatRequest
    pub fn convert_to_chat_request(&self, payload: Value) -> Result<OpenAIChatRequest, AppError> {
        serde_json::from_value(payload)
            .map_err(|e| AppError::BadRequest(format!("Failed to convert payload to OpenAI chat request: {}", e)))
    }
    
    // Helper functions for token and usage tracking
    pub fn extract_tokens_from_chat_response(&self, response: &OpenAIChatResponse) -> (i32, i32) {
        if let Some(usage) = &response.usage {
            (usage.prompt_tokens, usage.completion_tokens)
        } else {
            (0, 0)
        }
    }
}

impl Clone for OpenAIClient {
    fn clone(&self) -> Self {
        Self {
            client: Client::new(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            request_id_counter: self.request_id_counter.clone(),
        }
    }
}