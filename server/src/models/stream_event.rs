use super::error_details::ErrorDetails;
use crate::clients::open_router_client::OpenRouterStreamChunk;
use serde::{Deserialize, Serialize};

/// Usage update information sent during streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageUpdate {
    pub request_id: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub cache_read_tokens: Option<i64>,
    pub cache_write_tokens: Option<i64>,
    pub estimated_cost: f64,
    pub tokens_total: i64,
    pub is_final: bool,
}

/// Strongly-typed streaming events for SSE communication
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum StreamEvent {
    /// Content chunk from the model
    ContentChunk(OpenRouterStreamChunk),
    /// Usage update with token counts and cost
    UsageUpdate(UsageUpdate),
    /// Stream has started
    StreamStarted { request_id: String },
    /// Stream was cancelled
    StreamCancelled { request_id: String, reason: String },
    /// Detailed error information
    ErrorDetails {
        request_id: String,
        error: ErrorDetails,
    },
    /// Stream has completed successfully
    StreamCompleted {
        request_id: String,
        final_cost: f64,
        tokens_input: i64,
        tokens_output: i64,
        cache_read_tokens: i64,
        cache_write_tokens: i64,
    },
}
