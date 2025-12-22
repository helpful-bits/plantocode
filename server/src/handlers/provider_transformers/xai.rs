use serde_json::Value;
use tracing::{debug, error};

use crate::clients::open_router_client::{
    OpenRouterStreamChoice, OpenRouterStreamChunk, OpenRouterStreamDelta, OpenRouterUsage,
};
use crate::clients::openai::OpenAIStreamChunk;
use crate::clients::usage_extractor::ProviderUsage;
use crate::models::usage_metadata::{TokenModalityDetail, UsageMetadata};
use crate::streaming::transformers::{StreamChunkTransformer, StreamError, TransformResult};

/// XAI stream transformer - validates and passes through OpenAI-compatible format
///
/// XAI uses OpenAI-compatible streaming format, so this transformer handles
/// their chunks by deserializing and re-serializing to ensure robustness.
pub struct XaiStreamTransformer {
    model_id: String,
}

impl XaiStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
        }
    }
}

impl StreamChunkTransformer for XaiStreamTransformer {
    fn transform_chunk(&self, chunk: &Value) -> Result<TransformResult, StreamError> {
        // Check for XAI API error objects
        if let Some(error_obj) = chunk.get("error") {
            error!("XAI API error in stream chunk: {}", error_obj);
            return Err(self.handle_error_chunk(error_obj));
        }

        // Fully deserialize into OpenAIStreamChunk and re-serialize to ensure valid structure
        match serde_json::from_value::<OpenAIStreamChunk>(chunk.clone()) {
            Ok(openai_chunk) => {
                // Validate that the chunk has meaningful content or is a final chunk with usage
                let has_content = openai_chunk.choices.iter().any(|choice| {
                    choice.delta.content.is_some()
                        || choice.delta.role.is_some()
                        || choice.finish_reason.is_some()
                });

                let has_usage = openai_chunk.usage.is_some();

                // Only transform chunks that have actual content or usage data
                if has_content || has_usage {
                    // Convert OpenAI chunk to OpenRouter format
                    let choices: Vec<OpenRouterStreamChoice> = openai_chunk
                        .choices
                        .into_iter()
                        .map(|choice| OpenRouterStreamChoice {
                            index: choice.index,
                            delta: OpenRouterStreamDelta {
                                role: choice.delta.role,
                                content: choice.delta.content,
                            },
                            finish_reason: choice.finish_reason,
                        })
                        .collect();

                    let usage = openai_chunk.usage.map(|u| OpenRouterUsage {
                        prompt_tokens: u.prompt_tokens,
                        completion_tokens: u.completion_tokens,
                        total_tokens: u.total_tokens,
                        cost: None,
                        cached_input_tokens: u
                            .prompt_tokens_details
                            .as_ref()
                            .and_then(|ptd| ptd.cached_tokens)
                            .unwrap_or(0),
                        cache_write_tokens: 0,
                        cache_read_tokens: u
                            .prompt_tokens_details
                            .as_ref()
                            .and_then(|ptd| ptd.cached_tokens)
                            .unwrap_or(0),
                        prompt_tokens_details: None,
                    });

                    let chunk = OpenRouterStreamChunk {
                        id: openai_chunk.id,
                        model: openai_chunk.model,
                        choices,
                        created: openai_chunk.created,
                        object: openai_chunk.object,
                        usage,
                    };

                    Ok(TransformResult::Transformed(chunk))
                } else {
                    debug!("XAI chunk has no meaningful content or usage, ignoring");
                    Ok(TransformResult::Ignore)
                }
            }
            Err(e) => {
                debug!(
                    "Failed to deserialize XAI chunk: {}, ignoring malformed data",
                    e
                );
                Ok(TransformResult::Ignore)
            }
        }
    }

    fn handle_error_chunk(&self, error: &Value) -> StreamError {
        let error_message = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown XAI API error");
        StreamError::ProviderError(format!("XAI API error: {}", error_message))
    }

    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // XAI sends text in choices[0].delta.content (same as OpenAI)
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
        if let Some(usage) = chunk.get("usage") {
            let prompt_tokens = usage
                .get("prompt_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let completion_tokens = usage
                .get("completion_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            // Extract all cached token types from prompt_tokens_details
            let prompt_tokens_details = usage.get("prompt_tokens_details");
            let cached_tokens = prompt_tokens_details
                .and_then(|ptd| ptd.get("cached_tokens"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            if prompt_tokens > 0 || completion_tokens > 0 {
                // Create comprehensive metadata
                let mut metadata = crate::models::usage_metadata::UsageMetadata::default();

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
                        metadata.text_tokens_output = Some(text_tokens);
                    }
                }

                // Extract prompt token details including all modalities
                if let Some(ptd) = prompt_tokens_details {
                    metadata.text_tokens = ptd.get("text_tokens").and_then(|v| v.as_i64());
                    metadata.audio_tokens_input = ptd.get("audio_tokens").and_then(|v| v.as_i64());
                    metadata.image_tokens = ptd.get("image_tokens").and_then(|v| v.as_i64());

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

                metadata.provider = Some("XAI".to_string());

                // Extract XAI-specific fields
                let mut provider_specific_map = serde_json::Map::new();

                if let Some(num_sources) = usage.get("num_sources_used") {
                    provider_specific_map
                        .insert("num_sources_used".to_string(), num_sources.clone());
                }

                // Store any XAI-specific usage fields
                if let Some(web_search_count) = usage.get("web_search_count") {
                    provider_specific_map
                        .insert("web_search_count".to_string(), web_search_count.clone());
                }

                if !provider_specific_map.is_empty() {
                    metadata.provider_specific =
                        Some(serde_json::Value::Object(provider_specific_map));
                } else {
                    // Store the full usage object for debugging/future fields
                    metadata.provider_specific = Some(usage.clone());
                }

                let mut usage = ProviderUsage::new(
                    prompt_tokens,
                    completion_tokens,
                    0, // cache_write_tokens (XAI doesn't report separately)
                    cached_tokens,
                    self.model_id.clone(),
                );
                usage.metadata = Some(metadata);
                Some(usage)
            } else {
                None
            }
        } else {
            None
        }
    }
}
