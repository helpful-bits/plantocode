/// Generates a prompt for creating a human-readable summary of regex filters
pub fn generate_regex_summary_prompt(
    title_regex: &str,
    content_regex: &str,
    negative_title_regex: &str,
    negative_content_regex: &str,
) -> String {
    format!(
        r#"You are a helpful assistant that explains file filtering rules in simple terms.

Given the following regular expressions used to filter files:
- Title Regex (files to include based on path): `{}`
- Content Regex (files to include based on content): `{}`
- Negative Title Regex (files to exclude based on path): `{}`
- Negative Content Regex (files to exclude based on content): `{}`

Please provide a concise, human-readable paragraph summarizing what files will be matched and what will be excluded. If a regex is empty, consider it as not applying any restriction for that part.

Focus on explaining the practical effect of these filters rather than technical regex details. Use natural language that non-technical users can understand.

For example: "The system will look for files whose paths match X and content matches Y, while excluding files whose paths match Z or content matches W."

Keep your response to 2-3 sentences maximum."#,
        if title_regex.is_empty() { "(no restriction)" } else { title_regex },
        if content_regex.is_empty() { "(no restriction)" } else { content_regex },
        if negative_title_regex.is_empty() { "(no restriction)" } else { negative_title_regex },
        if negative_content_regex.is_empty() { "(no restriction)" } else { negative_content_regex }
    )
}