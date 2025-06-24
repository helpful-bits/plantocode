use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use regex::Regex;
use crate::error::{AppError, AppResult};
use crate::models::TaskType;
use crate::db_utils::SettingsRepository;
use crate::api_clients::ServerProxyClient;
use crate::utils::hash_utils::generate_project_hash;
use tauri::{AppHandle, Manager};
use std::sync::Arc;

/// **UNIFIED PROMPT SYSTEM**
/// This provides a single, comprehensive prompt processing system that handles
/// placeholder substitution, template processing, and prompt composition with
/// proper capture of original templates before placeholder replacement.

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
    
    // Language setting for transcription and other language-specific tasks
    pub language: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ComposedPrompt {
    pub system_prompt: String,
    pub user_prompt: String,
    pub system_prompt_id: String,
    pub system_prompt_template: String,
    pub context_sections: Vec<String>,
    pub estimated_total_tokens: Option<usize>,
    pub estimated_system_tokens: Option<usize>,
    pub estimated_user_tokens: Option<usize>,
}

/// Unified prompt processor that handles template processing and composition
pub struct UnifiedPromptProcessor;

impl UnifiedPromptProcessor {
    pub fn new() -> Self {
        Self
    }

    /// Get effective system prompt - first check project database, then server defaults
    /// Returns (resolved_prompt, original_template, prompt_id)
    async fn get_effective_system_prompt(
        &self,
        app_handle: &AppHandle,
        project_directory: &str,
        task_type: &str,
    ) -> AppResult<(String, String, String)> {
        // First: Check for custom project system prompt in database
        let repo = app_handle.state::<Arc<crate::db_utils::BackgroundJobRepository>>().inner().clone();
        let settings_repo = crate::db_utils::SettingsRepository::new(repo.get_pool());
        
        // Get project hash from directory
        let project_hash = generate_project_hash(project_directory);
        
        // Check for custom project system prompt
        if let Ok(Some(custom_prompt)) = settings_repo.get_project_system_prompt(&project_hash, task_type).await {
            return Ok((custom_prompt.system_prompt.clone(), custom_prompt.system_prompt, "custom".to_string()));
        }
        
        // Second: Fall back to server default system prompt
        let server_client = app_handle.state::<Arc<ServerProxyClient>>().inner().clone();
        if let Some(default_prompt) = server_client.get_default_system_prompt(task_type).await? {
            // Try both field name formats (server might use either)
            let prompt_str = default_prompt.get("system_prompt")
                .or_else(|| default_prompt.get("systemPrompt"))
                .and_then(|p| p.as_str());
            
            if let Some(prompt_str) = prompt_str {
                // Store original template BEFORE any placeholder replacement
                let original_template = prompt_str.to_string();
                // At this stage, resolved_prompt is same as original - placeholder replacement happens in process_template
                let resolved_prompt = prompt_str.to_string();
                return Ok((resolved_prompt, original_template, "default".to_string()));
            }
        }

        // Ultimate fallback: empty system prompt
        Ok(("".to_string(), "".to_string(), "fallback".to_string()))
    }

    /// Main composition method that combines database templates with context
    pub async fn compose_prompt(
        &self,
        context: &UnifiedPromptContext,
        app_handle: &AppHandle,
    ) -> AppResult<ComposedPrompt> {
        // Get the system prompt template from project settings or server defaults
        let (system_template, original_template, system_prompt_id) = self.get_effective_system_prompt(
            app_handle,
            &context.project_directory,
            &context.task_type.to_string(),
        ).await?;

        // Process the template with placeholder substitution
        let processed_system = self.process_template(&system_template, context)?;
        
        // Create user prompt with context
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
            system_prompt_template: original_template,
            context_sections,
            estimated_total_tokens: Some(total_tokens),
            estimated_system_tokens: Some(system_tokens),
            estimated_user_tokens: Some(user_tokens),
        })
    }

    /// Process template with placeholder substitution
    pub fn process_template(
        &self,
        template: &str,
        context: &UnifiedPromptContext,
    ) -> AppResult<String> {
        let mut result = template.to_string();

        
        // Substitute basic placeholders
        result = self.substitute_basic_placeholders(&result, context)?;
        
        // Process rich content sections
        result = self.process_rich_content(&result, context)?;

        Ok(result)
    }

    /// Create placeholder mapping
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


    /// Substitute basic placeholders
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
        
        // Handle XML content placeholders
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


    /// Generate file contents XML
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

    /// Generate project structure XML
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

/// Builder for UnifiedPromptContext
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