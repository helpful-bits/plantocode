use std::collections::HashMap;
use crate::error::{AppError, AppResult};
use crate::utils::enhanced_prompt_template::{EnhancedPromptContext, EnhancedTemplateProcessor, ProjectContext};
use crate::db_utils::SettingsRepository;
use crate::models::TaskType;

/// Sophisticated prompt composition system that assembles system + user + context
/// This combines the database customization with function-based prompt generation
pub struct PromptComposer {
    template_processor: EnhancedTemplateProcessor,
}

/// Comprehensive context for prompt composition
#[derive(Debug, Clone)]
pub struct CompositionContext {
    // Session and task info
    pub session_id: String,
    pub task_type: TaskType,
    pub task_description: String,
    
    // Optional context data
    pub project_directory: Option<String>,
    pub project_structure: Option<String>,
    pub file_contents: Option<HashMap<String, String>>,
    pub relevant_files: Option<Vec<String>>,
    pub codebase_structure: Option<String>,
    
    // Task-specific parameters
    pub custom_instructions: Option<String>,
    pub model_name: Option<String>,
    pub session_name: Option<String>,
    
    // Metadata
    pub metadata: Option<HashMap<String, String>>,
}

/// Result of prompt composition
#[derive(Debug, Clone)]
pub struct ComposedPrompt {
    pub final_prompt: String,
    pub system_prompt_id: String,
    pub context_sections: Vec<String>,
    pub estimated_tokens: Option<usize>,
}

impl PromptComposer {
    pub fn new() -> Self {
        Self {
            template_processor: EnhancedTemplateProcessor::new(),
        }
    }

    /// Main composition method that creates sophisticated prompts
    pub async fn compose_prompt(
        &self,
        context: &CompositionContext,
        settings_repo: &SettingsRepository,
    ) -> AppResult<ComposedPrompt> {
        // Get the system prompt template from database
        let (system_template, system_prompt_id) = settings_repo
            .get_effective_system_prompt_with_substitution(
                &context.session_id,
                &context.task_type.to_string(),
                &self.create_placeholders(context)?,
            )
            .await?
            .ok_or_else(|| {
                AppError::ConfigError(format!(
                    "No system prompt found for task type: {}",
                    context.task_type.to_string()
                ))
            })?;

        // Create enhanced context for sophisticated template processing
        let enhanced_context = self.create_enhanced_context(context)?;

        // Process the system template with enhanced features
        let processed_system_prompt = self
            .template_processor
            .process_template(&system_template, &enhanced_context)?;

        // Generate user prompt based on task type
        let user_prompt = self.generate_user_prompt(context)?;

        // Compose final prompt
        let final_prompt = self.compose_final_prompt(&processed_system_prompt, &user_prompt, context)?;

        // Estimate tokens
        let estimated_tokens = Some(crate::utils::token_estimator::estimate_tokens(&final_prompt) as usize);

        // Track context sections for debugging/audit
        let context_sections = self.extract_context_sections(&enhanced_context);

        Ok(ComposedPrompt {
            final_prompt,
            system_prompt_id,
            context_sections,
            estimated_tokens,
        })
    }

    /// Create enhanced context from composition context
    fn create_enhanced_context(&self, context: &CompositionContext) -> AppResult<EnhancedPromptContext> {
        let project_context = if let Some(project_dir) = &context.project_directory {
            Some(ProjectContext {
                project_directory: project_dir.clone(),
                project_hash: None, // Could be computed if needed
                structure_summary: context.project_structure.clone(),
                metadata: context.metadata.clone(),
            })
        } else {
            None
        };

        Ok(EnhancedPromptContext {
            custom_instructions: context.custom_instructions.clone(),
            model_name: context.model_name.clone(),
            session_name: context.session_name.clone(),
            task_type: Some(context.task_type.to_string()),
            project_context,
            file_contents: context.file_contents.clone(),
            directory_tree: context.codebase_structure.clone(),
            relevant_files: context.relevant_files.clone(),
            codebase_structure: context.project_structure.clone(),
        })
    }

    /// Create placeholders for template substitution
    fn create_placeholders(&self, context: &CompositionContext) -> AppResult<crate::utils::PromptPlaceholders> {
        let mut placeholders = crate::utils::PromptPlaceholders::new()
            .with_task_type(Some(&context.task_type.to_string()));

        if let Some(custom_instructions) = &context.custom_instructions {
            placeholders = placeholders.with_custom_instructions(Some(custom_instructions));
        }

        if let Some(project_structure) = &context.project_structure {
            placeholders = placeholders.with_project_context(Some(project_structure));
        }

        if let Some(file_contents) = &context.file_contents {
            if let Ok(json_str) = serde_json::to_string(file_contents) {
                placeholders = placeholders.with_file_contents(Some(&json_str));
            }
        }

        if let Some(codebase_structure) = &context.codebase_structure {
            placeholders = placeholders.with_directory_tree(Some(codebase_structure));
        }

        Ok(placeholders)
    }

    /// Generate user prompt based on task type and context
    fn generate_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        match context.task_type {
            TaskType::PathFinder => self.generate_path_finder_user_prompt(context),
            TaskType::ImplementationPlan => self.generate_implementation_plan_user_prompt(context),
            TaskType::TextImprovement => self.generate_text_improvement_user_prompt(context),
            TaskType::GuidanceGeneration => self.generate_guidance_user_prompt(context),
            TaskType::TextCorrection => self.generate_text_correction_user_prompt(context),
            TaskType::PathCorrection => self.generate_path_correction_user_prompt(context),
            TaskType::TaskEnhancement => self.generate_task_enhancement_user_prompt(context),
            TaskType::RegexPatternGeneration => self.generate_regex_pattern_user_prompt(context),
            TaskType::RegexSummaryGeneration => self.generate_regex_summary_user_prompt(context),
            TaskType::GenericLlmStream => self.generate_generic_llm_user_prompt(context),
            _ => Ok(format!("## Task Description:\n\n{}", context.task_description)),
        }
    }

    /// Generate sophisticated path finder user prompt
    fn generate_path_finder_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        let mut prompt = format!(
            "<path_finder_query>\n<task_description><![CDATA[{}]]></task_description>\n",
            context.task_description
        );

        if let Some(directory_tree) = &context.codebase_structure {
            prompt.push_str(&format!(
                "\n<project_structure><![CDATA[{}]]></project_structure>\n",
                directory_tree
            ));
        }

        if let Some(file_contents) = &context.file_contents {
            prompt.push_str("\n<file_contents>");
            for (path, content) in file_contents {
                prompt.push_str(&format!(
                    "\n    <file path=\"{}\"><![CDATA[{}]]></file>",
                    path, content
                ));
            }
            prompt.push_str("\n</file_contents>");
        }

        prompt.push_str("\n\n<output_format_instruction>");
        prompt.push_str("\nReturn ONLY file paths and no other commentary, with one file path per line.");
        prompt.push_str("\nFor example:");
        prompt.push_str("\nsrc/components/Button.tsx");
        prompt.push_str("\nsrc/hooks/useAPI.ts");
        prompt.push_str("\nsrc/styles/theme.css");
        prompt.push_str("\n</output_format_instruction>");
        prompt.push_str("\n</path_finder_query>");

        Ok(prompt)
    }

    /// Generate sophisticated implementation plan user prompt
    fn generate_implementation_plan_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        let mut prompt = String::new();

        if let Some(project_structure) = &context.project_structure {
            prompt.push_str(&format!(
                "<project_structure>\n{}\n</project_structure>\n\n",
                project_structure
            ));
        }

        if let Some(file_contents) = &context.file_contents {
            if !file_contents.is_empty() {
                prompt.push_str("<codebase_info>\n");
                prompt.push_str(&format!(
                    "You are provided with the complete project structure above, showing all files in the project.\n"
                ));
                prompt.push_str(&format!(
                    "The {} files below are highlighted as most relevant to this task and their contents are included:\n\n",
                    file_contents.len()
                ));

                for (path, content) in file_contents {
                    prompt.push_str(&format!("<file path=\"{}\">\n```\n{}\n```\n</file>\n\n", path, content));
                }

                prompt.push_str("</codebase_info>\n\n");
            }
        }

        prompt.push_str(&format!("<task>\n{}\n</task>", context.task_description));

        Ok(prompt)
    }

    /// Generate text improvement user prompt
    fn generate_text_improvement_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        Ok(context.task_description.clone())
    }

    /// Generate guidance user prompt with sophisticated context
    fn generate_guidance_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        let mut prompt = format!(
            "<architectural_guidance_query>\n<task_description><![CDATA[{}]]></task_description>\n",
            context.task_description
        );

        if let Some(relevant_files) = &context.relevant_files {
            if !relevant_files.is_empty() {
                prompt.push_str("\n<relevant_files>");
                for file_path in relevant_files {
                    prompt.push_str(&format!("\n    <file>{}</file>", file_path));
                }
                prompt.push_str("\n</relevant_files>");
            }
        }

        if let Some(file_contents) = &context.file_contents {
            if !file_contents.is_empty() {
                prompt.push_str("\n\n<file_contents_summary>");
                prompt.push_str(&format!("\n    Files analyzed: {}", file_contents.len()));
                for path in file_contents.keys() {
                    prompt.push_str(&format!("\n    - {}", path));
                }
                prompt.push_str("\n</file_contents_summary>");
            }
        }

        prompt.push_str(r#"

<response_format>
    Create a concise narrative in Markdown that directly explains the data flow and architecture.

    Your response must be brief and focused primarily on:

    1. The specific path data takes through the system
    2. How data is transformed between components
    3. The key function calls in sequence
    4. Clear, actionable implementation guidance
    5. No introduction, just the story

    Avoid lengthy, philosophical, or overly metaphorical explanations. The reader needs a clear, direct understanding of how data moves through the code. It has to be in engaging Andrew Huberman style (but without the science, just style of talking). The story has to be very short. Use simple English.

</response_format>
</architectural_guidance_query>"#);

        Ok(prompt)
    }

    /// Generate text correction user prompt (consolidates voice correction and post-transcription correction)
    fn generate_text_correction_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        Ok(format!(
            "## Text to Correct:\n\n{}\n\nPlease correct and improve this text while maintaining its original meaning and technical content. Clean up any transcription errors, improve readability, and ensure proper grammar and formatting.",
            context.task_description
        ))
    }

    /// Generate path correction user prompt
    fn generate_path_correction_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        let mut prompt = format!(
            "I have the following file paths that may contain errors or may not exist:\n{}\n\n",
            context.task_description
        );

        if let Some(directory_tree) = &context.codebase_structure {
            prompt.push_str("Here is the current project structure for reference:\n");
            prompt.push_str("```\n");
            prompt.push_str(directory_tree);
            prompt.push_str("\n```\n\n");
        }

        prompt.push_str("Please correct these paths based on:\n");
        prompt.push_str("1. Most likely real paths in typical project structures\n");
        prompt.push_str("2. Usual naming conventions for files\n");
        prompt.push_str("3. What files would typically be needed\n\n");
        prompt.push_str("Return ONLY a list of corrected file paths, one per line.");

        Ok(prompt)
    }

    /// Generate task enhancement user prompt
    fn generate_task_enhancement_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        let mut prompt = format!("## Task Description to Enhance:\n\n{}", context.task_description);

        if let Some(project_structure) = &context.project_structure {
            prompt.push_str("\n\n## Project Context:\n\n");
            prompt.push_str(project_structure);
        }

        Ok(prompt)
    }

    /// Generate regex pattern user prompt
    fn generate_regex_pattern_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        let mut prompt = format!(
            "Based on the following task description, identify the user's intent regarding file selection and generate appropriate JavaScript-compatible regular expressions for matching file paths (titles) and file content.\n\n"
        );

        if let Some(directory_tree) = &context.codebase_structure {
            prompt.push_str("To help with generating more accurate regex patterns, here is the current project directory structure:\n");
            prompt.push_str("```\n");
            prompt.push_str(directory_tree);
            prompt.push_str("\n```\n\n");
            prompt.push_str("Consider this structure when creating patterns to match files in the appropriate directories.\n\n");
        }

        prompt.push_str(&format!("Task Description: \"{}\"\n\n", context.task_description));

        prompt.push_str("IMPORTANT: The generated patterns will be used in an OR relationship - files matching EITHER the titleRegex OR the contentRegex will be included in the results. You don't need to combine both patterns into one; they will be applied separately.\n\n");

        prompt.push_str("CRITICAL: Your entire response must be ONLY the raw JSON object. Do NOT include any surrounding text, explanations, or markdown code fences like ```json ... ```. The response must start with '{' and end with '}'.\n\n");

        prompt.push_str("Now, generate the JSON for the provided task description.");

        Ok(prompt)
    }

    /// Generate regex summary user prompt
    fn generate_regex_summary_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        Ok(format!(
            "Regex patterns to summarize: {}\n\nExplain what each pattern matches in clear, understandable language.",
            context.task_description
        ))
    }

    /// Generate generic LLM user prompt
    fn generate_generic_llm_user_prompt(&self, context: &CompositionContext) -> AppResult<String> {
        let mut prompt = format!("User Request: {}", context.task_description);

        if let Some(project_structure) = &context.project_structure {
            prompt.push_str("\n\n## Project Context:\n\n");
            prompt.push_str(project_structure);
        }

        if let Some(custom_instructions) = &context.custom_instructions {
            prompt.push_str("\n\n## Additional Instructions:\n\n");
            prompt.push_str(custom_instructions);
        }

        Ok(prompt)
    }

    /// Compose the final prompt from system and user parts
    fn compose_final_prompt(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        _context: &CompositionContext,
    ) -> AppResult<String> {
        // For OpenRouter/LLM APIs, we typically send system and user prompts separately
        // But for our internal processing, we can combine them for token estimation
        Ok(format!("{}\n\n{}", system_prompt, user_prompt))
    }

    /// Extract context sections for debugging/audit
    fn extract_context_sections(&self, context: &EnhancedPromptContext) -> Vec<String> {
        let mut sections = Vec::new();

        if context.file_contents.is_some() {
            sections.push("file_contents".to_string());
        }
        if context.directory_tree.is_some() {
            sections.push("directory_tree".to_string());
        }
        if context.project_context.is_some() {
            sections.push("project_context".to_string());
        }
        if context.relevant_files.is_some() {
            sections.push("relevant_files".to_string());
        }

        sections
    }
}

/// Convenience builder for composition context
pub struct CompositionContextBuilder {
    context: CompositionContext,
}

impl CompositionContextBuilder {
    pub fn new(session_id: String, task_type: TaskType, task_description: String) -> Self {
        Self {
            context: CompositionContext {
                session_id,
                task_type,
                task_description,
                project_directory: None,
                project_structure: None,
                file_contents: None,
                relevant_files: None,
                codebase_structure: None,
                custom_instructions: None,
                model_name: None,
                session_name: None,
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

    pub fn relevant_files(mut self, relevant_files: Option<Vec<String>>) -> Self {
        self.context.relevant_files = relevant_files;
        self
    }

    pub fn codebase_structure(mut self, codebase_structure: Option<String>) -> Self {
        self.context.codebase_structure = codebase_structure;
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

    pub fn session_name(mut self, session_name: Option<String>) -> Self {
        self.context.session_name = session_name;
        self
    }

    pub fn metadata(mut self, metadata: Option<HashMap<String, String>>) -> Self {
        self.context.metadata = metadata;
        self
    }

    pub fn build(self) -> CompositionContext {
        self.context
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_composition_context_builder() {
        let context = CompositionContextBuilder::new(
            "test_session".to_string(),
            TaskType::PathFinder,
            "Find relevant files".to_string(),
        )
        .build();

        assert_eq!(context.session_id, "test_session");
        assert_eq!(context.task_type, TaskType::PathFinder);
        assert_eq!(context.task_description, "Find relevant files");
    }

    #[test]
    fn test_path_finder_user_prompt_generation() {
        let composer = PromptComposer::new();
        let context = CompositionContextBuilder::new(
            "test_session".to_string(),
            TaskType::PathFinder,
            "Find React components".to_string(),
        )
        .codebase_structure(Some("src/\n  components/\n    Button.tsx".to_string()))
        .build();

        let result = composer.generate_path_finder_user_prompt(&context).unwrap();

        assert!(result.contains("<path_finder_query>"));
        assert!(result.contains("Find React components"));
        assert!(result.contains("<project_structure>"));
        assert!(result.contains("Button.tsx"));
    }
}