/// System prompt for generating implementation plan titles
pub fn generate_implementation_plan_title_system_prompt() -> String {
    r#"You are an expert at creating concise, descriptive titles for software implementation plans. Your task is to create a clear, informative title based on a task description and relevant files.

Please provide a title that:
1. Clearly communicates the main purpose or goal of the implementation
2. Is concise (ideally 5-10 words, maximum 15 words)
3. Uses proper capitalization and technical terminology
4. Captures the essence of what will be implemented
5. Would be useful in a list of implementation plans for easy identification

Your response should be ONLY the title itself, with no additional explanation or formatting.
Focus on creating a title that would help a developer quickly understand what this implementation plan is about.

Example good titles:
- "Multi-Factor Authentication Integration with Auth0"
- "Real-Time Chat Feature Using WebSockets"
- "Database Optimization for High-Volume Transactions"
- "Responsive UI Components for Mobile Devices"
- "Background Job Processing System Enhancement"
"#.to_string()
}

/// User prompt for generating implementation plan titles based on task description and relevant files
pub fn generate_implementation_plan_title_user_prompt(task_description: &str, relevant_files_summary: &str) -> String {
    format!(
r#"Please create a concise, descriptive title for an implementation plan with the following details:

Task Description:
{}

{}

The title should capture the essence of this implementation task while being concise and clear."#,
    task_description, relevant_files_summary)
}

