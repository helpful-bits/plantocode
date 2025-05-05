"use server";

import { ActionState } from '@/types';
import { setupDatabase } from '@/lib/db';
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_PRO_PREVIEW_MODEL, GEMINI_FLASH_MODEL } from '@/lib/constants';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { generateGuidanceForPathsPrompt, generateTaskGuidancePrompt } from '@/lib/prompts/guidance-prompts';

/**
 * Generate guidance for specific file paths
 */
export async function generateGuidanceForPathsAction(
  taskDescription: string,
  paths: string[],
  sessionId: string,
  options?: { modelOverride?: string }
): Promise<ActionState<{ guidance: string }>> {
  await setupDatabase();
  
  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }
  
  if (!paths.length) {
    return { isSuccess: false, message: "No paths provided" };
  }
  
  // Add strict validation for sessionId
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    return { isSuccess: false, message: "Invalid or missing session ID for guidance generation" };
  }
  
  try {
    // Get session to retrieve project directory
    const session = await getSessionWithBackgroundJobs(sessionId);
    if (!session) {
      return { isSuccess: false, message: "Session not found" };
    }
    
    // Get project settings
    const projectSettings = await getModelSettingsForProject(session.projectDirectory);
    
    // Get settings for guidance generation
    const guidanceSettings = projectSettings?.guidance_generation || {
      model: GEMINI_PRO_PREVIEW_MODEL,
      maxTokens: 16384,
      temperature: 0.7
    };
    
    // Override model if provided
    const model = options?.modelOverride || guidanceSettings.model;
    
    // Prepare prompt for guidance generation
    const promptText = generateGuidanceForPathsPrompt(taskDescription, paths);
    
    // Call the Gemini client
    const result = await geminiClient.sendRequest(promptText, {
      model,
      maxOutputTokens: guidanceSettings.maxTokens,
      temperature: guidanceSettings.temperature,
      apiType: 'gemini',
      taskType: 'guidance_generation',
      sessionId,
      projectDirectory: session.projectDirectory
    });
    
    if (!result.isSuccess) {
      return { 
        isSuccess: false, 
        message: result.message || "Failed to generate guidance" 
      };
    }
    
    // Check if this is a background job response
    if (result.metadata?.jobId) {
      return {
        isSuccess: true,
        message: "Guidance generation started in the background",
        data: { guidance: "" },
        metadata: {
          isBackgroundJob: true,
          jobId: result.metadata.jobId
        }
      };
    }
    
    // Otherwise return the immediate result
    return {
      isSuccess: true,
      message: "Successfully generated guidance",
      data: { guidance: result.data || "" }
    };
  } catch (error) {
    console.error("[generateGuidanceForPathsAction]", error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error generating guidance",
      error: error instanceof Error ? error : new Error("Unknown error")
    };
  }
}

// Helper function to get session with background jobs
async function getSessionWithBackgroundJobs(sessionId: string) {
  const { getSessionWithBackgroundJobs } = await import('@/lib/db');
  return getSessionWithBackgroundJobs(sessionId);
}

// Helper function to get a project summary
async function getProjectSummary(projectDirectory: string): Promise<string> {
  try {
    // Generate a directory tree representation of the project
    const directoryTree = await generateDirectoryTree(projectDirectory);
    return directoryTree;
  } catch (error) {
    console.error("[getProjectSummary]", error);
    return "Failed to generate project summary";
  }
}

export async function generateTaskGuidanceAction(
  taskDescription: string,
  projectDirectory: string,
  options?: {
    modelOverride?: string;
    guidanceType?: 'full' | 'planning' | 'structured';
    projectSummary?: string;
  },
  sessionId?: string
): Promise<ActionState<{ guidance: string }>> {
  await setupDatabase();
  
  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }
  
  // Validate sessionId if provided
  if (sessionId !== undefined && (typeof sessionId !== 'string' || !sessionId.trim())) {
    return { isSuccess: false, message: "Invalid session ID provided for task guidance" };
  }
  
  try {
    // Get project settings
    const projectSettings = await getModelSettingsForProject(projectDirectory);
    
    // Get settings for task guidance
    const guidanceSettings = projectSettings?.['task_guidance'] || {
      model: GEMINI_FLASH_MODEL,
      maxTokens: 8192,
      temperature: 0.3 // Lower temperature for more predictable output
    };
    
    // Override model if provided
    const model = options?.modelOverride || guidanceSettings.model;
    
    // Get the files listing from the project directory
    const projectSummary = options?.projectSummary || await getProjectSummary(projectDirectory);
    
    const guidanceType = options?.guidanceType || 'full';
    const promptText = generateTaskGuidancePrompt(taskDescription, projectSummary, guidanceType);
    
    // Call the Gemini client
    const result = await geminiClient.sendRequest(promptText, {
      model,
      maxOutputTokens: guidanceSettings.maxTokens,
      temperature: guidanceSettings.temperature,
      apiType: 'gemini',
      taskType: 'task_guidance',
      projectDirectory,
      sessionId
    });
    
    if (!result.isSuccess) {
      return { 
        isSuccess: false, 
        message: result.message || "Failed to generate task guidance" 
      };
    }
    
    // Check if this is a background job response
    if (result.metadata?.jobId) {
      return {
        isSuccess: true,
        message: "Task guidance generation started in the background",
        data: { guidance: "" },
        metadata: {
          isBackgroundJob: true,
          jobId: result.metadata.jobId
        }
      };
    }
    
    // Otherwise return the immediate result
    return {
      isSuccess: true,
      message: "Successfully generated task guidance",
      data: { guidance: result.data || "" }
    };
  } catch (error) {
    console.error("[generateTaskGuidanceAction]", error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error generating guidance",
      error: error instanceof Error ? error : new Error("Unknown error")
    };
  }
} 