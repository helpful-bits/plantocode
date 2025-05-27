use regex::Regex;

pub fn extract_xml_from_markdown(content: &str) -> String {
    let trimmed_content = content.trim();
    
    if trimmed_content.is_empty() {
        return String::new();
    }

    let xml_fence_pattern = Regex::new(r"(?s)```xml\s*\n?(.*?)\n?```").unwrap();
    if let Some(caps) = xml_fence_pattern.captures(trimmed_content) {
        if let Some(xml_content) = caps.get(1) {
            return xml_content.as_str().trim().to_string();
        }
    }

    let generic_fence_pattern = Regex::new(r"(?s)```\s*\n?(.*?)\n?```").unwrap();
    if let Some(caps) = generic_fence_pattern.captures(trimmed_content) {
        if let Some(inner_content) = caps.get(1) {
            let inner_str = inner_content.as_str().trim();
            if inner_str.starts_with('<') {
                return inner_str.to_string();
            }
        }
    }

    trimmed_content.to_string()
}