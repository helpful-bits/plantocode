"use server";

import { ActionState } from '@/types';
import { setupDatabase } from '@/lib/db';
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';

/**
 * Correct paths based on task description and project structure
 */
export async function correctPathsAction(
  taskDescription: string,
  paths: string[],
  projectDirectory: string,
  options?: { modelOverride?: string }
): Promise<ActionState<{ correctedPaths: string[] }>> {
  await setupDatabase();
  
  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }
  
  if (!paths.length) {
    return { isSuccess: false, message: "No paths provided to correct" };
  }
  
  try {
    // Get project settings
    const projectSettings = await getModelSettingsForProject(projectDirectory);
    
    // Get settings for path correction
    const pathSettings = projectSettings?.path_correction || {
      model: GEMINI_FLASH_MODEL,
      maxTokens: 8192,
      temperature: 0.3 // Lower temperature for more precise path correction
    };
    
    // Override model if provided
    const model = options?.modelOverride || pathSettings.model;
    
    // Prepare prompt for path correction
    const promptText = `
Task: ${taskDescription}

The following file paths have been identified but may contain errors or may not exist in the project:
${paths.map(p => `- ${p}`).join('\n')}

Please correct these paths based on:
1. Most likely real paths in typical project structures
2. Usual naming conventions for files based on the task description
3. What files would typically be needed for this task

Return ONLY a list of corrected file paths, one per line.
`;
    
    // Call the Gemini client
    const result = await geminiClient.sendRequest(promptText, {
      model,
      maxOutputTokens: pathSettings.maxTokens,
      temperature: pathSettings.temperature,
      apiType: 'gemini',
      taskType: 'path_correction',
      projectDirectory
    });
    
    if (!result.isSuccess) {
      return { 
        isSuccess: false, 
        message: result.message || "Failed to correct paths" 
      };
    }
    
    // Parse the corrected paths from the result
    const correctedPaths = result.data
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('-')) // Filter out empty lines and bullet points
      .map(line => line.replace(/^- /, '')); // Remove bullet points if any
    
    return {
      isSuccess: true,
      message: "Successfully corrected paths",
      data: { correctedPaths }
    };
  } catch (error) {
    console.error("[correctPathsAction]", error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error correcting paths",
      error: error instanceof Error ? error : new Error("Unknown error")
    };
  }
}
