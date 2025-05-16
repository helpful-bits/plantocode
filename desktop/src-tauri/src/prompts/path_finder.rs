/// Prompt template for finding relevant files or modules
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
Please provide your response in the following format:

<path_finder_results>
  <analysis>
    Your thought process analyzing the task and determining which files are relevant. Explain your reasoning.
  </analysis>
  <primary_files>
    <file path="relative/path/to/file1.ext" relevance="high">Brief explanation of why this file is highly relevant</file>
    <file path="relative/path/to/file2.ext" relevance="high">Brief explanation of why this file is highly relevant</file>
    <!-- Include all high-relevance files -->
  </primary_files>
  <secondary_files>
    <file path="relative/path/to/file3.ext" relevance="medium">Brief explanation of why this file is somewhat relevant</file>
    <file path="relative/path/to/file4.ext" relevance="medium">Brief explanation of why this file is somewhat relevant</file>
    <!-- Include all medium-relevance files -->
  </secondary_files>
  <potential_files>
    <file path="relative/path/to/file5.ext" relevance="low">Brief explanation of why this file might be relevant</file>
    <file path="relative/path/to/file6.ext" relevance="low">Brief explanation of why this file might be relevant</file>
    <!-- Include all low-relevance files -->
  </potential_files>
  <overview>
    A brief summary of the expected changes and how they relate to the task.
  </overview>
</path_finder_results>

IMPORTANT: All file paths should be RELATIVE to the project root, not absolute paths. For example, use "src/main.rs" instead of "/absolute/path/to/src/main.rs".

Be thorough in your analysis but focus on the most relevant files. If you're uncertain about a file's exact path, make your best educated guess based on the codebase structure.
</output_format_instruction>
</path_finder_query>"#);

    prompt
}

/// Generate the system prompt for path finding
pub fn generate_path_finder_system_prompt() -> String {
    String::from(r#"You are an expert code analyst with deep knowledge of programming languages and project structures.

Your task is to identify the most relevant files for implementing or fixing a specific task in a codebase. 

Always respond with a structured XML output containing these sections:

1. <analysis> - A detailed analysis of the task and how it relates to the codebase
2. <primary_files> - Files that are directly relevant and will need to be modified (high relevance)
   - Each file should be wrapped in <file path="..." relevance="high">explanation</file>
   - The explanation should describe why this file is critically important
3. <secondary_files> - Files that provide context or may need minor changes (medium relevance)
   - Each file should be wrapped in <file path="..." relevance="medium">explanation</file>
   - The explanation should describe how this file relates to the task
4. <potential_files> - Files that might be relevant depending on implementation choices (low relevance)
   - Each file should be wrapped in <file path="..." relevance="low">explanation</file>
   - The explanation should describe potential scenarios where this file would matter
5. <overview> - A summary of your findings and recommendations for approaching the task

CRITICAL REQUIREMENTS:
- All file paths MUST be relative to the project root (e.g., "src/main.rs" not "/home/user/project/src/main.rs")
- Provide thoughtful, specific explanations for why each file is relevant
- Focus on a manageable number of truly relevant files (typically 3-10 primary files)
- Consider both implementation files and test files when appropriate
- If you're uncertain about exact paths, make educated guesses based on typical project structures

This structured format helps developers quickly understand which files they need to focus on and why."#)
}

/// Generate the user prompt for path finding with file contents
pub fn generate_path_finder_prompt_with_contents(task_description: &str, codebase_structure: Option<&str>, file_contents_xml: Option<&str>) -> String {
    let mut prompt = generate_path_finder_prompt(task_description, codebase_structure);
    
    // Add file contents if provided
    if let Some(contents) = file_contents_xml {
        prompt.push_str(&format!(
r#"

FILE CONTENTS:
{}

Use the file contents above to better understand the codebase structure and behavior. Each file is wrapped in a <file> element with a 'path' attribute, and the content is enclosed in a CDATA section to preserve formatting.
"#, 
        contents));
    }
    
    prompt
}