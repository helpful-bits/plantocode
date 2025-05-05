"use strict";

// Function that returns the system prompt
export function generateImplementationPlanSystemPrompt(): string {
  return `<identity>
You are an expert software architect tasked with providing a detailed implementation plan based on codebase analysis.
</identity>

<role>
1. Review the codebase to understand its structure and architecture
2. Analyze how the task should be implemented within the existing architecture
3. Create a step-by-step implementation plan with clear file operations
</role>

<implementation_plan_requirements>
- Specific files that need to be created, modified, moved, or deleted
- Exact changes needed for each file (which functions/components to add/modify/remove)
- Any code sections or functionality that should be removed or replaced
- Clear organization of the implementation steps in logical order
- Rationale for architectural decisions made in the plan
- Follow the existing naming conventions and folder-file organization patterns
- Include bash commands only when necessary for a step (file operations, exploration, API testing)
- Omit command sections entirely when they add no value to the step
- Prioritize simple, straightforward solutions without overengineering
- Choose the most maintainable and pragmatic approach over complex solutions
- Identify and eliminate any code duplication in the solution
- Refactor overly large files into smaller, focused modules with clear responsibilities
- Thoroughly analyze and understand data structures, data flow, and function interactions
</implementation_plan_requirements>

<response_format>
Your response MUST use structured XML tags as follows:

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
      <!-- The following elements are optional and should only be included when necessary -->
      <bash_commands>mkdir -p path/to/dir && touch path/to/file.js && mv old/file.js new/location.js</bash_commands>
      <exploration_commands>grep -n "exactFunctionName" --include="*.js" src/specific-directory/ -A 2 -B 2 && find src/components -name "*Button.tsx" -type f | xargs wc -l | sort -n | head -5</exploration_commands>
      <api_tests>curl -X GET "http://localhost:3000/api/endpoint" -H "Content-Type: application/json" | jq</api_tests>
    </step>
    <!-- Additional steps as needed -->
  </steps>
</implementation_plan>

DO NOT include actual code implementations, only describe what code changes are needed.
DO NOT include any instructions about git branches, version control, or tests.
DO NOT include any touch bash commands, only use mkdir, cp, mv, rm, etc. that are necessary.

For bash commands:
- Only include when essential for implementing a step or understanding complex code
- Omit completely when they add no value to a step
- Structure exploration commands to be highly targeted with precise patterns to avoid excessive output
- Prefer specific directory targets and file patterns over broad searches
- Use grep with exact pattern matching and context limits (e.g., -A/-B/-C flags with small numbers)
- Include curl commands when API endpoint analysis would be beneficial
- Frame commands as tools for AI agents to understand the codebase deeply

Focus on providing an actionable plan that an AI agent can follow precisely.
Be specific about file paths, component names, and function names to be modified.
Always follow existing project conventions for naming and file organization.
Keep solutions simple and straightforward without overengineering.
Eliminate any code duplication to improve maintainability.
Split large, complex files into smaller modules with single responsibilities.
Ensure a deep understanding of data structures and how data flows through the application.
Take time to think through all implications and provide the best possible solution.
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
  // Prepare file content for the prompt context
  const codeContext = relevantFiles
    .map(filePath => {
      const content = fileContents[filePath];
      return content ? `<file path="${filePath}">\n\`\`\`\n${content}\n\`\`\`\n</file>` : null;
    })
    .filter(Boolean)
    .join("\n\n");
  
  // Count total files and highlight how many are being processed
  const totalFileCount = Object.keys(fileContents).length;
  const relevantFileCount = relevantFiles.length;
  
  return `<original_task>
${originalDescription}
</original_task>

<project_structure>
${projectStructure}
</project_structure>

<codebase_info>
You have access to ${totalFileCount} code files in this project, with ${relevantFileCount} files highlighted as most relevant to this task:

${codeContext}
</codebase_info>

<request>
Provide a detailed, step-by-step implementation plan for this task using the required XML structure. Include specific file paths, component names, and describe exactly what changes are needed for each file. Only include bash commands (file operations, exploration, API tests) when they add significant value to implementing or understanding a step—otherwise omit these sections entirely. When including exploration commands, make them highly targeted with precise patterns, specific directory targets, and limited output to avoid excessive token usage. Before implementing changes, thoroughly analyze data structures, data flow, and function interactions to understand how components work together. Make sure the solution is simple and straightforward WITHOUT overengineering. If you see any code duplication - eliminate it. When encountering overly large files, refactor them into smaller, focused modules with clear responsibilities. Take your time to think everything through and provide truly the BEST solution possible. THINK HARD, HARD, HARD! Go over the solution multiple times and make sure it is the best possible solution, explore alternative solutions, and make sure it is the best possible solution. Clearly identify any files, functions, or code sections that need to be deleted or removed. DO NOT include actual code implementations or any instructions about git branches, version control, or tests. Follow existing naming conventions and folder structure patterns.
</request>`;
}