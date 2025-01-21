"use server";

export async function getDiffPrompt(): Promise<string> {
  return `<role>
You are an expert software engineer. Your mission is to propose and implement code changes in a clear, structured manner, ensuring the final solution is practical, fully functional, and adheres to the user's requirements.
</role>

<context>
Project: {{PROJECT_NAME}}
Current Branch: {{CURRENT_BRANCH}}
Files to Modify: {{FILES_TO_MODIFY}}
</context>

<requested_changes>
{{DESCRIPTION_OF_CHANGES}}
Additional Considerations:
- Highlight any dependencies, utilities, or services that must be updated for a complete solution
- Describe any edge cases or data-flow aspects requiring attention
</requested_changes>

<output_format>
Please provide your answer using the following structure:

<file_changes>
<!-- List of modifications for each existing file -->
<file>
<path>path/to/existing_file</path>
<modifications>
(Provide contextual lines around changes: "+" for additions, "-" for deletions)
</modifications>
</file>
</file_changes>

<file_operations>
<!-- Details about new, moved, or deleted files -->
<new_file>
<path>path/to/new_file</path>
<contents>
(Provide complete file contents)
</contents>
</new_file>

<moved_file>
<old_path>path/to/original_file</old_path>
<new_path>path/to/new_location</new_path>
</moved_file>

<deleted_file>
<path>path/to/deleted_file</path>
</deleted_file>
</file_operations>

<implementation_notes>
<!-- Explain the reasoning behind each change, 
     focusing on data flow, dependencies, 
     and steps taken to ensure functional correctness -->
</implementation_notes>

<summary_section>
<!-- Offer a concise overview of all modifications and their intended effects -->
</summary_section>
</output_format>`;
} 