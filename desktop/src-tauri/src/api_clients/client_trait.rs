use async_trait::async_trait;
use std::pin::Pin;
use futures::Stream;
use serde_json::Value;

use crate::error::AppResult;
use crate::models::{OpenRouterResponse, OpenRouterStreamChunk};

/// Common options for API clients
#[derive(Debug, Clone)]
pub struct ApiClientOptions {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub stream: bool,
}

// Default implementation removed to force explicit model configuration

/// Common trait for all API clients
#[async_trait]
pub trait ApiClient: Send + Sync {
    /// Send a completion request and get a response
    async fn complete(&self, prompt: &str, options: ApiClientOptions) -> AppResult<OpenRouterResponse>;
    
    /// Send a completion request with messages and get a response
    async fn chat_completion(
        &self, 
        messages: Vec<crate::models::OpenRouterRequestMessage>, 
        options: ApiClientOptions
    ) -> AppResult<OpenRouterResponse>;
    
    /// Send a streaming completion request and get a stream of chunks
    async fn stream_complete(
        &self,
        prompt: &str,
        options: ApiClientOptions,
    ) -> AppResult<Pin<Box<dyn Stream<Item = AppResult<OpenRouterStreamChunk>> + Send>>>;
}

// Transcription service trait
#[async_trait]
pub trait TranscriptionClient: Send + Sync {
    /// Transcribe audio data
    async fn transcribe(&self, audio_data: &[u8], filename: &str, model: &str, duration_ms: i64) -> AppResult<String>;
}