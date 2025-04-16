"use server";

import { ActionState } from '@/types';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { callGeminiAPI } from '@/lib/gemini-api';

interface PathFinderRequestPayload {
  taskDescription: string;
}

export async function findRelevantFilesAction(
  projectDirectory: string,
  taskDescription: string
): Promise<ActionState<{ relevantPaths: string[], enhancedTaskDescription: string }>> {
  // Validate inputs
  if (!taskDescription || !taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty." };
  }

  if (!projectDirectory || !projectDirectory.trim()) {
    return { isSuccess: false, message: "Project directory cannot be empty." };
  }

  try {
    // Generate the directory tree for the project
    const codebaseStructure = await generateDirectoryTree(projectDirectory);
    if (!codebaseStructure) {
      return { isSuccess: false, message: "Failed to generate codebase structure." };
    }

    // Prepare the API request to Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { isSuccess: false, message: "GEMINI_API_KEY environment variable is not set." };
    }

    // Prepare the XML-formatted prompt for both finding relevant files and enhancing the task description
    const prompt = `<?xml version="1.0" encoding="UTF-8"?>
<prompt>
  <role>
    You are an expert software engineer analyzing a codebase to provide guidance on a programming task.
  </role>

  <task_description>
    ${taskDescription}
  </task_description>

  <project_structure>
    ${codebaseStructure}
  </project_structure>

  <requirements>
    1. Find the most relevant files for implementing this task.
    2. Provide general guidance on how to approach the task.
  </requirements>

  <output_format>
    <relevant_files>
      List only the file paths, one per line.
      No explanations, bullets, or other formatting.
      Only include files that actually exist based on the project structure provided.
      Include ALL relevant files that would need to be examined or modified for the task.
      Also include:
      - Parent components or files that these components extend or inherit from
      - Related dependency files that might be needed to understand the overall context
      - Configuration files that might affect the components
      - Test files for the components if they exist
      - Any documentation files (.md, .txt, etc.) that explain related functionality
      - Context files needed to understand the overall architecture
      Do not include node_modules, .git, or other common ignored directories.
    </relevant_files>

    <guidance>
      Generate a single concise paragraph summarizing:
      - The key components and architectural patterns involved in this task
      - How these components interact with each other
      - The approach that would be most appropriate for implementing the task
      
      Do NOT write detailed explanations of what each file does.
      Do NOT include introductory sentences like "Based on the codebase analysis" or "Here's a plan".
      Do NOT repeat or rephrase the original task description.
      Do NOT include concluding statements or "good luck" messages.
      Do NOT write in first person (avoid "I", "me", "my").
      Focus on giving clear, concise guidance that adds context to the task without overwhelming detail.
    </guidance>
  </output_format>
</prompt>`;

    // Call the Gemini API
    const result = await callGeminiAPI(
      "", // No system prompt needed as we're using XML format
      prompt,
      "gemini-2.0-flash",
      { maxOutputTokens: 16384 }
    );

    if (!result.isSuccess || !result.data) {
      return { isSuccess: false, message: result.message || "API request failed" };
    }

    const responseText = result.data;
    
    // Extract relevant files from the response
    const relevantFilesMatch = responseText.match(/<relevant_files>([\s\S]*?)<\/relevant_files>/);
    const guidanceMatch = responseText.match(/<guidance>([\s\S]*?)<\/guidance>/);
    
    if (!relevantFilesMatch) {
      return { isSuccess: false, message: "Could not extract relevant files from API response." };
    }

    // Process the relevant files section
    const relevantFilesText = relevantFilesMatch[1].trim();
    const relevantPaths = relevantFilesText
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.startsWith('#') && !line.startsWith('-'))
      .map((line: string) => line.replace(/^[*-]\s+/, '')) // Remove bullet points if any
      .map((line: string) => line.split(/\s+#/)[0].trim()); // Remove any comments
    
    // Extract guidance/enhanced task description
    const enhancedTaskDescription = guidanceMatch ? guidanceMatch[1].trim() : "";
    
    if (relevantPaths.length === 0) {
      return { isSuccess: false, message: "No relevant paths were identified." };
    }
    
    return {
      isSuccess: true,
      message: `Found ${relevantPaths.length} relevant file paths with task guidance.`,
      data: { 
        relevantPaths,
        enhancedTaskDescription
      }
    };
  } catch (error) {
    console.error('Error in findRelevantFilesAction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { isSuccess: false, message: `Error finding relevant files: ${errorMessage}` };
  }
}
