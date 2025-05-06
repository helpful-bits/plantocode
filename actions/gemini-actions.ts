"use server";

import { ActionState } from '@/types';
import { sessionRepository } from '@/lib/db/repositories';
import { setupDatabase } from '@/lib/db'; // Use index export
import geminiClient from '@/lib/api/gemini-client';
import { WriteStream } from 'fs';
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
    
    console.log(`[Gemini Action] Using ${planSettings.model} model with ${planSettings.maxTokens} max tokens for implementation plan`);
    
    // Use the Gemini client for streaming requests
    return geminiClient.sendStreamingRequest(promptText, sessionId, {
      // Use settings from project settings with potential override for temperature
      model: planSettings.model,
      maxOutputTokens: planSettings.maxTokens,
      temperature: options?.temperature || planSettings.temperature,
      
      // Pass streaming updates handlers
      streamingUpdates: options?.streamingUpdates || {
        onStart: () => {
          console.log(`[Gemini Action] Started processing for session ${sessionId}`);
        },
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
 * Process SSE event data from Gemini API
 * @param eventData Raw SSE event data
 * @param writeStream Optional write stream to save content
 * @returns Object with processing results
 */
export async function processGeminiEventData(
  eventData: string,
  writeStream?: WriteStream
): Promise<{ success: boolean; content: string | null; tokenCount: number; charCount: number }> {
  // Allow empty data chunks to pass through but return immediately
  if (!eventData) return { success: false, content: null, tokenCount: 0, charCount: 0 };

  const lines = eventData.split('\n');
  let processedContent = '';
  let success = false;
  let tokenCount = 0;
  let charCount = 0;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataContent = line.substring(6).trim(); // Trim potential whitespace
      if (dataContent === '[DONE]') {
        continue;
      }

      try {
        const data = JSON.parse(dataContent);
        let textContent = data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p.text === 'string')?.text;

        // Check for token stats if available in the response
        if (data?.candidates?.[0]?.usageMetadata) {
          tokenCount += data.candidates[0].usageMetadata.totalTokens || 0;
        }

        // Extract text, strip fences, check if non-empty after stripping
        if (textContent) {
          // Clean potential markdown fences from XML content
          const cleanedXml = await extractXmlContent(textContent);
          const finalContent = cleanedXml || textContent;
          
          charCount += finalContent.length; // Count characters of the raw text
          
          if (writeStream) {
            writeStream.write(finalContent); // Write the cleaned content
            success = true;
            processedContent += finalContent; // Accumulate content
          }
        }
      } catch (e) {
        console.warn("[Gemini SSE] Error parsing JSON chunk or malformed data:", e);
      } // Close catch block
    }
  }

  return { success, content: processedContent, tokenCount, charCount };
}

/**
 * Extract and clean XML content from model output
 * Handles common issues like markdown fences, leading/trailing text, etc.
 * 
 * @param rawContent The raw content from the model
 * @returns Cleaned XML content or null if no valid XML found
 */
export async function extractXmlContent(rawContent: string): Promise<string | null> {
  if (!rawContent) return null;
  
  // 1. First, try to find content between markdown code fences
  const markdownMatch = rawContent.match(/```(?:xml)?([\s\S]*?)```/);
  const contentToProcess = markdownMatch ? markdownMatch[1].trim() : rawContent;
  
  // 2. Look for XML declaration and changes tag
  const xmlDeclMatch = contentToProcess.match(/<\?xml[^>]*\?>/);
  const changesTagMatch = contentToProcess.match(/<changes[^>]*>/);
  
  if (!xmlDeclMatch || !changesTagMatch) {
    // If we don't have both XML declaration and changes tag,
    // try a last resort approach to find anything that looks like XML
    const lastResortMatch = contentToProcess.match(/<\?xml[\s\S]*<\/changes>/);
    if (lastResortMatch) {
      return lastResortMatch[0];
    }
    return null;
  }
  
  // Get the positions of the XML declaration and changes tag
  const xmlDeclPos = contentToProcess.indexOf(xmlDeclMatch[0]);
  const changesOpenPos = contentToProcess.indexOf(changesTagMatch[0]);
  
  // Find the closing changes tag
  const changesClosePos = contentToProcess.lastIndexOf('</changes>');
  
  // If we have all the required parts, extract the XML
  if (xmlDeclPos >= 0 && changesOpenPos >= 0 && changesClosePos >= 0) {
    return contentToProcess.substring(xmlDeclPos, changesClosePos + 10); // 10 = '</changes>'.length
  }
  
  return null;
}
