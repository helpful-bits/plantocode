/// Generate a prompt for regex pattern generation based on task description
/// This prompt instructs the LLM to return a JSON object with regex patterns for file matching
pub fn generate_regex_pattern_prompt(task_description: &str, directory_tree: Option<&str>) -> String {
    let mut structure_context = String::new();
    if let Some(tree) = directory_tree {
        if !tree.trim().is_empty() {
            structure_context = format!(
                "\nTo help with generating more accurate regex patterns, here is the current project directory structure:\n```\n{}\n```\n\nConsider this structure when creating patterns to match files in the appropriate directories.\n",
                tree
            );
        }
    }

    format!(r#"Based on the following task description, identify the user's intent regarding file selection and generate appropriate JavaScript-compatible regular expressions for matching file paths (titles) and file content.{structure_context}

Task Description: "{task_description}"

IMPORTANT: The generated patterns will be used in an OR relationship - files matching EITHER the titleRegex OR the contentRegex will be included in the results. You don't need to combine both patterns into one; they will be applied separately.

CRITICAL: Your entire response must be ONLY the raw JSON object. Do NOT include any surrounding text, explanations, or markdown code fences like ```json ... ```. The response must start with '{{' and end with '}}'.

Provide the output with these keys:
- "titleRegex": Pattern to match file paths to INCLUDE (string or empty string)
- "contentRegex": Pattern to match file content to INCLUDE (string or empty string)  
- "negativeTitleRegex": Pattern to match file paths to EXCLUDE (string or empty string)
- "negativeContentRegex": Pattern to match file content to EXCLUDE (string or empty string)

If a pattern is not applicable or cannot be generated for a category, set its value to an empty string or omit the key entirely. Escaped backslashes are needed for JSON strings containing regex.
IMPORTANT: Do NOT use inline flags like (?i) or lookarounds within the regex patterns. Standard, widely compatible JavaScript RegExp syntax only.

Example for "Find all TypeScript files in components folder, but exclude test files":
{{
  "titleRegex": "^components\\/.*\\.tsx?$",
  "contentRegex": "",
  "negativeTitleRegex": "\\.(test|spec)\\.",
  "negativeContentRegex": ""
}}

Example for "Find files using 'useState' hook but exclude those with 'deprecated' comments":
{{
  "titleRegex": "",
  "contentRegex": "import\\s+.*?{{\\s*.*?useState.*?\\s*}}\\s*from\\s+['\"]react['\"]|React\\.useState",
  "negativeTitleRegex": "",
  "negativeContentRegex": "deprecated"
}}

Now, generate the JSON for the provided task description."#)
}