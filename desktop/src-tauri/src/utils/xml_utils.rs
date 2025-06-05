use once_cell::sync::Lazy;
use regex::Regex;

static XML_FENCE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)```xml\s*\n?(.*?)\n?```")
        .expect("XML fence regex pattern should be valid")
});

static GENERIC_FENCE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)```\s*\n?(.*?)\n?```")
        .expect("Generic fence regex pattern should be valid")
});

static ORIGINAL_CONTENT_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)<!-- ORIGINAL_CONTENT -->(.*?)<!-- /ORIGINAL_CONTENT -->")
        .expect("Original content regex pattern should be valid")
});

pub fn extract_xml_from_markdown(content: &str) -> String {
    let trimmed_content = content.trim();
    
    if trimmed_content.is_empty() {
        return String::new();
    }

    if let Some(caps) = XML_FENCE_REGEX.captures(trimmed_content) {
        if let Some(xml_content) = caps.get(1) {
            return xml_content.as_str().trim().to_string();
        }
    }

    if let Some(caps) = GENERIC_FENCE_REGEX.captures(trimmed_content) {
        if let Some(inner_content) = caps.get(1) {
            let inner_str = inner_content.as_str().trim();
            if inner_str.starts_with('<') {
                return inner_str.to_string();
            }
        }
    }

    trimmed_content.to_string()
}

/// Extracts content from HTML comment tags like <!-- ORIGINAL_CONTENT -->content<!-- /ORIGINAL_CONTENT -->
pub fn extract_original_content(content: &str) -> Option<String> {
    let trimmed_content = content.trim();
    
    if trimmed_content.is_empty() {
        return None;
    }

    if let Some(caps) = ORIGINAL_CONTENT_REGEX.captures(trimmed_content) {
        if let Some(extracted_content) = caps.get(1) {
            return Some(extracted_content.as_str().trim().to_string());
        }
    }

    None
}