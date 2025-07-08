use crate::error::{AppError, AppResult};
use crate::jobs::types::{StructuredImplementationPlan, StructuredImplementationPlanStep};
use log::{debug, warn};
use std::collections::HashSet;

// Common words that indicate natural language sentences rather than paths
const COMMON_WORDS: &[&str] = &[
    "the", "is", "are", "was", "were", "been", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may", "might",
    "must", "can", "this", "that", "these", "those", "a", "an", "and", "or",
    "but", "if", "then", "because", "as", "while", "when", "where", "which",
    "who", "what", "how", "why", "all", "some", "any", "each", "every"
];

// Common false positive tokens
const FALSE_POSITIVE_TOKENS: &[&str] = &[
    "TODO", "NOTE", "FIXME", "HACK", "BUG", "ISSUE", "WARNING", "ERROR",
    "DEPRECATED", "IMPORTANT", "REVIEW", "REFACTOR", "OPTIMIZE"
];

/// Parse paths from LLM text response with robust format handling
/// 
/// This function extracts file paths from LLM responses that can come in various formats:
/// - Plain text lines
/// - Numbered lists (1. path/to/file, 1) path/to/file)
/// - Lettered lists (a. path/to/file, A) path/to/file)
/// - Bullet points (- path/to/file, * path/to/file)
/// - Arrow indicators (-> path/to/file, => path/to/file)
/// - Quoted paths (single, double quotes, backticks)
/// - Paths inside markdown code blocks
/// - Mixed formats
/// 
/// The function filters out comments, explanatory text, and other non-path content.
pub fn parse_paths_from_text_response(response_text: &str, project_directory: &str) -> AppResult<Vec<String>> {
    let mut paths = Vec::new();
    let mut in_code_block = false;
    let mut code_block_delimiter = String::new();
    
    // Normalize line endings
    let normalized_text = response_text.replace("\r\n", "\n").replace("\r", "\n");
    
    // Split by newlines and process each line
    for line in normalized_text.lines() {
        let trimmed_line = line.trim();
        
        // Handle code block state
        if trimmed_line.starts_with("```") {
            if in_code_block && trimmed_line.starts_with(&code_block_delimiter) {
                in_code_block = false;
                code_block_delimiter.clear();
            } else if !in_code_block {
                in_code_block = true;
                code_block_delimiter = trimmed_line.chars().take_while(|&c| c == '`').collect();
            }
            continue;
        }
        
        // Extract potential path from the line
        if let Some(path) = extract_path_from_line(trimmed_line, in_code_block) {
            paths.push(path);
        }
    }
    
    // Post-process and validate paths
    let validated_paths = post_process_paths(paths);
    
    // Remove duplicates while preserving order
    let mut unique_paths = Vec::new();
    let mut seen = HashSet::new();
    for path in validated_paths {
        if seen.insert(path.clone()) {
            unique_paths.push(path);
        }
    }
    
    Ok(unique_paths)
}

/// Extract a potential path from a single line
fn extract_path_from_line(line: &str, in_code_block: bool) -> Option<String> {
    // Skip empty lines
    if line.is_empty() || line.len() < 2 {
        return None;
    }
    
    // Skip comment lines unless in code block
    if !in_code_block && (line.starts_with("//") || line.starts_with("#")) {
        return None;
    }
    
    // Extended list of prefixes to ignore
    let ignore_prefixes = [
        "Note:", "Analysis:", "Here are", "The following", "Based on",
        "I found", "I've found", "These are", "Located at", "Found in",
        "File:", "Path:", "Files:", "Paths:", "Directory:", "Folder:",
        "Please", "You should", "Consider", "Check", "Look at",
        "Important:", "Warning:", "Error:", "Info:", "Debug:",
        "Summary:", "Result:", "Output:", "Description:", "Explanation:",
        "However", "Therefore", "Additionally", "Furthermore", "Moreover"
    ];
    
    // Skip lines with ignored prefixes unless in code block
    if !in_code_block {
        for prefix in &ignore_prefixes {
            if line.starts_with(prefix) {
                return None;
            }
        }
    }
    
    // Remove various list formats and indicators
    let cleaned_line = remove_list_indicators(line);
    
    // Extract from inline code if present
    let cleaned_line = extract_from_inline_code(&cleaned_line);
    
    // Clean quotes and other delimiters
    let cleaned_path = cleaned_line
        .trim_matches(|c: char| {
            c == '\"' || c == '\'' || c == '`' || c == ',' || c == ':' || 
            c == ';' || c == '[' || c == ']' || c == '{' || c == '}' ||
            c == '(' || c == ')' || c == '<' || c == '>'
        })
        .trim();
    
    // Validate the cleaned path
    if is_valid_path(cleaned_path) {
        Some(cleaned_path.to_string())
    } else {
        None
    }
}

/// Remove various list indicators from the beginning of a line
fn remove_list_indicators(line: &str) -> String {
    let mut result = line;
    
    // Handle numbered lists (1. 1) etc.)
    if let Some(first_char) = result.chars().next() {
        if first_char.is_ascii_digit() {
            // Match patterns like "1.", "1)", "1:", "1-"
            for delimiter in &[". ", ") ", ": ", "- ", " "] {
                if let Some(pos) = result.find(delimiter) {
                    let prefix = &result[..pos];
                    if prefix.chars().all(|c| c.is_ascii_digit()) {
                        result = &result[pos + delimiter.len()..];
                        break;
                    }
                }
            }
        }
    }
    
    // Handle lettered lists (a. a) A. A))
    if let Some(first_char) = result.chars().next() {
        if first_char.is_ascii_alphabetic() && result.len() > 2 {
            let second_char = result.chars().nth(1).unwrap_or(' ');
            if second_char == '.' || second_char == ')' {
                if result.chars().nth(2) == Some(' ') {
                    result = &result[3..];
                }
            }
        }
    }
    
    // Handle bullet points and arrows
    let indicators = ["- ", "* ", "+ ", "• ", "-> ", "=> ", ">> ", "> "];
    for indicator in &indicators {
        if result.starts_with(indicator) {
            result = &result[indicator.len()..];
            break;
        }
    }
    
    result.trim().to_string()
}

/// Extract content from inline code markers
fn extract_from_inline_code(line: &str) -> String {
    if line.contains('`') {
        // Find content between backticks
        let parts: Vec<&str> = line.split('`').collect();
        if parts.len() >= 3 {
            // Return the content between the first pair of backticks
            return parts[1].to_string();
        }
    }
    line.to_string()
}

/// Check if a string is likely to be a valid file path
fn is_valid_path(path: &str) -> bool {
    // Skip if empty or too short
    if path.is_empty() || path.len() < 2 {
        return false;
    }
    
    // Skip JSON-like content
    if path == "json" || path == "JSON" || path == "null" || path == "undefined" {
        return false;
    }
    
    // Skip common false positives
    if FALSE_POSITIVE_TOKENS.iter().any(|&token| path == token) {
        return false;
    }
    
    // Check if it ends with sentence punctuation (unless it's part of the filename)
    if path.ends_with('.') || path.ends_with('!') || path.ends_with('?') {
        // Allow if it has a file extension before the punctuation
        if !path[..path.len()-1].contains('.') {
            return false;
        }
    }
    
    // Check if it contains path separators or looks like a filename
    let has_path_separator = path.contains('/') || path.contains('\\');
    let has_file_extension = has_valid_file_extension(path);
    
    // If no path separator and no extension, it's probably not a path
    if !has_path_separator && !has_file_extension {
        return false;
    }
    
    // Check if the line contains too many common words (likely a sentence)
    let words: Vec<&str> = path.split_whitespace().collect();
    if words.len() > 3 {
        let common_word_count = words.iter()
            .filter(|&word| COMMON_WORDS.contains(&word.to_lowercase().as_str()))
            .count();
        if common_word_count > 1 {
            return false;
        }
    }
    
    true
}

/// Check if a path has a valid file extension
fn has_valid_file_extension(path: &str) -> bool {
    if let Some(last_dot_pos) = path.rfind('.') {
        if last_dot_pos > 0 && last_dot_pos < path.len() - 1 {
            let extension = &path[last_dot_pos + 1..];
            // Check if extension contains only alphanumeric characters and is reasonable length
            extension.len() <= 10 && 
            extension.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        } else {
            false
        }
    } else {
        false
    }
}

/// Post-process the extracted paths to remove false positives
fn post_process_paths(paths: Vec<String>) -> Vec<String> {
    paths.into_iter()
        .filter(|path| {
            // Remove single words without path separators or extensions
            if !path.contains('/') && !path.contains('\\') && !has_valid_file_extension(path) {
                return false;
            }
            
            // Additional validation can be added here
            true
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_paths() {
        let response = "src/main.rs\nlib/utils.js\nREADME.md";
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "lib/utils.js", "README.md"]);
    }

    #[test]
    fn test_parse_numbered_lists() {
        let response = "1. src/main.rs\n2. lib/utils.js\n3) config/settings.json\n4- test/spec.ts";
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "lib/utils.js", "config/settings.json", "test/spec.ts"]);
    }

    #[test]
    fn test_parse_lettered_lists() {
        let response = "a. src/main.rs\nb) lib/utils.js\nA. config/settings.json\nB) test/spec.ts";
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "lib/utils.js", "config/settings.json", "test/spec.ts"]);
    }

    #[test]
    fn test_parse_bullet_points() {
        let response = "- src/main.rs\n* lib/utils.js\n+ config/settings.json\n• test/spec.ts";
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "lib/utils.js", "config/settings.json", "test/spec.ts"]);
    }

    #[test]
    fn test_parse_arrow_indicators() {
        let response = "-> src/main.rs\n=> lib/utils.js\n>> config/settings.json\n> test/spec.ts";
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "lib/utils.js", "config/settings.json", "test/spec.ts"]);
    }

    #[test]
    fn test_parse_quoted_paths() {
        let response = r#""src/main.rs"
'lib/utils.js'
`config/settings.json`
<test/spec.ts>
[package.json]
{tsconfig.json}
(babel.config.js)"#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec![
            "src/main.rs", "lib/utils.js", "config/settings.json", 
            "test/spec.ts", "package.json", "tsconfig.json", "babel.config.js"
        ]);
    }

    #[test]
    fn test_parse_inline_code() {
        let response = "The main file is `src/main.rs` and the test is in `test/spec.ts`.";
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "test/spec.ts"]);
    }

    #[test]
    fn test_parse_code_blocks() {
        let response = r#"Here are the files:
```
src/main.rs
lib/utils.js
config/settings.json
```

And more files:
```typescript
// This is a comment
test/spec.ts
src/types.d.ts
```"#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec![
            "src/main.rs", "lib/utils.js", "config/settings.json",
            "test/spec.ts", "src/types.d.ts"
        ]);
    }

    #[test]
    fn test_ignore_natural_language() {
        let response = r#"I found these files:
The main file is located in the source directory.
This is where all the important code lives.
src/main.rs
lib/utils.js
Please check if these are correct.
You should look at the following files."#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "lib/utils.js"]);
    }

    #[test]
    fn test_ignore_prefixes() {
        let response = r#"Note: This is important
Analysis: The code structure
Here are the files:
src/main.rs
The following paths exist:
lib/utils.js
Based on my analysis:
config/settings.json
File: src/types.ts
Path: test/spec.ts"#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec![
            "src/main.rs", "lib/utils.js", "config/settings.json",
            "src/types.ts", "test/spec.ts"
        ]);
    }

    #[test]
    fn test_filter_false_positives() {
        let response = r#"TODO
NOTE
FIXME
json
JSON
null
undefined
src/main.rs
lib/utils.js"#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "lib/utils.js"]);
    }

    #[test]
    fn test_sentence_punctuation() {
        let response = r#"This is a sentence.
Another sentence!
Question?
src/main.rs
file.txt.
config.json!"#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs"]);
    }

    #[test]
    fn test_path_validation() {
        let response = r#"word
singleword
has-extension.rs
path/to/file
path\to\file
another/path/file.js
just.an.extension.txt"#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec![
            "has-extension.rs",
            "path/to/file",
            "path\\to\\file",
            "another/path/file.js",
            "just.an.extension.txt"
        ]);
    }

    #[test]
    fn test_complex_mixed_format() {
        let response = r#"Based on my analysis, I found the following files:

1. `src/main.rs` - The main entry point
2. "lib/utils.js" (utility functions)
3) config/settings.json

Here are additional files in the codebase:
- test/spec.ts
* src/types.d.ts
-> components/Button.tsx

```javascript
// Important files:
src/api/handler.js
src/api/middleware.js
```

Note: These files are critical:
a. package.json
b) tsconfig.json

File: README.md
Path: docs/api.md"#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        let mut sorted_paths = paths.clone();
        sorted_paths.sort();
        let mut expected = vec![
            "src/main.rs", "lib/utils.js", "config/settings.json",
            "test/spec.ts", "src/types.d.ts", "components/Button.tsx",
            "src/api/handler.js", "src/api/middleware.js",
            "package.json", "tsconfig.json", "README.md", "docs/api.md"
        ];
        expected.sort();
        assert_eq!(sorted_paths, expected);
    }

    #[test]
    fn test_windows_paths() {
        let response = r#"C:\Users\dev\project\src\main.rs
src\lib\utils.js
.\config\settings.json
..\shared\types.ts"#;
        let paths = parse_paths_from_text_response(response, "C:\\Users\\dev\\project").unwrap();
        assert_eq!(paths, vec![
            "C:\\Users\\dev\\project\\src\\main.rs",
            "src\\lib\\utils.js",
            ".\\config\\settings.json",
            "..\\shared\\types.ts"
        ]);
    }

    #[test]
    fn test_remove_duplicates() {
        let response = r#"src/main.rs
lib/utils.js
src/main.rs
config/settings.json
lib/utils.js"#;
        let paths = parse_paths_from_text_response(response, "/project").unwrap();
        assert_eq!(paths, vec!["src/main.rs", "lib/utils.js", "config/settings.json"]);
    }
}

// Implementation plan parsing functions

pub fn parse_implementation_plan(clean_xml_content: &str) -> AppResult<(StructuredImplementationPlan, String)> {
    debug!("Parsing implementation plan from cleaned XML content");
    
    if clean_xml_content.trim().is_empty() {
        warn!("Empty XML content provided for parsing");
        return Err(AppError::ValidationError("Empty XML content provided".to_string()));
    }
    
    // First, try to validate that the content at least looks like XML
    let is_xml_format = clean_xml_content.trim_start().starts_with('<');
    if !is_xml_format {
        warn!("Content does not appear to be XML: {}", &clean_xml_content[..100.min(clean_xml_content.len())]);
        // Don't fail immediately, let's try to create a structured plan from the text
        return create_fallback_plan_from_text(clean_xml_content);
    }
    
    // Attempt to deserialize the clean XML content into structured format
    match quick_xml::de::from_str::<StructuredImplementationPlan>(clean_xml_content) {
        Ok(structured_plan) => {
            // Validate the parsed plan has meaningful content
            if structured_plan.steps.is_empty() {
                warn!("Parsed implementation plan has no steps");
            }
            
            // Generate human-readable summary
            let mut summary = String::new();
            if let Some(instructions) = &structured_plan.agent_instructions {
                summary.push_str(&format!("Agent Instructions: {}\n\n", instructions));
            }
            
            summary.push_str(&format!("Implementation Plan with {} steps:\n", structured_plan.steps.len()));
            for (i, step) in structured_plan.steps.iter().enumerate() {
                summary.push_str(&format!("{}. {}: {}\n", i + 1, step.title, step.description));
            }
            
            Ok((structured_plan, summary.trim().to_string()))
        },
        Err(e) => {
            warn!("Failed to parse structured XML: {}. Content length: {}", e, clean_xml_content.len());
            // Fall back to text parsing
            create_fallback_plan_from_text(clean_xml_content)
        }
    }
}

pub fn create_fallback_plan_from_text(text_content: &str) -> AppResult<(StructuredImplementationPlan, String)> {
    debug!("Creating fallback plan from text content");
    
    // Try to parse the text content into meaningful steps
    let mut steps = Vec::new();
    let mut current_step = 1;
    
    // Split by common step indicators (numbers, bullet points, etc.)
    let lines: Vec<&str> = text_content.lines().collect();
    let mut current_description = String::new();
    let mut step_title = "Implementation Step".to_string();
    
    for line in lines.iter() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        
        // Check if this line looks like a step header (starts with number, bullet, etc.)
        if trimmed.starts_with(char::is_numeric) || 
           trimmed.starts_with("Step") ||
           trimmed.starts_with("##") ||
           trimmed.starts_with("-") ||
           trimmed.starts_with("*") {
            
            // Save previous step if we have content
            if !current_description.trim().is_empty() {
                steps.push(StructuredImplementationPlanStep {
                    number: Some(current_step.to_string()),
                    title: step_title.clone(),
                    description: current_description.trim().to_string(),
                    file_operations: None,
                    bash_commands: None,
                    exploration_commands: None,
                });
                current_step += 1;
                current_description.clear();
            }
            
            // Extract title from this line
            step_title = trimmed
                .trim_start_matches(char::is_numeric)
                .trim_start_matches('.')
                .trim_start_matches('-')
                .trim_start_matches('*')
                .trim_start_matches('#')
                .trim_start_matches("Step")
                .trim_start_matches(':')
                .trim()
                .to_string();
            
            if step_title.is_empty() {
                step_title = format!("Implementation Step {}", current_step);
            }
        } else {
            // Add to current description
            if !current_description.is_empty() {
                current_description.push('\n');
            }
            current_description.push_str(trimmed);
        }
    }
    
    // Add the last step
    if !current_description.trim().is_empty() {
        steps.push(StructuredImplementationPlanStep {
            number: Some(current_step.to_string()),
            title: step_title,
            description: current_description.trim().to_string(),
            file_operations: None,
            bash_commands: None,
            exploration_commands: None,
        });
    }
    
    // If no steps were parsed, create a single step with all content
    if steps.is_empty() {
        steps.push(StructuredImplementationPlanStep {
            number: Some("1".to_string()),
            title: "Implementation Plan".to_string(),
            description: text_content.trim().to_string(),
            file_operations: None,
            bash_commands: None,
            exploration_commands: None,
        });
    }
    
    let fallback_plan = StructuredImplementationPlan {
        agent_instructions: Some("Note: This plan was parsed from text format. The LLM did not return XML as expected.".to_string()),
        steps,
    };
    
    // Generate summary
    let summary = format!("Implementation Plan with {} steps (parsed from text format)", fallback_plan.steps.len());
    
    Ok((fallback_plan, summary))
}