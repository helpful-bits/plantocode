"use server";

import { ActionState } from '@/types';
import { setupDatabase } from '@/lib/db';
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_PRO_PREVIEW_MODEL, GEMINI_FLASH_MODEL } from '@/lib/constants';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { generateGuidanceForPathsPrompt } from '@/lib/prompts/guidance-prompts';
import { loadFileContents } from '@/lib/file-utils';

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
      model: GEMINI_FLASH_MODEL, // Use Flash model for faster responses
      maxTokens: 8192, // Reduce token count since we want concise responses
      temperature: 0.5 // Lower temperature for more focused responses
    };
    
    // Override model if provided
    const model = options?.modelOverride || guidanceSettings.model;
    
    // Read file contents for the paths
    let fileContents: Record<string, string> = {};
    try {
      // Read content for all selected files
      fileContents = await loadFileContents(session.projectDirectory, paths);
      
      console.log(`[generateGuidanceForPathsAction] Read content for ${Object.keys(fileContents).length} of ${paths.length} files`);
    } catch (readError) {
      console.warn(`[generateGuidanceForPathsAction] Error reading file contents:`, readError);
      // Continue even if file reading fails - we'll use paths only
    }
    
    // Prepare prompt for guidance generation with file contents
    const promptText = generateGuidanceForPathsPrompt(taskDescription, paths, fileContents);
    
    // Call the Gemini client
    const result = await geminiClient.sendRequest(promptText, {
      model,
      maxOutputTokens: guidanceSettings.maxTokens,
      temperature: guidanceSettings.temperature,
      apiType: 'gemini',
      taskType: 'guidance_generation',
      sessionId,
      projectDirectory: session.projectDirectory,
      // Force using a background job for architectural guidance
      forceBackgroundJob: true,
      metadata: {
        targetField: 'taskDescription',
        isVisible: true
      }
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

 