use std::collections::HashMap;
use crate::error::{AppError, AppResult};

/// Standard placeholders that can be used in system prompt templates
#[derive(Debug, Clone)]
pub struct PromptPlaceholders {
    pub project_context: Option<String>,
    pub custom_instructions: Option<String>,
    pub file_contents: Option<String>,
    pub directory_tree: Option<String>,
    pub model_name: Option<String>,
    pub session_name: Option<String>,
    pub task_type: Option<String>,
}

impl Default for PromptPlaceholders {
    fn default() -> Self {
        Self {
            project_context: None,
            custom_instructions: None,
            file_contents: None,
            directory_tree: None,
            model_name: None,
            session_name: None,
            task_type: None,
        }
    }
}

impl PromptPlaceholders {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn with_project_context(mut self, value: Option<&str>) -> Self {
        self.project_context = value.map(|s| s.to_string());
        self
    }
    
    pub fn with_custom_instructions(mut self, value: Option<&str>) -> Self {
        self.custom_instructions = value.map(|s| s.to_string());
        self
    }
    
    pub fn with_file_contents(mut self, value: Option<&str>) -> Self {
        self.file_contents = value.map(|s| s.to_string());
        self
    }
    
    pub fn with_directory_tree(mut self, value: Option<&str>) -> Self {
        self.directory_tree = value.map(|s| s.to_string());
        self
    }
    
    pub fn with_model_name(mut self, value: Option<&str>) -> Self {
        self.model_name = value.map(|s| s.to_string());
        self
    }
    
    pub fn with_session_name(mut self, value: Option<&str>) -> Self {
        self.session_name = value.map(|s| s.to_string());
        self
    }
    
    pub fn with_task_type(mut self, value: Option<&str>) -> Self {
        self.task_type = value.map(|s| s.to_string());
        self
    }
}

/// Substitute placeholders in a system prompt template with actual values
pub fn substitute_placeholders(template: &str, placeholders: &PromptPlaceholders) -> AppResult<String> {
    let mut result = template.to_string();
    
    // Handle conditional sections first - remove entire lines/sections if placeholder is empty
    result = handle_conditional_sections(&result, placeholders);
    
    // Create a mapping of placeholder patterns to their values
    let mut substitutions = HashMap::new();
    
    if let Some(ref value) = placeholders.project_context {
        substitutions.insert("{{PROJECT_CONTEXT}}", value.as_str());
        substitutions.insert("{{project_context}}", value.as_str());
    }
    
    if let Some(ref value) = placeholders.custom_instructions {
        substitutions.insert("{{CUSTOM_INSTRUCTIONS}}", value.as_str());
        substitutions.insert("{{custom_instructions}}", value.as_str());
    }
    
    if let Some(ref value) = placeholders.file_contents {
        substitutions.insert("{{FILE_CONTENTS}}", value.as_str());
        substitutions.insert("{{file_contents}}", value.as_str());
    }
    
    if let Some(ref value) = placeholders.directory_tree {
        substitutions.insert("{{DIRECTORY_TREE}}", value.as_str());
        substitutions.insert("{{directory_tree}}", value.as_str());
    }
    
    if let Some(ref value) = placeholders.model_name {
        substitutions.insert("{{MODEL_NAME}}", value.as_str());
        substitutions.insert("{{model_name}}", value.as_str());
    }
    
    if let Some(ref value) = placeholders.session_name {
        substitutions.insert("{{SESSION_NAME}}", value.as_str());
        substitutions.insert("{{session_name}}", value.as_str());
    }
    
    if let Some(ref value) = placeholders.task_type {
        substitutions.insert("{{TASK_TYPE}}", value.as_str());
        substitutions.insert("{{task_type}}", value.as_str());
    }
    
    // Apply substitutions
    for (placeholder, value) in substitutions {
        result = result.replace(placeholder, value);
    }
    
    // Add default substitutions for common empty placeholders
    result = result.replace("{{PROJECT_CONTEXT}}", "");
    result = result.replace("{{project_context}}", "");
    result = result.replace("{{CUSTOM_INSTRUCTIONS}}", "");
    result = result.replace("{{custom_instructions}}", "");
    result = result.replace("{{FILE_CONTENTS}}", "");
    result = result.replace("{{file_contents}}", "");
    result = result.replace("{{DIRECTORY_TREE}}", "");
    result = result.replace("{{directory_tree}}", "");
    result = result.replace("{{MODEL_NAME}}", "");
    result = result.replace("{{model_name}}", "");
    result = result.replace("{{SESSION_NAME}}", "");
    result = result.replace("{{session_name}}", "");
    result = result.replace("{{TASK_TYPE}}", "");
    result = result.replace("{{task_type}}", "");
    
    // Clean up excessive blank lines
    result = clean_excessive_whitespace(&result);
    
    Ok(result)
}

/// Handle conditional sections in templates
fn handle_conditional_sections(template: &str, placeholders: &PromptPlaceholders) -> String {
    let mut result = template.to_string();
    
    // Remove lines containing only placeholders that have no value
    let lines: Vec<&str> = result.lines().collect();
    let mut filtered_lines = Vec::new();
    
    for line in lines {
        let trimmed = line.trim();
        
        // Skip lines that contain only empty placeholders
        if should_skip_line(trimmed, placeholders) {
            continue;
        }
        
        filtered_lines.push(line);
    }
    
    filtered_lines.join("\n")
}

/// Determine if a line should be skipped due to empty placeholders
fn should_skip_line(line: &str, placeholders: &PromptPlaceholders) -> bool {
    // Check if line only contains placeholders that are empty
    if line == "{{DIRECTORY_TREE}}" && placeholders.directory_tree.is_none() {
        return true;
    }
    if line == "{{FILE_CONTENTS}}" && placeholders.file_contents.is_none() {
        return true;
    }
    if line == "{{CUSTOM_INSTRUCTIONS}}" && placeholders.custom_instructions.is_none() {
        return true;
    }
    if line == "{{PROJECT_CONTEXT}}" && placeholders.project_context.is_none() {
        return true;
    }
    
    false
}

/// Clean up excessive whitespace and blank lines
fn clean_excessive_whitespace(text: &str) -> String {
    // Replace multiple consecutive newlines with at most 2 newlines
    let lines: Vec<&str> = text.lines().collect();
    let mut result_lines = Vec::new();
    let mut blank_count = 0;
    
    for line in lines {
        if line.trim().is_empty() {
            blank_count += 1;
            if blank_count <= 2 {
                result_lines.push(line);
            }
        } else {
            blank_count = 0;
            result_lines.push(line);
        }
    }
    
    result_lines.join("\n")
}

/// Convert a hardcoded prompt to a template with placeholders
/// This is useful for migrating existing prompts to the template system
pub fn convert_to_template(prompt: &str) -> String {
    let mut template = prompt.to_string();
    
    // This is a simple heuristic-based conversion
    // More sophisticated logic could be added based on specific patterns
    
    // Since task descriptions are now handled in user prompts,
    // this function mainly handles other placeholders like LANGUAGE, etc.
    
    template
}

/// Get a unique identifier for a system prompt based on session, task type, and template content
/// This can be used as system_prompt_id for database tracking
pub fn generate_system_prompt_id(session_id: &str, task_type: &str, template_hash: &str) -> String {
    format!("{}:{}:{}", session_id, task_type, template_hash)
}

/// Get template with placeholders for display in UI (replaces actual values with placeholder names)
pub fn get_template_for_display(template: &str) -> String {
    // This function shows the template with placeholders intact for UI display
    // The user mentioned showing "prompt text with placeholders instead of actual code"
    template.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_placeholder_substitution() {
        let template = "Instructions: {{CUSTOM_INSTRUCTIONS}}\nTask: {{TASK_TYPE}}";
        let placeholders = PromptPlaceholders::new()
            .with_custom_instructions(Some("Test instructions"))
            .with_task_type(Some("test_task"));
        
        let result = substitute_placeholders(template, &placeholders).unwrap();
        assert!(result.contains("Instructions: Test instructions"));
        assert!(result.contains("Task: test_task"));
    }

    #[test]
    fn test_empty_placeholders() {
        let template = "Language: {{LANGUAGE}}\nType: {{IMPROVEMENT_TYPE}}";
        let placeholders = PromptPlaceholders::new();
        
        let result = substitute_placeholders(template, &placeholders).unwrap();
        assert!(result.contains("Language: English")); // Default value
        assert!(result.contains("Type: general")); // Default value
    }
}