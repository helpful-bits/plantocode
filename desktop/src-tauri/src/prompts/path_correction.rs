/// Prompt template for correcting file paths
pub fn generate_path_correction_prompt(paths: &[&str], project_directory: &str, codebase_structure: Option<&str>) -> String {
    let paths_text = paths.join("\n");
    
    let mut prompt = format!(
r#"You are a file path expert in a software development environment. Your task is to correct, validate, or complete the provided file paths within the context of the project.

PROJECT ROOT DIRECTORY:
{}

PATHS TO CORRECT OR VALIDATE:
{}

"#, 
    project_directory, paths_text);

    // Add codebase structure if provided
    if let Some(structure) = codebase_structure {
        prompt.push_str(&format!(
r#"CODEBASE STRUCTURE:
{}

"#, 
        structure));
    }

    // Add instructions for the response format
    prompt.push_str(
r#"Please provide your response in the following format:

<path_correction>
  <analysis>
    A brief analysis of the provided paths and the issues they might have.
  </analysis>
  
  <corrected_paths>
    <path original="original/path/example.js" corrected="/absolute/corrected/path/example.js">
      Explanation of what was corrected and why.
    </path>
    <!-- Repeat for each path -->
  </corrected_paths>
  
  <summary>
    A brief summary of the corrections made and any patterns of issues identified.
  </summary>
</path_correction>

When correcting paths:
1. Ensure all paths are absolute (start from the project root)
2. Verify file extensions match the expected file type
3. Correct any obvious typos or case issues
4. If a path seems to reference a file that doesn't exist, suggest the most likely correct path
5. If a path is ambiguous, provide the most likely interpretation but note alternative possibilities
6. If a path seems correct as is, indicate that no correction was needed

Be sure to use your knowledge of common file structures in software projects to inform your corrections. If multiple interpretations are possible, choose the most likely one based on the codebase structure and standard practices."#);

    prompt
}