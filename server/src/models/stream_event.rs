use super::error_details::ErrorDetails;
use crate::clients::open_router_client::OpenRouterStreamChunk;
use serde::{Deserialize, Serialize};

/// Usage update information sent during streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    StreamStarted {
        #[serde(rename = "requestId")]
        request_id: String,
    },
    /// Stream was cancelled
    StreamCancelled {
        #[serde(rename = "requestId")]
        request_id: String,
        reason: String,
    },
    /// Detailed error information
    ErrorDetails {
        #[serde(rename = "requestId")]
        request_id: String,
        error: ErrorDetails,
    },
    /// Stream has completed successfully
    StreamCompleted {
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "finalCost")]
        final_cost: f64,
        #[serde(rename = "tokensInput")]
        tokens_input: i64,
        #[serde(rename = "tokensOutput")]
        tokens_output: i64,
        #[serde(rename = "cacheReadTokens")]
        cache_read_tokens: i64,
        #[serde(rename = "cacheWriteTokens")]
        cache_write_tokens: i64,
    },
}
