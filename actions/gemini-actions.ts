"use server";

import { promises as fs, existsSync, createWriteStream, WriteStream } from 'fs'; // Import WriteStream and createWriteStream
import path from 'path';
import os from 'os';
import { ActionState, Session, GeminiStatus } from '@/types'; // Import GeminiStatus
import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import
import { getProjectPatchesDirectory, getAppPatchesDirectory } from '@/lib/path-utils'; // Import path utils
 
const MODEL_ID = "gemini-2.5-pro-preview-03-25"; // MUST STAY LIKE THIS, DO *NOT* CHANGE!
const GENERATE_CONTENT_API = "generateContent"; // Use generateContent endpoint
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:${GENERATE_CONTENT_API}?alt=sse`; // Add alt=sse for streaming
const FALLBACK_PATCHES_DIR = getAppPatchesDirectory(); // Used as fallback if we can't write to project directory

interface GeminiRequestPayload {
    contents: {
        role: string;
        parts: { text: string }[];
    }[];
    generationConfig?: {
        responseMimeType?: string;
        // Add other config options if needed (temperature, maxOutputTokens, etc.)
    };
}

interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
            role: string;
        };
        // Add other candidate fields if needed (finishReason, safetyRatings, etc.)
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
    } catch (err) {
      console.warn(`Cannot create patches directory in project: ${err.message}`);
      return FALLBACK_PATCHES_DIR;
    }
  } catch (error) {
    console.warn(`Error determining patches directory: ${error.message}`);
    return FALLBACK_PATCHES_DIR;
  }
}

// Action to send prompt to Gemini and process streaming response
// This action runs in the background and updates the session status in the DB.
// The UI polls the DB to get the latest status.
export async function sendPromptToGeminiAction(
    promptText: string, // Renamed prompt to avoid conflict with built-in prompt
    sessionId: string
): Promise<ActionState<{ savedFilePath: string | null }>> { // Return type updated
    // Ensure DB is set up before processing
    await setupDatabase();
 
    const apiKey = process.env.GEMINI_API_KEY;

    // --- Initial Validation ---
    if (!apiKey) { 
        return { isSuccess: false, message: "GEMINI_API_KEY is not configured." };
    }
    if (!promptText) {
        return { isSuccess: false, message: "Prompt cannot be empty." };
    }
    if (!sessionId) {
        return { isSuccess: false, message: "Session ID is required." };
    }

    let session: Session | null = null;
    let fileHandle: fs.FileHandle | null = null;
    let writeStream: WriteStream | null = null;
    let filePath = ''; // Variable to store the final file path

    try {
        // --- Fetch Session and Check Status ---
        session = await sessionRepository.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found.`);
        }

        if (session.geminiStatus === 'running') {
            return { isSuccess: false, message: "Gemini processing is already running for this session." };
        }

        if (session.geminiStatus === 'canceled') {
            return { isSuccess: false, message: `Cannot start Gemini processing. Current status: ${session.geminiStatus}` };
        }

        const sessionName = session.name; // Get session name for the filename

        // --- Update Session Status to Running BEFORE the API call ---
        // Also clear previous error messages and patch path from the session
        await sessionRepository.updateSessionGeminiStatus(sessionId, 'idle', null, null, null, null); // Clear previous state
        
        // Now set to running
        const startTime = Date.now();
        await sessionRepository.updateSessionGeminiStatus(sessionId, 'running', startTime);
        console.log(`[Gemini Action] Session ${sessionId}: Status set to running at ${startTime}.`);

        // --- Prepare Patch Output File EARLIER ---
        // Get the appropriate patches directory for this session
        const patchesDir = await getPatchesDir(session);
        await fs.mkdir(patchesDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeSessionName = sanitizeFilename(sessionName);
        const filename = `${timestamp}_${safeSessionName}.patch`;
        filePath = path.join(patchesDir, filename);

        // Create empty file immediately and update session with path
        fileHandle = await fs.open(filePath, 'w'); // Open file for writing
        await sessionRepository.updateSessionGeminiStatus(
          sessionId, 
          'running', 
          startTime, 
          null, 
          filePath, // Update path immediately 
          'Processing started, awaiting content...',
          { tokensReceived: 0, charsReceived: 0 } // Initialize streaming stats
        );
        writeStream = fileHandle.createWriteStream(); // Create write stream from handle

        console.log(`[Gemini Action] Session ${sessionId}: Created empty patch file at: ${filePath}`);

        // --- Prepare Payload ---
        const payload: GeminiRequestPayload = {
            contents: [
                { role: "user", parts: [{ text: promptText }] } // Use renamed promptText
            ],
            generationConfig: { 
                responseMimeType: "text/plain", // Expecting plain text patch
            },
        };

        // --- Check for Cancellation Immediately Before Fetch (Important!) ---
        const currentSessionState = await sessionRepository.getSession(sessionId);
        if (currentSessionState?.geminiStatus === 'canceled') {
            console.log(`[Gemini Action] Session ${sessionId}: Processing canceled before API call.`);
            // Don't set endTime here, let the cancellation action handle it
            return { isSuccess: false, message: "Gemini processing was canceled.", data: { savedFilePath: null } }; 
        }

        // --- Make API Call ---
        console.log(`[Gemini Action] Sending prompt to Gemini for session ${sessionId}...`); // Use session ID in logs
        const response = await fetch(`${GEMINI_API_URL}&key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            // TODO: Consider AbortController if Gemini API adds support for it in SSE
            // signal: abortController.signal
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Gemini Action] Session ${sessionId}: Gemini API error ${response.status}: ${errText}`);
            throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 250)}`); // Show more error context
        } 

        // --- Check for Cancellation Immediately After Fetch (before streaming) ---
        const postFetchSessionState = await sessionRepository.getSession(sessionId);
        if (postFetchSessionState?.geminiStatus === 'canceled') {
            console.log(`[Gemini Action] Session ${sessionId}: Processing canceled after API call, before streaming.`);
            return { isSuccess: false, message: "Gemini processing was canceled.", data: { savedFilePath: null } };
        }

        // --- Process Streaming Response ---
        const reader = response.body?.getReader();
        if (!reader) {
            if (fileHandle) await fileHandle.close(); // Ensure fileHandle exists
            throw new Error("Failed to get response stream reader");
        }

        const textDecoder = new TextDecoder(); // Decoder for Uint8Array chunks
        let buffer = '';
        let hasWrittenAnyContent = false; // Track if any usable content was written
        
        try {
            console.log(`[Gemini Action] Session ${sessionId}: Starting to process Gemini stream...`); // Keep log

            let totalTokens = 0;
            let totalChars = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log(`[Gemini Action] Session ${sessionId}: Stream completed.`);
                    break;
                }

                // Decode chunk and append to buffer
                const decodedChunk = textDecoder.decode(value, { stream: true }); // Ensure stream flag is true
                buffer += decodedChunk;

                // Process complete SSE events in the buffer (events are separated by double newlines)
                let processedBuffer = '';
                const events = buffer.split('\n\n'); // SSE events are separated by double newlines

                // Process all complete events except possibly the last partial one
                const completeEvents = events.slice(0, -1);
 
                for (const eventData of completeEvents) {
                    // --- Cancellation Check INSIDE Loop ---
                    const checkSession = await sessionRepository.getSession(sessionId);
                    if (!checkSession || checkSession.geminiStatus === 'canceled') { // Also check if session was somehow deleted
                        console.log(`[Gemini Action] Session ${sessionId}: Cancellation detected during stream processing.`);
                        // Close the stream and file handle immediately
                        if (writeStream) writeStream.end();
                        if (fileHandle) await fileHandle.close();
                        // Update status immediately - Set path to null because cancellation implies incomplete file
                        await sessionRepository.updateSessionGeminiStatus(sessionId, 'canceled', startTime, Date.now(), null, "Processing canceled by user.");
                        throw new Error('Processing canceled by user.'); // Throw to trigger cleanup logic
                    } // Close cancellation check
                    
                    // Updated to capture metrics
                    const { success, content, tokenCount, charCount } = processSseEvent(eventData, writeStream);
                    if (success && content && content.length > 0) hasWrittenAnyContent = true;
                    
                    // Accumulate metrics
                    totalTokens += tokenCount;
                    totalChars += charCount;
                    
                    // Update session with progress stats
                    if (tokenCount > 0 || charCount > 0) {
                        await sessionRepository.updateSessionGeminiStatus(
                          sessionId, 
                          'running', 
                          startTime, 
                          null, 
                          filePath, // Keep filePath even during processing
                          // Use a clearer message during processing
                          `Processing: Received ${totalTokens} tokens / ${totalChars} chars...`,
                          // Update stats object
                          `Processing: ${totalTokens} tokens received`,
                          { tokensReceived: totalTokens, charsReceived: totalChars }
                        );
                    }
                }

                // --- Additional cancellation check AFTER processing a batch ---
                const checkSessionAfterBatch = await sessionRepository.getSession(sessionId);
                if (!checkSessionAfterBatch || checkSessionAfterBatch.geminiStatus === 'canceled') {
                     console.log(`[Gemini Action] Session ${sessionId}: Cancellation detected after batch processing.`);
                     // Close the stream and handle before throwing
                     if (writeStream) writeStream.end(); // Close write stream
                     if (fileHandle) await fileHandle.close(); // Close file handle
                     throw new Error('Processing canceled by user.');
                }

                // Keep the last potentially incomplete event in the buffer
                buffer = events[events.length - 1];
            }

            // Process any remaining data in the buffer after the loop
            if (buffer.trim().length > 0) {
                console.log(`[Gemini Action] Session ${sessionId}: Processing remaining buffer (${buffer.trim().length} trimmed bytes)`);
                const { success, content } = processSseEvent(buffer, writeStream); // Capture content
                if (success && content && content.length > 0) hasWrittenAnyContent = true; // Update flag
                // Note: Consider a final cancellation check here as well if needed
            }
            // hasWrittenAnyContent already tracks this, bytesWritten is also a good check
        } catch (error) {
            console.error(`[Gemini Action] Session ${sessionId}: Error processing stream:`, error);
            throw error; // Rethrow to be caught by the outer try/catch block
        } finally {
            // Ensure the stream is properly closed
            if (writeStream) {
                writeStream.end();
                console.log(`[Gemini Action] Session ${sessionId}: File stream for ${filename} ended. Wrote ${writeStream?.bytesWritten ?? 0} bytes.`);
            }
            if (fileHandle) {
                await fileHandle.close();
                console.log(`[Gemini Action] Session ${sessionId}: File handle for ${filename} closed.`);
            } // Close if fileHandle check
        }

        // Check if any actual content was written OR if the stream reported bytes written
        const wasContentWritten = hasWrittenAnyContent || (writeStream && writeStream.bytesWritten > 0);

        if (!wasContentWritten && filePath) { // Only delete if path exists
            // If no usable content was written, delete the empty file
            console.log(`[Gemini Action] Session ${sessionId}: No usable content was written to file ${filePath}, deleting it.`);
            await fs.unlink(filePath);
            console.log(`[Gemini Action] Session ${sessionId}: Deleted empty file: ${filePath}`);
            // filePath = ''; // Don't clear filePath here, it's used in the status update below
            // Update status to failed immediately
            const endTimeNoContent = Date.now(); // Define endTimeNoContent
            await sessionRepository.updateSessionGeminiStatus(sessionId, 'failed', startTime, endTimeNoContent, null, "Gemini response did not contain usable text content.");
            console.log(`[Gemini Action] Session ${sessionId}: Set status to failed due to no content.`);
            return { isSuccess: false, message: "Gemini response did not contain usable text content.", data: { savedFilePath: null } };
        }

        // --- Update Session Status to Completed ---
        // Check for cancellation one last time before marking as completed
        const finalCheckSession = await sessionRepository.getSession(sessionId);
        if (finalCheckSession?.geminiStatus === 'canceled') {
             console.log(`[Gemini Action] Session ${sessionId}: Cancellation detected just before marking complete.`);
             // File might have been partially written, handle cleanup explicitly here
             if (filePath && existsSync(filePath)) { // Check existence before unlinking
                 // await fs.unlink(filePath); // Let cancel action handle cleanup? Or keep file? Decided to keep partially written file on cancel for now.
                 filePath = ''; // Clear path after deletion
             } // Close unlink check
             return { isSuccess: false, message: "Gemini processing was canceled.", data: { savedFilePath: null } };
         }
        const endTime = Date.now();
        await sessionRepository.updateSessionGeminiStatus(sessionId, 'completed', startTime, endTime, filePath, `Successfully generated and saved patch file.`);
        console.log(`[Gemini Action] Session ${sessionId}: Processing completed successfully at ${endTime}. Patch saved to ${filePath}`);

        return {
            isSuccess: true,
            message: "Successfully generated and saved patch file",
            data: { savedFilePath: filePath }
        };

    } catch (error) {
        console.error(`[Gemini Action] Session ${sessionId}: Error processing Gemini request:`, error);
        const endTime = Date.now();
        // Check if the error is due to cancellation
        const isCancellation = error instanceof Error && error.message.includes('Processing canceled');
        const errorMessage = error instanceof Error ? error.message : "Failed to process Gemini request";
        // Update session status based on error type
        const finalStatus = isCancellation ? 'canceled' : 'failed';
         // Get start time from session if available, otherwise use current time as fallback
        const startTimeForUpdate = session?.geminiStartTime || startTime || Date.now(); // Use fetched session start time
        // Persist the final status, times, and error message
        // Ensure file path is only set if the status is NOT canceled and the file exists
        let finalPath: string | null = null;
        if (!isCancellation && filePath && existsSync(filePath)) { // Keep file on failure if it exists
            finalPath = filePath; // Keep path on failure
        }
        await sessionRepository.updateSessionGeminiStatus(sessionId, finalStatus, startTimeForUpdate, endTime, finalPath, errorMessage);
        console.log(`[Gemini Action] Session ${sessionId}: Set status to ${finalStatus} at ${endTime}. Error: ${errorMessage}`);

        // Clean up potentially partially written or empty file only if it was explicitly canceled
        if (isCancellation && filePath && existsSync(filePath)) {
             try {
                 // Decide whether to delete on cancel. For now, let's delete.
                 await fs.unlink(filePath);
                 // Set finalPath to null as the file is deleted
                 console.log(`[Gemini Action] Session ${sessionId}: Successfully cleaned up canceled file: ${filePath}`);
             } catch (unlinkError) {
                 console.warn(`[Gemini Action] Failed to clean up file ${filePath}:`, unlinkError);
             }
         } // Close filePath check

        return {
            isSuccess: false,
            message: errorMessage, // Use captured error message
            data: { savedFilePath: null } // Always null path on cancellation
        };
    }
} // End of sendPromptToGeminiAction

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
            writeStream.write(textContent);
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
// New action to handle cancellation
export async function cancelGeminiProcessingAction(
    sessionId: string
): Promise<ActionState<null>> { // Return type indicates no specific data
    await setupDatabase();

    try {
        // Get the session first
        const session = await sessionRepository.getSession(sessionId);
        if (!session) {
            return { isSuccess: false, message: `Session ${sessionId} not found.` };
        }

        // Only attempt to cancel if status is 'running'
        if (session.geminiStatus !== 'running') {
            console.log(`[Gemini Action] Session ${sessionId}: Cannot cancel - status is not 'running'. Current status: ${session.geminiStatus}`);
            return { isSuccess: false, message: `Cannot cancel Gemini processing. Current status: ${session.geminiStatus}` };
        }

        // Check if there's a patch file to clean up based on the stored patch path
        const patchPath = session.geminiPatchPath;
        const fileExists = patchPath && existsSync(patchPath);

        if (fileExists && patchPath) {
            // Only proceed if status is 'running'
            const endTime = Date.now();
            // Update the session status to canceled, providing the start time and the current end time
            await sessionRepository.updateSessionGeminiStatus(sessionId, 'canceled', session.geminiStartTime, endTime, null, "Processing canceled by user."); // Set path to null
            console.log(`[Gemini Action] Session ${sessionId}: Status set to canceled at ${endTime}.`);

            try {
                await fs.unlink(patchPath);
                console.log(`[Gemini Action] Session ${sessionId}: Cleaned up file on cancel: ${patchPath}`);
            } catch (unlinkError) {
                console.warn(`[Gemini Action] Session ${sessionId}: Failed to clean up canceled file ${patchPath}`, unlinkError);
                // Don't fail the whole operation, just log the warning
            }

            return { isSuccess: true, message: "Gemini processing cancellation requested." };
        } else {
            console.log(`[Gemini Action] Session ${sessionId}: No patch file found to clean up on cancel.`);
        }

        return { isSuccess: true, message: "Gemini processing cancellation requested." };
    } catch (error) {
        // Keep existing catch block
        console.error(`[Gemini Action] Error canceling processing for session ${sessionId}:`, error);
        return { 
            isSuccess: false,
            message: error instanceof Error ? error.message : "Failed to cancel Gemini processing."
        };
    }
}
