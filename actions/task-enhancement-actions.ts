"use server";

import { ActionState } from "@/types";
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_PRO_PREVIEW_MODEL, MODEL_SETTINGS_KEY } from '@/lib/constants'; // Use Pro model for better analysis
import { generateDirectoryTree } from '@/lib/directory-tree';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';

const TASK_ENHANCER_MODEL_ID = GEMINI_PRO_PREVIEW_MODEL; // Use Pro model

// New function to generate just the prompt template without API call
export async function generateTaskPromptTemplateAction({
  originalDescription, 
  relevantFiles,
  fileContents,
  projectDirectory
}: {
  originalDescription: string;
  relevantFiles: string[];
  fileContents: Record<string, string>;
  projectDirectory: string;
}): Promise<ActionState<string>> {
  if (!originalDescription.trim()) {
    return { isSuccess: false, message: "Original task description cannot be empty." };
  }

  if (relevantFiles.length === 0 || Object.keys(fileContents).length === 0) {
    return { isSuccess: false, message: "No relevant files or file contents provided." };
  }

  try {
    // Generate project structure tree
    const projectStructure = await generateDirectoryTree(projectDirectory);
    
    // Construct the prompt for task enhancement using code analysis
    const systemPrompt = `<identity>
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
- Follow the existing naming conventions and folder-file organization patterns found in the codebase
- Include a single comprehensive bash command for all file operations
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
    </step>
    <!-- Additional steps as needed -->
  </steps>
  <combined_bash>mkdir -p path/to/dir && touch path/to/file.js && cp source/file.js dest/file.js</combined_bash>
</implementation_plan>

DO NOT include actual code implementations, only describe what code changes are needed.
DO NOT include any instructions about git branches, version control, or tests.
DO NOT include any touch bash commands, only use mkdir, cp, mv, rm, etc. that are necessary for the task.
Focus on providing an actionable, concrete plan that a developer can follow to implement the task correctly.
Be specific about file paths, component names, and function names that should be modified or created.
Always follow existing project conventions for naming and file organization.
Provide a SINGLE combined bash command at the end that handles ALL file operations for the entire task.
This should be a one-liner using && or ; to combine multiple operations if needed.
</response_format>`;

    // Prepare file content for the prompt context, with specific highlighting of the most relevant files
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
    
    const userPromptContent = `<original_task>
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
Provide a detailed, step-by-step implementation plan for this task using the required XML structure. Include specific file paths, component names, and describe exactly what changes are needed for each file. At the end of the plan, provide a SINGLE combined bash command that handles ALL file operations for the entire task (creating, modifying, moving, or deleting files). This should be a one-liner using && or ; to combine operations. Clearly identify any files, functions, or code sections that need to be deleted or removed. DO NOT include actual code implementations, only describe what needs to be changed, added, or removed. DO NOT include any instructions about git branches, version control, or tests. Follow the existing naming conventions and folder structure patterns found in the codebase.
</request>`;

    // Combine the prompts
    const fullPrompt = `${systemPrompt}\n\n${userPromptContent}`;

    return {
      isSuccess: true,
      message: "Successfully generated task prompt template.",
      data: fullPrompt,
      clipboardFeedback: true
    };
  } catch (error: unknown) {
    console.error("Error generating task prompt template:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to generate task prompt template",
    };
  }
}

export async function enhanceTaskDescriptionAction({
  originalDescription, // Keep originalDescription parameter
  relevantFiles,
  fileContents,
  projectDirectory
}: {
  originalDescription: string;
  relevantFiles: string[];
  fileContents: Record<string, string>;
  projectDirectory: string;
}): Promise<ActionState<string>> {
  if (!originalDescription.trim()) {
    return { isSuccess: false, message: "Original task description cannot be empty." };
  }

  if (relevantFiles.length === 0 || Object.keys(fileContents).length === 0) {
    return { isSuccess: false, message: "No relevant files or file contents provided." };
  }

  try {
    // Get model settings for the project
    const projectSettings = await getModelSettingsForProject(projectDirectory);
    
    // Get task enhancement settings or use defaults
    const enhancementSettings = projectSettings?.task_enhancement || {
      model: TASK_ENHANCER_MODEL_ID,
      maxTokens: 16384,
      temperature: 0.9
    };
    
    // Generate project structure tree
    const projectStructure = await generateDirectoryTree(projectDirectory);
    
    // Construct the prompt for task enhancement using code analysis
    const systemPrompt = `<identity>
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
- Follow the existing naming conventions and folder-file organization patterns found in the codebase
- Include a single comprehensive bash command for all file operations
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
    </step>
    <!-- Additional steps as needed -->
  </steps>
  <combined_bash>mkdir -p path/to/dir && touch path/to/file.js && cp source/file.js dest/file.js</combined_bash>
</implementation_plan>

DO NOT include actual code implementations, only describe what code changes are needed.
DO NOT include any instructions about git branches, version control, or tests.
DO NOT include any touch bash commands, only use mkdir, cp, mv, rm, etc. that are necessary for the task.
Focus on providing an actionable, concrete plan that a developer can follow to implement the task correctly.
Be specific about file paths, component names, and function names that should be modified or created.
Always follow existing project conventions for naming and file organization.
Provide a SINGLE combined bash command at the end that handles ALL file operations for the entire task.
This should be a one-liner using && or ; to combine multiple operations if needed.
</response_format>`;

    // Prepare file content for the prompt context, with specific highlighting of the most relevant files
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
    
    const userPromptContent = `<original_task>
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
Provide a detailed, step-by-step implementation plan for this task using the required XML structure. Include specific file paths, component names, and describe exactly what changes are needed for each file. At the end of the plan, provide a SINGLE combined bash command that handles ALL file operations for the entire task (creating, modifying, moving, or deleting files). This should be a one-liner using && or ; to combine operations. Clearly identify any files, functions, or code sections that need to be deleted or removed. DO NOT include actual code implementations, only describe what needs to be changed, added, or removed. DO NOT include any instructions about git branches, version control, or tests. Follow the existing naming conventions and folder structure patterns found in the codebase.
</request>`;

    // Call the Gemini API
    const result = await geminiClient.sendRequest(
      userPromptContent,
      {
        model: enhancementSettings.model,
        systemPrompt: systemPrompt,
        maxOutputTokens: enhancementSettings.maxTokens,
        temperature: enhancementSettings.temperature,
        taskType: 'task_enhancement',
        apiType: 'gemini',
        projectDirectory: projectDirectory
      }
    );

    if (!result.isSuccess || !result.data) {
      console.error("Gemini API call failed for Task Enhancement:", result.message);
      return { isSuccess: false, message: result.message || "Failed to enhance task description via AI" };
    }

    return {
      isSuccess: true,
      message: "Successfully enhanced task description.",
      data: result.data.trim(),
      clipboardFeedback: true
    };
  } catch (error: unknown) {
    console.error("Error enhancing task description:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to enhance task description",
    };
  }
} 