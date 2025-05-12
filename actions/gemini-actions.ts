"use server";

import { ActionState, TaskType } from '@/types';
import { sessionRepository } from '@/lib/db/repositories';
import { setupDatabase } from '@/lib/db'; // Use index export
import { geminiClient } from '@/lib/api'; // Import from centralized API module
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { createBackgroundJob, enqueueJob } from '@/lib/jobs/job-helpers';
import { DEFAULT_TASK_SETTINGS } from '@/lib/constants';

/**
 * Send a prompt to Gemini and receive streaming response
 */
export async function sendPromptToGeminiAction(
  promptText: string,
  sessionId: string,
  options?: { temperature?: number; streamingUpdates?: any }
): Promise<ActionState<{ requestId: string, savedFilePath: string | null }>> {
  await setupDatabase();
  
  // Validate inputs
  if (!promptText) {
    return { isSuccess: false, message: "Prompt cannot be empty." };
  }
  
  // Add strict validation for sessionId
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    return { isSuccess: false, message: "Session ID is required and must be a string." };
  }
  
  try {
    // Get the session to retrieve project directory
    const session = await sessionRepository.getSession(sessionId);
    if (!session) {
      return { isSuccess: false, message: "Session not found." };
    }
    
    // Get the project directory - critical for settings and path resolution
    const projectDirectory = session.projectDirectory;
    
    // Get the project-specific model settings
    const allSettings = await getModelSettingsForProject(projectDirectory);

    // Get the implementation plan task settings
    const planSettings = allSettings.implementation_plan || DEFAULT_TASK_SETTINGS.implementation_plan;
    
    // Use the Gemini client for streaming requests
    return geminiClient.sendStreamingRequest(promptText, {
      sessionId,
      // Use settings from project settings with potential override for temperature
      model: planSettings.model,
      maxOutputTokens: planSettings.maxTokens,
      temperature: options?.temperature || planSettings.temperature,
      
      // Pass streaming updates handlers
      streamingUpdates: options?.streamingUpdates || {
        onStart: () => {},
        onError: (error: Error) => {
          console.error(`[Gemini Action] Error processing request:`, error);
        }
      },
      
      // Pass critical metadata for tracking and consistency
      taskType: 'implementation_plan',
      apiType: 'gemini',
      projectDirectory: projectDirectory,
      
      // Pass additional metadata to help with job tracking
      metadata: {
        modelConfig: {
          model: planSettings.model,
          maxTokens: planSettings.maxTokens,
          temperature: options?.temperature || planSettings.temperature
        }
      }
    });
  } catch (error) {
    console.error(`[Gemini Action] Error preparing request:`, error);
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Unknown error preparing request." 
    };
  }
}

/**
 * Cancel a specific Gemini request
 */
export async function cancelGeminiRequestAction(
  requestId: string
): Promise<ActionState<null>> {
  await setupDatabase();
  
  return geminiClient.cancelRequest(requestId);
}

/**
 * Cancel all running Gemini requests for a session
 */
export async function cancelGeminiProcessingAction(
  sessionId: string
): Promise<ActionState<{ cancelledQueueRequests: number; cancelledBackgroundJobs: number; }>> {
  await setupDatabase();

  const result = await geminiClient.cancelAllSessionRequests(sessionId);

  // Handle the potential null return format
  if (result.data === null) {
    return {
      isSuccess: result.isSuccess,
      message: result.message,
      data: {
        cancelledQueueRequests: 0,
        cancelledBackgroundJobs: 0
      },
      metadata: result.metadata
    };
  }

  return result;
}

/**
 * Initiate a generic Gemini streaming request as a background job
 * 
 * This action creates a background job for a generic LLM streaming request
 * and enqueues it for processing. It provides a consistent job-based approach
 * for streaming that can be monitored by the UI.
 */
export async function initiateGenericGeminiStreamAction(params: { 
  sessionId: string; 
  promptText: string; 
  systemPrompt?: string;
  projectDirectory?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number; 
  topK?: number;
  metadata?: Record<string, any>;
}): Promise<ActionState<{ jobId: string }>> {
  await setupDatabase();
  
  const { 
    sessionId, 
    promptText, 
    systemPrompt, 
    projectDirectory,
    model: explicitModel,
    temperature: explicitTemperature,
    maxOutputTokens: explicitMaxTokens,
    topP: explicitTopP, 
    topK: explicitTopK,
    metadata 
  } = params;
  
  if (!promptText.trim()) {
    return { isSuccess: false, message: "Prompt text cannot be empty" };
  }
  
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    return { isSuccess: false, message: "Invalid or missing session ID" };
  }
  
  try {
    // Set default values to be overridden by settings or explicit params
    let model, temperature, maxOutputTokens;
    let topP = explicitTopP || 0.95;
    let topK = explicitTopK || 40;
    
    if (projectDirectory) {
      try {
        // Get all task settings from project
        const allSettings = await getModelSettingsForProject(projectDirectory);
        
        // Get settings for generic_llm_stream task type
        const genericSettings = allSettings.generic_llm_stream;
        
        // Apply settings, prioritizing explicit parameters
        model = explicitModel || genericSettings.model;
        temperature = explicitTemperature !== undefined ? explicitTemperature : genericSettings.temperature;
        maxOutputTokens = explicitMaxTokens || genericSettings.maxTokens;
      } catch (error) {
        console.warn(`Could not retrieve project settings for ${projectDirectory}:`, error);
        // We'll fall back to explicit values or client defaults if we can't get settings
      }
    }
    
    // Get the session repository to look up the session name for better job labeling
    const { sessionRepository } = await import('@/lib/db/repositories');
    
    // Get the session name
    let sessionName = '';
    try {
      const sessionDetails = await sessionRepository.getSession(sessionId);
      sessionName = sessionDetails?.name || '';
    } catch (error) {
      console.warn(`Could not retrieve session name for ${sessionId}:`, error);
    }
    
    // Create a background job
    const job = await createBackgroundJob(
      sessionId,
      {
        apiType: 'gemini',
        taskType: 'generic_llm_stream',
        model,
        maxOutputTokens,
        temperature,
        rawInput: promptText.substring(0, 100) + (promptText.length > 100 ? '...' : ''),
        metadata: {
          sessionName,
          projectDirectory,
          ...(metadata || {})
        }
      }
    );
    
    // Enqueue the job for processing
    await enqueueJob(
      'GENERIC_GEMINI_STREAM',
      {
        backgroundJobId: job.id,
        sessionId,
        projectDirectory,
        promptText,
        systemPrompt,
        model,
        temperature,
        maxOutputTokens,
        topP,
        topK,
        metadata: {
          ...(metadata || {}),
          sessionName
        }
      },
      5 // Medium priority
    );
    
    return {
      isSuccess: true,
      message: "Generic Gemini streaming job queued",
      data: { jobId: job.id },
      metadata: {
        jobId: job.id
      }
    };
  } catch (error) {
    console.error("[initiateGenericGeminiStreamAction]", error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error initiating Gemini streaming job",
      error: error instanceof Error ? error : new Error("Unknown error")
    };
  }
}
