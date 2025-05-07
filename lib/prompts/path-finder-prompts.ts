"use strict";

/**
 * Generates the system prompt for path finder
 */
export function generatePathFinderSystemPrompt(): string {
  return `You are a code path finder that helps identify the most relevant files for a given programming task.
Given a project structure, file contents, and a task description, analyze which files would be most important to understand or modify for the task.

Return ONLY file paths and no other commentary, with one file path per line.

For example:
src/components/Button.tsx
src/hooks/useAPI.ts
src/styles/theme.css

DO NOT include ANY text, explanations, or commentary. The response must consist ONLY of file paths, one per line.

Focus on the most critical files that would need to be understood or modified for the task.
When file contents are provided, analyze the actual code to determine relevance to the task.
If the task involves multiple areas of the codebase, include files from all relevant areas.
If multiple files are part of the same component or feature, include all of them.
Prioritize files that contain core logic, data structures, and APIs directly related to the task.
Ignore irrelevant configuration files, assets, or generated code unless they're directly involved in the task.
Don't include node_modules or other dependency directories.
Do not hallucinate or make up file paths.
All returned file paths must be relative to the project root.
Focus on files needed to FULLY understand the dataflow and context.`;
}

/**
 * Generates the user prompt for path finder
 */
export function generatePathFinderUserPrompt(
  directoryTree: string,
  taskDescription: string,
  fileContents?: {[filePath: string]: string}
): string {
  let prompt = `<path_finder_query>
  <task_description><![CDATA[${taskDescription}]]></task_description>

  <project_structure><![CDATA[${directoryTree}]]></project_structure>`;

  // Add file contents if available
  if (fileContents && Object.keys(fileContents).length > 0) {
    prompt += `\n\n  <file_contents>`;
    
    for (const [filePath, content] of Object.entries(fileContents)) {
      // Add file path and content with proper XML formatting
      prompt += `\n    <file path="${filePath}"><![CDATA[${content}]]></file>`;
    }
    
    prompt += `\n  </file_contents>`;
  }

  prompt += `\n\n  <output_format_instruction>
    Return ONLY file paths and no other commentary, with one file path per line.
    For example:
    src/components/Button.tsx
    src/hooks/useAPI.ts
    src/styles/theme.css
  </output_format_instruction>
</path_finder_query>`;
  
  return prompt;
}