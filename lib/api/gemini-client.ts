import { ActionState } from "@/types";
import requestQueue from "./request-queue";
import fsManager from "../file/fs-manager";
import { GEMINI_FLASH_MODEL, GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';
import { sessionRepository } from '@/lib/db';
import { setupDatabase } from '@/lib/db'; // Use index export
import { WriteStream } from "fs";
import { stripMarkdownCodeFences } from '@/lib/utils';
import streamingRequestPool, { RequestType } from "./streaming-request-pool";
import fs from 'fs/promises';

// Constants
const GENERATE_CONTENT_API = "generateContent";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Default max tokens - adjust based on the model being used
// Maximum tokens for different models
const MAX_OUTPUT_TOKENS = 60000; // Default for Flash model
const GEMINI_PRO_MAX_OUTPUT_TOKENS = 65536; // For Pro Preview model

// Types for the API
export interface GeminiRequestOptions {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  streamingUpdates?: StreamingUpdateCallback;
  requestId?: string;
  sessionId?: string;
  systemPrompt?: string;
  requestType?: RequestType;
}

export interface GeminiRequestPayload {
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
  systemInstruction?: {
    parts: { text: string }[];
  };
}

export interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
      role: string;
    };
  }[];
}

export interface StreamingUpdateCallback {
  onStart?: () => void;
  onUpdate?: (content: string, stats: { tokens: number, chars: number }) => void;
  onComplete?: (finalContent: string, stats: { tokens: number, chars: number }) => void;
  onError?: (error: Error) => void;
}

// Helper for the SSE event processing
interface SSEEventResult {
  success: boolean;
  content: string | null;
  tokenCount: number;
  charCount: number;
}

class GeminiClient {
  /**
   * Send a standard (non-streaming) request to Gemini
   */
  async sendRequest(
    userPromptContent: string,
    options: GeminiRequestOptions = {}
  ): Promise<ActionState<string>> {
    // Get API key from environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { isSuccess: false, message: "Gemini API key not found in environment variables" };
    }
    
    // Extract options
    const modelId = options.model || GEMINI_FLASH_MODEL;
    const maxOutputTokens = options.maxOutputTokens || MAX_OUTPUT_TOKENS;
    const temperature = options.temperature || 0.7;
    const topP = options.topP || 0.95;
    const topK = options.topK || 40;
    
    // Get the request type or default to GENERAL for non-streaming requests
    const requestType = options.requestType || RequestType.GENERAL;
    
    // Use the streaming request pool instead of the request queue
    // This ensures proper prioritization alongside streaming requests
    return streamingRequestPool.execute(
      async () => {
        // Build the API URL
        const apiUrl = `${GEMINI_API_BASE}/${modelId}:${GENERATE_CONTENT_API}?key=${apiKey}`;
        
        // Build request payload
        const payload: GeminiRequestPayload = {
          contents: [
            {
              role: 'user',
              parts: [
                { text: userPromptContent }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens,
            temperature,
            topP,
            topK,
          },
        };
        
        // Add system instruction if provided
        if (options.systemPrompt) {
          payload.systemInstruction = {
            parts: [
              { text: options.systemPrompt }
            ]
          };
        }
        
        // Make the API request
        console.log(`[Gemini Client] Calling ${modelId}`);
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Gemini Client] Error: ${response.status} ${response.statusText}`, errorText);
          
          // Handle different error types
          if (response.status === 429) {
            throw new Error(`RATE_LIMIT:${response.status}:Gemini API rate limit exceeded. Please try again later.`);
          } else if (response.status >= 500) {
            throw new Error(`SERVER_ERROR:${response.status}:Gemini API server error.`);
          } else {
            throw new Error(`API_ERROR:${response.status}:${errorText.slice(0, 150)}`);
          }
        }
        
        const data = await response.json();
        
        // Extract text from response
        if (!data.candidates || !data.candidates.length || 
            !data.candidates[0].content || 
            !data.candidates[0].content.parts || 
            !data.candidates[0].content.parts.length) {
          console.error('[Gemini Client] No valid response data found', data);
          throw new Error('No valid response from Gemini API');
        }
        
        const text = data.candidates[0].content.parts[0].text;
        return {
          isSuccess: true,
          message: "Gemini API call successful",
          data: text,
        };
      },
      'non-streaming', // Use a constant session ID for non-streaming requests
      requestType === RequestType.CODE_ANALYSIS ? 10 : 5, // Higher priority for code analysis
      requestType // Use the specified request type
    );
  }
  
  /**
   * Send a streaming request to Gemini
   */
  async sendStreamingRequest(
    promptText: string,
    sessionId: string,
    options: GeminiRequestOptions = {}
  ): Promise<ActionState<{ requestId: string, savedFilePath: string | null }>> {
    // Get the request type or default to GEMINI_CHAT
    const requestType = options.requestType || RequestType.GEMINI_CHAT;
    
    // If this is a code analysis request, cancel any pending chat requests for this session
    // This prevents conflicts between the two types of requests
    if (requestType === RequestType.CODE_ANALYSIS) {
      // Cancel any pending chat requests for this session
      streamingRequestPool.cancelQueuedRequestsByType(RequestType.GEMINI_CHAT, sessionId);
    }
    
    // Set appropriate priority based on request type
    const priority = requestType === RequestType.CODE_ANALYSIS ? 10 : 5;
    
    // Use the streaming request pool to execute the request with the appropriate type
    return streamingRequestPool.execute(
      async () => { 
        // The actual function remains the same, wrapped by the executor
        await setupDatabase();
        
        let request: GeminiRequest | null = null; // Will store the request object
        // Get API key from environment
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
          return { isSuccess: false, message: "GEMINI_API_KEY is not configured." };
        }
        let outputPath: string | null = null;
        let releaseStream: (() => Promise<void>) | null = null;
        let writeStream: WriteStream | null = null;
        let totalTokens = 0;
        let totalChars = 0;
        
        try {
          // Fetch Session
          const session = await sessionRepository.getSession(sessionId);
          if (!session) {
            throw new Error(`Session ${sessionId} not found.`);
          }
          
          // Create a new Gemini request
          request = await sessionRepository.createGeminiRequest(sessionId, promptText); // Assign created request
          console.log(`[Gemini Client] Created new request ${request.id} for session ${sessionId} with type ${requestType}`);
          
          // Update request status to running
          const startTime = Date.now();
          await sessionRepository.updateGeminiRequestStatus(
            request.id,
            'running',
            startTime
          );
          
          // Create a unique file path for the XML changes output
          outputPath = await fsManager.createUniqueFilePath(
            request.id,
            session.name || 'unnamed_session',
            session.projectDirectory,
            'xml' // Use .xml extension for the output file
          );
          
          // Create write stream for the XML output
          const streamResult = await fsManager.createWriteStream(outputPath);
          writeStream = streamResult.stream;
          releaseStream = streamResult.releaseStream;
          
          // Update request with path and initial status
          await sessionRepository.updateGeminiRequestStatus(
            request.id,
            'running',
            startTime, 
            null, 
            outputPath, 
            'Processing started, generating XML changes...',
            { tokensReceived: 0, charsReceived: 0 } // Initial stats
          );
          console.log(`[Gemini Client] XML changes will be saved to: ${outputPath}`);
          
          // Use temperature from options or default
          let temperature = options.temperature || 0.7;
          
          const modelId = options.model || GEMINI_FLASH_MODEL;
          const apiUrl = `${GEMINI_API_BASE}/${modelId}:${GENERATE_CONTENT_API}?alt=sse&key=${apiKey}`;

          // Set max output tokens based on the chosen model
          const defaultMaxOutputTokens = modelId === GEMINI_PRO_PREVIEW_MODEL ? GEMINI_PRO_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS;
          const maxOutputTokens = options.maxOutputTokens || defaultMaxOutputTokens;
          const topP = options.topP || 0.95;
          const topK = options.topK || 40;

          // Prepare payload
          const payload: GeminiRequestPayload = {
            contents: [
              { role: "user", parts: [{ text: promptText }] }
            ],
            generationConfig: { 
              responseMimeType: "text/plain", // Expecting plain text XML output
              maxOutputTokens: maxOutputTokens, // Use calculated max tokens
              temperature: temperature, // Use extracted or default temperature
              topP: topP, // Use calculated topP
              topK: topK // Use calculated topK
            },
          };
          
          // Add system instruction if provided
          if (options.systemPrompt) {
            payload.systemInstruction = {
              parts: [
                { text: options.systemPrompt }
              ]
            };
          }
          
          // Check for cancellation just before the API call
          const currentRequest = await sessionRepository.getGeminiRequest(request.id);
          if (!currentRequest || currentRequest.status === 'canceled') {
             console.log(`[Gemini Client] Request ${request.id}: Processing canceled before API call.`);
             if (releaseStream) await releaseStream(); // Ensure releaseStream is called
             releaseStream = null;
             writeStream = null;
             return { 
              isSuccess: false, 
              message: "Gemini processing was canceled.", 
              data: { requestId: request.id, savedFilePath: null } 
            }; 
          }
          
          // Make the API request
          console.log(`[Gemini Client] Sending streaming request to ${modelId} API`);
          
          // Add a timeout for the fetch request to prevent hanging indefinitely
          const timeoutMs = 590000; // ~9.8 minutes
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          
          try {
            const response = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            clearTimeout(timeoutId); // Clear timeout if request succeeds
            
            clearTimeout(timeoutId);
            
            // Handle response errors
            if (!response.ok) {
              const errText = await response.text();
              console.error(`[Gemini Client] Request ${request.id}: API error ${response.status}: ${errText}`);
              throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 250)}`);
            }
            
            // Check for cancellation after API call but before streaming
             const postFetchRequest = await sessionRepository.getGeminiRequest(request.id);
            if (!postFetchRequest || postFetchRequest.status === 'canceled') {
              console.log(`[Gemini Client] Request ${request.id}: Processing canceled after API call, before streaming.`);
              if (releaseStream) await releaseStream(); // Ensure releaseStream is called
              releaseStream = null;
              writeStream = null;
              
              return { 
                isSuccess: false, 
                message: "Gemini processing was canceled.", 
                data: { requestId: request.id, savedFilePath: null } 
              };
            }
            
            // Process streaming response
            const reader = response.body?.getReader();
             if (!reader) {
              throw new Error("Failed to get response stream reader");
            }
            
            // Call the onStart callback if provided
            if (options.streamingUpdates?.onStart) {
              try {
                // Only call client-side callbacks if we're in a browser environment
                if (typeof window !== 'undefined') {
                  options.streamingUpdates.onStart();
                }
              } catch (callbackError) {
                console.error(`[Gemini Client] Error calling onStart callback:`, callbackError);
              }
            }
             
            // Process the stream
            let buffer = '';
            let hasWrittenAnyContent = false;
            
            // Process the stream in chunks
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                console.log(`[Gemini Client] Request ${request.id}: Stream completed.`);
                break;
              }
              
              // Decode chunk and append to buffer
              const decodedChunk = new TextDecoder().decode(value, { stream: true });
              buffer += decodedChunk;
              
              // Process complete SSE events in the buffer
               const events = buffer.split('\n\n');
              
              // Process all complete events except possibly the last partial one
               const completeEvents = events.slice(0, -1);
              
              for (const eventData of completeEvents) {
                // Check for cancellation during streaming
                const checkRequest = await sessionRepository.getGeminiRequest(request.id);
                if (!checkRequest || checkRequest.status === 'canceled') {
                  console.log(`[Gemini Client] Request ${request.id}: Cancellation detected during stream processing.`);
                  
                  if (releaseStream) await releaseStream(); // Ensure releaseStream is called
                  releaseStream = null;
                  
                  await sessionRepository.updateGeminiRequestStatus(
                    request.id, 
                    'canceled', 
                    startTime, 
                    Date.now(), 
                    null, 
                    "Processing canceled by user."
                  );
                  
                  // Removed direct session status update here
                  if (options.streamingUpdates?.onError) {
                    try {
                      // Check if we're in a server context before calling the callback
                      if (typeof window !== 'undefined') {
                        options.streamingUpdates.onError(new Error('Processing canceled by user.'));
                      } else {
                        // Server-side - just log the error
                        console.error(`[Gemini Client] Error in request processing: Processing canceled by user.`);
                      }
                    } catch (callbackError) {
                      console.error(`[Gemini Client] Error calling onError callback:`, callbackError);
                    }
                  }
                  
                  return {
                    isSuccess: false,
                    message: "Processing canceled by user.",
                    data: { requestId: request.id, savedFilePath: null }
                  };
                }
                
                // Process the event
                const result = this.processSseEvent(eventData, writeStream);
                if (result.success && result.content && result.content.length > 0) {
                  hasWrittenAnyContent = true;
                }
                
                // Update totals
                totalTokens += result.tokenCount;
                totalChars += result.charCount;
                
                // Call update callback if provided
                if (result.content && options.streamingUpdates?.onUpdate) {
                  try {
                    // Only call client-side callbacks if we're in a browser environment
                    if (typeof window !== 'undefined') {
                      options.streamingUpdates.onUpdate(
                        result.content,
                        { tokens: totalTokens, chars: totalChars }
                      );
                    }
                  } catch (callbackError) {
                    console.error(`[Gemini Client] Error calling onUpdate callback:`, callbackError);
                  }
                }
                
                // Update request stats
                if (result.tokenCount > 0 || result.charCount > 0) {
                  await sessionRepository.updateGeminiRequestStatus(
                    request.id, 
                    'running', 
                    startTime, 
                    null, 
                    outputPath,
                    null, // Don't change status message
                    { 
                      tokensReceived: totalTokens, 
                      charsReceived: totalChars 
                    }
                  );
                }
              }
              
              // Update buffer with the potentially incomplete last event
              buffer = events[events.length - 1];
            }
            
            // Process any remaining data in the buffer
            if (buffer.trim().length > 0) {
              const result = this.processSseEvent(buffer, writeStream);
              if (result.success && result.content && result.content.length > 0) {
                hasWrittenAnyContent = true;
              }
              totalTokens += result.tokenCount;
              totalChars += result.charCount;
              
              // Call update callback if provided
              if (result.content && options.streamingUpdates?.onUpdate) {
                try {
                  // Only call client-side callbacks if we're in a browser environment
                  if (typeof window !== 'undefined') {
                    options.streamingUpdates.onUpdate(
                      result.content,
                      { tokens: totalTokens, chars: totalChars }
                    );
                  }
                } catch (callbackError) {
                  console.error(`[Gemini Client] Error calling onUpdate callback:`, callbackError);
                }
              }
            }
            
            // Release file stream
            if (releaseStream) await releaseStream(); // Ensure releaseStream is called
            releaseStream = null;
            
            // Call the onComplete callback if provided
            if (options.streamingUpdates?.onComplete) {
              try {
                // Only call client-side callbacks if we're in a browser environment
                if (typeof window !== 'undefined') {
                  options.streamingUpdates.onComplete(
                    hasWrittenAnyContent ? "Content generated successfully" : "No content was generated",
                    { tokens: totalTokens, chars: totalChars }
                  );
                }
              } catch (callbackError) {
                console.error(`[Gemini Client] Error calling onComplete callback:`, callbackError);
              }
            }
            
            // Check if any content was written
            if (!hasWrittenAnyContent) {
              console.log(`[Gemini Client] Request ${request.id}: No content was generated.`);
              
              // Update the request as completed but with a warning
              await sessionRepository.updateGeminiRequestStatus(
                request.id,
                'completed',
                startTime,
                Date.now(),
                null, // Don't set the path since no valid content
                'No XML content was generated from this prompt.',
                { tokensReceived: totalTokens, charsReceived: totalChars }
              );
              
              return {
                isSuccess: false,
                message: "Request completed but no content was generated.",
                data: { requestId: request.id, savedFilePath: null }
              };
            }
            
            // Verify the XML content is valid by reading the file
            try {
              const xmlContent = await fs.readFile(outputPath, 'utf-8');
              
              // Basic validation - check if it has XML declaration and changes tag
              const hasXmlDecl = xmlContent.includes('<?xml');
              const hasChangesOpen = xmlContent.includes('<changes');
              const hasChangesClose = xmlContent.includes('</changes>');
              
              if (!hasXmlDecl || !hasChangesOpen || !hasChangesClose) {
                console.log(`[Gemini Client] Request ${request.id}: Generated content is not valid XML. XML decl: ${hasXmlDecl}, changes open: ${hasChangesOpen}, changes close: ${hasChangesClose}`);
                
                // Update request with warning
                await sessionRepository.updateGeminiRequestStatus(
                  request.id,
                  'completed',
                  startTime,
                  Date.now(),
                  outputPath, // Keep the path so user can see the content
                  'Generated content may not be valid XML. Please check the file.',
                  { tokensReceived: totalTokens, charsReceived: totalChars }
                );
                
                return {
                  isSuccess: true, // Still return success so the user can see the output
                  message: "Request completed but generated content may not be valid XML.",
                  data: { requestId: request.id, savedFilePath: outputPath }
                };
              }
              
              // Content appears to be valid XML
              console.log(`[Gemini Client] Request ${request.id}: Valid XML content generated (${xmlContent.length} chars).`);
            } catch (readError) {
              console.error(`[Gemini Client] Error reading generated XML file: ${readError}`);
              
              // Update request with error
              await sessionRepository.updateGeminiRequestStatus(
                request.id,
                'completed',
                startTime,
                Date.now(),
                outputPath,
                `Error verifying XML content: ${readError instanceof Error ? readError.message : String(readError)}`,
                { tokensReceived: totalTokens, charsReceived: totalChars }
              );
              
              return {
                isSuccess: true, // Still return success so the user can see the output
                message: "Request completed but error verifying XML content.",
                data: { requestId: request.id, savedFilePath: outputPath }
              };
            }
            
            // Update the request as completed successfully
            await sessionRepository.updateGeminiRequestStatus(
              request.id,
              'completed',
              startTime,
              Date.now(),
              outputPath,
              'XML changes generated successfully.',
              { tokensReceived: totalTokens, charsReceived: totalChars }
            );
            
            return {
              isSuccess: true,
              message: "XML changes generated successfully.",
              data: { requestId: request.id, savedFilePath: outputPath }
            };
          } catch (fetchError) {
            clearTimeout(timeoutId);
            console.error(`[Gemini Client] Fetch error for request ${request?.id}:`, fetchError);
            throw fetchError; // Rethrow to be caught by outer try/catch
          }
        } catch (error) {
          // Ensure resources are cleaned up on error
          if (releaseStream) {
            try {
              await releaseStream();
            } catch (closeError) {
              console.warn(`[Gemini Client] Request ${request.id}: Error closing file stream during error handling:`, closeError);
            }
            releaseStream = null; // Nullify after closing
          }
          
          // Format error message
          let errorMessage = "An unexpected error occurred during Gemini processing.";
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (error && typeof error === 'object' && 'message' in error) {
            errorMessage = String(error.message);
          }
          
          // Call error callback if provided
          if (options.streamingUpdates?.onError) {
            options.streamingUpdates.onError(
              error instanceof Error ? error : new Error(errorMessage)
            );
          }
          
          // Update request status if request was created
          if (request) {
            try {
              await sessionRepository.updateGeminiRequestStatus(
                request.id,
                'failed',
                request.startTime,
                Date.now(),
                null, // Clear path on failure
                errorMessage
              );
            } catch (updateError) {
              console.error(`[Gemini Client] Error updating request status after failure:`, updateError);
            }
          }
          
          return {
            isSuccess: false,
            message: errorMessage,
            data: { requestId: request?.id ?? '', savedFilePath: null }
          };
        }
      },
      sessionId,
      priority,
      requestType
    );
  }
  
  /**
   * Processes a Server-Sent Events (SSE) event from the Gemini API
   */
  private processSseEvent(eventData: string, writeStream: WriteStream | null): SSEEventResult {
    if (!eventData.trim()) {
      return { success: false, content: null, tokenCount: 0, charCount: 0 };
    }
    
    try {
      const lines = eventData.trim().split('\n');
      const dataLines = lines.filter(line => line.startsWith('data: '));
      
      if (dataLines.length === 0) {
        // No data found
        return { success: false, content: null, tokenCount: 0, charCount: 0 };
      }
      
      // Process each data line
      let combinedContent = '';
      let totalTokens = 0;
      
      for (const line of dataLines) {
        // Extract the JSON data
        const jsonStr = line.substring(6); // Remove 'data: ' prefix
        
        if (jsonStr === '[DONE]') {
          // End of stream marker
          continue;
        }
        
        try {
          const data = JSON.parse(jsonStr);
          
          // Extract the text content
          if (data.candidates && 
              data.candidates[0] && 
              data.candidates[0].content && 
              data.candidates[0].content.parts && 
              data.candidates[0].content.parts[0] && 
              typeof data.candidates[0].content.parts[0].text === 'string') {
            
            const rawText = data.candidates[0].content.parts[0].text;
            
            // Check if we have any content
            if (rawText && rawText.length > 0) {
              // Before writing to stream, check for XML-specific tokens that indicate
              // we might be getting complete XML rather than just fragment
              const hasXmlDecl = rawText.includes('<?xml');
              const hasChangesOpen = rawText.includes('<changes');
              const hasChangesClose = rawText.includes('</changes>');
              
              // Log only for significant XML structural elements to avoid spam
              if (hasXmlDecl || hasChangesOpen || hasChangesClose) {
                console.log(`[Gemini SSE] Received XML fragment with: declaration=${hasXmlDecl}, opening=${hasChangesOpen}, closing=${hasChangesClose}`);
              }
              
              // Write to stream if available
              if (writeStream) {
                writeStream.write(rawText);
              }
              
              combinedContent += rawText; // Accumulate raw XML content
              
              // Get token count from response if available, otherwise estimate
              if (data.candidates[0].usageMetadata?.totalTokens) {
                totalTokens += data.candidates[0].usageMetadata.totalTokens;
              } else {
                // Estimate tokens - very rough approximation
                totalTokens += Math.ceil(rawText.length / 4);
              }
            }
          }
        } catch (innerError) {
          console.warn("[Gemini SSE] Error parsing SSE data JSON:", innerError);
          // Continue processing other lines
        }
      }
      
      return { 
        success: true, 
        content: combinedContent, 
        tokenCount: totalTokens,
        charCount: combinedContent.length
      };
    } catch (error) {
      console.error("[Gemini SSE] Error processing SSE event:", error);
      return { success: false, content: null, tokenCount: 0, charCount: 0 };
    }
  }
  
  /**
   * Cancel a specific Gemini request
   */
  async cancelRequest(requestId: string): Promise<ActionState<null>> {
    await setupDatabase();
    
    try {
      // Get the request
      const request = await sessionRepository.getGeminiRequest(requestId);
      if (!request) {
        return { isSuccess: false, message: `Request ${requestId} not found.` };
      }
      
      // Only attempt to cancel if status is 'running'
      if (request.status !== 'running') {
        console.log(`[Gemini Client] Request ${requestId}: Cannot cancel - status is not 'running'. Current status: ${request.status}`);
        return { isSuccess: false, message: `Cannot cancel Gemini processing. Current status: ${request.status}` };
      }
      
      // Update the request status to canceled
      const endTime = Date.now();
      await sessionRepository.updateGeminiRequestStatus(
        requestId, 
        'canceled', 
        request.startTime, 
        endTime, 
        null, // Clear xml path
        "Processing canceled by user."
      );
      
      // Removed direct session status update here
      return { isSuccess: true, message: "Gemini processing cancellation requested." };
    } catch (error) {
      console.error(`[Gemini Client] Error canceling processing for request ${requestId}:`, error);
      return { 
        isSuccess: false,
        message: error instanceof Error ? error.message : "Failed to cancel Gemini processing."
      };
    }
  }
  
  /**
   * Cancel all running requests for a session
   */
  async cancelAllSessionRequests(sessionId: string): Promise<ActionState<null>> {
    await setupDatabase();
    
    try {
      // Cancel any queued requests first
      const queuedCancelled = streamingRequestPool.cancelQueuedSessionRequests(sessionId);
      console.log(`[Gemini Client] Canceled ${queuedCancelled} queued requests for session ${sessionId}`);
      
      // Get all running requests for the session
      const requests = await sessionRepository.getGeminiRequests(sessionId);
      const runningRequests = requests.filter(r => r.status === 'running');
      
      if (runningRequests.length === 0 && queuedCancelled === 0) {
        return { 
          isSuccess: false, 
          message: "No running or queued Gemini processing found for this session." 
        };
      }
      
      // Cancel all running requests
      const cancelResults = await Promise.all(
        runningRequests.map(r => this.cancelRequest(r.id))
      );
      
      // Check if all cancellations were successful
      const allSuccessful = cancelResults.every(r => r.isSuccess);
      
      if (allSuccessful || queuedCancelled > 0) {
        const totalCancelled = runningRequests.length + queuedCancelled;
        return { 
          isSuccess: true, 
          message: `Successfully canceled ${totalCancelled} Gemini processing request(s).` 
        };
      } else {
        const failedCount = cancelResults.filter(r => !r.isSuccess).length;
        return { 
          isSuccess: false, 
          message: `Failed to cancel ${failedCount} of ${runningRequests.length} Gemini processing request(s).` 
        };
      }
    } catch (error) {
      console.error(`[Gemini Client] Error canceling processing for session ${sessionId}:`, error);
      return { 
        isSuccess: false,
        message: error instanceof Error ? error.message : "Failed to cancel Gemini processing."
      };
    }
  }
  
  /**
   * Get queue statistics specific to Gemini
   */
  getQueueStats() {
    return requestQueue.getStats();
  }

  /**
   * Get streaming pool statistics
   */
  getStreamingPoolStats() {
    return streamingRequestPool.getStats();
  }
}

// Export singleton instance
const geminiClient = new GeminiClient();
export default geminiClient; 