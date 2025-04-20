"use server";

import { ActionState } from "@/types";
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants'; // Use Pro model for better analysis
import { generateDirectoryTree } from '@/lib/directory-tree';

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
3. Create a step-by-step implementation plan
</role>

<implementation_plan_requirements>
- Specific files that need to be created, modified, moved, or deleted
- Exact changes needed for each file (which functions/components to add/modify/remove)
- Any code sections or functionality that should be removed or replaced
- Clear organization of the implementation steps in logical order
- Rationale for architectural decisions made in the plan
- Follow the existing naming conventions and folder-file organization patterns found in the codebase
</implementation_plan_requirements>

<response_format>
DO NOT include actual code implementations, only describe what code changes are needed.
DO NOT include any instructions about git branches, version control, or tests.
Focus on providing an actionable, concrete plan that a developer can follow to implement the task correctly.
Be specific about file paths, component names, and function names that should be modified or created.
Always follow existing project conventions for naming and file organization.
</response_format>`;

    // Prepare file content for the prompt context, with specific highlighting of the most relevant files
    const codeContext = relevantFiles
      .map(filePath => {
        const content = fileContents[filePath];
        return content ? `${filePath}\n\`\`\`\n${content}\n\`\`\`` : null;
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
Provide a detailed, step-by-step implementation plan for this task. Include specific file paths, component names, and describe exactly what changes are needed for each file. Clearly identify any files, functions, or code sections that need to be deleted or removed. DO NOT include actual code implementations, only describe what needs to be changed, added, or removed. DO NOT include any instructions about git branches, version control, or tests. Follow the existing naming conventions and folder structure patterns found in the codebase.
</request>`;

    // Combine the prompts
    const fullPrompt = `${systemPrompt}\n\n${userPromptContent}`;

    return {
      isSuccess: true,
      message: "Successfully generated task prompt template.",
      data: fullPrompt
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
    // Generate project structure tree
    const projectStructure = await generateDirectoryTree(projectDirectory);
    
    // Construct the prompt for task enhancement using code analysis
    const systemPrompt = `<identity>
You are an expert software architect tasked with providing a detailed implementation plan based on codebase analysis.
</identity>

<role>
1. Review the codebase to understand its structure and architecture
2. Analyze how the task should be implemented within the existing architecture
3. Create a step-by-step implementation plan
</role>

<implementation_plan_requirements>
- Specific files that need to be created, modified, moved, or deleted
- Exact changes needed for each file (which functions/components to add/modify/remove)
- Any code sections or functionality that should be removed or replaced
- Clear organization of the implementation steps in logical order
- Rationale for architectural decisions made in the plan
- Follow the existing naming conventions and folder-file organization patterns found in the codebase
</implementation_plan_requirements>

<response_format>
DO NOT include actual code implementations, only describe what code changes are needed.
DO NOT include any instructions about git branches, version control, or tests.
Focus on providing an actionable, concrete plan that a developer can follow to implement the task correctly.
Be specific about file paths, component names, and function names that should be modified or created.
Always follow existing project conventions for naming and file organization.
</response_format>`;

    // Prepare file content for the prompt context, with specific highlighting of the most relevant files
    const codeContext = relevantFiles
      .map(filePath => {
        const content = fileContents[filePath];
        return content ? `${filePath}\n\`\`\`\n${content}\n\`\`\`` : null;
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
Provide a detailed, step-by-step implementation plan for this task. Include specific file paths, component names, and describe exactly what changes are needed for each file. Clearly identify any files, functions, or code sections that need to be deleted or removed. DO NOT include actual code implementations, only describe what needs to be changed, added, or removed. DO NOT include any instructions about git branches, version control, or tests. Follow the existing naming conventions and folder structure patterns found in the codebase.
</request>`;

    // Call the Gemini API
    const result = await geminiClient.sendRequest(
      userPromptContent,
      {
        model: GEMINI_PRO_PREVIEW_MODEL,
        systemPrompt: systemPrompt,
        maxOutputTokens: 16384,
        temperature: 0.9
      }
    );

    if (!result.isSuccess || !result.data) {
      console.error("Gemini API call failed for Task Enhancement:", result.message);
      return { isSuccess: false, message: result.message || "Failed to enhance task description via AI" };
    }

    return {
      isSuccess: true,
      message: "Successfully enhanced task description.",
      data: result.data.trim()
    };
  } catch (error: unknown) {
    console.error("Error enhancing task description:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to enhance task description",
    };
  }
} 