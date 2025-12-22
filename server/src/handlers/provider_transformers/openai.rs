use chrono;
use serde_json::Value;
use tracing::{debug, error};
use uuid::Uuid;

use crate::clients::open_router_client::{
    OpenRouterStreamChoice, OpenRouterStreamChunk, OpenRouterStreamDelta,
};
use crate::clients::openai::OpenAIStreamChunk;
use crate::clients::usage_extractor::ProviderUsage;
use crate::models::usage_metadata::{TokenModalityDetail, UsageMetadata};
use crate::streaming::transformers::{StreamChunkTransformer, StreamError, TransformResult};

/// OpenAI stream transformer - validates and passes through compatible format
///
/// OpenAI sends streaming chunks in a format that's mostly compatible with
/// OpenRouterStreamChunk, but this transformer ensures robustness by:
/// - Validating chunk structure before forwarding
/// - Handling API error chunks properly
/// - Never forwarding malformed chunks to prevent client errors
pub struct OpenAIStreamTransformer {
    model_id: String,
}

impl OpenAIStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
        }
    }
}

impl OpenAIStreamTransformer {
    /// Extract usage from Responses API format
    fn extract_usage_from_responses_api(&self, usage: &Value) -> Option<ProviderUsage> {
        let input_tokens = usage
            .get("input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        let output_tokens = usage
            .get("output_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        // Extract cached tokens from input_tokens_details if available
        let cache_read_tokens = usage
            .get("input_tokens_details")
            .and_then(|details| details.get("cached_tokens"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        if input_tokens > 0 || output_tokens > 0 {
            // Create comprehensive metadata
            let mut metadata = UsageMetadata::default();

            // Extract output token details including reasoning tokens
            if let Some(otd) = usage.get("output_tokens_details") {
                metadata.reasoning_tokens = otd.get("reasoning_tokens").and_then(|v| v.as_i64());
                metadata.audio_tokens_output = otd.get("audio_tokens").and_then(|v| v.as_i64());
            }

            // Extract input token details
            if let Some(itd) = usage.get("input_tokens_details") {
                metadata.audio_tokens_input = itd.get("audio_tokens").and_then(|v| v.as_i64());
                metadata.image_tokens = itd.get("image_tokens").and_then(|v| v.as_i64());
                metadata.text_tokens = itd.get("text_tokens").and_then(|v| v.as_i64());
            }

            metadata.provider = Some("OpenAI".to_string());

            let mut usage = ProviderUsage::new(
                input_tokens,
                output_tokens,
                0, // cache_write_tokens (Responses API doesn't report separately)
                cache_read_tokens,
                self.model_id.clone(),
            );
            usage.metadata = Some(metadata);
            return Some(usage);
        }
        None
    }

    /// Convert OpenAI chunk to standardized format without OpenAI-specific fields
    fn create_standardized_chunk(
        &self,
        openai_chunk: &OpenAIStreamChunk,
    ) -> Option<OpenRouterStreamChunk> {
        let choices: Vec<OpenRouterStreamChoice> = openai_chunk
            .choices
            .iter()
            .filter_map(|choice| {
                // Only include choices that have actual content, exclude finish_reason
                if choice.delta.content.is_some() || choice.delta.role.is_some() {
                    Some(OpenRouterStreamChoice {
                        index: choice.index,
                        delta: OpenRouterStreamDelta {
                            role: choice.delta.role.clone(),
                            content: choice.delta.content.clone(),
                        },
                        finish_reason: None,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Only return a chunk if we have actual content
        if !choices.is_empty() {
            Some(OpenRouterStreamChunk {
                id: openai_chunk.id.clone(),
                model: openai_chunk.model.clone(),
                choices,
                created: openai_chunk.created,
                object: Some("chat.completion.chunk".to_string()),
                usage: None,
            })
        } else {
            None
        }
    }
}

impl StreamChunkTransformer for OpenAIStreamTransformer {
    fn transform_chunk(&self, chunk: &Value) -> Result<TransformResult, StreamError> {
        // Check for OpenAI API error objects
        if let Some(error_obj) = chunk.get("error") {
            error!("OpenAI API error in stream chunk: {}", error_obj);
            return Err(self.handle_error_chunk(error_obj));
        }

        // First check if this is a Responses API SSE event (new format)
        if let Some(event_type) = chunk.get("type").and_then(|t| t.as_str()) {
            // This is a Responses API SSE event
            match event_type {
                "response.output_text.delta" => {
                    // Extract the delta text
                    if let Some(delta) = chunk.get("delta").and_then(|d| d.as_str()) {
                        if !delta.is_empty() {
                            // Create a standardized chunk from the Responses API delta
                            let standardized_chunk = OpenRouterStreamChunk {
                                id: chunk
                                    .get("item_id")
                                    .and_then(|id| id.as_str())
                                    .unwrap_or(&format!("resp-{}", Uuid::new_v4()))
                                    .to_string(),
                                model: self.model_id.clone(),
                                choices: vec![OpenRouterStreamChoice {
                                    index: chunk
                                        .get("output_index")
                                        .and_then(|i| i.as_i64())
                                        .unwrap_or(0)
                                        as i32,
                                    delta: OpenRouterStreamDelta {
                                        role: None,
                                        content: Some(delta.to_string()),
                                    },
                                    finish_reason: None,
                                }],
                                created: Some(chrono::Utc::now().timestamp()),
                                object: Some("chat.completion.chunk".to_string()),
                                usage: None,
                            };
                            return Ok(TransformResult::Transformed(standardized_chunk));
                        }
                    }
                    Ok(TransformResult::Ignore)
                }
                "response.output_text.done" => {
                    // Final text output event, might contain full text
                    debug!("OpenAI Responses API: output_text.done event");
                    Ok(TransformResult::Ignore)
                }
                "response.created" | "response.started" => {
                    // Initial response events
                    debug!("OpenAI Responses API: {} event", event_type);
                    Ok(TransformResult::Ignore)
                }
                "response.completed" => {
                    // Response completed - extract usage if available
                    debug!("OpenAI Responses API: response.completed event");
                    if let Some(response) = chunk.get("response") {
                        if let Some(usage) = response.get("usage") {
                            // Extract usage data from completed response
                            let _ = self.extract_usage_from_chunk(usage);
                        }
                    }
                    Ok(TransformResult::Done)
                }
                "response.failed" | "response.cancelled" => {
                    // Error events
                    error!("OpenAI Responses API: {} event", event_type);
                    if let Some(response) = chunk.get("response") {
                        if let Some(error) = response.get("error") {
                            return Err(self.handle_error_chunk(error));
                        }
                    }
                    Err(StreamError::ProviderError(format!(
                        "Response {}",
                        event_type
                    )))
                }
                _ => {
                    // Unknown event type, ignore
                    debug!("OpenAI Responses API: unknown event type: {}", event_type);
                    Ok(TransformResult::Ignore)
                }
            }
        } else {
            // Try to parse as Chat Completions format (old format)
            match serde_json::from_value::<OpenAIStreamChunk>(chunk.clone()) {
                Ok(openai_chunk) => {
                    // Check if this is the final chunk with finish_reason
                    let is_final_chunk = openai_chunk
                        .choices
                        .iter()
                        .any(|choice| choice.finish_reason.is_some());

                    // Check if this chunk has content
                    let has_content = openai_chunk.choices.iter().any(|choice| {
                        choice.delta.content.is_some() || choice.delta.role.is_some()
                    });

                    // Transform content chunks to standardized format without finish_reason
                    if has_content {
                        // Create standardized chunk without any OpenAI-specific fields
                        if let Some(standardized_chunk) =
                            self.create_standardized_chunk(&openai_chunk)
                        {
                            Ok(TransformResult::Transformed(standardized_chunk))
                        } else {
                            Ok(TransformResult::Ignore)
                        }
                    } else if is_final_chunk {
                        // Final chunk with finish_reason but no content
                        // For OpenAI, we should NOT return Done here because usage data comes in a subsequent chunk
                        // Return Ignore to allow processing of the following usage chunk
                        debug!(
                            "OpenAI stream transformer: final chunk detected, but ignoring to allow usage chunk processing"
                        );
                        Ok(TransformResult::Ignore)
                    } else if openai_chunk.usage.is_some() {
                        // Usage chunk - ignore here, will be handled by streaming handler
                        Ok(TransformResult::Ignore)
                    } else {
                        // Empty chunk - ignore
                        Ok(TransformResult::Ignore)
                    }
                }
                Err(e) => {
                    debug!("Failed to deserialize as OpenAI chunk: {}, ignoring", e);
                    Ok(TransformResult::Ignore)
                }
            }
        }
    }

    fn handle_error_chunk(&self, error: &Value) -> StreamError {
        let error_message = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown OpenAI API error");
        StreamError::ProviderError(format!("OpenAI API error: {}", error_message))
    }

    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // First check if this is a Responses API SSE event
        if let Some(event_type) = chunk.get("type").and_then(|t| t.as_str()) {
            if event_type == "response.output_text.delta" {
                // Extract delta from Responses API format
                return chunk
                    .get("delta")
                    .and_then(|d| d.as_str())
                    .map(|s| s.to_string());
            }
        }

        // Otherwise try Chat Completions format: choices[0].delta.content
        chunk
            .get("choices")
            .and_then(|choices| choices.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(|content| content.as_str())
            .map(|s| s.to_string())
    }

    fn extract_usage_from_chunk(&self, chunk: &Value) -> Option<ProviderUsage> {
        // First check if this is a Responses API SSE event with usage
        if let Some(event_type) = chunk.get("type").and_then(|t| t.as_str()) {
            if event_type == "response.completed" {
                // Extract usage from the nested response object
                if let Some(response) = chunk.get("response") {
                    if let Some(usage) = response.get("usage") {
                        return self.extract_usage_from_responses_api(usage);
                    }
                }
            }
        }

        // Otherwise try Chat Completions format
        if let Some(usage) = chunk.get("usage") {
            // Check if usage field is non-null
            if usage.is_null() {
                return None;
            }

            let prompt_tokens = usage
                .get("prompt_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let completion_tokens = usage
                .get("completion_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            // Extract all cached token types from prompt_tokens_details
            let prompt_details = usage.get("prompt_tokens_details");
            let cached_tokens = prompt_details
                .and_then(|details| details.get("cached_tokens"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            // Only return usage if we have actual token counts
            if prompt_tokens > 0 || completion_tokens > 0 {
                // Create comprehensive metadata
                let mut metadata = UsageMetadata::default();

                // Extract completion token details including reasoning tokens
                if let Some(ctd) = usage.get("completion_tokens_details") {
                    metadata.reasoning_tokens =
                        ctd.get("reasoning_tokens").and_then(|v| v.as_i64());
                    metadata.audio_tokens_output = ctd.get("audio_tokens").and_then(|v| v.as_i64());
                    metadata.accepted_prediction_tokens = ctd
                        .get("accepted_prediction_tokens")
                        .and_then(|v| v.as_i64());
                    metadata.rejected_prediction_tokens = ctd
                        .get("rejected_prediction_tokens")
                        .and_then(|v| v.as_i64());

                    // Also check for any nested completion details
                    if let Some(audio_tokens) = ctd.get("audio_tokens").and_then(|v| v.as_i64()) {
                        metadata.audio_tokens_output = Some(audio_tokens);
                    }
                    if let Some(text_tokens) = ctd.get("text_tokens").and_then(|v| v.as_i64()) {
                        // Store text tokens in completion if available
                        metadata.text_tokens_output = Some(text_tokens);
                    }
                }

                // Extract prompt token details including all modalities
                if let Some(ptd) = prompt_details {
                    metadata.audio_tokens_input = ptd.get("audio_tokens").and_then(|v| v.as_i64());
                    metadata.image_tokens = ptd.get("image_tokens").and_then(|v| v.as_i64());
                    metadata.text_tokens = ptd.get("text_tokens").and_then(|v| v.as_i64());

                    // Extract any additional cached token details
                    if let Some(cache_creation_input_tokens) = ptd
                        .get("cache_creation_input_tokens")
                        .and_then(|v| v.as_i64())
                    {
                        metadata.cache_creation_input_tokens = Some(cache_creation_input_tokens);
                    }
                    if let Some(cache_read_input_tokens) =
                        ptd.get("cache_read_input_tokens").and_then(|v| v.as_i64())
                    {
                        metadata.cache_read_input_tokens = Some(cache_read_input_tokens);
                    }
                }

                // Extract system info from chunk root
                metadata.system_fingerprint = chunk
                    .get("system_fingerprint")
                    .and_then(|v| v.as_str())
                    .map(String::from);

                metadata.model_version = chunk
                    .get("model")
                    .and_then(|v| v.as_str())
                    .map(String::from);

                // Extract ID if present
                metadata.response_id = chunk.get("id").and_then(|v| v.as_str()).map(String::from);

                metadata.provider = Some("OpenAI".to_string());

                // Store the full usage object for debugging/future fields
                metadata.provider_specific = Some(usage.clone());

                let mut usage = ProviderUsage::new(
                    prompt_tokens,     // Total input tokens
                    completion_tokens, // Total output tokens
                    0,                 // cache_write_tokens (OpenAI doesn't report separately)
                    cached_tokens,     // cache_read_tokens
                    self.model_id.clone(),
                );
                usage.metadata = Some(metadata);
                return Some(usage);
            }
        }
        None
    }
}
