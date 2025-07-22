use super::{OpenRouterStreamChunk, error_details::ErrorDetails, usage_update::UsageUpdate};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "event", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum StreamEvent {
    ContentChunk(OpenRouterStreamChunk),
    UsageUpdate(UsageUpdate),
    StreamStarted {
        request_id: String,
    },
    StreamCancelled {
        request_id: String,
        reason: String,
    },
    // Note: error_details variant uses snake_case, but the ErrorDetails struct itself uses camelCase
    // This matches the server's serialization format
    ErrorDetails {
        request_id: String,
        error: ErrorDetails,
    },
    // Indicates the stream has completed successfully with final cost data
    StreamCompleted {
        request_id: String,
        final_cost: f64,
        tokens_input: i64,
        tokens_output: i64,
        cache_read_tokens: i64,
        cache_write_tokens: i64,
    },
}
