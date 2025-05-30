use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::error::{AppError, AppResult};

/// Enhanced template system that supports rich context generation and conditional sections
/// This combines the database customization with sophisticated prompt composition

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedPromptContext {
    // Basic placeholders
    pub custom_instructions: Option<String>,
    pub model_name: Option<String>,
    pub session_name: Option<String>,
    pub task_type: Option<String>,
    
    // Rich context data
    pub project_context: Option<ProjectContext>,
    pub file_contents: Option<HashMap<String, String>>,
    pub directory_tree: Option<String>,
    pub relevant_files: Option<Vec<String>>,
    pub codebase_structure: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    pub project_directory: String,
    pub project_hash: Option<String>,
    pub structure_summary: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
}

/// Enhanced template processor that can handle sophisticated prompt generation
pub struct EnhancedTemplateProcessor;

impl EnhancedTemplateProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Process a template with enhanced features including conditional sections and rich content
    pub fn process_template(
        &self,
        template: &str,
        context: &EnhancedPromptContext,
    ) -> AppResult<String> {
        let mut result = template.to_string();

        // Process conditional sections first
        result = self.process_conditional_sections(&result, context)?;
        
        // Process rich placeholders
        result = self.process_rich_placeholders(&result, context)?;
        
        // Process basic placeholders
        result = self.process_basic_placeholders(&result, context)?;

        Ok(result)
    }

    /// Process conditional sections like {{#IF FILE_CONTENTS}}...{{/IF}}
    fn process_conditional_sections(
        &self,
        template: &str,
        context: &EnhancedPromptContext,
    ) -> AppResult<String> {
        let mut result = template.to_string();
        
        // Regular expression to match conditional sections
        let conditional_regex = regex::Regex::new(r"(?s)\{\{#IF\s+(\w+)\}\}(.*?)\{\{/IF\}\}")
            .map_err(|e| AppError::InternalError(format!("Regex compilation error: {}", e)))?;

        while let Some(captures) = conditional_regex.captures(&result) {
            let full_match = captures.get(0).unwrap().as_str();
            let condition = captures.get(1).unwrap().as_str();
            let content = captures.get(2).unwrap().as_str();

            let should_include = self.evaluate_condition(condition, context);
            
            let replacement = if should_include {
                content.to_string()
            } else {
                String::new()
            };

            result = result.replace(full_match, &replacement);
        }

        Ok(result)
    }

    /// Evaluate whether a condition should include its content
    fn evaluate_condition(&self, condition: &str, context: &EnhancedPromptContext) -> bool {
        match condition {
            "FILE_CONTENTS" => context.file_contents.as_ref().map_or(false, |fc| !fc.is_empty()),
            "DIRECTORY_TREE" => context.directory_tree.as_ref().map_or(false, |dt| !dt.trim().is_empty()),
            "PROJECT_CONTEXT" => context.project_context.is_some(),
            "RELEVANT_FILES" => context.relevant_files.as_ref().map_or(false, |rf| !rf.is_empty()),
            "CODEBASE_STRUCTURE" => context.codebase_structure.as_ref().map_or(false, |cs| !cs.trim().is_empty()),
            "CUSTOM_INSTRUCTIONS" => context.custom_instructions.as_ref().map_or(false, |ci| !ci.trim().is_empty()),
            _ => false,
        }
    }

    /// Process rich placeholders that generate complex XML content
    fn process_rich_placeholders(
        &self,
        template: &str,
        context: &EnhancedPromptContext,
    ) -> AppResult<String> {
        let mut result = template.to_string();

        // Process FILE_CONTENTS_XML placeholder
        if let Some(file_contents) = &context.file_contents {
            let xml_content = self.generate_file_contents_xml(file_contents)?;
            result = result.replace("{{FILE_CONTENTS_XML}}", &xml_content);
        }

        // Process PROJECT_STRUCTURE_XML placeholder
        if let Some(directory_tree) = &context.directory_tree {
            let xml_content = self.generate_project_structure_xml(directory_tree)?;
            result = result.replace("{{PROJECT_STRUCTURE_XML}}", &xml_content);
        }

        // Process CODEBASE_INFO_XML placeholder
        if let Some(project_context) = &context.project_context {
            let xml_content = self.generate_codebase_info_xml(project_context, context)?;
            result = result.replace("{{CODEBASE_INFO_XML}}", &xml_content);
        }

        // Process RELEVANT_FILES_XML placeholder
        if let Some(relevant_files) = &context.relevant_files {
            let xml_content = self.generate_relevant_files_xml(relevant_files)?;
            result = result.replace("{{RELEVANT_FILES_XML}}", &xml_content);
        }

        Ok(result)
    }

    /// Generate properly formatted XML for file contents
    fn generate_file_contents_xml(&self, file_contents: &HashMap<String, String>) -> AppResult<String> {
        if file_contents.is_empty() {
            return Ok(String::new());
        }

        let mut xml = String::from("\n<file_contents>");
        
        for (path, content) in file_contents {
            // Escape content for CDATA if needed
            let escaped_content = if content.contains("]]>") {
                // If content contains ]]>, we need to escape it differently
                content.replace("]]>", "]]]]><![CDATA[>")
            } else {
                content.clone()
            };

            xml.push_str(&format!(
                "\n    <file path=\"{}\"><![CDATA[{}]]></file>",
                self.escape_xml_attribute(path),
                escaped_content
            ));
        }
        
        xml.push_str("\n</file_contents>");
        Ok(xml)
    }

    /// Generate properly formatted XML for project structure
    fn generate_project_structure_xml(&self, directory_tree: &str) -> AppResult<String> {
        if directory_tree.trim().is_empty() {
            return Ok(String::new());
        }

        Ok(format!(
            "\n<project_structure><![CDATA[\n{}\n]]></project_structure>",
            directory_tree
        ))
    }

    /// Generate rich codebase information XML
    fn generate_codebase_info_xml(
        &self,
        project_context: &ProjectContext,
        context: &EnhancedPromptContext,
    ) -> AppResult<String> {
        let mut xml = String::from("\n<codebase_info>");
        
        // Add project directory
        xml.push_str(&format!(
            "\n    <project_directory>{}</project_directory>",
            self.escape_xml_content(&project_context.project_directory)
        ));

        // Add project hash if available
        if let Some(hash) = &project_context.project_hash {
            xml.push_str(&format!(
                "\n    <project_hash>{}</project_hash>",
                self.escape_xml_content(hash)
            ));
        }

        // Add structure summary if available
        if let Some(summary) = &project_context.structure_summary {
            xml.push_str(&format!(
                "\n    <structure_summary><![CDATA[{}]]></structure_summary>",
                summary
            ));
        }

        // Add file count if we have file contents
        if let Some(file_contents) = &context.file_contents {
            xml.push_str(&format!(
                "\n    <included_files_count>{}</included_files_count>",
                file_contents.len()
            ));
        }

        // Add metadata if available
        if let Some(metadata) = &project_context.metadata {
            if !metadata.is_empty() {
                xml.push_str("\n    <metadata>");
                for (key, value) in metadata {
                    xml.push_str(&format!(
                        "\n        <{}>{}</{}>",
                        self.escape_xml_tag(key),
                        self.escape_xml_content(value),
                        self.escape_xml_tag(key)
                    ));
                }
                xml.push_str("\n    </metadata>");
            }
        }

        xml.push_str("\n</codebase_info>");
        Ok(xml)
    }

    /// Generate XML for relevant files list
    fn generate_relevant_files_xml(&self, relevant_files: &[String]) -> AppResult<String> {
        if relevant_files.is_empty() {
            return Ok(String::new());
        }

        let mut xml = String::from("\n<relevant_files>");
        
        for file_path in relevant_files {
            xml.push_str(&format!(
                "\n    <file>{}</file>",
                self.escape_xml_content(file_path)
            ));
        }
        
        xml.push_str("\n</relevant_files>");
        Ok(xml)
    }

    /// Process basic placeholders
    fn process_basic_placeholders(
        &self,
        template: &str,
        context: &EnhancedPromptContext,
    ) -> AppResult<String> {
        let mut result = template.to_string();

        // Basic string replacements
        if let Some(custom_instructions) = &context.custom_instructions {
            result = result.replace("{{CUSTOM_INSTRUCTIONS}}", custom_instructions);
        }

        if let Some(model_name) = &context.model_name {
            result = result.replace("{{MODEL_NAME}}", model_name);
        }

        if let Some(session_name) = &context.session_name {
            result = result.replace("{{SESSION_NAME}}", session_name);
        }

        if let Some(task_type) = &context.task_type {
            result = result.replace("{{TASK_TYPE}}", task_type);
        }

        // Legacy placeholders for compatibility
        if let Some(directory_tree) = &context.directory_tree {
            result = result.replace("{{DIRECTORY_TREE}}", directory_tree);
        }

        if let Some(project_context) = &context.project_context {
            result = result.replace("{{PROJECT_DIRECTORY}}", &project_context.project_directory);
        }

        // Handle file contents as JSON string for simple placeholders
        if let Some(file_contents) = &context.file_contents {
            if let Ok(json_str) = serde_json::to_string(file_contents) {
                result = result.replace("{{FILE_CONTENTS}}", &json_str);
            }
        }

        Ok(result)
    }

    /// Escape XML attribute content
    fn escape_xml_attribute(&self, content: &str) -> String {
        content
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    /// Escape XML content
    fn escape_xml_content(&self, content: &str) -> String {
        content
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    }

    /// Escape XML tag names
    fn escape_xml_tag(&self, tag: &str) -> String {
        tag.chars()
            .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
            .collect()
    }
}

/// Builder for creating enhanced prompt contexts
pub struct EnhancedPromptContextBuilder {
    context: EnhancedPromptContext,
}

impl EnhancedPromptContextBuilder {
    pub fn new() -> Self {
        Self {
            context: EnhancedPromptContext {
                custom_instructions: None,
                model_name: None,
                session_name: None,
                task_type: None,
                project_context: None,
                file_contents: None,
                directory_tree: None,
                relevant_files: None,
                codebase_structure: None,
            },
        }
    }

    pub fn custom_instructions(mut self, custom_instructions: Option<String>) -> Self {
        self.context.custom_instructions = custom_instructions;
        self
    }

    pub fn model_name(mut self, model_name: Option<String>) -> Self {
        self.context.model_name = model_name;
        self
    }

    pub fn session_name(mut self, session_name: Option<String>) -> Self {
        self.context.session_name = session_name;
        self
    }

    pub fn task_type(mut self, task_type: Option<String>) -> Self {
        self.context.task_type = task_type;
        self
    }

    pub fn project_context(mut self, project_context: Option<ProjectContext>) -> Self {
        self.context.project_context = project_context;
        self
    }

    pub fn file_contents(mut self, file_contents: Option<HashMap<String, String>>) -> Self {
        self.context.file_contents = file_contents;
        self
    }

    pub fn directory_tree(mut self, directory_tree: Option<String>) -> Self {
        self.context.directory_tree = directory_tree;
        self
    }

    pub fn relevant_files(mut self, relevant_files: Option<Vec<String>>) -> Self {
        self.context.relevant_files = relevant_files;
        self
    }

    pub fn codebase_structure(mut self, codebase_structure: Option<String>) -> Self {
        self.context.codebase_structure = codebase_structure;
        self
    }

    pub fn build(self) -> EnhancedPromptContext {
        self.context
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_placeholder_replacement() {
        let processor = EnhancedTemplateProcessor::new();
        let context = EnhancedPromptContextBuilder::new()
            .custom_instructions(Some("Test instructions".to_string()))
            .task_type(Some("test_task".to_string()))
            .build();

        let template = "Instructions: {{CUSTOM_INSTRUCTIONS}}, Task: {{TASK_TYPE}}";
        let result = processor.process_template(template, &context).unwrap();
        
        assert_eq!(result, "Instructions: Test instructions, Task: test_task");
    }

    #[test]
    fn test_conditional_sections() {
        let processor = EnhancedTemplateProcessor::new();
        let mut file_contents = HashMap::new();
        file_contents.insert("test.rs".to_string(), "fn main() {}".to_string());
        
        let context = EnhancedPromptContextBuilder::new()
            .file_contents(Some(file_contents))
            .build();

        let template = "{{#IF FILE_CONTENTS}}Files are available{{/IF}}{{#IF LANGUAGE}}Language specified{{/IF}}";
        let result = processor.process_template(template, &context).unwrap();
        
        assert_eq!(result, "Files are available");
    }

    #[test]
    fn test_file_contents_xml_generation() {
        let processor = EnhancedTemplateProcessor::new();
        let mut file_contents = HashMap::new();
        file_contents.insert("test.rs".to_string(), "fn main() {\n    println!(\"Hello\");\n}".to_string());
        
        let context = EnhancedPromptContextBuilder::new()
            .file_contents(Some(file_contents))
            .build();

        let template = "{{FILE_CONTENTS_XML}}";
        let result = processor.process_template(template, &context).unwrap();
        
        assert!(result.contains("<file_contents>"));
        assert!(result.contains("<file path=\"test.rs\">"));
        assert!(result.contains("<![CDATA["));
        assert!(result.contains("fn main()"));
    }
}