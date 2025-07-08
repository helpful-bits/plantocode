use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandardizedUsageResponse {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub cache_write_tokens: i32,
    pub cache_read_tokens: i32,
    pub cached_input_tokens: i32,
    pub cost: Option<f64>,
}