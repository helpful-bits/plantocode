use bigdecimal::BigDecimal;
use serde_json::Value;
use std::str::FromStr;
use tracing::{debug, error};

use crate::clients::open_router_client::{
    OpenRouterStreamChoice, OpenRouterStreamChunk, OpenRouterStreamDelta, OpenRouterUsage,
};
use crate::clients::usage_extractor::ProviderUsage;
use crate::models::usage_metadata::{TokenModalityDetail, UsageMetadata};
use crate::streaming::transformers::{StreamChunkTransformer, StreamError, TransformResult};

/// OpenRouter stream transformer - validates and passes through native format
///
/// OpenRouter sends streaming chunks in the native OpenRouterStreamChunk format,
/// so this transformer primarily validates chunks and ensures error handling
/// while passing valid chunks through unchanged.
pub struct OpenRouterStreamTransformer {
    model_id: String,
}

impl OpenRouterStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
        }
    }
}

impl OpenRouterStreamTransformer {}

impl StreamChunkTransformer for OpenRouterStreamTransformer {
    fn transform_chunk(&self, chunk: &Value) -> Result<TransformResult, StreamError> {
        // Check for OpenRouter API error objects
        if let Some(error_obj) = chunk.get("error") {
            error!("OpenRouter API error in stream chunk: {}", error_obj);
            return Err(self.handle_error_chunk(error_obj));
        }

        // Special handling for final usage chunk from OpenRouter
        // OpenRouter sends a final chunk with empty choices but containing usage data
        if let Some(choices) = chunk.get("choices") {
            if choices
                .as_array()
                .map(|arr| arr.is_empty())
                .unwrap_or(false)
            {
                if chunk.get("usage").is_some() {
                    debug!("OpenRouter final usage chunk detected with empty choices");
                    // Extract usage data before returning the chunk
                    if let Some(usage) = self.extract_usage_from_chunk(chunk) {
                        debug!("Extracted final usage from OpenRouter: {:?}", usage);
                    }
                }
            }
        }

        // If it's a valid OpenRouter chunk, return it directly
        match serde_json::from_value::<OpenRouterStreamChunk>(chunk.clone()) {
            Ok(openrouter_chunk) => {
                // Valid OpenRouter format, return directly
                Ok(TransformResult::Transformed(openrouter_chunk))
            }
            Err(e) => {
                debug!(
                    "Failed to deserialize OpenRouter chunk: {}, ignoring malformed data",
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
            .unwrap_or("Unknown OpenRouter API error");
        StreamError::ProviderError(format!("OpenRouter API error: {}", error_message))
    }

    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // OpenRouter sends text in choices[0].delta.content (same as OpenAI)
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

            // Extract cached tokens from prompt_tokens_details
            let cached_tokens = usage
                .get("prompt_tokens_details")
                .and_then(|details| details.get("cached_tokens"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            // Enhanced cost information extraction - handles all OpenRouter cost formats
            let cost = usage
                .get("cost")
                .and_then(|v| match v {
                    Value::Number(n) => n.as_f64(),
                    Value::String(s) => s.parse::<f64>().ok(),
                    Value::Object(obj) => {
                        // Handle nested cost objects
                        obj.get("amount")
                            .and_then(|amount| match amount {
                                Value::Number(n) => n.as_f64(),
                                Value::String(s) => s.parse::<f64>().ok(),
                                _ => None,
                            })
                            .or_else(|| {
                                obj.get("total").and_then(|total| match total {
                                    Value::Number(n) => n.as_f64(),
                                    Value::String(s) => s.parse::<f64>().ok(),
                                    _ => None,
                                })
                            })
                    }
                    _ => None,
                })
                .and_then(|f| BigDecimal::from_str(&f.to_string()).ok());

            // CRITICAL FIX: Extract usage data whenever cost is present OR tokens are present
            // This ensures we capture intermediate chunks with cost information even with zero tokens
            if prompt_tokens > 0 || completion_tokens > 0 || cached_tokens > 0 || cost.is_some() {
                // Create metadata to capture additional fields
                let mut metadata = crate::models::usage_metadata::UsageMetadata::default();

                // Extract reasoning tokens
                if let Some(ctd) = usage.get("completion_tokens_details") {
                    metadata.reasoning_tokens =
                        ctd.get("reasoning_tokens").and_then(|v| v.as_i64());
                }

                // Extract cost details with comprehensive parsing
                if let Some(cost_details) = usage.get("cost_details") {
                    metadata.upstream_inference_cost = cost_details
                        .get("upstream_inference_cost")
                        .and_then(|v| match v {
                            Value::Number(n) => n.as_f64(),
                            Value::String(s) => s.parse::<f64>().ok(),
                            _ => None,
                        });
                }

                // Extract BYOK flag
                metadata.is_byok = usage.get("is_byok").and_then(|v| v.as_bool());

                // Extract provider info
                metadata.provider = Some("OpenRouter".to_string());

                // Extract additional usage metadata that might be present
                if let Some(model_version) = usage.get("model") {
                    metadata.model_version = model_version.as_str().map(|s| s.to_string());
                }

                // Extract system fingerprint if present
                if let Some(fingerprint) = usage.get("system_fingerprint") {
                    metadata.system_fingerprint = fingerprint.as_str().map(|s| s.to_string());
                }

                // Extract response ID if present
                if let Some(response_id) = usage.get("id") {
                    metadata.response_id = response_id.as_str().map(|s| s.to_string());
                }

                // Store any provider-specific data that might be useful for debugging
                metadata.provider_specific = Some(usage.clone());

                let mut usage = if let Some(cost_val) = cost {
                    ProviderUsage::with_cost(
                        prompt_tokens,
                        completion_tokens,
                        0,
                        cached_tokens,
                        self.model_id.clone(),
                        cost_val,
                    )
                } else {
                    ProviderUsage::new(
                        prompt_tokens,
                        completion_tokens,
                        0,
                        cached_tokens,
                        self.model_id.clone(),
                    )
                };
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
