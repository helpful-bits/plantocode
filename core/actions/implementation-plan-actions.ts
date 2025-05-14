"use server";

import { ActionState } from '@core/types';
import { setupDatabase } from '@core/lib/db';
import { GEMINI_PRO_PREVIEW_MODEL, GEMINI_FLASH_MODEL } from '@core/lib/constants';
import { getModelSettingsForProject } from '@core/actions/project-settings-actions';
import { generateDirectoryTree } from '@core/lib/directory-tree';
import { 
  generateImplementationPlanSystemPrompt, 
  generateImplementationPlanUserPrompt 
} from '@core/lib/prompts/implementation-plan-prompts';
import { 
  generateImplementationPlanTitleSystemPrompt,
  generateImplementationPlanTitleUserPrompt
} from '@core/lib/prompts/implementation-plan-title-prompts';
import { createBackgroundJob, enqueueJob } from '@core/lib/jobs/job-helpers';
import { loadFileContents } from '@core/lib/file-utils';
import { generateSimpleTextAction } from './gemini-actions';

/**
 * Create an implementation plan for a given task
 */
export async function createImplementationPlanAction(params: {
  projectDirectory: string;
  taskDescription: string;
  relevantFiles: string[];
  sessionId: string;
  temperatureOverride?: number;
}): Promise<ActionState<{ jobId?: string }>> {
  await setupDatabase();

  const { projectDirectory, taskDescription, relevantFiles, sessionId, temperatureOverride } = params;

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

    // Always load file contents server-side for reliability
    console.log(`[createImplementationPlanAction] Loading content for ${relevantFiles.length} relevant files from disk...`);
    const actualFileContents = await loadFileContents(projectDirectory, relevantFiles);
    console.log(`[createImplementationPlanAction] Successfully loaded file contents. Map contains ${Object.keys(actualFileContents).length} files.`);

    // Get the session repository to look up the session name
    const { sessionRepository } = await import('@core/lib/db/repositories');

    // Get the session name
    let sessionName = '';
    try {
      const sessionDetails = await sessionRepository.getSession(sessionId);
      sessionName = sessionDetails?.name || '';
      console.log(`Found session name: ${sessionName} for ID: ${sessionId}`);
    } catch (error) {
      console.warn(`Could not retrieve session name for ${sessionId}:`, error);
    }
    
    // Generate a dynamic title for the implementation plan
    let dynamicTitle = '';
    try {
      // Create a concise summary of relevant files for the title generation
      const relevantFilesSummary = relevantFiles.length <= 5 
        ? `Relevant files include: ${relevantFiles.join(', ')}`
        : `Relevant files include: ${relevantFiles.slice(0, 5).join(', ')} and ${relevantFiles.length - 5} more files`;
      
      // Generate the title prompts
      const titleSystemPrompt = generateImplementationPlanTitleSystemPrompt();
      const titleUserPrompt = generateImplementationPlanTitleUserPrompt({
        taskDescription,
        relevantFilesSummary
      });
      
      // Call generateSimpleTextAction to get a title
      const titleResult = await generateSimpleTextAction({
        prompt: titleUserPrompt,
        systemPrompt: titleSystemPrompt,
        model: GEMINI_FLASH_MODEL,
        temperature: 0.4,
        maxOutputTokens: 30,
        projectDirectory
      });
      
      if (titleResult.isSuccess && titleResult.data) {
        dynamicTitle = titleResult.data.trim();
        console.log(`Generated dynamic title: "${dynamicTitle}"`);
      } else {
        console.warn(`Failed to generate dynamic title: ${titleResult.message}`);
      }
    } catch (error) {
      console.warn(`Error generating dynamic title:`, error);
      // Continue with the flow even if title generation fails
    }
    
    // Use the dynamic title if available, otherwise fallback to session name or generic title
    const planTitle = dynamicTitle || sessionName || "Implementation Plan";

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
          sessionName: planTitle,
          originalSessionName: sessionName
        }
      },
      projectDirectory
    );

    console.log(`[createImplementationPlanAction] Enqueuing job for implementation plan generation`);
    await enqueueJob(
      'IMPLEMENTATION_PLAN_GENERATION',
      {
        backgroundJobId: job.id,
        sessionId,
        projectDirectory,
        relevantFiles,
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
}): Promise<ActionState<{ prompt: string }>> {
  const { projectDirectory, taskDescription, relevantFiles } = params;

  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }

  if (!relevantFiles.length) {
    return { isSuccess: false, message: "No relevant files provided" };
  }

  try {
    // Generate directory tree using ALL project files to provide complete structure context
    const projectStructure = await generateDirectoryTree(projectDirectory);

    // Always load file contents server-side for reliability
    console.log(`[getImplementationPlanPromptAction] Loading content for ${relevantFiles.length} relevant files from disk...`);
    const actualFileContents = await loadFileContents(projectDirectory, relevantFiles);
    console.log(`[getImplementationPlanPromptAction] Successfully loaded file contents. Map contains ${Object.keys(actualFileContents).length} files.`);

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