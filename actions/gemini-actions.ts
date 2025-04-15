"use server";

import { promises as fs, existsSync } from 'fs';
import { WriteStream } from 'fs';
import path from 'path';
import os from 'os';
import { ActionState, Session, GeminiStatus } from '@/types'; // Import GeminiStatus
import { sessionRepository } from '@/lib/db/repository'; // Ensure repository is imported
import { setupDatabase } from '@/lib/db/setup';
 
const MODEL_ID = "gemini-2.5-pro-preview-03-25";
const GENERATE_CONTENT_API = "generateContent"; // Use generateContent endpoint
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:${GENERATE_CONTENT_API}?alt=sse`; // Add alt=sse for streaming
const PATCHES_DIR = path.join(process.cwd(), 'patches'); // Save patches in repository root

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
    return name.replace(/[^a-z0-9_\-\.]/gi, '_').substring(0, 60); // Keep it reasonably short
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
        } // Close if statement

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
            throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 150)}`);
        } 

        // --- Check for Cancellation Immediately After Fetch (before streaming) ---
        const postFetchSessionState = await sessionRepository.getSession(sessionId);
        if (postFetchSessionState?.geminiStatus === 'canceled') {
            console.log(`[Gemini Action] Session ${sessionId}: Processing canceled after API call, before streaming.`);
            return { isSuccess: false, message: "Gemini processing was canceled.", data: { savedFilePath: null } };
        }

        // --- Prepare Patch Output File ---
        await fs.mkdir(PATCHES_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeSessionName = sanitizeFilename(sessionName);
        const filename = `${timestamp}_${safeSessionName}.patch`;
        filePath = path.join(PATCHES_DIR, filename); // Store the full path

        console.log(`[Gemini Action] Session ${sessionId}: Preparing to write patch to: ${filePath}`);
        fileHandle = await fs.open(filePath, 'w');
        writeStream = fileHandle.createWriteStream();

        // --- Process Streaming Response ---
        const reader = response.body?.getReader();
        if (!reader) {
            if (fileHandle) await fileHandle.close(); // Ensure fileHandle exists
            throw new Error("Failed to get response reader");
        }

        const textDecoder = new TextDecoder(); // Decoder for Uint8Array chunks
        let buffer = '';
        let hasWrittenAnyContent = false; // Track if any usable content was written
        
        try {
            console.log(`[Gemini Action] Session ${sessionId}: Starting to process Gemini stream...`); // Keep log

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log(`[Gemini Action] Stream completed for session ${sessionId}.`);
                    break;
                }

                // Decode chunk and append to buffer
                const chunk = textDecoder.decode(value, { stream: true });
                buffer += chunk;

                // Process complete SSE events in the buffer
                let processedBuffer = '';
                const events = buffer.split('\n\n'); // SSE events are separated by double newlines

                // Process all complete events except possibly the last partial one
                const completeEvents = events.slice(0, -1);
 
                for (const eventData of completeEvents) {
                    // --- Cancellation Check INSIDE Loop ---
                    const checkSession = await sessionRepository.getSession(sessionId);
                    if (!checkSession || checkSession.geminiStatus === 'canceled') { // Also check if session was somehow deleted
                        console.log(`[Gemini Action] Cancellation detected during stream processing for session ${sessionId}.`);
                        // Close the stream and handle before throwing
                        if (writeStream) writeStream.end();
                        if (fileHandle) await fileHandle.close();
                        throw new Error('Processing canceled by user.'); // Throw to trigger cleanup logic
                    }
                    const { success, content } = processSseEvent(eventData, writeStream);
                    if (success && content && content.length > 0) hasWrittenAnyContent = true; // Mark if any content was written
                    processedBuffer += content || ''; // Keep track of processed content (optional)
                }

                // --- Additional cancellation check AFTER processing a batch ---
                const checkSessionAfterBatch = await sessionRepository.getSession(sessionId);
                if (!checkSessionAfterBatch || checkSessionAfterBatch.geminiStatus === 'canceled') {
                     console.log(`[Gemini Action] Cancellation detected after batch processing for session ${sessionId}.`);
                     throw new Error('Processing canceled by user.');
                     // Close the stream and handle before throwing
                     if (writeStream) writeStream.end();
                     if (fileHandle) await fileHandle.close();
                }

                // Keep the last potentially incomplete event in the buffer
                buffer = events[events.length - 1];
            }

            // Process any remaining data in the buffer after the loop
            if (buffer.trim().length > 0) {
                console.log(`[Gemini Action] Processing remaining buffer for session ${sessionId}:`, buffer.length, "bytes");
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

        if (!wasContentWritten) {
            // If no usable content was written, delete the empty file
            console.log(`[Gemini Action] No usable content was written to file ${filePath}, deleting it.`);
            await fs.unlink(filePath);
            console.log(`[Gemini Action] Deleted empty file: ${filePath}`);
            filePath = ''; // Clear filePath since it's deleted
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
             if (filePath && existsSync(filePath)) {
                 await fs.unlink(filePath);
             }
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
        const startTimeForUpdate = session?.geminiStartTime || Date.now(); // Use fetched session start time
        // Persist the final status, times, and error message
        // Path should be null on cancellation, potentially present on failure if file exists
        const finalPath = isCancellation ? null : (filePath && existsSync(filePath) ? filePath : null);
        await sessionRepository.updateSessionGeminiStatus(sessionId, finalStatus, startTimeForUpdate, endTime, finalPath, errorMessage);
        console.log(`[Gemini Action] Session ${sessionId}: Set status to ${finalStatus} at ${endTime}.`);

        // Clean up potentially partially written or empty file only if it was explicitly canceled
        if (isCancellation && filePath && existsSync(filePath)) { // Check filePath again before unlink
             try {
                 console.log(`[Gemini Action] Session ${sessionId}: Cleaning up canceled file: ${filePath}`);
                 await fs.unlink(filePath);
             } catch (unlinkError) {
                 console.warn(`[Gemini Action] Failed to clean up file ${filePath}:`, unlinkError);
             }
         } // Close filePath check

        return {
            isSuccess: false,
            message: errorMessage, // Use captured error message
            data: { savedFilePath: null } // Ensure savedFilePath is null on error
        };
    }
} // End of sendPromptToGeminiAction

/**
 * Helper function to process a single SSE event chunk - SYNCHRONOUS.
 * Parses the event data, extracts text, cleans it, and writes to the stream.
 * @param eventData Raw data string from an SSE event (may contain multiple lines).
 * @param writeStream The stream to write cleaned content to.
 * @returns Object indicating if usable content was processed and the processed content string.
 */
function processSseEvent(eventData: string, writeStream: WriteStream | null): { success: boolean; content: string | null } {
    if (!eventData || !eventData.trim()) return { success: false, content: null };

    const lines = eventData.split('\n');
    let processedContent = '';
    let success = false; // Track if any *usable* data was processed/written

    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const dataContent = line.substring(6); // Don't trim yet, JSON parser handles whitespace
            if (dataContent === '[DONE]') {
                // console.log("Received [DONE] marker"); // Less verbose logging
                continue;
            }

            try {
                const data = JSON.parse(dataContent);
                // Extract text content from candidates if available
                let textContent = data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p.text === 'string')?.text;

                if (textContent) {
                    // Clean the text content (e.g., strip markdown fences)
                    textContent = stripMarkdownCodeFences(textContent);

                    if (writeStream) {
                        // console.log(`[Gemini SSE] Writing chunk: ${textContent.substring(0, 50)}...`); // Verbose logging
                        writeStream.write(textContent);
                        success = true;
                        processedContent += textContent; // Accumulate cleaned content
                    }
                }
            } catch (e) {
                console.error("Error parsing SSE data:", e);
                // Avoid logging raw data unless absolutely necessary for debugging privacy
                // console.log("Raw data causing parse error:", dataContent);
            }
        }
    }

    return { success, content: processedContent };
}
        
/**
 * Helper function to strip common markdown code fences from the beginning and end of a string.
 * Handles variations like ```diff, ```patch, ```, etc.
 * @param content The string content potentially containing code fences.
 * @returns The content with leading/trailing fences removed.
 */
function stripMarkdownCodeFences(content: string): string {
    // Match potential fences at the beginning or end, considering optional language identifiers and surrounding whitespace/newlines.
    // Using a single regex with alternations for start and end.
    // Group 1 captures the actual content *between* the fences if both are present.
    // Group 2 captures content if only a start fence is present.
    // Group 3 captures content if only an end fence is present.
    const fenceRegex = /^\s*```(?:diff|patch|text|plain|[\w-]+)?\s*?\n([\s\S]*?)\n?\s*```\s*$|^\s*```(?:diff|patch|text|plain|[\w-]+)?\s*?\n([\s\S]+)|([\s\S]+?)\n?\s*```\s*$/;

    const match = content.match(fenceRegex);

    if (match) {
        // Return the captured content group (prioritizing the middle content if both fences exist)
        return match[1] ?? match[2] ?? match[3] ?? '';
    }
 
    // If no fences are matched, return the original content
    return content;
}
// New action to handle cancellation
export async function cancelGeminiProcessingAction(
    sessionId: string
): Promise<ActionState<null>> { // Return type indicates no specific data
    if (!sessionId) {
        return { isSuccess: false, message: "Session ID is required for cancellation." };
    }

    try {
        console.log(`[Gemini Action] Session ${sessionId}: Attempting to cancel processing...`);
        // Fetch session to get startTime and check current status
        const session = await sessionRepository.getSession(sessionId);
        if (!session) {
            return { isSuccess: false, message: `Session ${sessionId} not found.` };
        }
        // Don't allow cancellation if already completed, failed, or canceled
        if (session.geminiStatus === 'completed' || session.geminiStatus === 'failed' || session.geminiStatus === 'canceled') {
            return { isSuccess: false, message: `Cannot cancel a session that is already ${session.geminiStatus}.` };
        }
        // If it's already failed or canceled, just confirm it's stopped
        if (session.geminiStatus === 'failed' || session.geminiStatus === 'canceled') {
            return { isSuccess: true, message: `Processing for session ${sessionId} was already ${session.geminiStatus}.` };
        }

        // Only proceed if status is 'running' or 'idle' (if somehow stuck)
        const endTime = Date.now();
        // Update the session status to canceled, providing the start time and the current end time
        await sessionRepository.updateSessionGeminiStatus(sessionId, 'canceled', session.geminiStartTime, endTime, null, "Processing canceled by user."); // Provide reason
        console.log(`[Gemini Action] Session ${sessionId}: Status set to canceled at ${endTime}.`);
        return { isSuccess: true, message: "Gemini processing cancellation requested." };
    } catch (error) {
        console.error(`[Gemini Action] Error canceling processing for session ${sessionId}:`, error);
        return { 
            isSuccess: false,
            message: error instanceof Error ? error.message : "Failed to cancel Gemini processing."
        };
    }
}
