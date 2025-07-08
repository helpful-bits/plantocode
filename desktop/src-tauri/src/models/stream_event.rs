use serde::{Deserialize, Serialize};
use super::{OpenRouterStreamChunk, usage_update::UsageUpdate};

/// Represents different types of events that can occur during streaming
#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// Regular content chunk from the LLM
    ContentChunk(OpenRouterStreamChunk),
    /// Usage update with incremental token and cost information
    UsageUpdate(UsageUpdate),
}