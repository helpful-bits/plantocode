/// Prompt template for generating regular expressions
pub fn generate_regex_prompt(description: &str, examples: Option<Vec<&str>>, target_language: Option<&str>) -> String {
    let mut prompt = format!(
r#"You are a regular expression expert. Your task is to create precise and efficient regular expressions based on the provided description and examples.

DESCRIPTION OF WHAT TO MATCH:
{}

"#, 
    description);

    // Add examples if provided
    if let Some(examples_list) = examples {
        prompt.push_str("EXAMPLES TO MATCH:\n");
        for example in examples_list {
            prompt.push_str(&format!("- {}\n", example));
        }
        prompt.push_str("\n");
    }

    // Add target language if provided
    if let Some(language) = target_language {
        prompt.push_str(&format!(
r#"TARGET LANGUAGE/ENVIRONMENT: {}

"#, 
        language));
    }

    // Add instructions for the response format
    prompt.push_str(
r#"Please provide your response in the following format:

<regex_generation>
  <analysis>
    A brief analysis of the pattern requirements based on the description and examples provided.
  </analysis>
  
  <regex_patterns>
    <pattern purpose="primary">
      <expression>^your_regex_pattern_here$</expression>
      <explanation>
        A detailed explanation of how this regular expression works:
        - What each part of the regex matches
        - Any special characters or quantifiers used
        - How it handles the examples provided
        - Any edge cases considered
      </explanation>
    </pattern>
    
    <pattern purpose="alternative">
      <expression>^your_alternative_regex_pattern$</expression>
      <explanation>
        Explanation of this alternative pattern and when it might be better to use than the primary pattern.
      </explanation>
    </pattern>
    
    <!-- Include any additional alternative patterns if relevant -->
  </regex_patterns>
  
  <flags>
    <flag>g</flag> <!-- global match -->
    <flag>i</flag> <!-- case-insensitive -->
    <!-- Include any other recommended flags -->
  </flags>
  
  <usage_examples>
    <example language="javascript">
      const regex = /your_regex_pattern_here/gi;
      const matches = text.match(regex);
    </example>
    <!-- Include examples for other relevant languages -->
  </usage_examples>
  
  <limitations>
    <item>Any limitations or edge cases this regex won't handle</item>
    <!-- Include any other limitations -->
  </limitations>
</regex_generation>

Ensure your regular expressions are:
1. Accurate - they should correctly match the patterns described
2. Efficient - they should avoid unnecessary backtracking and complexity
3. Readable - they should be understandable by other developers
4. Robust - they should handle edge cases appropriately"#);

    prompt
}