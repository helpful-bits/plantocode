// A token estimator for approximating token count
// This uses character counts with model-specific adjustments

// Average ratio of characters to tokens for English text
const CHARS_PER_TOKEN: f32 = 4.0;

// Different multipliers for non-English, code, XML, etc.
const CODE_CHARS_PER_TOKEN: f32 = 3.5; // Code is typically more token-dense
const JSON_CHARS_PER_TOKEN: f32 = 3.0; // JSON and structured data are even more token-dense
const XML_CHARS_PER_TOKEN: f32 = 3.2; // XML structured data

// Overhead costs for adding structure
const MESSAGE_OVERHEAD_TOKENS: u32 = 5; // Overhead per message
const FILE_METADATA_OVERHEAD_TOKENS: u32 = 10; // Overhead per file when including file content
const SYSTEM_PROMPT_OVERHEAD_TOKENS: u32 = 8; // Overhead for system prompt formatting

/// Estimate the number of tokens in a string
pub fn estimate_tokens(text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }
    
    let char_count = text.chars().count() as f32;
    // Add small buffer for tokenization overhead
    ((char_count / CHARS_PER_TOKEN) * 1.1).ceil() as u32
}

/// Estimate the number of tokens for code or structured data 
pub fn estimate_code_tokens(code: &str) -> u32 {
    if code.is_empty() {
        return 0;
    }
    
    let char_count = code.chars().count() as f32;
    // Code tends to have more tokens per character, add buffer
    ((char_count / CODE_CHARS_PER_TOKEN) * 1.15).ceil() as u32
}

/// Estimate the number of tokens for JSON/XML data
pub fn estimate_structured_data_tokens(data: &str) -> u32 {
    if data.is_empty() {
        return 0;
    }
    
    let char_count = data.chars().count() as f32;
    // Detect if this looks like XML vs JSON
    let ratio = if data.trim_start().starts_with('<') {
        XML_CHARS_PER_TOKEN
    } else {
        JSON_CHARS_PER_TOKEN
    };
    
    // Structured data is very token-dense, add larger buffer
    ((char_count / ratio) * 1.2).ceil() as u32
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
    
    // Add tokens for system prompt with overhead
    if let Some(prompt) = system_prompt {
        total += estimate_tokens(prompt) + SYSTEM_PROMPT_OVERHEAD_TOKENS;
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
    let message_count = user_prompts.len() + assistant_responses.len();
    let overhead = message_count as u32 * MESSAGE_OVERHEAD_TOKENS;
    
    total + overhead
}

/// Helper function to get the context window size from RuntimeAIConfig
pub fn get_model_context_window(model_name: &str) -> u32 {
    // Try to get the context window size from the configuration
    match crate::config::get_model_context_window(model_name) {
        Ok(context_window) => context_window,
        Err(_) => {
            // Log warning but don't panic - use a conservative default
            log::warn!("Failed to get context window for model {}, using default", model_name);
            32_000 // Conservative default for most modern models
        }
    }
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
    total += estimate_tokens(system_prompt) + SYSTEM_PROMPT_OVERHEAD_TOKENS;
    total += estimate_structured_data_tokens(directory_tree);
    
    // File contents with proper detection of content type
    for (filepath, content) in file_contents {
        total += estimate_tokens(filepath);
        
        // Detect file type and estimate accordingly
        let extension = std::path::Path::new(filepath)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("");
            
        match extension {
            "json" | "xml" | "yml" | "yaml" | "toml" => {
                total += estimate_structured_data_tokens(content);
            }
            "rs" | "ts" | "js" | "tsx" | "jsx" | "py" | "java" | "cpp" | "c" | "h" | "cs" | "go" | "php" | "rb" | "swift" | "kt" => {
                total += estimate_code_tokens(content);
            }
            _ => {
                total += estimate_tokens(content);
            }
        }
        
        total += FILE_METADATA_OVERHEAD_TOKENS; // Overhead for each file's metadata
    }
    
    // Message formatting overhead
    total += MESSAGE_OVERHEAD_TOKENS;
    
    // Add 10% buffer for prompt formatting and structure
    (total as f32 * 1.1).ceil() as u32
}