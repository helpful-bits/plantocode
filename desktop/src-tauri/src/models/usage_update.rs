use serde::{Deserialize, Serialize};

/// Usage update event sent by the server during streaming
/// Contains cumulative token counts and estimated cost
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct UsageUpdate {
    /// Event type (always "usage_update")
    #[serde(rename = "type")]
    pub event_type: String,
    /// Cumulative input tokens
    pub tokens_input: i64,
    /// Cumulative output tokens  
    pub tokens_output: i64,
    /// Total tokens (input + output)
    pub tokens_total: i64,
    /// Estimated cost as string
    pub estimated_cost: String,
}