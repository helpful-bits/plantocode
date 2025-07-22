use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SearchResult<T> {
    pub object: String,
    pub data: Vec<T>,
    pub has_more: bool,
    pub url: String,
    pub next_page: Option<String>,
    pub total_count: Option<i64>,
}