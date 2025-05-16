// A token estimator for approximating token count
// This uses character counts with model-specific adjustments

// Average ratio of characters to tokens for English text
const CHARS_PER_TOKEN: f32 = 4.0;

// Different multipliers for non-English, code, XML, etc.
const CODE_CHARS_PER_TOKEN: f32 = 3.5; // Code is typically more token-dense
const JSON_CHARS_PER_TOKEN: f32 = 3.0; // JSON and structured data are even more token-dense

// No default max tokens constant, as all values should come from server config

// Overhead costs for adding structure
const MESSAGE_OVERHEAD_TOKENS: u32 = 5; // Overhead per message
const FILE_METADATA_OVERHEAD_TOKENS: u32 = 10; // Overhead per file when including file content

/// Estimate the number of tokens in a string
pub fn estimate_tokens(text: &str) -> u32 {
    let char_count = text.chars().count() as f32;
    (char_count / CHARS_PER_TOKEN).ceil() as u32
}

/// Estimate the number of tokens for code or structured data 
pub fn estimate_code_tokens(code: &str) -> u32 {
    let char_count = code.chars().count() as f32;
    (char_count / CODE_CHARS_PER_TOKEN).ceil() as u32
}

/// Estimate the number of tokens for JSON/XML data
pub fn estimate_structured_data_tokens(data: &str) -> u32 {
    let char_count = data.chars().count() as f32;
    (char_count / JSON_CHARS_PER_TOKEN).ceil() as u32
}

/// Estimate the number of tokens in multiple strings
pub fn estimate_tokens_for_texts(texts: &[&str]) -> u32 {
    texts.iter().map(|text| estimate_tokens(text)).sum()
}

/// Estimate the number of tokens in a conversation
pub fn estimate_conversation_tokens(
    system_prompt: Option<&str>,
    user_prompts: &[&str],
    assistant_responses: &[&str],
) -> u32 {
    let mut total = 0;
    
    // Add tokens for system prompt
    if let Some(prompt) = system_prompt {
        total += estimate_tokens(prompt);
    }
    
    // Add tokens for user prompts
    for prompt in user_prompts {
        total += estimate_tokens(prompt);
    }
    
    // Add tokens for assistant responses
    for response in assistant_responses {
        total += estimate_tokens(response);
    }
    
    // Add overhead for message formatting
    let message_count = 1 + user_prompts.len() + assistant_responses.len();
    let overhead = message_count as u32 * MESSAGE_OVERHEAD_TOKENS;
    
    total + overhead
}

/// Helper function to get the context window size
pub fn get_model_context_window(model_name: &str) -> u32 {
    // Try to get the context window size from the configuration
    if let Ok(context_window) = crate::config::get_model_context_window(model_name) {
        return context_window;
    }
    
    // Fallback to a default value if configuration doesn't provide one
    // This matches our default value in config.rs
    32_000 // Return a reasonable default that won't be a practical limit for most models
}

/// Estimate tokens for a path finder request with file contents
pub fn estimate_path_finder_tokens(
    task_description: &str,
    system_prompt: &str,
    directory_tree: &str,
    file_contents: &std::collections::HashMap<String, String>,
) -> u32 {
    let mut total = 0;
    
    // Base components
    total += estimate_tokens(task_description);
    total += estimate_tokens(system_prompt);
    total += estimate_structured_data_tokens(directory_tree);
    
    // File contents
    for (filepath, content) in file_contents {
        total += estimate_tokens(filepath);
        total += estimate_code_tokens(content);
        total += FILE_METADATA_OVERHEAD_TOKENS; // Overhead for each file's metadata
    }
    
    // Message formatting overhead (system prompt + user message with all content)
    total += 2 * MESSAGE_OVERHEAD_TOKENS;
    
    total
}