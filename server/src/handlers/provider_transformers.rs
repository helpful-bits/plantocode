/// PROVIDER-SPECIFIC STREAM TRANSFORMERS
/// 
/// This module implements provider-specific streaming chunk transformers that handle
/// the unique quirks of each AI provider while ensuring robust parsing and format
/// conversion to the standardized OpenRouterStreamChunk format.
/// 
/// Each transformer follows the critical safety pattern:
/// 1. Parse chunk to serde_json::Value first (catch JSON errors)
/// 2. Check for provider error objects (convert to StreamError)
/// 3. Validate structure and transform OR return Ignore
/// 4. NEVER forward unparseable chunks to prevent client errors

use serde_json::Value;
use tracing::{error, debug, info};
use uuid::Uuid;
use chrono;
use bigdecimal::BigDecimal;
use std::str::FromStr;

use crate::streaming::transformers::{StreamChunkTransformer, TransformResult, StreamError};
use crate::clients::google_client::{GoogleStreamChunk, GoogleUsageMetadata, GoogleStreamPart};
use crate::clients::open_router_client::{OpenRouterStreamChunk, OpenRouterStreamChoice, OpenRouterStreamDelta, OpenRouterUsage};
use crate::clients::usage_extractor::ProviderUsage;
use crate::clients::openai::{OpenAIStreamChunk, OpenAIResponsesSSEEvent};
use crate::models::usage_metadata::{UsageMetadata, TokenModalityDetail};

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
    fn convert_google_to_openrouter(&self, google_chunk: GoogleStreamChunk) -> Result<OpenRouterStreamChunk, StreamError> {
        let choices = if let Some(candidates) = google_chunk.candidates {
            candidates.into_iter().enumerate().map(|(idx, candidate)| {
                let content = candidate.content
                    .and_then(|c| {
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
                            if combined_text.is_empty() { None } else { Some(combined_text) }
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
            }).collect()
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
        let is_final_chunk = chunk.get("candidates")
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
                let has_meaningful_content = google_chunk.candidates
                    .as_ref()
                    .map(|candidates| {
                        candidates.iter().any(|c| {
                            // Accept chunks with any content parts (including thinking parts)
                            c.content.as_ref()
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
                debug!("Failed to parse Google chunk as GoogleStreamChunk: {}, chunk: {}", e, chunk);
                
                // Try lenient parsing to extract any valid content
                if let Some(candidates) = chunk.get("candidates").and_then(|c| c.as_array()) {
                    debug!("Attempting lenient parsing of Google chunk candidates");
                    
                    // Collect ALL text from ALL candidates and ALL parts
                    let mut all_texts = Vec::new();
                    
                    for (idx, candidate) in candidates.iter().enumerate() {
                        if let Some(parts) = candidate
                            .get("content")
                            .and_then(|c| c.get("parts"))
                            .and_then(|p| p.as_array()) {
                            
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
                        debug!("Found {} text segments in malformed Google chunk, transforming", all_texts.len());
                        
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
                    info!("Google stream transformer: final chunk detected in lenient parsing, returning Done");
                    return Ok(TransformResult::Done);
                }
                
                Ok(TransformResult::Ignore)
            }
        }
    }
    
    fn handle_error_chunk(&self, error: &Value) -> StreamError {
        let error_message = error.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown Google API error");
        StreamError::ProviderError(format!("Google API error: {}", error_message))
    }
    
    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // Google sends text in candidates[0].content.parts[0].text
        chunk.get("candidates")
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
            let prompt_tokens = usage_metadata.get("promptTokenCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let completion_tokens = usage_metadata.get("candidatesTokenCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let total_tokens = usage_metadata.get("totalTokenCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let cache_read_tokens = usage_metadata.get("cachedContentTokenCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            
            // Create comprehensive metadata
            let mut metadata = crate::models::usage_metadata::UsageMetadata::default();
            
            // Extract Google's version of reasoning tokens
            metadata.thoughts_tokens = usage_metadata.get("thoughtsTokenCount")
                .and_then(|v| v.as_i64());
            
            // Extract prompt token details (modality information)
            if let Some(ptd) = usage_metadata.get("promptTokensDetails") {
                if let Some(details_array) = ptd.as_array() {
                    metadata.prompt_tokens_details = Some(
                        details_array.iter()
                            .filter_map(|d| {
                                let modality = d.get("modality")?.as_str()?.to_string();
                                let token_count = d.get("tokenCount")?.as_i64()?;
                                Some(crate::models::usage_metadata::TokenModalityDetail {
                                    modality,
                                    token_count,
                                })
                            })
                            .collect()
                    );
                }
            }
            
            // Extract model version from chunk
            metadata.model_version = chunk.get("modelVersion")
                .and_then(|v| v.as_str())
                .map(String::from);
            
            // Extract response ID
            metadata.response_id = chunk.get("responseId")
                .and_then(|v| v.as_str())
                .map(String::from);
            
            metadata.provider = Some("Google".to_string());
            
            let mut usage = ProviderUsage::new(
                prompt_tokens,
                completion_tokens,
                0,
                cache_read_tokens,
                self.model_id.clone()
            );
            usage.metadata = Some(metadata);
            Some(usage)
        } else {
            None
        }
    }
}

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
        let input_tokens = usage.get("input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        let output_tokens = usage.get("output_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        // Extract cached tokens from input_tokens_details if available
        let cache_read_tokens = usage.get("input_tokens_details")
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
                self.model_id.clone()
            );
            usage.metadata = Some(metadata);
            return Some(usage);
        }
        None
    }

    /// Convert OpenAI chunk to standardized format without OpenAI-specific fields
    fn create_standardized_chunk(&self, openai_chunk: &OpenAIStreamChunk) -> Option<OpenRouterStreamChunk> {
        let choices: Vec<OpenRouterStreamChoice> = openai_chunk.choices.iter()
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
                                id: chunk.get("item_id")
                                    .and_then(|id| id.as_str())
                                    .unwrap_or(&format!("resp-{}", Uuid::new_v4()))
                                    .to_string(),
                                model: self.model_id.clone(),
                                choices: vec![OpenRouterStreamChoice {
                                    index: chunk.get("output_index")
                                        .and_then(|i| i.as_i64())
                                        .unwrap_or(0) as i32,
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
                    Err(StreamError::ProviderError(format!("Response {}", event_type)))
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
                    let is_final_chunk = openai_chunk.choices.iter().any(|choice| {
                        choice.finish_reason.is_some()
                    });

                    // Check if this chunk has content
                    let has_content = openai_chunk.choices.iter().any(|choice| {
                        choice.delta.content.is_some() || choice.delta.role.is_some()
                    });

                    // Transform content chunks to standardized format without finish_reason
                    if has_content {
                        // Create standardized chunk without any OpenAI-specific fields
                        if let Some(standardized_chunk) = self.create_standardized_chunk(&openai_chunk) {
                            Ok(TransformResult::Transformed(standardized_chunk))
                        } else {
                            Ok(TransformResult::Ignore)
                        }
                    } else if is_final_chunk {
                        // Final chunk with finish_reason but no content
                        // For OpenAI, we should NOT return Done here because usage data comes in a subsequent chunk
                        // Return Ignore to allow processing of the following usage chunk
                        debug!("OpenAI stream transformer: final chunk detected, but ignoring to allow usage chunk processing");
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
        let error_message = error.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown OpenAI API error");
        StreamError::ProviderError(format!("OpenAI API error: {}", error_message))
    }
    
    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // First check if this is a Responses API SSE event
        if let Some(event_type) = chunk.get("type").and_then(|t| t.as_str()) {
            if event_type == "response.output_text.delta" {
                // Extract delta from Responses API format
                return chunk.get("delta")
                    .and_then(|d| d.as_str())
                    .map(|s| s.to_string());
            }
        }

        // Otherwise try Chat Completions format: choices[0].delta.content
        chunk.get("choices")
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
            
            let prompt_tokens = usage.get("prompt_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let completion_tokens = usage.get("completion_tokens")
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
                    metadata.reasoning_tokens = ctd.get("reasoning_tokens").and_then(|v| v.as_i64());
                    metadata.audio_tokens_output = ctd.get("audio_tokens").and_then(|v| v.as_i64());
                    metadata.accepted_prediction_tokens = ctd.get("accepted_prediction_tokens").and_then(|v| v.as_i64());
                    metadata.rejected_prediction_tokens = ctd.get("rejected_prediction_tokens").and_then(|v| v.as_i64());
                    
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
                    if let Some(cache_creation_input_tokens) = ptd.get("cache_creation_input_tokens").and_then(|v| v.as_i64()) {
                        metadata.cache_creation_input_tokens = Some(cache_creation_input_tokens);
                    }
                    if let Some(cache_read_input_tokens) = ptd.get("cache_read_input_tokens").and_then(|v| v.as_i64()) {
                        metadata.cache_read_input_tokens = Some(cache_read_input_tokens);
                    }
                }
                
                // Extract system info from chunk root
                metadata.system_fingerprint = chunk.get("system_fingerprint")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                
                metadata.model_version = chunk.get("model")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                
                // Extract ID if present
                metadata.response_id = chunk.get("id")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                
                metadata.provider = Some("OpenAI".to_string());
                
                // Store the full usage object for debugging/future fields
                metadata.provider_specific = Some(usage.clone());
                
                
                let mut usage = ProviderUsage::new(
                    prompt_tokens,        // Total input tokens
                    completion_tokens,    // Total output tokens
                    0,                   // cache_write_tokens (OpenAI doesn't report separately)
                    cached_tokens,       // cache_read_tokens
                    self.model_id.clone()
                );
                usage.metadata = Some(metadata);
                return Some(usage);
            }
        }
        None
    }
}


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
                    choice.delta.content.is_some() || 
                    choice.delta.role.is_some() ||
                    choice.finish_reason.is_some()
                });
                
                let has_usage = openai_chunk.usage.is_some();
                
                // Only transform chunks that have actual content or usage data
                if has_content || has_usage {
                    // Convert OpenAI chunk to OpenRouter format
                    let choices: Vec<OpenRouterStreamChoice> = openai_chunk.choices.into_iter()
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
                        cached_input_tokens: u.prompt_tokens_details.as_ref()
                            .and_then(|ptd| ptd.cached_tokens)
                            .unwrap_or(0),
                        cache_write_tokens: 0,
                        cache_read_tokens: u.prompt_tokens_details.as_ref()
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
                debug!("Failed to deserialize XAI chunk: {}, ignoring malformed data", e);
                Ok(TransformResult::Ignore)
            }
        }
    }
    
    fn handle_error_chunk(&self, error: &Value) -> StreamError {
        let error_message = error.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown XAI API error");
        StreamError::ProviderError(format!("XAI API error: {}", error_message))
    }
    
    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // XAI sends text in choices[0].delta.content (same as OpenAI)
        chunk.get("choices")
            .and_then(|choices| choices.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(|content| content.as_str())
            .map(|s| s.to_string())
    }
    
    fn extract_usage_from_chunk(&self, chunk: &Value) -> Option<ProviderUsage> {
        if let Some(usage) = chunk.get("usage") {
            let prompt_tokens = usage.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let completion_tokens = usage.get("completion_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            
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
                    metadata.reasoning_tokens = ctd.get("reasoning_tokens").and_then(|v| v.as_i64());
                    metadata.audio_tokens_output = ctd.get("audio_tokens").and_then(|v| v.as_i64());
                    metadata.accepted_prediction_tokens = ctd.get("accepted_prediction_tokens").and_then(|v| v.as_i64());
                    metadata.rejected_prediction_tokens = ctd.get("rejected_prediction_tokens").and_then(|v| v.as_i64());
                    
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
                    if let Some(cache_creation_input_tokens) = ptd.get("cache_creation_input_tokens").and_then(|v| v.as_i64()) {
                        metadata.cache_creation_input_tokens = Some(cache_creation_input_tokens);
                    }
                    if let Some(cache_read_input_tokens) = ptd.get("cache_read_input_tokens").and_then(|v| v.as_i64()) {
                        metadata.cache_read_input_tokens = Some(cache_read_input_tokens);
                    }
                }
                
                // Extract system info from chunk root
                metadata.system_fingerprint = chunk.get("system_fingerprint")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                
                metadata.model_version = chunk.get("model")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                
                // Extract ID if present
                metadata.response_id = chunk.get("id")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                
                metadata.provider = Some("XAI".to_string());
                
                // Extract XAI-specific fields
                let mut provider_specific_map = serde_json::Map::new();
                
                if let Some(num_sources) = usage.get("num_sources_used") {
                    provider_specific_map.insert("num_sources_used".to_string(), num_sources.clone());
                }
                
                // Store any XAI-specific usage fields
                if let Some(web_search_count) = usage.get("web_search_count") {
                    provider_specific_map.insert("web_search_count".to_string(), web_search_count.clone());
                }
                
                if !provider_specific_map.is_empty() {
                    metadata.provider_specific = Some(serde_json::Value::Object(provider_specific_map));
                } else {
                    // Store the full usage object for debugging/future fields
                    metadata.provider_specific = Some(usage.clone());
                }
                
                
                let mut usage = ProviderUsage::new(
                    prompt_tokens,
                    completion_tokens,
                    0,                    // cache_write_tokens (XAI doesn't report separately)
                    cached_tokens,
                    self.model_id.clone()
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

impl OpenRouterStreamTransformer {
    
}

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
            if choices.as_array().map(|arr| arr.is_empty()).unwrap_or(false) {
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
                debug!("Failed to deserialize OpenRouter chunk: {}, ignoring malformed data", e);
                Ok(TransformResult::Ignore)
            }
        }
    }
    
    fn handle_error_chunk(&self, error: &Value) -> StreamError {
        let error_message = error.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown OpenRouter API error");
        StreamError::ProviderError(format!("OpenRouter API error: {}", error_message))
    }
    
    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // OpenRouter sends text in choices[0].delta.content (same as OpenAI)
        chunk.get("choices")
            .and_then(|choices| choices.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(|content| content.as_str())
            .map(|s| s.to_string())
    }
    
    fn extract_usage_from_chunk(&self, chunk: &Value) -> Option<ProviderUsage> {
        if let Some(usage) = chunk.get("usage") {
            let prompt_tokens = usage.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let completion_tokens = usage.get("completion_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            
            // Extract cached tokens from prompt_tokens_details
            let cached_tokens = usage.get("prompt_tokens_details")
                .and_then(|details| details.get("cached_tokens"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            
            // Enhanced cost information extraction - handles all OpenRouter cost formats
            let cost = usage.get("cost").and_then(|v| match v {
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
                            obj.get("total")
                                .and_then(|total| match total {
                                    Value::Number(n) => n.as_f64(),
                                    Value::String(s) => s.parse::<f64>().ok(),
                                    _ => None,
                                })
                        })
                },
                _ => None,
            }).and_then(|f| BigDecimal::from_str(&f.to_string()).ok());
            
            // CRITICAL FIX: Extract usage data whenever cost is present OR tokens are present
            // This ensures we capture intermediate chunks with cost information even with zero tokens
            if prompt_tokens > 0 || completion_tokens > 0 || cached_tokens > 0 || cost.is_some() {
                // Create metadata to capture additional fields
                let mut metadata = crate::models::usage_metadata::UsageMetadata::default();
                
                // Extract reasoning tokens
                if let Some(ctd) = usage.get("completion_tokens_details") {
                    metadata.reasoning_tokens = ctd.get("reasoning_tokens").and_then(|v| v.as_i64());
                }
                
                // Extract cost details with comprehensive parsing
                if let Some(cost_details) = usage.get("cost_details") {
                    metadata.upstream_inference_cost = cost_details.get("upstream_inference_cost")
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
                        cost_val
                    )
                } else {
                    ProviderUsage::new(
                        prompt_tokens,
                        completion_tokens,
                        0,
                        cached_tokens,
                        self.model_id.clone()
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

