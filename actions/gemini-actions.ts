"use server";

import { ActionState } from '@/types';
import { sessionRepository } from '@/lib/db/repositories';
import { setupDatabase } from '@/lib/db'; // Use index export
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { createBackgroundJob, enqueueJob } from '@/lib/jobs/job-helpers';

// Constants
const MAX_OUTPUT_TOKENS = 65536; // Maximum output tokens for Gemini 2.5 Pro

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
    const projectSettings = await getModelSettingsForProject(projectDirectory);
    
    // Get the implementation plan task settings or use defaults
    const planSettings = projectSettings?.implementation_plan || {
      model: GEMINI_FLASH_MODEL,
      maxTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7
    };
    
    // Use the Gemini client for streaming requests
    return geminiClient.sendStreamingRequest(promptText, sessionId, {
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
): Promise<ActionState<null>> {
  await setupDatabase();
  
  return geminiClient.cancelAllSessionRequests(sessionId);
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
    // Get model settings if project directory is provided
    let model = explicitModel || GEMINI_FLASH_MODEL;
    let temperature = explicitTemperature || 0.7;
    let maxOutputTokens = explicitMaxTokens || 60000;
    let topP = explicitTopP || 0.95;
    let topK = explicitTopK || 40;
    
    if (projectDirectory) {
      try {
        const projectSettings = await getModelSettingsForProject(projectDirectory);
        
        // Get settings for generic requests (fall back to streaming settings)
        const genericSettings = projectSettings?.streaming || {
          model: GEMINI_FLASH_MODEL,
          maxTokens: 60000,
          temperature: 0.7
        };
        
        // Apply settings if not explicitly provided
        if (genericSettings && genericSettings.model && !explicitModel) {
          model = genericSettings.model;
        }
        
        if (genericSettings && genericSettings.maxTokens && !explicitMaxTokens) {
          maxOutputTokens = genericSettings.maxTokens;
        }
        
        if (genericSettings && genericSettings.temperature !== undefined && !explicitTemperature) {
          temperature = genericSettings.temperature;
        }
      } catch (error) {
        console.warn(`Could not retrieve project settings for ${projectDirectory}:`, error);
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
