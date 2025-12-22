use chrono;
use serde_json::Value;
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::clients::google_client::{GoogleStreamChunk, GoogleStreamPart, GoogleUsageMetadata};
use crate::clients::open_router_client::{
    OpenRouterStreamChoice, OpenRouterStreamChunk, OpenRouterStreamDelta, OpenRouterUsage,
};
use crate::clients::usage_extractor::ProviderUsage;
use crate::models::usage_metadata::{TokenModalityDetail, UsageMetadata};
use crate::streaming::transformers::{StreamChunkTransformer, StreamError, TransformResult};

/// Google stream transformer - converts Google native format to OpenRouter format
///
/// Google sends streaming chunks in their native format with:
/// - candidates array instead of choices
/// - usage_metadata instead of usage
/// - Missing required id field for OpenRouter compatibility
///
/// This transformer robustly handles:
/// - Google API error chunks (converts to StreamError)
/// - Malformed chunks (returns Ignore, never forwards)
/// - Valid content chunks (converts to OpenRouterStreamChunk)
/// - Final chunks with usage metadata (extracts for billing)
///
/// Note: Google sends cumulative usage metadata in multiple chunks during streaming.
/// We track the last seen usage and only extract it once when we see a truly final chunk.
pub struct GoogleStreamTransformer {
    model_id: String,
}

impl GoogleStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
        }
    }

    /// Convert GoogleStreamChunk to OpenRouterStreamChunk format
    fn convert_google_to_openrouter(
        &self,
        google_chunk: GoogleStreamChunk,
    ) -> Result<OpenRouterStreamChunk, StreamError> {
        let choices = if let Some(candidates) = google_chunk.candidates {
            candidates
                .into_iter()
                .enumerate()
                .map(|(idx, candidate)| {
                    let content = candidate.content.and_then(|c| {
                        // Concatenate ALL text parts without filtering - preserve everything
                        c.parts.and_then(|parts| {
                            let mut all_text = Vec::new();

                            // Iterate through ALL parts and collect text
                            for part in parts {
                                if let Some(text) = part.text {
                                    all_text.push(text);
                                }
                                // Note: If Google adds other part types in future, we can handle them here
                            }

                            // Join all collected text
                            let combined_text = all_text.join("");
                            if combined_text.is_empty() {
                                None
                            } else {
                                Some(combined_text)
                            }
                        })
                    });

                    OpenRouterStreamChoice {
                        delta: OpenRouterStreamDelta {
                            role: Some("assistant".to_string()),
                            content,
                        },
                        index: candidate.index,
                        finish_reason: None, // Remove finish_reason from standardized streams
                    }
                })
                .collect()
        } else {
            vec![]
        };

        let usage = google_chunk.usage_metadata.map(|metadata| OpenRouterUsage {
            prompt_tokens: metadata.prompt_token_count,
            completion_tokens: metadata.candidates_token_count.unwrap_or(0),
            total_tokens: metadata.total_token_count,
            cost: None, // Will be filled by billing system
            cached_input_tokens: metadata.cached_content_token_count.unwrap_or(0),
            cache_write_tokens: 0,
            cache_read_tokens: metadata.cached_content_token_count.unwrap_or(0),
            prompt_tokens_details: None,
        });

        Ok(OpenRouterStreamChunk {
            id: format!("chatcmpl-{}", Uuid::new_v4()),
            choices,
            created: Some(chrono::Utc::now().timestamp()),
            model: self.model_id.clone(),
            object: Some("chat.completion.chunk".to_string()),
            usage,
        })
    }
}

impl StreamChunkTransformer for GoogleStreamTransformer {
    fn transform_chunk(&self, chunk: &Value) -> Result<TransformResult, StreamError> {
        // Check for Google API error objects
        if let Some(error_obj) = chunk.get("error") {
            error!("Google API error in stream chunk: {}", error_obj);
            return Err(self.handle_error_chunk(error_obj));
        }

        // Check if this is a final chunk with finishReason
        let is_final_chunk = chunk
            .get("candidates")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|candidate| candidate.get("finishReason"))
            .and_then(|fr| fr.as_str())
            .map(|reason| reason == "STOP")
            .unwrap_or(false);

        // Google might send chunks with different structures
        // First try to deserialize as GoogleStreamChunk
        match serde_json::from_value::<GoogleStreamChunk>(chunk.clone()) {
            Ok(google_chunk) => {
                // Check if this chunk has any meaningful content or metadata
                let has_meaningful_content = google_chunk
                    .candidates
                    .as_ref()
                    .map(|candidates| {
                        candidates.iter().any(|c| {
                            // Accept chunks with any content parts (including thinking parts)
                            c.content
                                .as_ref()
                                .and_then(|content| content.parts.as_ref())
                                .map(|parts| !parts.is_empty())
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false);

                // Transform if we have ANY content - don't filter valid chunks
                if has_meaningful_content {
                    let transformed_chunk = self.convert_google_to_openrouter(google_chunk)?;
                    Ok(TransformResult::Transformed(transformed_chunk))
                } else if is_final_chunk {
                    // This is the final chunk with no content, just finishReason
                    // Return Done to signal stream completion
                    info!("Google stream transformer: final chunk detected, returning Done");
                    Ok(TransformResult::Done)
                } else {
                    // Only ignore chunks that are truly empty
                    Ok(TransformResult::Ignore)
                }
            }
            Err(e) => {
                // Log the parsing error for debugging
                debug!(
                    "Failed to parse Google chunk as GoogleStreamChunk: {}, chunk: {}",
                    e, chunk
                );

                // Try lenient parsing to extract any valid content
                if let Some(candidates) = chunk.get("candidates").and_then(|c| c.as_array()) {
                    debug!("Attempting lenient parsing of Google chunk candidates");

                    // Collect ALL text from ALL candidates and ALL parts
                    let mut all_texts = Vec::new();

                    for (idx, candidate) in candidates.iter().enumerate() {
                        if let Some(parts) = candidate
                            .get("content")
                            .and_then(|c| c.get("parts"))
                            .and_then(|p| p.as_array())
                        {
                            // Collect text from ALL parts in this candidate
                            for part in parts {
                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    if !text.is_empty() {
                                        all_texts.push((idx, text.to_string()));
                                    }
                                }
                            }
                        }
                    }

                    // If we found any text, create choices for each candidate
                    if !all_texts.is_empty() {
                        debug!(
                            "Found {} text segments in malformed Google chunk, transforming",
                            all_texts.len()
                        );

                        // Group texts by candidate index
                        let mut choices = Vec::new();
                        let mut current_idx = 0;
                        let mut current_texts = Vec::new();

                        for (idx, text) in all_texts {
                            if idx != current_idx && !current_texts.is_empty() {
                                // Create choice for previous candidate
                                choices.push(OpenRouterStreamChoice {
                                    delta: OpenRouterStreamDelta {
                                        role: Some("assistant".to_string()),
                                        content: Some(current_texts.join("")),
                                    },
                                    index: current_idx as i32,
                                    finish_reason: None,
                                });
                                current_texts.clear();
                            }
                            current_idx = idx;
                            current_texts.push(text);
                        }

                        // Don't forget the last candidate
                        if !current_texts.is_empty() {
                            choices.push(OpenRouterStreamChoice {
                                delta: OpenRouterStreamDelta {
                                    role: Some("assistant".to_string()),
                                    content: Some(current_texts.join("")),
                                },
                                index: current_idx as i32,
                                finish_reason: None,
                            });
                        }

                        let chunk = OpenRouterStreamChunk {
                            id: format!("chatcmpl-{}", Uuid::new_v4()),
                            choices,
                            created: Some(chrono::Utc::now().timestamp()),
                            model: self.model_id.clone(),
                            object: Some("chat.completion.chunk".to_string()),
                            usage: None,
                        };

                        return Ok(TransformResult::Transformed(chunk));
                    }
                }

                // Check if this is a final chunk in the lenient parsing path
                if is_final_chunk {
                    // Return Done to signal stream completion
                    info!(
                        "Google stream transformer: final chunk detected in lenient parsing, returning Done"
                    );
                    return Ok(TransformResult::Done);
                }

                Ok(TransformResult::Ignore)
            }
        }
    }

    fn handle_error_chunk(&self, error: &Value) -> StreamError {
        let error_message = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown Google API error");
        StreamError::ProviderError(format!("Google API error: {}", error_message))
    }

    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // Google sends text in candidates[0].content.parts[0].text
        chunk
            .get("candidates")
            .and_then(|candidates| candidates.as_array())
            .and_then(|arr| arr.first())
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.as_array())
            .and_then(|arr| arr.first())
            .and_then(|part| part.get("text"))
            .and_then(|text| text.as_str())
            .map(|s| s.to_string())
    }

    fn extract_usage_from_chunk(&self, chunk: &Value) -> Option<ProviderUsage> {
        // Google provides cumulative usage in chunks with usageMetadata
        // Simply extract usageMetadata whenever it's present - don't check for is_final_chunk
        // The last captured usage will be the final one
        if let Some(usage_metadata) = chunk.get("usageMetadata") {
            let prompt_tokens = usage_metadata
                .get("promptTokenCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let completion_tokens = usage_metadata
                .get("candidatesTokenCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let total_tokens = usage_metadata
                .get("totalTokenCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let cache_read_tokens = usage_metadata
                .get("cachedContentTokenCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            // Create comprehensive metadata
            let mut metadata = crate::models::usage_metadata::UsageMetadata::default();

            // Extract Google's version of reasoning tokens
            metadata.thoughts_tokens = usage_metadata
                .get("thoughtsTokenCount")
                .and_then(|v| v.as_i64());

            // Extract prompt token details (modality information)
            if let Some(ptd) = usage_metadata.get("promptTokensDetails") {
                if let Some(details_array) = ptd.as_array() {
                    metadata.prompt_tokens_details = Some(
                        details_array
                            .iter()
                            .filter_map(|d| {
                                let modality = d.get("modality")?.as_str()?.to_string();
                                let token_count = d.get("tokenCount")?.as_i64()?;
                                Some(crate::models::usage_metadata::TokenModalityDetail {
                                    modality,
                                    token_count,
                                })
                            })
                            .collect(),
                    );
                }
            }

            // Extract model version from chunk
            metadata.model_version = chunk
                .get("modelVersion")
                .and_then(|v| v.as_str())
                .map(String::from);

            // Extract response ID
            metadata.response_id = chunk
                .get("responseId")
                .and_then(|v| v.as_str())
                .map(String::from);

            metadata.provider = Some("Google".to_string());

            let mut usage = ProviderUsage::new(
                prompt_tokens,
                completion_tokens,
                0,
                cache_read_tokens,
                self.model_id.clone(),
            );
            usage.metadata = Some(metadata);
            Some(usage)
        } else {
            None
        }
    }
}
