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
/// 
/// ## Cost Calculation Authority
/// 
/// **IMPORTANT**: The `cost` field within the `OpenRouterUsage` struct returned by both
/// `chat_completion` and `chat_completion_stream` methods contains the final, server-authoritative
/// cost calculation. This cost should be treated as the single source of truth for:
/// - User-facing cost display
/// - Billing calculations
/// - Usage tracking and analytics
/// 
/// The desktop client should NEVER perform local cost calculations or attempt to override
/// the server-provided cost values. All cost-related logic must defer to the server's
/// authoritative calculations to ensure consistency across the application.
#[async_trait]
pub trait ApiClient: Send + Sync {
    /// Send a completion request with messages and get a response
    /// 
    /// The returned `OpenRouterResponse.usage.cost` field contains the server-authoritative
    /// cost and should be used as the ground truth for billing purposes.
    async fn chat_completion(
        &self, 
        messages: Vec<crate::models::OpenRouterRequestMessage>, 
        options: ApiClientOptions
    ) -> AppResult<OpenRouterResponse>;
    
    /// Send a streaming completion request with messages and get a stream of chunks
    /// 
    /// The final stream chunk's `OpenRouterStreamChunk.usage.cost` field contains the
    /// server-authoritative cost and should be used as the ground truth for billing purposes.
    async fn chat_completion_stream(
        &self,
        messages: Vec<crate::models::OpenRouterRequestMessage>,
        options: ApiClientOptions,
    ) -> AppResult<Pin<Box<dyn Stream<Item = AppResult<OpenRouterStreamChunk>> + Send>>>;
}

// Transcription service trait
#[async_trait]
pub trait TranscriptionClient: Send + Sync {
    /// Transcribe audio data
    async fn transcribe(&self, audio_data: &[u8], filename: &str, model: &str, duration_ms: i64, language: Option<&str>) -> AppResult<String>;
}