// Token estimator for server-side accurate token counting and billing
// This module provides accurate token estimation using tiktoken-rs for:
// 1. Upfront billing estimation (before API calls)
// 2. Real-time streaming updates (during API calls)
// 3. Consistency with desktop client estimation

use log::debug;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use tiktoken_rs::{cl100k_base, get_bpe_from_model, o200k_base};

/// Provider-prefix to tokenizer mapping for performance optimization
/// This avoids trying model-specific tokenizers and goes straight to the appropriate encoding
static PROVIDER_TOKENIZER_MAP: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    let mut map = HashMap::new();

    // OpenAI models
    map.insert("gpt-4", "gpt-4");
    map.insert("gpt-4-turbo", "gpt-4-turbo");
    map.insert("gpt-4o", "gpt-4o");
    map.insert("gpt-3.5-turbo", "gpt-3.5-turbo");
    map.insert("text-embedding-3", "text-embedding-3-large");
    map.insert("text-embedding-ada", "text-embedding-ada-002");

    // Anthropic models (use cl100k_base)
    map.insert("claude", "cl100k_base");

    // Google models (use cl100k_base)
    map.insert("gemini", "cl100k_base");

    // Meta models (use cl100k_base)
    map.insert("llama", "cl100k_base");

    // Mistral models (use cl100k_base)
    map.insert("mistral", "cl100k_base");

    // Default fallback
    map.insert("default", "cl100k_base");

    map
});

/// Get the appropriate tokenizer encoding for a model using provider-prefix mapping
/// This is more efficient than trying get_bpe_from_model which may fail
fn get_tokenizer_encoding_for_model(model: &str) -> Result<tiktoken_rs::CoreBPE, anyhow::Error> {
    // Check direct model match first
    if let Ok(tokenizer) = get_bpe_from_model(model) {
        return Ok(tokenizer);
    }

    // Try provider-prefix mapping
    let model_lower = model.to_lowercase();
    for (prefix, encoding_name) in PROVIDER_TOKENIZER_MAP.iter() {
        if model_lower.starts_with(prefix) {
            debug!(
                "Using provider-prefix mapping: {} -> {}",
                model, encoding_name
            );
            return match *encoding_name {
                "cl100k_base" => cl100k_base(),
                "o200k_base" => o200k_base(),
                _ => get_bpe_from_model(encoding_name),
            };
        }
    }

    // Fallback to cl100k_base
    debug!(
        "No provider-prefix match for '{}', using cl100k_base fallback",
        model
    );
    cl100k_base()
}

/// Estimate the number of tokens in a text string using tiktoken-rs
///
/// This function uses the tiktoken-rs library to get accurate token counts for the specified model.
/// Falls back to cl100k_base encoding if the model-specific tokenizer is not found.
///
/// This is used for:
/// - Upfront billing estimation (critical for fair charging)
/// - Real-time streaming updates (for accurate user feedback)
/// - Consistency with desktop client estimates
///
/// # Arguments
///
/// * `text` - The text content to estimate tokens for
/// * `model` - The model name to get the appropriate tokenizer for
///
/// # Returns
///
/// Estimated token count as u32
pub fn estimate_tokens(text: &str, model: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }

    // Use provider-prefix-based tokenizer mapping for improved performance
    let tokenizer = match get_tokenizer_encoding_for_model(model) {
        Ok(tokenizer) => tokenizer,
        Err(_) => {
            // Final fallback to character-based heuristic
            debug!(
                "All tokenizer approaches failed for '{}', using character-based heuristic",
                model
            );
            let char_count = text.chars().count() as u32;
            return (char_count + 3) / 4; // 4 characters per token heuristic
        }
    };

    // Encode the text and return the token count
    let tokens = tokenizer.encode_with_special_tokens(text);
    let token_count = tokens.len() as u32;
    debug!(
        "Estimated {} tokens for {} characters using model '{}'",
        token_count,
        text.chars().count(),
        model
    );
    token_count
}

/// Estimate tokens for a complete prompt request
///
/// This function estimates tokens for a complete LLM request including all messages.
/// It properly handles different message formats and content types.
///
/// # Arguments
///
/// * `messages` - The messages array from the request
/// * `model` - The model name to get the appropriate tokenizer for
///
/// # Returns
///
/// Estimated token count as u32
pub fn estimate_tokens_for_messages(messages: &[serde_json::Value], model: &str) -> u32 {
    let mut total_tokens = 0;

    for message in messages {
        if let Some(content) = extract_content_from_message(message) {
            total_tokens += estimate_tokens(&content, model);
        }
    }

    // Add overhead for message formatting (roughly 4 tokens per message)
    total_tokens + (messages.len() as u32 * 4)
}

/// Extract text content from a message object
///
/// Handles different message formats:
/// - Simple string content
/// - Complex content arrays
/// - Different provider formats
///
/// # Arguments
///
/// * `message` - The message object to extract content from
///
/// # Returns
///
/// Combined text content as String
fn extract_content_from_message(message: &serde_json::Value) -> Option<String> {
    match message {
        serde_json::Value::Object(obj) => {
            if let Some(content) = obj.get("content") {
                match content {
                    serde_json::Value::String(s) => Some(s.clone()),
                    serde_json::Value::Array(arr) => {
                        let mut combined = String::new();
                        for item in arr {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                combined.push_str(text);
                            }
                        }
                        if !combined.is_empty() {
                            Some(combined)
                        } else {
                            None
                        }
                    }
                    _ => None,
                }
            } else {
                None
            }
        }
        serde_json::Value::String(s) => Some(s.clone()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_estimate_tokens_empty() {
        assert_eq!(estimate_tokens("", "gpt-4"), 0);
    }

    #[test]
    fn test_estimate_tokens_gpt4() {
        let text = "Hello, world!";
        let tokens = estimate_tokens(text, "gpt-4");
        // Should be more accurate than simple character counting
        assert!(tokens > 0);
        assert!(tokens < 20); // Reasonable upper bound
    }

    #[test]
    fn test_estimate_tokens_gpt35() {
        let text = "The quick brown fox jumps over the lazy dog";
        let tokens_gpt4 = estimate_tokens(text, "gpt-4");
        let tokens_gpt35 = estimate_tokens(text, "gpt-3.5-turbo");

        // Both should give reasonable token counts
        assert!(tokens_gpt4 > 0);
        assert!(tokens_gpt35 > 0);
    }

    #[test]
    fn test_estimate_tokens_fallback() {
        let text = "Hello, world!";
        let tokens = estimate_tokens(text, "unknown-model");
        // Should fall back to cl100k_base or character heuristic
        assert!(tokens > 0);
        assert!(tokens < 20);
    }

    #[test]
    fn test_estimate_tokens_for_messages() {
        let messages = vec![
            json!({
                "role": "user",
                "content": "Hello, how are you?"
            }),
            json!({
                "role": "assistant",
                "content": "I'm doing well, thank you!"
            }),
        ];

        let tokens = estimate_tokens_for_messages(&messages, "gpt-4");
        assert!(tokens > 10); // Should include content + overhead
        assert!(tokens < 50); // Reasonable upper bound
    }

    #[test]
    fn test_extract_content_from_message() {
        let message = json!({
            "role": "user",
            "content": "Hello, world!"
        });

        let content = extract_content_from_message(&message);
        assert_eq!(content, Some("Hello, world!".to_string()));
    }

    #[test]
    fn test_extract_content_from_complex_message() {
        let message = json!({
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Hello, "
                },
                {
                    "type": "text",
                    "text": "world!"
                }
            ]
        });

        let content = extract_content_from_message(&message);
        assert_eq!(content, Some("Hello, world!".to_string()));
    }
}
