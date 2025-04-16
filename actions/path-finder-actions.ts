"use server";

import { ActionState } from '@/types';
import { generateDirectoryTree } from '@/lib/directory-tree';

interface PathFinderRequestPayload {
  taskDescription: string;
}

export async function findRelevantFilesAction(
  projectDirectory: string,
  taskDescription: string
): Promise<ActionState<{ relevantPaths: string[] }>> {
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

    // Prepare the prompt for finding relevant files
    const prompt = `You're a code path finder assistant. Based on this task description and directory structure, list the MOST relevant files that would need to be examined or modified.

Task Description:
${taskDescription}

Project Structure:
${codebaseStructure}

Provide ONLY a list of file paths, with each path on a new line. No explanations, bullets, or other formatting. Only include files that actually exist based on the project structure provided. 
Include no more than 10 of the most relevant files, prioritizing the ones that would need to be modified for the task.
Do not include node_modules, .git, or other common ignored directories.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { isSuccess: false, message: `API request failed: ${response.status} ${errorText}` };
    }

    const responseData = await response.json();
    
    if (!responseData.candidates || !responseData.candidates[0]?.content?.parts[0]?.text) {
      return { isSuccess: false, message: "Invalid response format from API." };
    }

    const resultText = responseData.candidates[0].content.parts[0].text;
    
    // Split the result text into individual paths and clean up
    const relevantPaths = resultText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('-'))
      .map(line => line.replace(/^[*-]\s+/, '')) // Remove bullet points if any
      .map(line => line.split(/\s+#/)[0].trim()); // Remove any comments
    
    if (relevantPaths.length === 0) {
      return { isSuccess: false, message: "No relevant paths were identified." };
    }
    
    return {
      isSuccess: true,
      message: `Found ${relevantPaths.length} relevant file paths.`,
      data: { relevantPaths }
    };
  } catch (error) {
    console.error('Error in findRelevantFilesAction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { isSuccess: false, message: `Error finding relevant files: ${errorMessage}` };
  }
}
