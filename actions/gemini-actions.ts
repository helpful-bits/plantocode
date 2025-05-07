"use server";

import { ActionState } from '@/types';
import { sessionRepository } from '@/lib/db/repositories';
import { setupDatabase } from '@/lib/db'; // Use index export
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';

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
