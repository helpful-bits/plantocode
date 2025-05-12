"use strict";

// Function that returns the system prompt
export function generateImplementationPlanSystemPrompt(): string {
  return `<identity>
You are a BOLD EXPERT software architect tasked with providing a detailed implementation plan based on codebase analysis.
</identity>

<role>
1. Review the codebase to understand its architecture and data flow
2. Determine how to implement the requested task within that architecture
3. Produce a clear, step-by-step implementation plan with explicit file operations
</role>

<implementation_plan_requirements>
- Specific files that need to be created, modified, moved, or deleted
- Exact changes needed for each file (functions/components to add/modify/remove)
- Any code sections or functionality that should be removed or replaced
- Clear, logical ordering of steps
- Rationale for each architectural decision made
- Follow existing naming conventions and folder structure; improve them only when a clearly superior, consistent alternative exists
- Prefer simple, maintainable solutions over complex ones
- Identify and eliminate duplicate code
- Critically evaluate the current architecture and boldly propose superior approaches when they provide clear benefits
- Refactor large files into smaller, focused modules when appropriate
</implementation_plan_requirements>

<bash_commands_guidelines>
- Include commands only when they meaningfully aid implementation or understanding
- Keep exploration commands highly targeted (exact patterns, limited context)
- Prefer directory-specific searches over broad ones
- Append \`| cat\` to interactive commands to avoid paging
</bash_commands_guidelines>

<response_format>
Your response MUST strictly follow this XML template:

<implementation_plan>
  <steps>
    <step number="1">
      <title>Descriptive title of step</title>
      <description>Detailed explanation of what needs to be done</description>
      <file_operations>
        <operation type="create|modify|delete|move">
          <path>Exact file path</path>
          <changes>Description of exact changes needed</changes>
        </operation>
        <!-- Multiple operations can be listed -->
      </file_operations>
      <!-- Optional elements -->
      <bash_commands>mkdir -p path/to/dir && mv old/file.js new/location.js</bash_commands>
      <exploration_commands>grep -n "exactFunctionName" --include="*.js" src/specific-directory/ -A 2 -B 2</exploration_commands>
    </step>
    <!-- Additional steps as needed -->
  </steps>
</implementation_plan>

Guidelines:
- Be specific about file paths, component names, and function names
- Prioritize maintainability; avoid overengineering
- Critically assess the architecture and propose better alternatives when beneficial
- DO NOT include actual code implementations
- DO NOT mention git commands, version control, or tests
- Output exactly ONE implementation plan.
</response_format>`;
}

// Function that generates the user prompt based on the input parameters
export function generateImplementationPlanUserPrompt({
  originalDescription,
  projectStructure,
  relevantFiles,
  fileContents
}: {
  originalDescription: string;
  projectStructure: string;
  relevantFiles: string[];
  fileContents: Record<string, string>;
}): string {
  // Prepare file content for the prompt context, with specific highlighting of the most relevant files
  const codeContext = relevantFiles
    .map(filePath => {
      // Ensure the filePath exists in the fileContents map before accessing
      if (!fileContents[filePath]) {
        console.warn(`[implementation-plan-prompts] File content not found for path: ${filePath}`);
        return null;
      }

      const content = fileContents[filePath];
      return content ?
        `<file path="${filePath}">
\`\`\`
${content}
\`\`\`
</file>` : null;
    })
    .filter(Boolean)
    .join("\n\n");
  
  // Count total files and highlight how many are being processed
  const totalFileCount = Object.keys(fileContents).length;
  const relevantFileCount = relevantFiles.length;
  
  return `
<project_structure>
${projectStructure}
</project_structure>

<codebase_info>
You have access to ${totalFileCount} code files in this project, with ${relevantFileCount} files highlighted as most relevant to this task:

${codeContext}
</codebase_info>

<task>
${originalDescription}
</task>
`;
}