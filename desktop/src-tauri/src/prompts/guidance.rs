/// Prompt template for generating guidance on implementing a feature or fixing a bug
pub fn generate_guidance_prompt(task_description: &str, codebase_structure: Option<&str>, related_files: Option<Vec<&str>>) -> String {
    generate_guidance_user_prompt(task_description)
}

/// Generates a system prompt for architectural guidance
pub fn generate_guidance_system_prompt() -> String {
    String::from(r#"You are an expert software developer tasked with providing detailed guidance on how to implement a feature or fix a bug. You are not implementing the solution yourself, but rather providing a thorough explanation of the approach to take.

Your goal is to provide comprehensive guidance on how to implement this task, including architectural considerations, important patterns to follow, potential pitfalls, and specific implementation details.

Be thorough and detailed in your guidance. Focus on providing actionable advice that will help the developer implement the task correctly and efficiently."#)
}

/// Generates a user prompt for architectural guidance based on task description
pub fn generate_guidance_user_prompt(task_description: &str) -> String {
    format!(
        r#"<architectural_guidance_query>
  <task_description><![CDATA[{}]]></task_description>

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
</architectural_guidance_query>"#,
        task_description
    )
}

/// Generates a user prompt for architectural guidance with specific file paths
pub fn generate_guidance_for_paths_user_prompt(task_description: &str, paths: &[String], file_contents_summary: Option<&str>) -> String {
    // Build file content summary section if available
    let file_contents_section = if let Some(summary) = file_contents_summary {
        format!(r#"
  <file_contents_summary>
    <![CDATA[{}]]>
  </file_contents_summary>"#, summary)
    } else {
        String::new()
    };
    
    format!(
        r#"<architectural_guidance_query>
  <task_description><![CDATA[{}]]></task_description>

  <relevant_files>
{}  </relevant_files>{}

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
</architectural_guidance_query>"#,
        task_description,
        paths.iter().map(|p| format!("    <file>{}</file>\n", p)).collect::<String>(),
        file_contents_section
    )
}