use once_cell::sync::Lazy;
use regex::Regex;

static JSON_FENCE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)```json\s*\n?(.*?)\n?```")
        .expect("JSON fence regex pattern should be valid")
});

static GENERIC_FENCE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)```\s*\n?(.*?)\n?```")
        .expect("Generic fence regex pattern should be valid")
});

/// Extracts JSON content from markdown code blocks
pub fn extract_json_from_markdown(content: &str) -> String {
    let trimmed_content = content.trim();
    
    if trimmed_content.is_empty() {
        return String::new();
    }

    if let Some(caps) = JSON_FENCE_REGEX.captures(trimmed_content) {
        if let Some(json_content) = caps.get(1) {
            return json_content.as_str().trim().to_string();
        }
    }

    if let Some(caps) = GENERIC_FENCE_REGEX.captures(trimmed_content) {
        if let Some(inner_content) = caps.get(1) {
            let inner_str = inner_content.as_str().trim();
            if inner_str.starts_with('[') || inner_str.starts_with('{') {
                return inner_str.to_string();
            }
        }
    }

    if trimmed_content.starts_with('[') || trimmed_content.starts_with('{') {
        return trimmed_content.to_string();
    }

    String::new()
}