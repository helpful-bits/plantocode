"use server";

import { ActionState } from '@/types';
import { setupDatabase } from '@/lib/db';
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { generatePathCorrectionPrompt } from '@/lib/prompts/path-correction-prompts';

/**
 * Correct paths based on task description and project structure
 */
export async function correctPathsAction(
  paths: string,
  projectDirectory?: string,
  sessionId?: string
): Promise<ActionState<{ correctedPaths: string[] }>> {
  await setupDatabase();
  
  if (!paths.trim()) {
    return { isSuccess: false, message: "No paths provided to correct" };
  }
  
  // Validate sessionId if provided
  if (sessionId !== undefined && (typeof sessionId !== 'string' || !sessionId.trim())) {
    return { isSuccess: false, message: "Invalid session ID provided for path correction" };
  }
  
  try {
    // Parse input paths
    const pathsArray = paths
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    if (pathsArray.length === 0) {
      return { isSuccess: false, message: "No valid paths found in input" };
    }
    
    // Get project settings if project directory is provided
    let model = GEMINI_FLASH_MODEL;
    let maxTokens = 8192;
    let temperature = 0.3;
    
    if (projectDirectory) {
      const projectSettings = await getModelSettingsForProject(projectDirectory);
      
      // Get settings for path correction
      const pathSettings = projectSettings?.path_correction || {
        model: GEMINI_FLASH_MODEL,
        maxTokens: 8192,
        temperature: 0.3 // Lower temperature for more precise path correction
      };
      
      model = pathSettings.model;
      maxTokens = pathSettings.maxTokens;
      // Ensure temperature is defined, falling back to default if not
      temperature = pathSettings.temperature ?? 0.3;
    }
    
    // Use centralized prompt for path correction
    const promptText = generatePathCorrectionPrompt(pathsArray);
    
    // Call the Gemini client
    const result = await geminiClient.sendRequest(promptText, {
      model,
      maxOutputTokens: maxTokens,
      temperature,
      apiType: 'gemini',
      taskType: 'path_correction',
      projectDirectory,
      sessionId
    });
    
    if (!result.isSuccess) {
      return { 
        isSuccess: false, 
        message: result.message || "Failed to correct paths" 
      };
    }
    
    // Parse the corrected paths from the result
    let correctedPaths: string[] = [];

    if (result.data) {
      // Handle string data (normal response)
      if (typeof result.data === 'string') {
        correctedPaths = result.data
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('-')) // Filter out empty lines and bullet points
          .map((line: string) => line.replace(/^- /, '')); // Remove bullet points if any
      }
      // Handle background job response
      else if (typeof result.data === 'object' && 'isBackgroundJob' in result.data) {
        console.log(`Path correction sent to background job: ${result.data.jobId}`);
      }
    }
    
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
