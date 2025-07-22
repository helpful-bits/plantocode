use std::time::{SystemTime, UNIX_EPOCH};

/// Get current UTC timestamp in milliseconds
pub fn get_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
