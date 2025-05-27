use std::collections::HashMap;

/// Prompt template for generating implementation plans with enhanced context
pub fn generate_enhanced_implementation_plan_prompt(
    task_description: &str, 
    project_structure: Option<&str>, 
    relevant_files_contents: &HashMap<String, String>
) -> String {
    let mut prompt = format!(
r#"<implementation_plan>
    <agent_instructions>
        Read the following plan CAREFULLY, COMPREHEND IT, and IMPLEMENT it COMPLETELY. THINK HARD!
        DO NOT add unnecessary comments.
        DO NOT introduce backward compatibility approaches; leverage fully modern, forward-looking features exclusively.
    </agent_instructions>
    <steps>
"#);

    // Add instructions based on the task description
    prompt.push_str(&format!(
        "        <!-- Your task is to create a detailed, step-by-step implementation plan for the following:\n{}\n-->\n",
        task_description
    ));

    // Add project structure if provided
    if let Some(structure) = project_structure {
        prompt.push_str(
r#"        <!-- Here's the structure of the codebase:
<project_structure>
"#);
        prompt.push_str(structure);
        prompt.push_str(
r#"
</project_structure>
-->
"#);
    }

    // Add relevant files contents if provided
    if !relevant_files_contents.is_empty() {
        prompt.push_str(
r#"        <!-- Here are the contents of relevant files for this task:
<relevant_files_contents>
"#);

        // Add each file's content
        for (file_path, content) in relevant_files_contents {
            prompt.push_str(&format!(
r#"    <file path="{}"><![CDATA[{}]]></file>
"#,
                file_path, content
            ));
        }

        prompt.push_str(
r#"</relevant_files_contents>
-->
"#);
    }

    // Add instructions for steps
    prompt.push_str(
r#"        <!-- 
        Now, write detailed implementation steps. Each step should include:
        1. A clear title describing what happens in this step
        2. A detailed description explaining the implementation details, rationale, and any technical considerations
        3. Specific code changes to make, including file paths and code snippets
        4. Exploration commands if needed (for exploring the codebase further)
        
        Format each step like this:
        <step number="1">
            <title>Brief descriptive title of what this step accomplishes</title>
            <description>
                Detailed explanation of what needs to be done, why, and technical considerations.
                Include architecture decisions, patterns to follow, and explanations of complex logic.
            </description>
            <file_operations>
                <operation type="create|modify|delete">
                    <path>/path/to/file</path>
                    <changes>Describe changes or provide exact code</changes>
                </operation>
                <!-- Additional operations as needed -->
            </file_operations>
            <exploration_commands>
                <!-- Optional bash commands to further explore the codebase -->
                grep -r "search term" .
            </exploration_commands>
        </step>
        
        Write as many steps as needed to fully implement the feature, fixing, or enhancement.
        Be extremely detailed, especially for complex steps.
        -->
"#);

    // Close the steps and implementation plan tags
    prompt.push_str(
r#"    </steps>
</implementation_plan>"#);

    prompt
}

