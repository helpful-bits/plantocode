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

use actix_web::web;
use serde_json::{json, Value};
use tracing::{debug, error, info};
use uuid::Uuid;
use chrono;
use bigdecimal::BigDecimal;
use std::str::FromStr;

use crate::handlers::streaming_handler::{StreamChunkTransformer, TransformResult, StreamError};
use crate::clients::google_client::{GoogleStreamChunk, GoogleUsageMetadata};
use crate::clients::open_router_client::{OpenRouterStreamChunk, OpenRouterStreamChoice, OpenRouterStreamDelta, OpenRouterUsage};
use crate::clients::usage_extractor::ProviderUsage;

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
    last_usage_metadata: std::sync::Mutex<Option<crate::clients::google_client::GoogleUsageMetadata>>,
}

impl GoogleStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
            last_usage_metadata: std::sync::Mutex::new(None),
        }
    }
    
    /// Convert GoogleStreamChunk to OpenRouterStreamChunk format
    fn convert_google_to_openrouter(&self, google_chunk: GoogleStreamChunk) -> OpenRouterStreamChunk {
        let choices = if let Some(candidates) = google_chunk.candidates {
            candidates.into_iter().map(|candidate| {
                let content = candidate.content
                    .and_then(|c| c.parts.into_iter().next())
                    .map(|p| p.text)
                    .unwrap_or_default();
                
                OpenRouterStreamChoice {
                    delta: OpenRouterStreamDelta {
                        role: Some("assistant".to_string()),
                        content: if content.is_empty() { None } else { Some(content) },
                    },
                    index: candidate.index,
                    finish_reason: candidate.finish_reason,
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
        });

        OpenRouterStreamChunk {
            id: format!("chatcmpl-{}", Uuid::new_v4()),
            choices,
            created: Some(chrono::Utc::now().timestamp()),
            model: self.model_id.clone(),
            object: Some("chat.completion.chunk".to_string()),
            usage,
        }
    }
}

impl StreamChunkTransformer for GoogleStreamTransformer {
    fn transform_chunk(&self, chunk: &[u8]) -> Result<TransformResult, StreamError> {
        // Step 1: Convert to UTF-8 string
        let chunk_str = std::str::from_utf8(chunk)
            .map_err(|e| StreamError::ParseError(format!("Invalid UTF-8 in Google chunk: {}", e)))?;
        
        // Handle SSE format (data: prefix)
        let json_str = if chunk_str.starts_with("data: ") {
            let data_content = &chunk_str[6..];
            if data_content.trim() == "[DONE]" {
                debug!("Google transformer: Received [DONE] marker");
                return Ok(TransformResult::Done);
            }
            data_content
        } else {
            debug!("Google transformer: Chunk missing 'data: ' prefix, ignoring");
            return Ok(TransformResult::Ignore);
        };
        
        // Step 2: Parse to JSON Value first (robust parsing)
        let chunk_value = match serde_json::from_str::<Value>(json_str) {
            Ok(value) => value,
            Err(e) => {
                debug!("Google transformer: Ignoring unparseable chunk: {} - Error: {}", json_str, e);
                return Ok(TransformResult::Ignore);
            }
        };
        
        // Step 3: Check for Google API error objects
        if let Some(error_obj) = chunk_value.get("error") {
            error!("Google API error in stream chunk: {}", error_obj);
            return Err(self.handle_error_chunk(error_obj));
        }
        
        // Step 4: Try to deserialize as GoogleStreamChunk
        match serde_json::from_value::<GoogleStreamChunk>(chunk_value.clone()) {
            Ok(google_chunk) => {
                // Store usage metadata if present (Google sends cumulative totals)
                if let Some(ref usage_metadata) = google_chunk.usage_metadata {
                    if let Ok(mut last_usage) = self.last_usage_metadata.lock() {
                        *last_usage = Some(usage_metadata.clone());
                    }
                }
                
                let openrouter_chunk = self.convert_google_to_openrouter(google_chunk);
                let converted_json = serde_json::to_string(&openrouter_chunk)
                    .unwrap_or_else(|_| "{}".to_string());
                Ok(TransformResult::Transformed(web::Bytes::from(format!("data: {}\n\n", converted_json))))
            }
            Err(e) => {
                debug!("Google transformer: Failed to parse as GoogleStreamChunk: {}, ignoring", e);
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
    
    fn process_chunk_for_usage(&self, chunk: &[u8]) {
        let chunk_str = match std::str::from_utf8(chunk) {
            Ok(s) => s,
            Err(_) => return,
        };
        
        let json_str = if chunk_str.starts_with("data: ") {
            &chunk_str[6..]
        } else {
            chunk_str
        };
        
        if let Ok(chunk_value) = serde_json::from_str::<Value>(json_str) {
            if let Ok(google_chunk) = serde_json::from_value::<GoogleStreamChunk>(chunk_value) {
                if let Some(usage_metadata) = google_chunk.usage_metadata {
                    if let Ok(mut last_usage) = self.last_usage_metadata.lock() {
                        *last_usage = Some(usage_metadata);
                    }
                }
            }
        }
    }
    
    fn get_final_usage(&self) -> Option<ProviderUsage> {
        if let Ok(mut last_usage_guard) = self.last_usage_metadata.lock() {
            if let Some(usage_metadata) = last_usage_guard.take() {
                return Some(ProviderUsage {
                    prompt_tokens: usage_metadata.prompt_token_count,
                    completion_tokens: usage_metadata.candidates_token_count.unwrap_or(0),
                    cache_write_tokens: 0,
                    cache_read_tokens: usage_metadata.cached_content_token_count.unwrap_or(0),
                    model_id: self.model_id.clone(),
                    duration_ms: None,
                    cost: None,
                });
            }
        }
        None
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
    
    fn extract_usage_from_chunk(&self, _chunk: &Value) -> Option<(i32, i32)> {
        // Google doesn't provide incremental usage updates during streaming
        // Usage is only provided in the final chunk with usageMetadata
        None
    }
}

/// Anthropic stream transformer - injects OpenRouter fields into native format
/// 
/// Anthropic sends streaming chunks in their native format with:
/// - type field instead of object
/// - Missing required id field for OpenRouter compatibility
/// - Different structure for content deltas
/// - message_delta events containing incremental usage
/// 
/// This transformer robustly handles:
/// - Anthropic API error chunks (converts to StreamError)
/// - Native format detection and field injection
/// - Malformed chunks (returns Ignore, never forwards)
/// - Final chunks with usage information (extracts for billing)
/// - Incremental usage updates from message_delta events
pub struct AnthropicStreamTransformer {
    model_id: String,
    final_usage: std::sync::Mutex<Option<ProviderUsage>>,
}

impl AnthropicStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
            final_usage: std::sync::Mutex::new(None),
        }
    }
}

impl StreamChunkTransformer for AnthropicStreamTransformer {
    fn transform_chunk(&self, chunk: &[u8]) -> Result<TransformResult, StreamError> {
        // Step 1: Convert to UTF-8 string
        let chunk_str = std::str::from_utf8(chunk)
            .map_err(|e| StreamError::ParseError(format!("Invalid UTF-8 in Anthropic chunk: {}", e)))?;
        
        // Handle SSE format (data: prefix)
        let json_str = if chunk_str.starts_with("data: ") {
            let data_content = &chunk_str[6..];
            if data_content.trim() == "[DONE]" {
                debug!("Anthropic transformer: Received [DONE] marker");
                return Ok(TransformResult::Done);
            }
            data_content
        } else {
            debug!("Anthropic transformer: Chunk missing 'data: ' prefix, ignoring");
            return Ok(TransformResult::Ignore);
        };
        
        // Step 2: Parse to JSON Value first (robust parsing)
        let mut chunk_value = match serde_json::from_str::<Value>(json_str) {
            Ok(value) => value,
            Err(e) => {
                debug!("Anthropic transformer: Ignoring unparseable chunk: {} - Error: {}", json_str, e);
                return Ok(TransformResult::Ignore);
            }
        };
        
        // Step 3: Check for Anthropic API error objects
        if let Some(error_obj) = chunk_value.get("error") {
            error!("Anthropic API error in stream chunk: {}", error_obj);
            return Err(self.handle_error_chunk(error_obj));
        }
        
        // Step 4: Detect native Anthropic format and inject OpenRouter fields
        if chunk_value.get("type").is_some() && chunk_value.get("id").is_none() {
            // Inject required OpenRouter fields for client compatibility
            chunk_value["id"] = Value::String(format!("chatcmpl-{}", Uuid::new_v4()));
            chunk_value["object"] = Value::String("chat.completion.chunk".to_string());
            chunk_value["created"] = Value::Number(serde_json::Number::from(chrono::Utc::now().timestamp()));
            chunk_value["model"] = Value::String(self.model_id.clone());
        }
        
        // Step 5: Convert to OpenRouter format and return
        let converted_json = serde_json::to_string(&chunk_value)
            .unwrap_or_else(|_| "{}".to_string());
        Ok(TransformResult::Transformed(web::Bytes::from(format!("data: {}\n\n", converted_json))))
    }
    
    fn handle_error_chunk(&self, error: &Value) -> StreamError {
        let error_message = error.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown Anthropic API error");
        StreamError::ProviderError(format!("Anthropic API error: {}", error_message))
    }
    
    fn process_chunk_for_usage(&self, chunk: &[u8]) {
        let chunk_str = match std::str::from_utf8(chunk) {
            Ok(s) => s,
            Err(_) => return,
        };
        
        let json_str = if chunk_str.starts_with("data: ") {
            &chunk_str[6..]
        } else {
            chunk_str
        };
        
        if let Ok(chunk_value) = serde_json::from_str::<Value>(json_str) {
            if let Some(usage_obj) = chunk_value.get("usage") {
                let prompt_tokens = usage_obj.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let completion_tokens = usage_obj.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let cache_write_tokens = usage_obj.get("cache_creation_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let cache_read_tokens = usage_obj.get("cache_read_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                
                let total_prompt_tokens = prompt_tokens + cache_write_tokens + cache_read_tokens;
                
                if let Ok(mut usage_guard) = self.final_usage.lock() {
                    *usage_guard = Some(ProviderUsage {
                        prompt_tokens: total_prompt_tokens,
                        completion_tokens,
                        cache_write_tokens,
                        cache_read_tokens,
                        model_id: self.model_id.clone(),
                        duration_ms: None,
                        cost: None,
                    });
                }
            }
        }
    }
    
    fn get_final_usage(&self) -> Option<ProviderUsage> {
        if let Ok(mut usage_guard) = self.final_usage.lock() {
            usage_guard.take()
        } else {
            None
        }
    }
    
    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // Anthropic can send text in different formats depending on the chunk type
        
        // First try the standard OpenRouter format (choices[0].delta.content)
        if let Some(content) = chunk.get("choices")
            .and_then(|choices| choices.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(|content| content.as_str()) {
            return Some(content.to_string());
        }
        
        // Try Anthropic native format (delta.text for content_block_delta)
        if chunk.get("type") == Some(&Value::String("content_block_delta".to_string())) {
            if let Some(text) = chunk.get("delta")
                .and_then(|delta| delta.get("text"))
                .and_then(|text| text.as_str()) {
                return Some(text.to_string());
            }
        }
        
        // Try message delta format
        if chunk.get("type") == Some(&Value::String("message_delta".to_string())) {
            if let Some(text) = chunk.get("delta")
                .and_then(|delta| delta.get("content"))
                .and_then(|content| content.as_str()) {
                return Some(text.to_string());
            }
        }
        
        None
    }
    
    fn extract_usage_from_chunk(&self, chunk: &Value) -> Option<(i32, i32)> {
        // Anthropic sends cumulative usage in message_delta events
        if chunk.get("type") == Some(&Value::String("message_delta".to_string())) {
            if let Some(usage) = chunk.get("usage") {
                let input_tokens = usage.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let output_tokens = usage.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                
                if input_tokens > 0 || output_tokens > 0 {
                    // For message_delta events, also check for cache tokens
                    let cache_creation = usage.get("cache_creation_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let cache_read = usage.get("cache_read_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let total_input = input_tokens + cache_creation + cache_read;
                    
                    debug!("Extracted incremental usage from Anthropic message_delta: input={}, cache_creation={}, cache_read={}, output={}", 
                           input_tokens, cache_creation, cache_read, output_tokens);
                    return Some((total_input, output_tokens));
                }
            }
        }
        
        None
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
    final_usage: std::sync::Mutex<Option<ProviderUsage>>,
}

impl OpenAIStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
            final_usage: std::sync::Mutex::new(None),
        }
    }
}

impl StreamChunkTransformer for OpenAIStreamTransformer {
    fn transform_chunk(&self, chunk: &[u8]) -> Result<TransformResult, StreamError> {
        // Step 1: Convert to UTF-8 string
        let chunk_str = std::str::from_utf8(chunk)
            .map_err(|e| StreamError::ParseError(format!("Invalid UTF-8 in OpenAI chunk: {}", e)))?;
        
        // Handle SSE format (data: prefix)
        if !chunk_str.starts_with("data: ") {
            debug!("OpenAI transformer: Chunk missing 'data: ' prefix, ignoring");
            return Ok(TransformResult::Ignore);
        }
        
        let data_content = &chunk_str[6..];
        if data_content.trim() == "[DONE]" {
            debug!("OpenAI transformer: Received [DONE] marker");
            return Ok(TransformResult::Done);
        }
        
        // Step 2: Parse to JSON Value first (robust parsing)
        let chunk_value = match serde_json::from_str::<Value>(data_content) {
            Ok(value) => value,
            Err(e) => {
                debug!("OpenAI transformer: Ignoring unparseable chunk: {} - Error: {}", data_content, e);
                return Ok(TransformResult::Ignore);
            }
        };
        
        // Step 3: Check for OpenAI API error objects
        if let Some(error_obj) = chunk_value.get("error") {
            error!("OpenAI API error in stream chunk: {}", error_obj);
            return Err(self.handle_error_chunk(error_obj));
        }
        
        // Step 4: Validate as OpenRouterStreamChunk and forward
        match serde_json::from_value::<OpenRouterStreamChunk>(chunk_value) {
            Ok(_) => {
                // Valid OpenRouter format, forward as-is
                Ok(TransformResult::Transformed(web::Bytes::copy_from_slice(chunk)))
            }
            Err(e) => {
                debug!("OpenAI transformer: Failed to validate as OpenRouterStreamChunk: {}, ignoring", e);
                Ok(TransformResult::Ignore)
            }
        }
    }
    
    fn handle_error_chunk(&self, error: &Value) -> StreamError {
        let error_message = error.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown OpenAI API error");
        StreamError::ProviderError(format!("OpenAI API error: {}", error_message))
    }
    
    fn process_chunk_for_usage(&self, chunk: &[u8]) {
        let chunk_str = match std::str::from_utf8(chunk) {
            Ok(s) => s,
            Err(_) => return,
        };
        
        let json_str = if chunk_str.starts_with("data: ") {
            &chunk_str[6..]
        } else {
            chunk_str
        };
        
        if let Ok(chunk_value) = serde_json::from_str::<Value>(json_str) {
            if let Some(usage_obj) = chunk_value.get("usage") {
                let prompt_tokens = usage_obj.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let completion_tokens = usage_obj.get("completion_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                
                let cache_read_tokens = usage_obj.get("prompt_tokens_details")
                    .and_then(|details| details.get("cached_tokens"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;
                
                let cache_write_tokens = if cache_read_tokens > 0 {
                    prompt_tokens - cache_read_tokens
                } else {
                    0
                };
                
                if let Ok(mut usage_guard) = self.final_usage.lock() {
                    *usage_guard = Some(ProviderUsage {
                        prompt_tokens,
                        completion_tokens,
                        cache_write_tokens,
                        cache_read_tokens,
                        model_id: self.model_id.clone(),
                        duration_ms: None,
                        cost: None,
                    });
                }
            }
        }
    }
    
    fn get_final_usage(&self) -> Option<ProviderUsage> {
        if let Ok(mut usage_guard) = self.final_usage.lock() {
            usage_guard.take()
        } else {
            None
        }
    }
    
    fn extract_text_delta(&self, chunk: &Value) -> Option<String> {
        // OpenAI sends text in choices[0].delta.content
        chunk.get("choices")
            .and_then(|choices| choices.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(|content| content.as_str())
            .map(|s| s.to_string())
    }
    
    fn extract_usage_from_chunk(&self, chunk: &Value) -> Option<(i32, i32)> {
        // OpenAI reports usage in the final chunk with finish_reason
        // Check if this is a usage update chunk (has usage but may not have finish_reason yet)
        if let Some(_usage) = chunk.get("usage") {
            // OpenAI sends cumulative usage in each chunk that has usage data
            // We need to calculate the delta from the last known values
            // For now, return None as OpenAI doesn't provide true incremental usage
            // The final usage will be captured by extract_usage_if_final
            None
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
    final_usage: std::sync::Mutex<Option<ProviderUsage>>,
}

impl OpenRouterStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
            final_usage: std::sync::Mutex::new(None),
        }
    }
}

impl StreamChunkTransformer for OpenRouterStreamTransformer {
    fn transform_chunk(&self, chunk: &[u8]) -> Result<TransformResult, StreamError> {
        // Step 1: Convert to UTF-8 string
        let chunk_str = std::str::from_utf8(chunk)
            .map_err(|e| StreamError::ParseError(format!("Invalid UTF-8 in OpenRouter chunk: {}", e)))?;
        
        // Handle SSE format (data: prefix)
        if !chunk_str.starts_with("data: ") {
            debug!("OpenRouter transformer: Chunk missing 'data: ' prefix, ignoring");
            return Ok(TransformResult::Ignore);
        }
        
        let data_content = &chunk_str[6..];
        if data_content.trim() == "[DONE]" {
            debug!("OpenRouter transformer: Received [DONE] marker");
            return Ok(TransformResult::Done);
        }
        
        // Step 2: Parse to JSON Value first (robust parsing)
        let chunk_value = match serde_json::from_str::<Value>(data_content) {
            Ok(value) => value,
            Err(e) => {
                debug!("OpenRouter transformer: Ignoring unparseable chunk: {} - Error: {}", data_content, e);
                return Ok(TransformResult::Ignore);
            }
        };
        
        // Step 3: Check for OpenRouter API error objects
        if let Some(error_obj) = chunk_value.get("error") {
            error!("OpenRouter API error in stream chunk: {}", error_obj);
            return Err(self.handle_error_chunk(error_obj));
        }
        
        // Step 4: If it's a valid OpenRouter chunk, re-serialize it and return Transformed
        match serde_json::from_value::<OpenRouterStreamChunk>(chunk_value.clone()) {
            Ok(_) => {
                // Valid OpenRouter format, re-serialize and return
                let re_serialized = serde_json::to_string(&chunk_value).unwrap_or_default();
                Ok(TransformResult::Transformed(web::Bytes::from(format!("data: {}\n\n", re_serialized))))
            }
            Err(e) => {
                debug!("OpenRouter transformer: Failed to validate as OpenRouterStreamChunk: {}, ignoring", e);
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
    
    fn process_chunk_for_usage(&self, chunk: &[u8]) {
        let chunk_str = match std::str::from_utf8(chunk) {
            Ok(s) => s,
            Err(_) => return,
        };
        
        let json_str = if chunk_str.starts_with("data: ") {
            &chunk_str[6..]
        } else {
            chunk_str
        };
        
        if json_str.trim() == "[DONE]" {
            return;
        }
        
        if let Ok(chunk_value) = serde_json::from_str::<Value>(json_str) {
            if let Some(usage_obj) = chunk_value.get("usage") {
                let prompt_tokens = usage_obj.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let completion_tokens = usage_obj.get("completion_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                
                let cache_read_tokens = usage_obj.get("cached_input_tokens")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;
                
                if let Ok(mut usage_guard) = self.final_usage.lock() {
                    *usage_guard = Some(ProviderUsage {
                        prompt_tokens,
                        completion_tokens,
                        cache_write_tokens: 0,
                        cache_read_tokens,
                        model_id: self.model_id.clone(),
                        duration_ms: None,
                        cost: usage_obj.get("cost").and_then(|v| v.as_f64()).map(|f| BigDecimal::from_str(&f.to_string()).unwrap_or_default()),
                    });
                }
            }
        }
    }
    
    fn get_final_usage(&self) -> Option<ProviderUsage> {
        if let Ok(mut usage_guard) = self.final_usage.lock() {
            usage_guard.take()
        } else {
            None
        }
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
    
    fn extract_usage_from_chunk(&self, _chunk: &Value) -> Option<(i32, i32)> {
        // OpenRouter doesn't provide incremental usage updates during streaming
        // Usage is only provided in the final chunk
        None
    }
}