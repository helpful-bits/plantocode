use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use regex::Regex;
use crate::error::{AppError, AppResult};
use crate::models::TaskType;
use crate::db_utils::SettingsRepository;
use crate::utils::prompt_template_utils::PromptPlaceholders;

/// **UNIFIED PROMPT SYSTEM**
/// This consolidates the functionality from three overlapping systems:
/// 1. enhanced_prompt_template.rs
/// 2. prompt_template_utils.rs  
/// 3. prompt_composition.rs
/// 
/// All three systems were doing similar placeholder substitution with different APIs
/// This provides a single, comprehensive prompt processing system

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedPromptContext {
    // Session and task info
    pub session_id: String,
    pub task_type: TaskType,
    pub task_description: String,
    
    // Basic placeholders
    pub custom_instructions: Option<String>,
    pub model_name: Option<String>,
    pub session_name: Option<String>,
    
    // Rich context data
    pub project_directory: Option<String>,
    pub project_structure: Option<String>,
    pub file_contents: Option<HashMap<String, String>>,
    pub relevant_files: Option<Vec<String>>,
    pub codebase_structure: Option<String>,
    pub directory_tree: Option<String>,
    
    // Advanced features
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone)]
pub struct ComposedPrompt {
    pub final_prompt: String,
    pub system_prompt_id: String,
    pub context_sections: Vec<String>,
    pub estimated_tokens: Option<usize>,
}

/// Unified prompt processor that combines all three previous systems
pub struct UnifiedPromptProcessor;

impl UnifiedPromptProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Main composition method that combines database templates with context
    pub async fn compose_prompt(
        &self,
        context: &UnifiedPromptContext,
        settings_repo: &SettingsRepository,
    ) -> AppResult<ComposedPrompt> {
        // Get the system prompt template from database (from prompt_composition.rs)
        let placeholders = self.create_placeholders(context)?;
        let (system_template, system_prompt_id) = settings_repo
            .get_effective_system_prompt_with_substitution(
                &context.session_id,
                &context.task_type.to_string(),
                &placeholders,
            )
            .await?
            .ok_or_else(|| AppError::ConfigError("No system prompt found".to_string()))?;

        // Process the template with enhanced features (from enhanced_prompt_template.rs)
        let processed_system = self.process_template(&system_template, context)?;
        
        // Create user prompt with context (from prompt_composition.rs)
        let user_prompt = self.generate_user_prompt(context)?;
        
        // Combine system and user parts
        let final_prompt = format!("{}\n\n{}", processed_system, user_prompt);
        
        // Estimate tokens
        let estimated_tokens = Some(crate::utils::token_estimator::estimate_tokens(&final_prompt) as usize);
        
        // Track context sections used
        let context_sections = self.get_context_sections_used(context);
        
        Ok(ComposedPrompt {
            final_prompt,
            system_prompt_id,
            context_sections,
            estimated_tokens,
        })
    }

    /// Process template with placeholder substitution (consolidated from all three systems)
    pub fn process_template(
        &self,
        template: &str,
        context: &UnifiedPromptContext,
    ) -> AppResult<String> {
        let mut result = template.to_string();

        
        // Substitute basic placeholders (from prompt_template_utils.rs)
        result = self.substitute_basic_placeholders(&result, context)?;
        
        // Process rich content sections (from enhanced_prompt_template.rs)
        result = self.process_rich_content(&result, context)?;

        Ok(result)
    }

    /// Create placeholder mapping (from prompt_composition.rs)
    fn create_placeholders(&self, context: &UnifiedPromptContext) -> AppResult<PromptPlaceholders> {
        let mut placeholders = PromptPlaceholders::new();
        
        placeholders = placeholders.with_custom_instructions(context.custom_instructions.as_deref());
        placeholders = placeholders.with_model_name(context.model_name.as_deref());
        placeholders = placeholders.with_session_name(context.session_name.as_deref());
        placeholders = placeholders.with_task_type(Some(&context.task_type.to_string()));
        
        if let Some(ref project_dir) = context.project_directory {
            placeholders = placeholders.with_project_context(Some(project_dir));
        }

        // Convert file contents to XML format if available
        if let Some(ref file_contents) = context.file_contents {
            let file_contents_xml = self.generate_file_contents_xml(file_contents); // This function already returns an empty string if file_contents is empty
            if !file_contents_xml.is_empty() { // Only add if there's actual XML content
                placeholders = placeholders.with_file_contents(Some(&file_contents_xml));
            }
        }

        // Convert directory tree to XML format if available
        if let Some(ref tree) = context.directory_tree {
            let tree_xml = self.generate_project_structure_xml(tree); // This function already returns an empty string if tree is empty
            if !tree_xml.is_empty() { // Only add if there's actual XML content
                placeholders = placeholders.with_directory_tree(Some(&tree_xml));
            }
        }

        Ok(placeholders)
    }


    /// Substitute basic placeholders (from prompt_template_utils.rs)
    fn substitute_basic_placeholders(&self, template: &str, context: &UnifiedPromptContext) -> AppResult<String> {
        let mut result = template.to_string();
        
        // Create substitution map
        let mut substitutions = HashMap::new();
        
        if let Some(ref instructions) = context.custom_instructions {
            substitutions.insert("{{CUSTOM_INSTRUCTIONS}}", instructions.as_str());
        }
        
        if let Some(ref model) = context.model_name {
            substitutions.insert("{{MODEL_NAME}}", model.as_str());
        }
        
        if let Some(ref session) = context.session_name {
            substitutions.insert("{{SESSION_NAME}}", session.as_str());
        }
        
        let task_type_str = context.task_type.to_string();
        substitutions.insert("{{TASK_TYPE}}", &task_type_str);
        substitutions.insert("{{TASK_DESCRIPTION}}", &context.task_description);
        substitutions.insert("{{SESSION_ID}}", &context.session_id);
        
        if let Some(ref project_dir) = context.project_directory {
            substitutions.insert("{{PROJECT_DIRECTORY}}", project_dir.as_str());
        }
        
        // Apply substitutions
        for (placeholder, value) in substitutions {
            result = result.replace(placeholder, value);
        }
        
        Ok(result)
    }

    /// Process rich content placeholders with conditional sections
    fn process_rich_content(&self, template: &str, context: &UnifiedPromptContext) -> AppResult<String> {
        let mut result = template.to_string();
        
        // Process conditional sections - remove empty placeholders
        let empty_placeholders = vec![
            ("{{PROJECT_CONTEXT}}", context.project_directory.is_none()),
            ("{{FILE_CONTENTS}}", context.file_contents.as_ref().map_or(true, |fc| fc.is_empty())),
            ("{{DIRECTORY_TREE}}", context.directory_tree.is_none()),
            ("{{CUSTOM_INSTRUCTIONS}}", context.custom_instructions.is_none()),
            ("{{MODEL_NAME}}", context.model_name.is_none()),
            ("{{SESSION_NAME}}", context.session_name.is_none()),
        ];
        
        // Remove lines containing only empty placeholders
        for (placeholder, is_empty) in empty_placeholders {
            if is_empty {
                // Remove entire lines that contain only this placeholder
                let lines: Vec<&str> = result.lines().collect();
                let filtered_lines: Vec<&str> = lines.into_iter()
                    .filter(|line| {
                        let trimmed = line.trim();
                        !trimmed.is_empty() && trimmed != placeholder
                    })
                    .collect();
                result = filtered_lines.join("\n");
                
                // Also remove any remaining placeholder text
                result = result.replace(placeholder, "");
            }
        }
        
        // Clean up multiple consecutive newlines
        if let Ok(re_multiple_newlines) = Regex::new(r"\n\s*\n\s*\n+") {
            result = re_multiple_newlines.replace_all(&result, "\n\n").to_string();
        }
        
        Ok(result)
    }

    /// Generate user prompt with context (from prompt_composition.rs)
    fn generate_user_prompt(&self, context: &UnifiedPromptContext) -> AppResult<String> {
        let mut user_prompt = context.task_description.clone();
        
        // Add relevant context based on task type
        if let Some(ref files) = context.relevant_files {
            if !files.is_empty() {
                user_prompt.push_str(&format!("\n\nRelevant files: {}", files.join(", ")));
            }
        }
        
        if let Some(ref structure) = context.codebase_structure {
            user_prompt.push_str(&format!("\n\nCodebase structure:\n{}", structure));
        }
        
        Ok(user_prompt)
    }


    /// Generate file contents XML (from enhanced_prompt_template.rs)
    fn generate_file_contents_xml(&self, file_contents: &HashMap<String, String>) -> String {
        if file_contents.is_empty() {
            return String::new();
        }
        let mut xml = String::from("<file_contents>\n");
        for (path, content) in file_contents {
            xml.push_str(&format!("  <file path=\"{}\">\n{}\n  </file>\n", path, content));
        }
        xml.push_str("</file_contents>");
        xml
    }

    /// Generate project structure XML (from enhanced_prompt_template.rs)
    fn generate_project_structure_xml(&self, directory_tree: &str) -> String {
        if directory_tree.trim().is_empty() {
            return String::new();
        }
        format!("<project_structure>\n{}\n</project_structure>", directory_tree)
    }

    /// Get context sections used
    fn get_context_sections_used(&self, context: &UnifiedPromptContext) -> Vec<String> {
        let mut sections = Vec::new();
        
        if context.file_contents.is_some() {
            sections.push("file_contents".to_string());
        }
        if context.directory_tree.is_some() {
            sections.push("directory_tree".to_string());
        }
        if context.custom_instructions.is_some() {
            sections.push("custom_instructions".to_string());
        }
        
        sections
    }
}

/// Builder for UnifiedPromptContext (replaces CompositionContextBuilder)
pub struct UnifiedPromptContextBuilder {
    context: UnifiedPromptContext,
}

impl UnifiedPromptContextBuilder {
    pub fn new(session_id: String, task_type: TaskType, task_description: String) -> Self {
        Self {
            context: UnifiedPromptContext {
                session_id,
                task_type,
                task_description,
                custom_instructions: None,
                model_name: None,
                session_name: None,
                project_directory: None,
                project_structure: None,
                file_contents: None,
                relevant_files: None,
                codebase_structure: None,
                directory_tree: None,
                metadata: None,
            },
        }
    }

    pub fn project_directory(mut self, project_directory: Option<String>) -> Self {
        self.context.project_directory = project_directory;
        self
    }

    pub fn project_structure(mut self, project_structure: Option<String>) -> Self {
        self.context.project_structure = project_structure;
        self
    }

    pub fn file_contents(mut self, file_contents: Option<HashMap<String, String>>) -> Self {
        self.context.file_contents = file_contents;
        self
    }

    pub fn custom_instructions(mut self, custom_instructions: Option<String>) -> Self {
        self.context.custom_instructions = custom_instructions;
        self
    }

    pub fn model_name(mut self, model_name: Option<String>) -> Self {
        self.context.model_name = model_name;
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

    pub fn directory_tree(mut self, directory_tree: Option<String>) -> Self {
        self.context.directory_tree = directory_tree;
        self
    }

    pub fn session_name(mut self, session_name: Option<String>) -> Self {
        self.context.session_name = session_name;
        self
    }

    pub fn metadata(mut self, metadata: Option<HashMap<String, String>>) -> Self {
        self.context.metadata = metadata;
        self
    }

    pub fn build(self) -> UnifiedPromptContext {
        self.context
    }
}