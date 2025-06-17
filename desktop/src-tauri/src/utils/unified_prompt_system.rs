use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use regex::Regex;
use crate::error::{AppError, AppResult};
use crate::models::TaskType;
use crate::db_utils::SettingsRepository;
use crate::utils::prompt_template_utils::PromptPlaceholders;
use crate::api_clients::ServerProxyClient;
use tauri::{AppHandle, Manager};
use std::sync::Arc;

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
    // Project and task info
    pub project_directory: String,
    pub task_type: TaskType,
    pub task_description: String,
    
    // Basic placeholders
    pub custom_instructions: Option<String>,
    pub model_name: Option<String>,
    pub session_name: Option<String>,
    
    // Rich context data
    pub project_structure: Option<String>,
    pub file_contents: Option<HashMap<String, String>>,
    pub relevant_files: Option<Vec<String>>,
    pub directory_tree: Option<String>,
    
    // Advanced features
    pub metadata: Option<HashMap<String, String>>,
    
    // Text correction specific
    pub language: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ComposedPrompt {
    pub system_prompt: String,
    pub user_prompt: String,
    pub system_prompt_id: String,
    pub context_sections: Vec<String>,
    pub estimated_total_tokens: Option<usize>,
    pub estimated_system_tokens: Option<usize>,
    pub estimated_user_tokens: Option<usize>,
}

/// Unified prompt processor that combines all three previous systems
pub struct UnifiedPromptProcessor;

impl UnifiedPromptProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Get effective system prompt from project settings or server defaults
    async fn get_effective_system_prompt(
        &self,
        app_handle: &AppHandle,
        project_directory: &str,
        task_type: &str,
    ) -> AppResult<(String, String)> {
        // First try to get project-specific system prompt
        let project_settings = crate::commands::settings_commands::get_project_task_model_settings_command(
            app_handle.clone(),
            project_directory.to_string(),
        ).await?;

        if let Some(settings_json) = project_settings {
            let settings: serde_json::Value = serde_json::from_str(&settings_json)
                .map_err(|e| AppError::ConfigError(format!("Invalid project settings JSON: {}", e)))?;
            
            if let Some(task_settings) = settings.get(task_type) {
                if let Some(task_object) = task_settings.as_object() {
                    if let Some(system_prompt) = task_object.get("systemPrompt") {
                        if let Some(prompt_str) = system_prompt.as_str() {
                            if !prompt_str.is_empty() {
                                return Ok((prompt_str.to_string(), "project".to_string()));
                            }
                        }
                    }
                }
            }
        }

        // Fall back to server default system prompt
        let server_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
        if let Some(default_prompt) = server_client.get_default_system_prompt(task_type).await? {
            // Try both field name formats (server might use either)
            let prompt_str = default_prompt.get("system_prompt")
                .or_else(|| default_prompt.get("systemPrompt"))
                .and_then(|p| p.as_str());
            
            if let Some(prompt_str) = prompt_str {
                return Ok((prompt_str.to_string(), "default".to_string()));
            }
        }

        // Ultimate fallback: empty system prompt
        Ok(("".to_string(), "fallback".to_string()))
    }

    /// Main composition method that combines database templates with context
    pub async fn compose_prompt(
        &self,
        context: &UnifiedPromptContext,
        app_handle: &AppHandle,
    ) -> AppResult<ComposedPrompt> {
        // Get the system prompt template from project settings or server defaults
        let (system_template, system_prompt_id) = self.get_effective_system_prompt(
            app_handle,
            &context.project_directory,
            &context.task_type.to_string(),
        ).await?;

        // Process the template with enhanced features (from enhanced_prompt_template.rs)
        let processed_system = self.process_template(&system_template, context)?;
        
        // Create user prompt with context (from prompt_composition.rs)
        let user_prompt = self.generate_user_prompt(context)?;
        
        
        // Estimate tokens
        let system_tokens = crate::utils::token_estimator::estimate_tokens(&processed_system) as usize;
        let user_tokens = crate::utils::token_estimator::estimate_tokens(&user_prompt) as usize;
        let total_tokens = system_tokens + user_tokens;
        
        // Track context sections used
        let context_sections = self.get_context_sections_used(context);
        
        Ok(ComposedPrompt {
            system_prompt: processed_system,
            user_prompt,
            system_prompt_id,
            context_sections,
            estimated_total_tokens: Some(total_tokens),
            estimated_system_tokens: Some(system_tokens),
            estimated_user_tokens: Some(user_tokens),
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
    /// Handles None and empty values gracefully by only adding non-empty content
    fn create_placeholders(&self, context: &UnifiedPromptContext) -> AppResult<PromptPlaceholders> {
        let mut placeholders = PromptPlaceholders::new();
        
        placeholders = placeholders.with_custom_instructions(context.custom_instructions.as_deref());
        placeholders = placeholders.with_model_name(context.model_name.as_deref());
        placeholders = placeholders.with_session_name(context.session_name.as_deref());
        placeholders = placeholders.with_task_type(Some(&context.task_type.to_string()));
        
        if !context.project_directory.trim().is_empty() {
            placeholders = placeholders.with_project_context(Some(&context.project_directory));
        }

        // Convert file contents to XML format if available and non-empty
        if let Some(ref file_contents) = context.file_contents {
            if !file_contents.is_empty() {
                let file_contents_xml = self.generate_file_contents_xml(file_contents);
                if !file_contents_xml.is_empty() {
                    placeholders = placeholders.with_file_contents(Some(&file_contents_xml));
                }
            }
        }

        // Convert directory tree to XML format if available and non-empty
        if let Some(ref tree) = context.directory_tree {
            if !tree.trim().is_empty() {
                let tree_xml = self.generate_project_structure_xml(tree);
                if !tree_xml.is_empty() {
                    placeholders = placeholders.with_directory_tree(Some(&tree_xml));
                }
            }
        }

        Ok(placeholders)
    }


    /// Substitute basic placeholders (from prompt_template_utils.rs)
    fn substitute_basic_placeholders(&self, template: &str, context: &UnifiedPromptContext) -> AppResult<String> {
        let mut result = template.to_string();
        
        // Pre-generate XML content to avoid borrow checker issues
        let file_contents_xml = if let Some(ref file_contents) = context.file_contents {
            if !file_contents.is_empty() {
                self.generate_file_contents_xml(file_contents)
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        
        let directory_tree_xml = if let Some(ref directory_tree) = context.directory_tree {
            if !directory_tree.trim().is_empty() {
                self.generate_project_structure_xml(directory_tree)
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        
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
        substitutions.insert("{{PROJECT_DIRECTORY}}", &context.project_directory);
        
        if let Some(ref language) = context.language {
            substitutions.insert("{{LANGUAGE}}", language.as_str());
        }
        
        // Handle XML content placeholders - this was the missing piece!
        if !file_contents_xml.is_empty() {
            substitutions.insert("{{FILE_CONTENTS}}", file_contents_xml.as_str());
        }
        
        if !directory_tree_xml.is_empty() {
            substitutions.insert("{{DIRECTORY_TREE}}", directory_tree_xml.as_str());
        }
        
        // Apply substitutions
        for (placeholder, value) in substitutions {
            result = result.replace(placeholder, value);
        }
        
        // Clean up any remaining {{LANGUAGE}} placeholders if no language was provided
        result = result.replace("{{LANGUAGE}}", "English");
        
        Ok(result)
    }

    /// Process rich content placeholders with conditional sections
    /// Removes empty placeholders and cleans up formatting to prevent malformed prompts
    fn process_rich_content(&self, template: &str, context: &UnifiedPromptContext) -> AppResult<String> {
        let mut result = template.to_string();
        
        // Only remove placeholders that still exist in the result (meaning substitution failed)
        // This prevents removing successfully substituted XML content
        let placeholders_to_check = vec![
            "{{PROJECT_CONTEXT}}",
            "{{FILE_CONTENTS}}",
            "{{DIRECTORY_TREE}}",
            "{{CUSTOM_INSTRUCTIONS}}",
            "{{MODEL_NAME}}",
            "{{SESSION_NAME}}",
            "{{LANGUAGE}}",
        ];
        
        // Remove lines containing unsubstituted placeholders and clean up remaining placeholder text
        for placeholder in placeholders_to_check {
            if result.contains(placeholder) {
                // Remove entire lines that contain only this placeholder (with optional whitespace)
                let lines: Vec<&str> = result.lines().collect();
                let filtered_lines: Vec<&str> = lines.into_iter()
                    .filter(|line| {
                        let trimmed = line.trim();
                        // Keep lines that are not empty and don't contain only the placeholder
                        !(trimmed == placeholder || trimmed.is_empty() && line.contains(placeholder))
                    })
                    .collect();
                result = filtered_lines.join("\n");
                
                // Remove any remaining placeholder text
                result = result.replace(placeholder, "");
            }
        }
        
        // Clean up excessive whitespace and newlines
        if let Ok(re_multiple_newlines) = Regex::new(r"\n\s*\n\s*\n+") {
            result = re_multiple_newlines.replace_all(&result, "\n\n").to_string();
        }
        
        // Clean up leading/trailing whitespace
        result = result.trim().to_string();
        
        Ok(result)
    }

    /// Generate user prompt - simply wraps task description in <task></task> tags
    /// File contents and directory tree are handled via system prompt placeholders
    fn generate_user_prompt(&self, context: &UnifiedPromptContext) -> AppResult<String> {
        Ok(format!("<task>\n{}\n</task>", context.task_description))
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
    pub fn new(project_directory: String, task_type: TaskType, task_description: String) -> Self {
        Self {
            context: UnifiedPromptContext {
                project_directory,
                task_type,
                task_description,
                custom_instructions: None,
                model_name: None,
                session_name: None,
                project_structure: None,
                file_contents: None,
                relevant_files: None,
                directory_tree: None,
                metadata: None,
                language: None,
            },
        }
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

    pub fn language(mut self, language: Option<String>) -> Self {
        self.context.language = language;
        self
    }

    pub fn build(self) -> UnifiedPromptContext {
        self.context
    }
}