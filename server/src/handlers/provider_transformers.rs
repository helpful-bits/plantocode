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

use crate::handlers::streaming_handler::{StreamChunkTransformer, TransformResult, StreamError};
use crate::clients::google_client::GoogleStreamChunk;
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
            completion_tokens: metadata.candidates_token_count,
            total_tokens: metadata.total_token_count,
            cost: None, // Will be filled by billing system
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
        match serde_json::from_value::<GoogleStreamChunk>(chunk_value) {
            Ok(google_chunk) => {
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
    
    fn is_final_chunk(&self, chunk: &Value) -> bool {
        // Check if this chunk has candidates with finish_reason
        chunk.get("candidates")
            .and_then(|candidates| candidates.as_array())
            .and_then(|arr| arr.first())
            .and_then(|candidate| candidate.get("finish_reason"))
            .is_some()
    }
    
    fn extract_usage_if_final(&self, chunk: &[u8], model_id: &str) -> Option<ProviderUsage> {
        let chunk_str = std::str::from_utf8(chunk).ok()?;
        let json_str = if chunk_str.starts_with("data: ") {
            &chunk_str[6..]
        } else {
            chunk_str
        };
        
        let chunk_value: Value = serde_json::from_str(json_str).ok()?;
        
        // Check if this is a final chunk with usage metadata
        let is_final = self.is_final_chunk(&chunk_value);
        let has_usage = chunk_value.get("usageMetadata").is_some();
        
        if is_final && has_usage {
            if let Ok(google_chunk) = serde_json::from_value::<GoogleStreamChunk>(chunk_value) {
                if let Some(usage_metadata) = google_chunk.usage_metadata {
                    return Some(ProviderUsage {
                        prompt_tokens: usage_metadata.prompt_token_count,
                        completion_tokens: usage_metadata.candidates_token_count,
                        cache_write_tokens: 0, // Google doesn't support cache
                        cache_read_tokens: 0,
                        model_id: model_id.to_string(),
                        duration_ms: None,
                        cost: None,
                    });
                }
            }
        }
        
        None
    }
}

/// Anthropic stream transformer - injects OpenRouter fields into native format
/// 
/// Anthropic sends streaming chunks in their native format with:
/// - type field instead of object
/// - Missing required id field for OpenRouter compatibility
/// - Different structure for content deltas
/// 
/// This transformer robustly handles:
/// - Anthropic API error chunks (converts to StreamError)
/// - Native format detection and field injection
/// - Malformed chunks (returns Ignore, never forwards)
/// - Final chunks with usage information (extracts for billing)
pub struct AnthropicStreamTransformer {
    model_id: String,
}

impl AnthropicStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
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
    
    fn is_final_chunk(&self, chunk: &Value) -> bool {
        // Check for Anthropic completion indicators
        if chunk.get("type") == Some(&Value::String("message_stop".to_string())) {
            return true;
        }
        if let Some(delta) = chunk.get("delta") {
            if delta.get("stop_reason").is_some() {
                return true;
            }
        }
        // Standard OpenRouter completion check
        chunk.get("choices")
            .and_then(|choices| choices.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("finish_reason"))
            .is_some()
    }
    
    fn extract_usage_if_final(&self, chunk: &[u8], model_id: &str) -> Option<ProviderUsage> {
        let chunk_str = std::str::from_utf8(chunk).ok()?;
        let json_str = if chunk_str.starts_with("data: ") {
            &chunk_str[6..]
        } else {
            chunk_str
        };
        
        let chunk_value: Value = serde_json::from_str(json_str).ok()?;
        
        // Check if this is a final chunk with usage information
        let is_final = self.is_final_chunk(&chunk_value);
        let has_usage = chunk_value.get("usage").is_some();
        
        if is_final && has_usage {
            if let Some(usage_obj) = chunk_value.get("usage") {
                let prompt_tokens = usage_obj.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let completion_tokens = usage_obj.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let cache_write_tokens = usage_obj.get("cache_creation_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let cache_read_tokens = usage_obj.get("cache_read_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                
                return Some(ProviderUsage {
                    prompt_tokens,
                    completion_tokens,
                    cache_write_tokens,
                    cache_read_tokens,
                    model_id: model_id.to_string(),
                    duration_ms: None,
                    cost: None,
                });
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
}

impl OpenAIStreamTransformer {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
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
    
    fn is_final_chunk(&self, chunk: &Value) -> bool {
        // Check if chunk has choices with finish_reason AND usage information
        let has_finish_reason = chunk.get("choices")
            .and_then(|choices| choices.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("finish_reason"))
            .is_some();
        let has_usage = chunk.get("usage").is_some();
        
        has_finish_reason && has_usage
    }
    
    fn extract_usage_if_final(&self, chunk: &[u8], model_id: &str) -> Option<ProviderUsage> {
        let chunk_str = std::str::from_utf8(chunk).ok()?;
        let json_str = if chunk_str.starts_with("data: ") {
            &chunk_str[6..]
        } else {
            chunk_str
        };
        
        let chunk_value: Value = serde_json::from_str(json_str).ok()?;
        
        // Check if this is a final chunk with usage information
        if self.is_final_chunk(&chunk_value) {
            if let Some(usage_obj) = chunk_value.get("usage") {
                let prompt_tokens = usage_obj.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let completion_tokens = usage_obj.get("completion_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                
                return Some(ProviderUsage {
                    prompt_tokens,
                    completion_tokens,
                    cache_write_tokens: 0, // OpenAI doesn't support cache in this context
                    cache_read_tokens: 0,
                    model_id: model_id.to_string(),
                    duration_ms: None,
                    cost: None,
                });
            }
        }
        
        None
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
    
    fn is_final_chunk(&self, chunk: &Value) -> bool {
        // Check if the chunk contains a finish_reason that is not null
        chunk.get("choices")
            .and_then(|choices| choices.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("finish_reason"))
            .and_then(|reason| reason.as_str())
            .is_some()
    }
    
    fn extract_usage_if_final(&self, chunk: &[u8], model_id: &str) -> Option<ProviderUsage> {
        let chunk_str = std::str::from_utf8(chunk).ok()?;
        let json_str = if chunk_str.starts_with("data: ") {
            &chunk_str[6..]
        } else {
            chunk_str
        };
        
        if json_str.trim() == "[DONE]" {
            return None;
        }
        
        let chunk_value: Value = serde_json::from_str(json_str).ok()?;
        
        // Check if this chunk has usage data and is a final chunk
        if let Some(usage_obj) = chunk_value.get("usage") {
            let is_final = chunk_value.get("choices")
                .and_then(|choices| choices.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("finish_reason"))
                .and_then(|reason| reason.as_str())
                .is_some();
            
            if is_final {
                let prompt_tokens = usage_obj.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let completion_tokens = usage_obj.get("completion_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                
                return Some(ProviderUsage {
                    prompt_tokens,
                    completion_tokens,
                    cache_write_tokens: 0,
                    cache_read_tokens: 0,
                    model_id: model_id.to_string(),
                    duration_ms: None,
                    cost: usage_obj.get("cost").and_then(|v| v.as_f64()),
                });
            }
        }
        
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_google_transformer_valid_chunk() {
        let transformer = GoogleStreamTransformer::new("gemini-1.5-pro");
        let chunk_data = r#"data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"assistant"},"index":0}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}"#;
        
        match transformer.transform_chunk(chunk_data.as_bytes()).unwrap() {
            TransformResult::Transformed(bytes) => {
                let response_str = std::str::from_utf8(&bytes).unwrap();
                assert!(response_str.contains("chatcmpl-"));
                assert!(response_str.contains("Hello"));
            }
            _ => panic!("Should transform valid Google chunk"),
        }
    }
    
    #[test]
    fn test_google_transformer_malformed_chunk() {
        let transformer = GoogleStreamTransformer::new("gemini-1.5-pro");
        let chunk_data = "data: {invalid json}";
        
        match transformer.transform_chunk(chunk_data.as_bytes()).unwrap() {
            TransformResult::Ignore => {}, // Expected
            _ => panic!("Should ignore malformed chunk"),
        }
    }
    
    #[test]
    fn test_anthropic_transformer_native_format() {
        let transformer = AnthropicStreamTransformer::new("claude-3-sonnet");
        let chunk_data = r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        
        match transformer.transform_chunk(chunk_data.as_bytes()).unwrap() {
            TransformResult::Transformed(bytes) => {
                let response_str = std::str::from_utf8(&bytes).unwrap();
                assert!(response_str.contains("chatcmpl-"));
                assert!(response_str.contains("chat.completion.chunk"));
            }
            _ => panic!("Should transform valid Anthropic chunk"),
        }
    }
    
    #[test]
    fn test_openai_transformer_passthrough() {
        let transformer = OpenAIStreamTransformer::new("gpt-4");
        let chunk_data = r#"data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"},"index":0}],"created":1234567890,"model":"gpt-4","object":"chat.completion.chunk"}"#;
        
        match transformer.transform_chunk(chunk_data.as_bytes()).unwrap() {
            TransformResult::Transformed(bytes) => {
                let original = std::str::from_utf8(chunk_data.as_bytes()).unwrap();
                let transformed = std::str::from_utf8(&bytes).unwrap();
                assert_eq!(original, transformed);
            }
            _ => panic!("Should pass through valid OpenAI chunk"),
        }
    }
    
    #[test]
    fn test_done_marker_handling() {
        let transformers: Vec<Box<dyn StreamChunkTransformer>> = vec![
            Box::new(GoogleStreamTransformer::new("test")),
            Box::new(AnthropicStreamTransformer::new("test")),
            Box::new(OpenAIStreamTransformer::new("test")),
            Box::new(OpenRouterStreamTransformer::new("test")),
        ];
        
        for transformer in transformers {
            let chunk_data = "data: [DONE]";
            match transformer.transform_chunk(chunk_data.as_bytes()).unwrap() {
                TransformResult::Done => {}, // Expected
                _ => panic!("Should handle [DONE] marker"),
            }
        }
    }
    
    #[test]
    fn test_error_chunk_handling() {
        let transformer = GoogleStreamTransformer::new("test");
        let chunk_data = r#"data: {"error": {"message": "API error"}}"#;
        
        match transformer.transform_chunk(chunk_data.as_bytes()) {
            Err(StreamError::ProviderError(msg)) => {
                assert!(msg.contains("Google API error"));
                assert!(msg.contains("API error"));
            }
            _ => panic!("Should convert error chunk to StreamError"),
        }
    }
}