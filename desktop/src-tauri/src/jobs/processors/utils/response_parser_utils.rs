//! Response Parser Utilities
//! 
//! This module provides utilities for parsing LLM responses, particularly for extracting
//! file paths and other structured data from text responses.

use log::debug;
use crate::error::AppResult;

/// Parses paths from LLM text response with robust format handling
/// Handles numbered lists, bullet points, quotes, and various line endings
pub fn parse_paths_from_text_response(
    response_text: &str,
    project_directory: &str,
) -> AppResult<Vec<String>> {
    debug!("Parsing paths from text response");
    let mut paths = Vec::new();
    
    // Normalize line endings (handle \r\n, \n, \r)
    let normalized_text = response_text.replace("\r\n", "\n").replace("\r", "\n");
    
    // Split by newlines and process each line
    for line in normalized_text.lines() {
        let line = line.trim();
        
        // Filter out empty lines or lines that are clearly not paths
        if line.is_empty()
            || line.starts_with("//")
            || line.starts_with("#")
            || line.starts_with("Note:")
            || line.starts_with("Analysis:")
            || line.starts_with("Here are")
            || line.starts_with("The following")
            || line.starts_with("Based on")
            || line.len() < 2
        {
            continue;
        }
        
        // Handle numbered lists (e.g., "1. path/to/file")
        let line_without_numbers = if line.chars().next().map_or(false, |c| c.is_ascii_digit()) {
            if let Some(dot_pos) = line.find('.') {
                line[dot_pos + 1..].trim()
            } else {
                line
            }
        } else {
            line
        };
        
        // Handle bullet points (e.g., "- path/to/file", "* path/to/file")
        let line_without_bullets = if line_without_numbers.starts_with("- ") || line_without_numbers.starts_with("* ") {
            &line_without_numbers[2..]
        } else {
            line_without_numbers
        };
        
        // Clean the line of potential prefixes/suffixes
        let cleaned_path = line_without_bullets
            .trim_matches(|c| {
                c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || c == ';'
            })
            .trim();
        
        if cleaned_path.is_empty() {
            continue;
        }
        
        // Validate and normalize the path using security-aware validation
        let project_path = std::path::Path::new(project_directory);
        let validated_path = match crate::utils::path_utils::validate_llm_path(cleaned_path, project_path) {
            Ok(path) => path,
            Err(e) => {
                debug!("Skipping invalid LLM path '{}': {}", cleaned_path, e);
                continue;
            }
        };
        
        // Convert to string for storage
        let path_string = validated_path.to_string_lossy().to_string();
        paths.push(path_string);
    }
    
    // Remove duplicates while preserving order
    let mut unique_paths = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in paths {
        if seen.insert(path.clone()) {
            unique_paths.push(path);
        }
    }
    
    Ok(unique_paths)
}