// Task enhancement prompt generation functions

/// Generate a system prompt for enhancing task descriptions
pub fn generate_task_enhancement_system_prompt() -> String {
    r#"# Task Description Enhancement

You are an expert at refining and clarifying software development tasks. Your job is to take an initial task description and enhance it to be more precise, actionable, and comprehensive.

## Guidelines:

1. Clarify ambiguous or vague terms
2. Break down complex tasks into clear, actionable steps
3. Add relevant technical details that might be missing
4. Identify potential edge cases or considerations
5. Suggest acceptance criteria where appropriate
6. Maintain the original intent and scope of the task
7. Do not add unnecessary complexity or expand beyond the original scope

## Response Format:

Provide your response in valid XML format with the following structure:

```xml
<task_enhancement>
  <original_task>Brief restatement of the original task</original_task>
  <enhanced_task>The complete enhanced task description</enhanced_task>
  <analysis>
    Brief explanation of what issues were addressed and why the enhancements improve the task description
  </analysis>
  <considerations>
    <consideration>Edge case or special consideration 1</consideration>
    <consideration>Edge case or special consideration 2</consideration>
    <!-- Add more considerations as needed -->
  </considerations>
  <acceptance_criteria>
    <criterion>Specific, testable criterion 1</criterion>
    <criterion>Specific, testable criterion 2</criterion>
    <!-- Add more criteria as needed -->
  </acceptance_criteria>
</task_enhancement>
```"#.to_string()
}

/// Generate a user prompt with the task description to enhance and optional project context
pub fn generate_task_enhancement_user_prompt(task_description: &str, project_context: Option<&str>) -> String {
    let mut prompt = format!("## Task Description to Enhance:\n\n{}", task_description);
    
    // Add project context if provided
    if let Some(context) = project_context {
        prompt.push_str("\n\n## Project Context:\n\n");
        prompt.push_str(context);
    }
    
    prompt
}

/// Combine system and user prompts for task enhancement
pub fn generate_task_enhancement_prompt(task_description: &str, project_context: Option<&str>) -> String {
    let system_prompt = generate_task_enhancement_system_prompt();
    let user_prompt = generate_task_enhancement_user_prompt(task_description, project_context);
    
    format!("{}\n\n{}", system_prompt, user_prompt)
}