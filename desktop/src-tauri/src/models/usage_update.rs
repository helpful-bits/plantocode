use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageUpdate {
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub cache_read_tokens: Option<i64>,
    pub cache_write_tokens: Option<i64>,
    pub estimated_cost: f64,
    pub tokens_total: i64,
}