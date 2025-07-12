use super::{OpenRouterStreamChunk, usage_update::UsageUpdate};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "event", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum StreamEvent {
    ContentChunk(OpenRouterStreamChunk),
    UsageUpdate(UsageUpdate),
}