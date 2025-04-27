"use server";

import { ActionState } from '@/types';
import { setupDatabase } from '@/lib/db';
import { normalizePath } from '@/lib/path-utils';
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';

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
    const promptText = `
Task: ${taskDescription}

Files that will be used to accomplish this task:
${paths.map(p => `- ${p}`).join('\n')}

Please provide guidance on:
1. The overall approach to accomplish this task
2. The specific role of each listed file in the solution
3. Key functions and changes that would need to be implemented
4. Any potential challenges or edge cases to consider

Structure your guidance in a clear, step-by-step format.
`;
    
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