"use server";

import { promises as fs, existsSync, createWriteStream, WriteStream } from 'fs';
import path from 'path';
import os from 'os';
import { ActionState, Session, GeminiStatus, GeminiRequest } from '@/types';
import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup';
import { getProjectPatchesDirectory, getAppPatchesDirectory, normalizePath } from '@/lib/path-utils';
import { GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';
import geminiClient from '@/lib/api/gemini-client';

const MODEL_ID = GEMINI_PRO_PREVIEW_MODEL; // MUST STAY LIKE THIS, DO *NOT* CHANGE!
const GENERATE_CONTENT_API = "generateContent"; // Use generateContent endpoint
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:${GENERATE_CONTENT_API}?alt=sse`; // Add alt=sse for streaming
const FALLBACK_PATCHES_DIR = getAppPatchesDirectory(); // Used as fallback if we can't write to project directory
const MAX_OUTPUT_TOKENS = 65536; // Maximum output tokens for Gemini 2.5 Pro

interface GeminiRequestPayload {
    contents: {
        role: string;
        parts: { text: string }[];
    }[];
    generationConfig?: {
        responseMimeType?: string;
        maxOutputTokens?: number;
        temperature?: number;
        topP?: number;
        topK?: number;
    };
}

interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
            role: string;
        };
        // Other candidate fields (finishReason, safetyRatings, etc.) could be added here
    }[];
    // Add promptFeedback if needed
}

// --- Helper Functions ---
function sanitizeFilename(name: string): string {
    if (!name) return 'untitled_session'; // Handle empty session names
    return name.replace(/[^a-z0-9_\-\.]/gi, '_').substring(0, 60); // Keep it reasonably short
}

/**
 * Determines the appropriate patches directory based on the session
 * @param session The current session
 * @returns The path to use for storing patches
 */
async function getPatchesDir(session: Session): Promise<string> {
  if (!session || !session.projectDirectory) {
    return FALLBACK_PATCHES_DIR;
  }

  try {
    // Try to use a 'patches' directory within the project directory
    const projectPatchesDir = getProjectPatchesDirectory(session.projectDirectory);
    
    // Check if we can write to the project directory
    try {
      // Create directory if it doesn't exist
      await fs.mkdir(projectPatchesDir, { recursive: true });
      return projectPatchesDir;
    } catch (err: any) {
      console.warn(`Cannot create patches directory in project: ${err.message}`);
      return FALLBACK_PATCHES_DIR;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Error determining patches directory: ${errorMessage}`);
    return FALLBACK_PATCHES_DIR;
  }
}
/**
 * Formats a Date object into a filename-safe timestamp string, considering the user's timezone.
 * Falls back to a safe UTC format if the timezone is invalid or formatting fails.
 * @param date The Date object to format.
 * @param timeZone Optional IANA timezone string (e.g., 'America/New_York').
 * @returns A filename-safe timestamp string (e.g., '2024-07-28_15-30-05' or fallback UTC).
 */
function formatTimestampForFilename(date: Date, timeZone?: string): string {
    try {
        if (!timeZone) {
            console.warn("[formatTimestampForFilename] No timezone provided, falling back to UTC.");
            throw new Error("Timezone not provided"); // Force fallback
        }

        // Validate timezone using Intl.DateTimeFormat - throws RangeError for invalid zones
        new Intl.DateTimeFormat(undefined, { timeZone: timeZone }).format(date);

        // Use Intl.DateTimeFormat for timezone-aware formatting.
        // 'sv-SE' locale often gives a close-to-ISO format (YYYY-MM-DD HH:MM:SS).
        const formatter = new Intl.DateTimeFormat('sv-SE', { // Use locale that gives YYYY-MM-DD HH:MM:SS like format
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false, // Use 24-hour format
            timeZone: timeZone, // Apply the user's timezone
        });
        // Format the date and replace non-filename-friendly characters
        const formatted = formatter.format(date); // e.g., "2024-07-28 15:30:05"
        return formatted.replace(/ /g, '_').replace(/:/g, '-'); // -> "2024-07-28_15-30-05"
    } catch (error) {
        console.warn(`[formatTimestampForFilename] Error formatting timestamp with timezone "${timeZone}". Falling back to UTC ISO string. Error: ${error instanceof Error ? error.message : error}`);
        // Fallback to UTC ISO string, making it filename-safe (remove T, Z, milliseconds)
        return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19); // YYYY-MM-DD_HH-MM-SS
    }
}

/**
 * Send a prompt to Gemini and receive streaming response
 */
export async function sendPromptToGeminiAction(
  promptText: string,
  sessionId: string,
  userTimezone?: string
): Promise<ActionState<{ requestId: string, savedFilePath: string | null }>> {
  await setupDatabase();
  
  // Validate inputs
  if (!promptText) {
    return { isSuccess: false, message: "Prompt cannot be empty." };
  }
  if (!sessionId) {
    return { isSuccess: false, message: "Session ID is required." };
  }
  
  // Use the new Gemini client for streaming requests
  return geminiClient.sendStreamingRequest(promptText, sessionId, {
    // Can pass optional configuration here
    streamingUpdates: {
      onStart: () => {
        console.log(`[Gemini Action] Started processing for session ${sessionId}`);
      },
      onError: (error) => {
        console.error(`[Gemini Action] Error processing request: ${error.message}`);
      }
    }
  });
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

// Helper function to update session status based on request statuses
async function updateSessionStatusFromRequests(sessionId: string): Promise<void> {
    try {
        // Get all requests for the session
        const requests = await sessionRepository.getGeminiRequests(sessionId);
        
        if (requests.length === 0) {
            // No requests, set session to idle
            await sessionRepository.updateSessionGeminiStatus(
                sessionId,
                'idle',
                null,
                null,
                null,
                null
            );
            return;
        }
        
        // Check if any request is running
        const runningRequest = requests.find(r => r.status === 'running');
        if (runningRequest) {
            // If any request is running, update session status to running
            await sessionRepository.updateSessionGeminiStatus(
                sessionId,
                'running',
                runningRequest.startTime,
                null,
                runningRequest.patchPath,
                runningRequest.statusMessage,
                {
                    tokensReceived: runningRequest.tokensReceived,
                    charsReceived: runningRequest.charsReceived
                }
            );
            return;
        }
        
        // No running requests, use the most recent request's status
        const mostRecent = requests[0]; // Already sorted by created_at DESC
        await sessionRepository.updateSessionGeminiStatus(
            sessionId,
            mostRecent.status,
            mostRecent.startTime,
            mostRecent.endTime,
            mostRecent.patchPath,
            mostRecent.statusMessage,
            {
                tokensReceived: mostRecent.tokensReceived,
                charsReceived: mostRecent.charsReceived
            }
        );
    } catch (error) {
        console.error(`[Gemini Action] Error updating session status from requests:`, error);
    }
}

/**
 * Helper function to process a single SSE event chunk - SYNCHRONOUS.
 * Parses the event data, extracts text, cleans it, and writes to the stream.
 * @param eventData Raw data string from an SSE event (may contain multiple lines).
 * @param writeStream The stream to write cleaned content to, or null if none.
 * @returns Object indicating if usable content was processed and the processed content string.
 */
function processSseEvent(eventData: string, writeStream: WriteStream | null): { 
  success: boolean; 
  content: string | null;
  tokenCount: number;
  charCount: number;
} {
  if (!eventData || !eventData.trim()) return { success: false, content: null, tokenCount: 0, charCount: 0 };

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
          const strippedText = stripMarkdownCodeFences(textContent);
          charCount += strippedText.length; // Count characters of the *stripped* text
          textContent = strippedText; // Use stripped text from now on
          
          if (writeStream) {
            writeStream.write(textContent); // Write the actual cleaned content
            success = true;
            processedContent += textContent;
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
 * Helper function to strip common markdown code fences from the beginning and end of a string.
 * Handles variations like ```diff, ```patch, ```, etc.
 * @param content The string content potentially containing code fences.
 * @returns The content with leading/trailing fences removed.
 */
function stripMarkdownCodeFences(content: string): string {
    // Match potential fences at the beginning or end, considering optional language identifiers and surrounding whitespace/newlines.
    // Regex handles ```, ```diff, ```patch, etc., at start and end.
    // Group 1 captures the actual content *between* the fences if both are present.
    // Group 2 captures content if only a start fence is present (multiline match needed).
    // Group 3 captures content if only an end fence is present (multiline match needed).
    // Use [\s\S]*? for non-greedy matching of content. Added optional \r? for CR characters.
    const fenceRegex = /^\s*```(?:diff|patch|text|plain|[\w-]+)?\s*?\r?\n([\s\S]*?)\r?\n?\s*```\s*$|^\s*```(?:diff|patch|text|plain|[\w-]+)?\s*?\r?\n([\s\S]+)|([\s\S]+?)\r?\n?\s*```\s*$/;

    const match = content.match(fenceRegex);

    if (match) {
        // Return the captured content group (prioritizing the middle content if both fences exist)
        // Trim the result to remove potential leading/trailing whitespace/newlines inside the fences
        // that weren't part of the fence itself.
        return (match[1] ?? match[2] ?? match[3] ?? '').trim();
    }
 
    // If no fences are matched, return the original content
    return content;
}
