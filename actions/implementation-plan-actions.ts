"use server";

import { ActionState } from '@/types';
import { setupDatabase } from '@/lib/db';
import { GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { 
  generateImplementationPlanSystemPrompt, 
  generateImplementationPlanUserPrompt 
} from '@/lib/prompts/implementation-plan-prompts';
import { createBackgroundJob, enqueueJob } from '@/lib/jobs/job-helpers';
import { loadFileContents } from '@/lib/file-utils';

/**
 * Create an implementation plan for a given task
 */
export async function createImplementationPlanAction(params: {
  projectDirectory: string;
  taskDescription: string;
  relevantFiles: string[];
  fileContentsMap: Record<string, string>;
  sessionId: string;
  temperatureOverride?: number;
}): Promise<ActionState<{ jobId?: string }>> {
  await setupDatabase();
  
  const { projectDirectory, taskDescription, relevantFiles, fileContentsMap, sessionId, temperatureOverride } = params;
  
  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }
  
  if (!relevantFiles.length) {
    return { isSuccess: false, message: "No relevant files provided" };
  }
  
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    return { isSuccess: false, message: "Invalid or missing session ID" };
  }
  
  try {
    // Get project settings
    const projectSettings = await getModelSettingsForProject(projectDirectory);
    
    // Get settings for implementation plan
    const planSettings = projectSettings?.implementation_plan || {
      model: GEMINI_PRO_PREVIEW_MODEL,
      maxTokens: 65536,
      temperature: 0.95
    };
    
    // Calculate the final temperature to use (override takes precedence)
    const finalTemperature = temperatureOverride !== undefined ? temperatureOverride : planSettings.temperature;
    
    // Load file contents if not provided or empty
    let actualFileContents = fileContentsMap;
    const isFileContentsEmpty = Object.keys(fileContentsMap).length === 0;
    
    if (isFileContentsEmpty && relevantFiles.length > 0) {
      // Use the shared loadFileContents utility
      actualFileContents = await loadFileContents(projectDirectory, relevantFiles);
    }
    
    // Get the session repository to look up the session name
    const { sessionRepository } = await import('@/lib/db/repositories');
    
    // Get the session name
    let sessionName = '';
    try {
      const sessionDetails = await sessionRepository.getSession(sessionId);
      sessionName = sessionDetails?.name || '';
      console.log(`Found session name: ${sessionName} for ID: ${sessionId}`);
    } catch (error) {
      console.warn(`Could not retrieve session name for ${sessionId}:`, error);
    }
    
    // Create a background job
    const job = await createBackgroundJob(
      sessionId,
      {
        apiType: 'gemini',
        taskType: 'implementation_plan',
        model: planSettings.model,
        maxOutputTokens: planSettings.maxTokens,
        temperature: finalTemperature,
        rawInput: `Generate implementation plan for: ${taskDescription}`,
        metadata: {
          sessionName
        }
      },
      projectDirectory
    );
    
    // Note: The fileContentsMap is passed in the job payload for processing but is not stored persistently in the background_jobs database table to avoid excessive storage.
    await enqueueJob(
      'IMPLEMENTATION_PLAN_GENERATION',
      {
        backgroundJobId: job.id,
        sessionId,
        projectDirectory,
        relevantFiles,
        fileContentsMap: actualFileContents,
        originalTaskDescription: taskDescription,
        model: planSettings.model,
        maxOutputTokens: planSettings.maxTokens,
        temperature: finalTemperature
      },
      10 // Higher priority for implementation plans
    );
    
    return {
      isSuccess: true,
      message: "Implementation plan generation queued",
      data: { jobId: job.id },
      metadata: {
        jobId: job.id
      }
    };
  } catch (error) {
    console.error("[createImplementationPlanAction]", error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error creating implementation plan",
      error: error instanceof Error ? error : new Error("Unknown error")
    };
  }
}

/**
 * Get the implementation plan prompt for a given task
 */
export async function getImplementationPlanPromptAction(params: {
  projectDirectory: string;
  taskDescription: string;
  relevantFiles: string[];
  fileContentsMap: Record<string, string>;
}): Promise<ActionState<{ prompt: string }>> {
  const { projectDirectory, taskDescription, relevantFiles, fileContentsMap } = params;
  
  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }
  
  if (!relevantFiles.length) {
    return { isSuccess: false, message: "No relevant files provided" };
  }
  
  try {
    // Generate directory tree using only the selected relevant files
    const projectStructure = await generateDirectoryTree(projectDirectory, relevantFiles);

    // Load file contents if not provided or empty
    let actualFileContents = fileContentsMap;
    const isFileContentsEmpty = Object.keys(fileContentsMap).length === 0;

    if (isFileContentsEmpty && relevantFiles.length > 0) {
      // Use the shared loadFileContents utility
      actualFileContents = await loadFileContents(projectDirectory, relevantFiles);
    }
    
    // Generate user prompt
    const userPrompt = generateImplementationPlanUserPrompt({
      originalDescription: taskDescription,
      projectStructure,
      relevantFiles,
      fileContents: actualFileContents
    });
    
    return {
      isSuccess: true,
      message: "Successfully generated implementation plan prompt",
      data: { prompt: userPrompt }
    };
  } catch (error) {
    console.error("[getImplementationPlanPromptAction]", error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error generating implementation plan prompt",
      error: error instanceof Error ? error : new Error("Unknown error")
    };
  }
}