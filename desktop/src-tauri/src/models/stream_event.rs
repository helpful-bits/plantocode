use super::{OpenRouterStreamChunk, usage_update::UsageUpdate, error_details::ErrorDetails};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "event", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum StreamEvent {
    ContentChunk(OpenRouterStreamChunk),
    UsageUpdate(UsageUpdate),
    StreamStarted { request_id: String },
    StreamCancelled { 
        request_id: String, 
        reason: String 
    },
    // Note: error_details variant uses snake_case, but the ErrorDetails struct itself uses camelCase
    // This matches the server's serialization format
    ErrorDetails {
        request_id: String,
        error: ErrorDetails,
    },
    // Indicates the stream has completed successfully
    StreamCompleted,
}