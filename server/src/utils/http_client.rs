use reqwest::Client;
use std::time::Duration;

pub fn new_api_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(1740)) // 29 minutes to support long-running AI API calls
        .connect_timeout(Duration::from_secs(180)) // 3 minutes for initial connection
        // Set to 240 seconds (4 minutes) - less than server's 5-minute keep-alive timeout to prevent reusing stale connections
        .pool_idle_timeout(Some(Duration::from_secs(240)))
        .tcp_keepalive(Duration::from_secs(60))
        .build()
        .expect("Failed to build HTTP client")
}