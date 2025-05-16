// Text improvement prompt generation functions

/// Generate a system prompt for improving text based on the improvement type and language
pub fn generate_text_improvement_system_prompt(
    language: Option<&str>, 
    mode: Option<&str>, 
    custom_prompt: Option<&str>
) -> String {
    // Determine the language setting
    let lang = language.unwrap_or("en");
    // Determine the improvement mode
    let improvement_type = mode.unwrap_or("general");
    
    // Base system prompt
    let mut prompt = format!(
        "# Task: Improve the text provided by the user according to the improvement type: {}\n\n",
        improvement_type
    );
    
    // Add language-specific instructions
    match lang {
        "en" => prompt.push_str("Improve the text while keeping the same language (English).\n"),
        "es" => prompt.push_str("Mejora el texto manteniendo el mismo idioma (español).\n"),
        "fr" => prompt.push_str("Améliorez le texte en conservant la même langue (français).\n"),
        "de" => prompt.push_str("Verbessern Sie den Text, während Sie dieselbe Sprache (Deutsch) beibehalten.\n"),
        _ => prompt.push_str(&format!("Improve the text while keeping the same language ({}).\n", lang)),
    };
    
    // If custom prompt is provided, use it instead of the default improvement guidelines
    if let Some(custom) = custom_prompt {
        prompt.push_str("\n## Custom Improvement Guidelines:\n");
        prompt.push_str(custom);
    } else {
        // Add improvement type-specific instructions
        match improvement_type {
            "clarity" => {
                prompt.push_str("\n## Clarity Improvement Guidelines:\n");
                prompt.push_str("- Make the text clearer and more straightforward\n");
                prompt.push_str("- Remove ambiguity and vague language\n");
                prompt.push_str("- Use simple, direct language when possible\n");
                prompt.push_str("- Ensure logical flow and connections between ideas\n");
                prompt.push_str("- Maintain the original meaning and intent\n");
            },
            "conciseness" => {
                prompt.push_str("\n## Conciseness Improvement Guidelines:\n");
                prompt.push_str("- Make the text more concise without losing important information\n");
                prompt.push_str("- Remove redundancy and unnecessary words\n");
                prompt.push_str("- Combine sentences where appropriate\n");
                prompt.push_str("- Use more efficient phrasing\n");
                prompt.push_str("- Maintain the original meaning and intent\n");
            },
            "technical" => {
                prompt.push_str("\n## Technical Writing Improvement Guidelines:\n");
                prompt.push_str("- Improve precision and accuracy of technical terminology\n");
                prompt.push_str("- Ensure consistent use of technical terms\n");
                prompt.push_str("- Clarify complex concepts with appropriate detail\n");
                prompt.push_str("- Format code or technical references appropriately\n");
                prompt.push_str("- Maintain the original technical meaning and intent\n");
            },
            "grammar" => {
                prompt.push_str("\n## Grammar Improvement Guidelines:\n");
                prompt.push_str("- Fix any grammatical errors\n");
                prompt.push_str("- Correct spelling mistakes\n");
                prompt.push_str("- Ensure proper punctuation\n");
                prompt.push_str("- Improve sentence structure\n");
                prompt.push_str("- Maintain the original meaning and intent\n");
            },
            "persuasiveness" => {
                prompt.push_str("\n## Persuasiveness Improvement Guidelines:\n");
                prompt.push_str("- Strengthen arguments and reasoning\n");
                prompt.push_str("- Add persuasive elements like ethos, pathos, and logos\n");
                prompt.push_str("- Improve call-to-action if present\n");
                prompt.push_str("- Enhance overall persuasive impact\n");
                prompt.push_str("- Maintain the original meaning and intent\n");
            },
            "professional" => {
                prompt.push_str("\n## Professional Writing Improvement Guidelines:\n");
                prompt.push_str("- Use formal language appropriate for professional contexts\n");
                prompt.push_str("- Remove casual language, slang, and colloquialisms\n");
                prompt.push_str("- Ensure consistent tone throughout the text\n");
                prompt.push_str("- Improve structural organization for professional settings\n");
                prompt.push_str("- Maintain the original meaning and intent\n");
            },
            _ => {
                // General improvement
                prompt.push_str("\n## General Improvement Guidelines:\n");
                prompt.push_str("- Improve clarity and readability\n");
                prompt.push_str("- Correct grammatical errors and typos\n");
                prompt.push_str("- Enhance overall flow and structure\n");
                prompt.push_str("- Make the text more engaging where appropriate\n");
                prompt.push_str("- Maintain the original meaning and intent\n");
            }
        }
    }
    
    // Add input/output format instructions
    prompt.push_str("\n## Response Format:\n");
    prompt.push_str("Provide your response in valid XML format with the following structure:\n");
    prompt.push_str("```xml\n");
    prompt.push_str("<analysis>Brief explanation of what you improved and why</analysis>\n");
    prompt.push_str("<improved_text>The full improved text goes here</improved_text>\n");
    prompt.push_str("<changes>\n");
    prompt.push_str("  <change>Describe specific change 1</change>\n");
    prompt.push_str("  <change>Describe specific change 2</change>\n");
    prompt.push_str("  <!-- Add more changes as needed -->\n");
    prompt.push_str("</changes>\n");
    prompt.push_str("<recommendations>\n");
    prompt.push_str("  <recommendation>Optional recommendation 1 for further improvements</recommendation>\n");
    prompt.push_str("  <recommendation>Optional recommendation 2 for further improvements</recommendation>\n");
    prompt.push_str("  <!-- Add more recommendations as needed -->\n");
    prompt.push_str("</recommendations>\n");
    prompt.push_str("```\n");
    
    prompt
}

/// Generate a user prompt with the text to improve
pub fn generate_text_improvement_user_prompt(text: &str) -> String {
    format!("## Text to Improve:\n\n{}", text)
}

/// Legacy function for backward compatibility
/// Generate a prompt for improving text based on the improvement type
pub fn generate_text_improvement_prompt(
    text: &str, 
    improvement_type: &str, 
    language: Option<&str>
) -> String {
    let system_prompt = generate_text_improvement_system_prompt(
        language,
        Some(improvement_type),
        None
    );
    
    let user_prompt = generate_text_improvement_user_prompt(text);
    
    format!("{}\n\n{}", system_prompt, user_prompt)
}