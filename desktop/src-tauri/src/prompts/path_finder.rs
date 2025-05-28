/// Generate the user prompt for path finding (simple version without file contents)
pub fn generate_path_finder_prompt(task_description: &str, codebase_structure: Option<&str>) -> String {
    let mut prompt = format!(
r#"<path_finder_query>
<task_description><![CDATA[
{}
]]></task_description>

"#, 
    task_description);

    // Add codebase structure if provided
    if let Some(structure) = codebase_structure {
        prompt.push_str(&format!(
r#"<project_structure><![CDATA[
{}
]]></project_structure>

"#, 
        structure));
    }

    // Add instructions for the response format
    prompt.push_str(
r#"<output_format_instruction>
Return ONLY file paths and no other commentary, with one file path per line.
For example:
src/components/Button.tsx
src/hooks/useAPI.ts
src/styles/theme.css
</output_format_instruction>
</path_finder_query>"#);

    prompt
}

/// Generate the system prompt for path finding
pub fn generate_path_finder_system_prompt() -> String {
    String::from(r#"You are a code path finder. Your task is to identify the most relevant files for implementing or fixing a specific task in a codebase.

Return ONLY file paths and no other commentary, with one file path per line.

For example:
src/components/Button.tsx
src/hooks/useAPI.ts
src/styles/theme.css

DO NOT include ANY text, explanations, or commentary. The response must consist ONLY of file paths, one per line.

All returned file paths must be relative to the project root.

Guidance on file selection:
- Focus on truly relevant files - be selective and prioritize quality over quantity
- Prioritize files that will need direct modification (typically 3-10 files)
- Include both implementation files and test files when appropriate
- Consider configuration files only if they are directly relevant to the task
- If uncertain about exact paths, make educated guesses based on typical project structures
- Order files by relevance, with most important files first"#)
}

/// Generate the user prompt for path finding with file contents
pub fn generate_path_finder_prompt_with_contents(task_description: &str, codebase_structure: Option<&str>, file_contents_xml: Option<&str>) -> String {
    let mut prompt = format!(
r#"<path_finder_query>
<task_description><![CDATA[
{}
]]></task_description>

"#, 
    task_description);

    // Add codebase structure if provided
    if let Some(structure) = codebase_structure {
        prompt.push_str(&format!(
r#"<project_structure><![CDATA[
{}
]]></project_structure>

"#, 
        structure));
    }

    // Add file contents if provided
    if let Some(contents) = file_contents_xml {
        prompt.push_str(&format!(
r#"<file_contents><![CDATA[
{}
]]></file_contents>

"#, 
        contents));
    }

    // Add instructions for the response format
    prompt.push_str(
r#"<output_format_instruction>
Return ONLY file paths and no other commentary, with one file path per line.
For example:
src/components/Button.tsx
src/hooks/useAPI.ts
src/styles/theme.css
</output_format_instruction>
</path_finder_query>"#);

    prompt
}