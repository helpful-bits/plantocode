use crate::error::AppError;
use reqwest::Client;
use tokio::time::{Duration, Instant, sleep};
use tracing::{error, info, warn};

use super::structs::OpenAIResponsesResponse;

pub async fn wait_until_complete(
    client: &Client,
    api_key: &str,
    base_url: &str,
    response_id: &str,
) -> Result<OpenAIResponsesResponse, AppError> {
    let start_time = Instant::now();
    let max_duration = Duration::from_secs(1800); // 30 minutes total
    let early_timeout = Duration::from_secs(600); // 10 minutes for detecting stuck requests
    let mut retry_count = 0;
    let max_retries = 900; // 30 minutes / 2 seconds = 900 attempts
    let mut consecutive_queued_count = 0;

    loop {
        // Check if we've exceeded maximum duration
        if start_time.elapsed() > max_duration {
            error!(
                "Web search polling timeout after 30 minutes for response_id: {}",
                response_id
            );
            return Err(AppError::External(format!(
                "Web search timeout after 30 minutes. The search is taking longer than expected."
            )));
        }

        // Check retry count
        if retry_count >= max_retries {
            error!(
                "Web search polling exceeded maximum retries ({}) for response_id: {}",
                max_retries, response_id
            );
            return Err(AppError::External(format!(
                "Web search exceeded maximum polling attempts. Please try again."
            )));
        }
        let url = format!("{}/responses/{}", base_url, response_id);
        let response = client
            .get(&url)
            .bearer_auth(api_key)
            .send()
            .await
            .map_err(|e| AppError::External(format!("Failed to poll response: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get polling error response".to_string());

            // Provide helpful error messages based on status code
            let error_message = match status.as_u16() {
                429 => format!(
                    "Rate limit exceeded during web search polling.\n\n\
                    Details: {}\n\n\
                    The search request is queued but cannot proceed due to rate limits.\n\
                    Please wait a few minutes and try again.",
                    error_text
                ),
                503 => format!(
                    "OpenAI service temporarily unavailable during web search.\n\n\
                    Details: {}\n\n\
                    The service is experiencing high load. Please try again in a few minutes.",
                    error_text
                ),
                _ => format!(
                    "Web search polling failed (status {}).\n\n\
                    Details: {}",
                    status, error_text
                ),
            };

            return Err(AppError::External(error_message));
        }

        // Debug: log the raw response before parsing
        let response_text = response
            .text()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to read polling response: {}", e)))?;

        let responses_response: OpenAIResponsesResponse = serde_json::from_str(&response_text)
            .map_err(|e| {
                AppError::Internal(format!(
                    "Failed to parse polling response: {} - Body: {}",
                    e, response_text
                ))
            })?;

        // Log polling status periodically
        if retry_count % 30 == 0 && retry_count > 0 {
            let elapsed_mins = start_time.elapsed().as_secs() / 60;
            info!(
                "Web search still polling: response_id={}, status={}, elapsed_mins={}, attempts={}",
                response_id, responses_response.status, elapsed_mins, retry_count
            );
        }

        match responses_response.status.as_str() {
            "completed" => {
                let elapsed_secs = start_time.elapsed().as_secs();
                info!(
                    "Web search completed: response_id={}, elapsed_secs={}, attempts={}",
                    response_id, elapsed_secs, retry_count
                );
                return Ok(responses_response);
            }
            "failed" | "cancelled" => {
                return Err(AppError::External(format!(
                    "Response job failed with status: {}",
                    responses_response.status
                )));
            }
            "queued" => {
                consecutive_queued_count += 1;

                // Check for early timeout - if still queued after 10 minutes, likely stuck
                if start_time.elapsed() > early_timeout && consecutive_queued_count > 150 {
                    warn!(
                        "Request appears stuck in queued state after 2 minutes: response_id={}",
                        response_id
                    );

                    // Try to cancel the stuck request
                    let cancel_url = format!("{}/responses/{}/cancel", base_url, response_id);
                    let _ = client.post(&cancel_url).bearer_auth(api_key).send().await;

                    return Err(AppError::External(format!(
                        "Web search request appears stuck (queued for {} minutes). This may be due to:\n\n\
                        • High API load - Please try again in a few minutes\n\
                        • Rate limits on your account\n\
                        • Service degradation\n\n\
                        The request has been cancelled. Please retry your search.",
                        start_time.elapsed().as_secs() / 60
                    )));
                }
                // Use exponential backoff with jitter, capped at 5 seconds
                let base_delay: f64 = 2.0;
                let backoff_factor: f64 = 1.1;
                let max_delay: f64 = 5.0;
                let jitter: f64 = 0.5;

                let delay = (base_delay * backoff_factor.powi((retry_count / 10).min(5) as i32))
                    .min(max_delay)
                    + (rand::random::<f64>() * jitter);

                sleep(Duration::from_secs_f64(delay)).await;
                retry_count += 1;
                continue;
            }
            "in_progress" => {
                // Reset queued counter when we see progress
                consecutive_queued_count = 0;
            }
            _ => {
                warn!(
                    "Unexpected response status '{}' for response_id: {}",
                    responses_response.status, response_id
                );
                sleep(Duration::from_secs(2)).await;
                retry_count += 1;
                continue;
            }
        }
    }
}
