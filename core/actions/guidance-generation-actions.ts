"use server";

import { ActionState } from '@core/types';
import { setupDatabase } from '@core/lib/db';
import { GEMINI_PRO_PREVIEW_MODEL, GEMINI_FLASH_MODEL } from '@core/lib/constants';
import { getModelSettingsForProject } from '@core/actions/project-settings-actions';
import { generateDirectoryTree } from '@core/lib/directory-tree';
import { generateGuidanceForPathsPrompt } from '@core/lib/prompts/guidance-prompts';
import { loadFileContents } from '@core/lib/file-utils';
import { createBackgroundJob, enqueueJob } from '@core/lib/jobs/job-helpers';
import { ApiType, TaskType } from '@core/types/session-types';

/**
 * Generate guidance for specific file paths
 */
export async function generateGuidanceForPathsAction(
  taskDescription: string,
  paths: string[],
  sessionId: string,
  options?: { modelOverride?: string }
): Promise<ActionState<{ jobId: string }>> {
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
    
    // Create a background job
    const job = await createBackgroundJob(
      sessionId,
      {
        apiType: 'gemini' as ApiType,
        taskType: 'guidance_generation' as TaskType,
        model: model,
        rawInput: taskDescription,
        maxOutputTokens: guidanceSettings.maxTokens,
        temperature: guidanceSettings.temperature,
        metadata: {
          targetField: 'taskDescription',
          isVisible: true
        }
      },
      session.projectDirectory
    );
    
    // Prepare the job payload
    const guidanceGenerationPayload = {
      backgroundJobId: job.id,
      sessionId,
      projectDirectory: session.projectDirectory,
      promptText,
      paths,
      model,
      temperature: guidanceSettings.temperature,
      maxOutputTokens: guidanceSettings.maxTokens
    };
    
    // Enqueue the job
    await enqueueJob('GUIDANCE_GENERATION', guidanceGenerationPayload);
    
    // Return success with job ID
    return {
      isSuccess: true,
      message: "Guidance generation job queued",
      data: { jobId: job.id },
      metadata: { 
        jobId: job.id, 
        isBackgroundJob: true, 
        targetField: 'taskDescription'
      }
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
  const { getSessionWithBackgroundJobs } = await import('@core/lib/db');
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

 