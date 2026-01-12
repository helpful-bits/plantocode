use super::{OpenRouterStreamChunk, error_details::ErrorDetails, usage_update::UsageUpdate};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "event", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum StreamEvent {
    ContentChunk(OpenRouterStreamChunk),
    UsageUpdate(UsageUpdate),
    StreamStarted {
        #[serde(rename = "requestId")]
        request_id: String,
    },
    StreamCancelled {
        #[serde(rename = "requestId")]
        request_id: String,
        reason: String,
    },
    ErrorDetails {
        #[serde(rename = "requestId")]
        request_id: String,
        error: ErrorDetails,
    },
    // Indicates the stream has completed successfully with final cost data
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
