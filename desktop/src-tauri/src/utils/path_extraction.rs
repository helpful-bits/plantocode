use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

// Compile regexes once at startup for better performance
static PATH_TAG_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"<path>([^<]+)</path>").expect("Valid path tag regex")
});

static FILE_TAG_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"<file>([^<]+)</file>").expect("Valid file tag regex")
});

static FILE_ATTR_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<\w+\s+(?:file|path)=["']([^"']+)["']"#).expect("Valid file attribute regex")
});

// Simplified file path pattern that matches common file paths
static FILE_PATH_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b([a-zA-Z0-9_\-]+(?:/[a-zA-Z0-9_\-]+)*\.[a-zA-Z0-9]{1,10})\b")
        .expect("Valid file path regex")
});

// Pattern for paths in various contexts (quotes, natural language, etc.)
static CONTEXT_PATH_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?:(?:modify|update|change|edit|create|add|delete|remove|move|rename|refactor|implement|fix|patch|in|at|from|to|file|path)\s+)?["'`]?([a-zA-Z0-9_\-]+(?:/[a-zA-Z0-9_\-]+)*\.[a-zA-Z0-9]{1,10})["'`]?"#)
        .expect("Valid context path regex")
});

/// Extracts file paths from implementation plan XML content
pub fn extract_file_paths_from_implementation_plan(xml_content: &str) -> HashSet<String> {
    let mut paths = HashSet::new();
    
    // Extract paths from <path> tags
    extract_paths_from_xml_tags(xml_content, &mut paths);
    
    // Extract paths from general text content
    extract_paths_from_text(xml_content, &mut paths);
    
    // Filter out invalid paths
    paths.into_iter()
        .filter(|path| is_valid_file_path(path))
        .collect()
}

/// Extracts paths from XML tags
fn extract_paths_from_xml_tags(content: &str, paths: &mut HashSet<String>) {
    // Extract from <path> tags
    for cap in PATH_TAG_REGEX.captures_iter(content) {
        if let Some(path) = cap.get(1) {
            let path_str = path.as_str().trim();
            if !path_str.is_empty() {
                paths.insert(path_str.to_string());
            }
        }
    }
    
    // Extract from <file> tags
    for cap in FILE_TAG_REGEX.captures_iter(content) {
        if let Some(path) = cap.get(1) {
            let path_str = path.as_str().trim();
            if !path_str.is_empty() {
                paths.insert(path_str.to_string());
            }
        }
    }
    
    // Extract from file/path attributes in any tag
    for cap in FILE_ATTR_REGEX.captures_iter(content) {
        if let Some(path) = cap.get(1) {
            let path_str = path.as_str().trim();
            if !path_str.is_empty() {
                paths.insert(path_str.to_string());
            }
        }
    }
}

/// Extracts paths from general text content
fn extract_paths_from_text(content: &str, paths: &mut HashSet<String>) {
    // Extract simple file paths
    for cap in FILE_PATH_REGEX.captures_iter(content) {
        if let Some(path) = cap.get(1) {
            let path_str = path.as_str().trim();
            if !path_str.is_empty() {
                paths.insert(path_str.to_string());
            }
        }
    }
    
    // Extract paths in various contexts (quotes, natural language, etc.)
    for cap in CONTEXT_PATH_REGEX.captures_iter(content) {
        if let Some(path) = cap.get(1) {
            let path_str = path.as_str().trim();
            if !path_str.is_empty() {
                paths.insert(path_str.to_string());
            }
        }
    }
}

/// Validates if a given string is a valid file path
pub fn is_valid_file_path(path: &str) -> bool {
    // Check basic length requirements
    if path.len() < 3 || path.len() > 260 {  // 260 is Windows MAX_PATH
        return false;
    }
    
    // Must have a file extension
    if !path.contains('.') || path.ends_with('.') {
        return false;
    }
    
    // Check for common invalid patterns
    if path.starts_with('/') ||  // Absolute path
       path.starts_with('.') ||  // Hidden file
       path.contains(' ') ||     // Spaces
       path.contains("//") ||    // Double slashes
       path.contains("..") ||    // Parent directory
       path.ends_with('/') ||    // Ends with slash
       path.contains("://") ||   // URL pattern
       path.starts_with("http") || // HTTP URLs
       path.contains('\\') {     // Windows path separators
        return false;
    }
    
    // Validate extension
    if let Some(extension) = path.split('.').last() {
        if extension.is_empty() || 
           extension.len() > 10 || 
           !extension.chars().all(|c| c.is_alphanumeric()) {
            return false;
        }
    }
    
    // Check for valid path characters
    path.chars().all(|c| {
        c.is_alphanumeric() || c == '/' || c == '-' || c == '_' || c == '.'
    })
}