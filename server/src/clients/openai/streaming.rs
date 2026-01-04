use crate::error::AppError;
use actix_web::web;
use futures_util::{Stream, StreamExt};
use reqwest::Client;
use std::pin::Pin;
use tokio::time::{Duration, Instant, sleep};
use tracing::{error, info};

use super::structs::{OpenAIResponsesResponse, OpenAIResponsesUsage, StreamState};

/// UTF-8 safe string splitting that preserves character boundaries
/// Splits string at a safe position, preferring whitespace boundaries
pub fn utf8_safe_split(text: &str, target_chars: usize) -> (String, String) {
    if text.chars().count() <= target_chars {
        return (text.to_string(), String::new());
    }

    // Convert to char boundaries for safe splitting
    let char_indices: Vec<(usize, char)> = text.char_indices().collect();

    if char_indices.len() <= target_chars {
        return (text.to_string(), String::new());
    }

    // Find ideal split position (prefer whitespace)
    let mut split_index = target_chars.min(char_indices.len() - 1);

    // Look backwards from target position for whitespace
    for i in (target_chars / 2..split_index).rev() {
        if i < char_indices.len() && char_indices[i].1.is_whitespace() {
            split_index = i + 1; // Include the whitespace in first part
            break;
        }
    }

    // Get byte indices for safe string slicing
    let split_byte_index = if split_index < char_indices.len() {
        char_indices[split_index].0
    } else {
        text.len()
    };

    // Split at character boundary (UTF-8 safe)
    let chunk = text[..split_byte_index].to_string();
    let remaining = text[split_byte_index..].to_string();

    (chunk, remaining)
}

/// Creates a Chat Completions format SSE chunk for streaming
pub fn create_chat_completion_chunk(
    response_id: &str,
    model: &str,
    content: &str,
    is_final: bool,
    usage: Option<(i32, i32)>,
) -> String {
    let chunk = if is_final {
        serde_json::json!({
            "id": response_id,
            "object": "chat.completion.chunk",
            "created": chrono::Utc::now().timestamp(),
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": "stop"
            }],
            "usage": usage.map(|(input, output)| serde_json::json!({
                "prompt_tokens": input,
                "completion_tokens": output,
                "total_tokens": input + output
            }))
        })
    } else {
        serde_json::json!({
            "id": response_id,
            "object": "chat.completion.chunk",
            "created": chrono::Utc::now().timestamp(),
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {
                    "content": content
                },
                "finish_reason": null
            }]
        })
    };

    format!(
        "data: {}\n\n",
        serde_json::to_string(&chunk).unwrap_or_default()
    )
}

/// Extracts content from OpenAI Responses API output structure
/// Iterates ALL output items and ALL content parts to aggregate text
/// This fixes the "Empty content" issue for o4-mini, gpt-5-mini, gpt-5-nano models
pub fn extract_content_from_responses(response: &OpenAIResponsesResponse) -> String {
    // Log built-in tool calls for debugging
    if let Some(tool_calls) = &response.built_in_tool_calls {
        tracing::debug!("Built-in tool calls: {:?}", tool_calls);
    }

    // Log reasoning for debugging
    if let Some(reasoning) = &response.reasoning {
        // Check if reasoning summary is empty and log appropriately
        if let Some(summary_value) = reasoning.get("summary") {
            if let Some(summary_array) = summary_value.as_array() {
                if summary_array.is_empty() {
                    tracing::warn!(
                        "Reasoning summary is empty array - model may not be populating reasoning correctly"
                    );
                } else {
                    tracing::debug!("Reasoning summary contains {} items", summary_array.len());
                }
            } else {
                tracing::debug!("Reasoning: {:?}", reasoning);
            }
        } else {
            tracing::debug!("Reasoning: {:?}", reasoning);
        }
    }

    let mut accumulated_text = String::new();

    // Iterate through ALL output items and ALL content parts
    if let Some(outputs) = &response.output {
        for output in outputs {
            if output.get("type").and_then(|t| t.as_str()) == Some("message") {
                if let Some(content_array) = output.get("content").and_then(|c| c.as_array()) {
                    for content_item in content_array {
                        let content_type = content_item.get("type").and_then(|t| t.as_str());
                        match content_type {
                            Some("output_text") => {
                                if let Some(text) = content_item.get("text").and_then(|t| t.as_str()) {
                                    if !accumulated_text.is_empty() {
                                        accumulated_text.push('\n');
                                    }
                                    accumulated_text.push_str(text);
                                }
                            }
                            Some("refusal") => {
                                if let Some(text) = content_item.get("refusal").and_then(|t| t.as_str()) {
                                    if !accumulated_text.is_empty() {
                                        accumulated_text.push('\n');
                                    }
                                    accumulated_text.push_str(text);
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    // Fallback: check response.extra["output_text"] if accumulator is empty
    if accumulated_text.is_empty() {
        if let Some(output_text) = response.extra.get("output_text").and_then(|v| v.as_str()) {
            accumulated_text.push_str(output_text);
        }
    }

    accumulated_text
}

pub fn create_deep_research_stream(
    client: Client,
    api_key: String,
    base_url: String,
    response_id: String,
    model: String,
) -> impl Stream<Item = Result<web::Bytes, AppError>> + Send + 'static {
    use futures_util::stream::{self, StreamExt};

    stream::unfold(StreamState::Starting, move |state| {
        let client = client.clone();
        let api_key = api_key.clone();
        let base_url = base_url.clone();
        let response_id = response_id.clone();
        let model = model.clone();

        async move {
            match state {
                StreamState::Starting => {
                    // Log the start of web search polling
                    info!(
                        "Starting web search polling for response_id: {}",
                        response_id
                    );

                    // Send initial chunk
                    let initial_chunk = create_chat_completion_chunk(
                        &response_id,
                        &model,
                        "Deep research analysis starting...",
                        false,
                        None,
                    );
                    Some((
                        Ok(web::Bytes::from(initial_chunk)),
                        StreamState::Polling {
                            last_update: Instant::now(),
                            poll_count: 0,
                            start_time: Instant::now(),
                            consecutive_queued: 0,
                        },
                    ))
                }

                StreamState::Polling {
                    last_update,
                    poll_count,
                    start_time,
                    consecutive_queued,
                } => {
                    // Check for early timeout (10 minutes) if stuck in queued
                    if start_time.elapsed() > Duration::from_secs(600) && consecutive_queued > 150 {
                        error!(
                            "Request appears stuck in queued state after 10 minutes: response_id={}",
                            response_id
                        );

                        // Try to cancel the stuck request
                        let cancel_url = format!("{}/responses/{}/cancel", base_url, response_id);
                        let _ = client.post(&cancel_url).bearer_auth(&api_key).send().await;

                        let error_chunk = create_chat_completion_chunk(
                            &response_id,
                            &model,
                            "Search request appears stuck. This may be due to high API load or rate limits. The request has been cancelled - please try again.",
                            true,
                            None,
                        );
                        return Some((Ok(web::Bytes::from(error_chunk)), StreamState::Completed));
                    }

                    // Check for maximum polling duration (30 minutes)
                    if start_time.elapsed() > Duration::from_secs(1800) {
                        error!(
                            "Web search polling timeout after 30 minutes for response_id: {}",
                            response_id
                        );
                        let error_chunk = create_chat_completion_chunk(
                            &response_id,
                            &model,
                            "Web search timeout: The search took longer than the maximum allowed time. Please try a more specific query.",
                            true,
                            None,
                        );
                        return Some((Ok(web::Bytes::from(error_chunk)), StreamState::Completed));
                    }

                    // Send keep-alive comment every 500ms
                    if last_update.elapsed() < Duration::from_secs(3) {
                        sleep(Duration::from_millis(500)).await;
                        // Send SSE comment for keep-alive
                        return Some((
                            Ok(web::Bytes::from(": keepalive\n\n")),
                            StreamState::Polling {
                                last_update,
                                poll_count,
                                start_time,
                                consecutive_queued,
                            },
                        ));
                    }

                    // Poll the background job
                    let poll_url = format!("{}/responses/{}", base_url, response_id);
                    match client.get(&poll_url).bearer_auth(&api_key).send().await {
                        Ok(poll_response) => {
                            if let Ok(response_text) = poll_response.text().await {
                                if let Ok(responses_response) =
                                    serde_json::from_str::<OpenAIResponsesResponse>(&response_text)
                                {
                                    match responses_response.status.as_str() {
                                        "completed" => {
                                            // Extract content and prepare for streaming
                                            let content =
                                                extract_content_from_responses(&responses_response);

                                            Some((
                                                Ok(web::Bytes::from("")), // Transition chunk
                                                StreamState::ContentReady {
                                                    content,
                                                    usage: responses_response.usage,
                                                },
                                            ))
                                        }
                                        "failed" | "cancelled" => {
                                            // Extract more detailed error information if available from extra fields
                                            let error_message = if let Some(error) =
                                                responses_response.extra.get("error")
                                            {
                                                error
                                                    .get("message")
                                                    .and_then(|m| m.as_str())
                                                    .unwrap_or(&format!(
                                                        "Research {}: Unknown error",
                                                        responses_response.status
                                                    ))
                                                    .to_string()
                                            } else {
                                                format!(
                                                    "Research {}: No error details available",
                                                    responses_response.status
                                                )
                                            };

                                            let error_chunk = create_chat_completion_chunk(
                                                &response_id,
                                                &model,
                                                &error_message,
                                                true,
                                                None,
                                            );
                                            Some((
                                                Ok(web::Bytes::from(error_chunk)),
                                                StreamState::Completed,
                                            ))
                                        }
                                        _ => {
                                            // Still in progress, send progress update
                                            // Enhanced progress messages with timing info
                                            let elapsed_mins = (poll_count * 3) / 60;
                                            let progress_messages = if elapsed_mins > 5 {
                                                vec![
                                                    format!(
                                                        "Deep research in progress ({} minutes)...",
                                                        elapsed_mins
                                                    ),
                                                    format!(
                                                        "Complex web search ongoing ({} minutes)...",
                                                        elapsed_mins
                                                    ),
                                                    format!(
                                                        "Extensive analysis running ({} minutes)...",
                                                        elapsed_mins
                                                    ),
                                                    format!(
                                                        "Comprehensive search active ({} minutes)...",
                                                        elapsed_mins
                                                    ),
                                                ]
                                            } else if elapsed_mins > 2 {
                                                vec![
                                                    "Searching multiple sources...".to_string(),
                                                    "Analyzing search results...".to_string(),
                                                    "Processing web content...".to_string(),
                                                    "Gathering comprehensive data...".to_string(),
                                                ]
                                            } else {
                                                vec![
                                                    "Conducting web research...".to_string(),
                                                    "Analyzing information...".to_string(),
                                                    "Processing research findings...".to_string(),
                                                    "Synthesizing comprehensive response..."
                                                        .to_string(),
                                                ]
                                            };
                                            let message_idx =
                                                (poll_count / 3) as usize % progress_messages.len();
                                            let progress_chunk = create_chat_completion_chunk(
                                                &response_id,
                                                &model,
                                                &progress_messages[message_idx],
                                                false,
                                                None,
                                            );

                                            // Log polling status
                                            if poll_count % 10 == 0 {
                                                info!(
                                                    "Web search polling: response_id={}, attempt={}, elapsed_mins={}",
                                                    response_id, poll_count, elapsed_mins
                                                );
                                            }
                                            Some((
                                                Ok(web::Bytes::from(progress_chunk)),
                                                StreamState::Polling {
                                                    last_update: Instant::now(),
                                                    poll_count: poll_count + 1,
                                                    start_time,
                                                    consecutive_queued,
                                                },
                                            ))
                                        }
                                    }
                                } else {
                                    // Parsing error, continue polling
                                    Some((
                                        Ok(web::Bytes::from(": parsing error, continuing\n\n")),
                                        StreamState::Polling {
                                            last_update,
                                            poll_count,
                                            start_time,
                                            consecutive_queued,
                                        },
                                    ))
                                }
                            } else {
                                // Response read error, continue polling
                                Some((
                                    Ok(web::Bytes::from(": response error, continuing\n\n")),
                                    StreamState::Polling {
                                        last_update,
                                        poll_count,
                                        start_time,
                                        consecutive_queued,
                                    },
                                ))
                            }
                        }
                        Err(e) => {
                            // Network error, but check if it's persistent
                            if poll_count > 10 {
                                error!(
                                    "Persistent network error polling response {}: {}",
                                    response_id, e
                                );
                                let error_chunk = create_chat_completion_chunk(
                                    &response_id,
                                    &model,
                                    "Network error: Unable to retrieve research results. Please check your connection and try again.",
                                    true,
                                    None,
                                );
                                Some((Ok(web::Bytes::from(error_chunk)), StreamState::Completed))
                            } else {
                                // Continue polling for transient errors
                                Some((
                                    Ok(web::Bytes::from(": network error, retrying\n\n")),
                                    StreamState::Polling {
                                        last_update,
                                        poll_count: poll_count + 1,
                                        start_time,
                                        consecutive_queued,
                                    },
                                ))
                            }
                        }
                    }
                }

                StreamState::ContentReady { content, usage } => {
                    // Start streaming the actual content
                    Some((
                        Ok(web::Bytes::from("")), // Transition chunk
                        StreamState::ContentStreaming {
                            remaining: content,
                            chunk_size: 50, // Characters per chunk
                            usage,
                        },
                    ))
                }

                StreamState::ContentStreaming {
                    remaining,
                    chunk_size,
                    usage,
                } => {
                    if remaining.is_empty() {
                        // Send final completion chunk with usage
                        let usage_info = usage.map(|u| (u.input_tokens, u.output_tokens));
                        let final_chunk = create_chat_completion_chunk(
                            &response_id,
                            &model,
                            "",
                            true,
                            usage_info,
                        );
                        Some((Ok(web::Bytes::from(final_chunk)), StreamState::Completed))
                    } else {
                        // Send next content chunk with UTF-8 safe splitting
                        let (chunk_text, new_remaining) = utf8_safe_split(&remaining, chunk_size);
                        let content_chunk = create_chat_completion_chunk(
                            &response_id,
                            &model,
                            &chunk_text,
                            false,
                            None,
                        );

                        // Small delay to simulate natural typing
                        sleep(Duration::from_millis(50)).await;

                        Some((
                            Ok(web::Bytes::from(content_chunk)),
                            StreamState::ContentStreaming {
                                remaining: new_remaining,
                                chunk_size,
                                usage,
                            },
                        ))
                    }
                }

                StreamState::Completed => {
                    None // End the stream
                }
            }
        }
    })
}
