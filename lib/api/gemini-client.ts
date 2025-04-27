import { ActionState } from "@/types";
import requestQueue from "./request-queue";
import fsManager from "../file/fs-manager";
import { GEMINI_FLASH_MODEL, GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';
import { setupDatabase } from '@/lib/db'; // Use index export
import { WriteStream } from "fs";
import { stripMarkdownCodeFences } from '@/lib/utils';
import streamingRequestPool, { RequestType } from "./streaming-request-pool";
import fs from 'fs/promises';
import { getModelSettingsForProject } from "@/actions/project-settings-actions";
import { createChatHistory } from '../codebase/chat-history';
import { sessionRepository } from '@/lib/db/repository-factory';

// Temporary mock for sessionRepository until properly implemented
const sessionRepository = {
  createBackgroundJob: async (
    sessionId: string,
    prompt: string,
    apiType: string,
    taskType: string,
    model: string,
    maxTokens: number
  ) => {
    console.log(`[MOCK] Creating background job for session ${sessionId}`);
    return { id: `mock-job-${Date.now()}` };
  },
  
  updateBackgroundJobStatus: async (
    jobId: string,
    status: string,
    startTime: number | null,
    endTime: number | null,
    progress: number | null,
    message: string
  ) => {
    console.log(`[MOCK] Updating job ${jobId} to status ${status}: ${message}`);
    return true;
  }
};

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
  apiType?: string;
  taskType?: string;
  projectDirectory?: string;
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
    
    // Create a job if sessionId and taskType are provided
    let job: BackgroundJob | null = null;
    
    // Load project settings if projectDirectory is provided
    const taskType = options.taskType || 'xml_generation';
    const projectDirectory = options.projectDirectory;
    
    if (projectDirectory && taskType) {
      try {
        const modelSettings = await getModelSettingsForProject(projectDirectory);
        if (modelSettings && modelSettings[taskType as any]) {
          const settings = modelSettings[taskType as any];
          
          // Apply settings if not explicitly overridden in options
          if (settings.model && !options.model) {
            options.model = settings.model;
          }
          
          if (settings.maxTokens && !options.maxOutputTokens) {
            options.maxOutputTokens = settings.maxTokens;
          }
          
          if (settings.temperature !== undefined && !options.temperature) {
            options.temperature = settings.temperature;
          }
        }
      } catch (err) {
        console.warn(`Failed to load project settings for ${projectDirectory}:`, err);
      }
    }
    
    // Create background job if sessionId is provided
    if (options.sessionId && options.taskType) {
      await setupDatabase();
      
      try {
        job = await sessionRepository.createBackgroundJob(
          options.sessionId,
          userPromptContent,
          options.apiType || 'gemini',
          options.taskType,
          options.model || GEMINI_FLASH_MODEL,
          options.maxOutputTokens || MAX_OUTPUT_TOKENS
        );
        
        // Update to preparing status
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'preparing',
          null,
          null,
          null,
          'Setting up Gemini API request'
        );
      } catch (error) {
        console.error(`[Gemini Client] Error creating background job:`, error);
      }
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
        try {
          // Update job status to running if we have a job
          if (job) {
            await sessionRepository.updateBackgroundJobStatus(
              job.id,
              'running',
              Date.now(),
              null,
              null,
              'Processing with Gemini API'
            );
          }
          
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
            
            // Update job status to failed if we have a job
            if (job) {
              await sessionRepository.updateBackgroundJobStatus(
                job.id,
                'failed',
                null,
                Date.now(),
                null,
                `Error: ${response.status} ${errorText.substring(0, 100)}`
              );
            }
            
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
            
            // Update job status to failed if we have a job
            if (job) {
              await sessionRepository.updateBackgroundJobStatus(
                job.id,
                'failed',
                null,
                Date.now(),
                null,
                'No valid response from Gemini API'
              );
            }
            
            throw new Error('No valid response from Gemini API');
          }
          
          const text = data.candidates[0].content.parts[0].text;
          
          // Update job status to completed if we have a job
          if (job) {
            await sessionRepository.updateBackgroundJobStatus(
              job.id,
              'completed',
              null,
              Date.now(),
              null,
              'Successfully processed with Gemini API',
              {
                tokensReceived: data.usage?.outputTokens || 0,
                charsReceived: text.length
              }
            );
          }
          
          return {
            isSuccess: true,
            message: "Gemini API call successful",
            data: text,
            metadata: {
              jobId: job?.id
            }
          };
        } catch (error) {
          // Update job status to failed if we have a job and it wasn't updated already
          if (job) {
            try {
              await sessionRepository.updateBackgroundJobStatus(
                job.id,
                'failed',
                null,
                Date.now(),
                null,
                `Error: ${error instanceof Error ? error.message : String(error)}`
              );
            } catch (updateErr) {
              console.error("[Gemini Client] Error updating job status:", updateErr);
            }
          }
          
          throw error;
        }
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
    const apiType = options.apiType || 'gemini';
    const taskType = options.taskType || 'xml_generation';
    const projectDirectory = options.projectDirectory;
    
    // Load project settings if projectDirectory is provided
    if (projectDirectory && taskType) {
      try {
        const modelSettings = await getModelSettingsForProject(projectDirectory);
        if (modelSettings && modelSettings[taskType as any]) {
          const settings = modelSettings[taskType as any];
          
          // Apply settings if not explicitly overridden in options
          if (settings.model && !options.model) {
            options.model = settings.model;
          }
          
          if (settings.maxTokens && !options.maxOutputTokens) {
            options.maxOutputTokens = settings.maxTokens;
          }
          
          if (settings.temperature !== undefined && !options.temperature) {
            options.temperature = settings.temperature;
          }
        }
      } catch (err) {
        console.warn(`Failed to load project settings for ${projectDirectory}:`, err);
      }
    }
    
    const modelUsed = options.model || GEMINI_FLASH_MODEL;
    const maxOutputTokens = options.maxOutputTokens || MAX_OUTPUT_TOKENS;
    
    // If this is a code analysis request, cancel any pending chat requests for this session
    // This prevents conflicts between the two types of requests
    if (requestType === RequestType.CODE_ANALYSIS) {
      // Cancel any pending chat requests for this session
      streamingRequestPool.cancelQueuedRequestsByType(RequestType.GEMINI_CHAT, sessionId);
    }
    
    // Set appropriate priority based on request type
    const priority = requestType === RequestType.CODE_ANALYSIS ? 10 : 5;
    
    // Create background job record first before passing to execute
    await setupDatabase();
    let job: BackgroundJob | null = null;
    
    try {
      job = await sessionRepository.createBackgroundJob(
        sessionId,
        promptText,
        apiType as any,
        taskType as any,
        modelUsed,
        maxOutputTokens
      );
      
      // Update to 'preparing' status
      await sessionRepository.updateBackgroundJobStatus(
        job.id,
        'preparing',
        null,
        null,
        null,
        'Setting up request'
      );
    } catch (error) {
      console.error(`[Gemini Client] Error creating background job:`, error);
      return {
        isSuccess: false,
        message: `Error creating background job: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
    
    return streamingRequestPool.execute(
      async () => { 
        try {
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
            
            // Update to 'running' status when the request starts
            await sessionRepository.updateBackgroundJobStatus(
              job!.id,
              'running',
              Date.now(),
              null,
              null,
              'Streaming response from Gemini'
            );
            
            // Create a unique file path for the XML changes output
            outputPath = await fsManager.createUniqueFilePath(
              job!.id,
              session.name || 'unnamed_session',
              session.projectDirectory,
              'xml' // Use .xml extension for the output file
            );
            
            // Create write stream for the XML output
            const streamResult = await fsManager.createWriteStream(outputPath);
            writeStream = streamResult.stream;
            releaseStream = streamResult.releaseStream;
            
            // Notify of stream start via callback
            if (options.streamingUpdates?.onStart) {
              options.streamingUpdates.onStart();
            }
            
            // Prepare for API call
            const sseUrl = `${GEMINI_API_BASE}/${modelUsed}:${GENERATE_CONTENT_API}?alt=sse&key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY}`;
            
            // Add model specific temp and tokens logic here if needed
            const finalOutputTokens = modelUsed.includes('pro') ? Math.min(maxOutputTokens, 65536) : Math.min(maxOutputTokens, 60000);
            
            // Prepare payload for the API request
            const payload: GeminiRequestPayload = {
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: promptText }
                  ]
                }
              ],
              generationConfig: {
                maxOutputTokens: finalOutputTokens,
                temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
                topP: options.topP || 0.95,
                topK: options.topK || 40,
              }
            };
            
            // Add system instruction if provided
            if (options.systemPrompt) {
              payload.systemInstruction = {
                parts: [
                  { text: options.systemPrompt }
                ]
              };
            }
            
            console.log(`[Gemini Client] Sending streaming request to ${modelUsed}`);
            
            // Make the actual fetch call
            const response = await fetch(sseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`[Gemini Client] HTTP Error: ${response.status} ${response.statusText}`, errorText);
              throw new Error(`API HTTP error: ${response.status} ${errorText.substring(0, 100)}`);
            }
            
            if (!response.body) {
              throw new Error('Response has no body stream');
            }
            
            // Prepare for streaming using a reader
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            // Track statistics for each chunk
            const chunkStats = {
              totalTokens: 0,
              totalChars: 0
            };
            
            // Process the stream
            let accumBuffer = '';
            let isDone = false;
            
            // Periodically update the job with token counts
            let lastUpdateTokenCount = 0;
            let lastUpdateTime = Date.now();
            const UPDATE_INTERVAL = 1000; // Update the DB at most once per second
            
            while (!isDone) {
              const { done, value } = await reader.read();
              
              if (done) {
                isDone = true;
                // Process any remaining data
                if (accumBuffer.trim()) {
                  const results = this.processSseEvent(accumBuffer, writeStream);
                  chunkStats.totalTokens += results.tokenCount;
                  chunkStats.totalChars += results.charCount;
                  accumBuffer = '';
                }
                break;
              }
              
              // Decode the chunk and add to buffer
              const chunkText = decoder.decode(value, { stream: true });
              accumBuffer += chunkText;
              
              // Split on double newlines which separate events
              const events = accumBuffer.split('\n\n');
              
              // Process all complete events except the last one which might be incomplete
              for (let i = 0; i < events.length - 1; i++) {
                const eventText = events[i].trim();
                if (!eventText) continue;
                
                // Process each event
                const results = this.processSseEvent(eventText, writeStream);
                
                // Update stats
                chunkStats.totalTokens += results.tokenCount;
                chunkStats.totalChars += results.charCount;
                
                // Update token count if sufficient time has passed and we have new tokens
                if (Date.now() - lastUpdateTime > UPDATE_INTERVAL && 
                    chunkStats.totalTokens > lastUpdateTokenCount) {
                  await sessionRepository.updateBackgroundJobStatus(
                    job!.id,
                    'running',
                    null,
                    null,
                    null,
                    null,
                    { 
                      tokensReceived: chunkStats.totalTokens, 
                      charsReceived: chunkStats.totalChars 
                    }
                  );
                  lastUpdateTokenCount = chunkStats.totalTokens;
                  lastUpdateTime = Date.now();
                }
                
                // Call streaming update callback if provided
                if (options.streamingUpdates?.onUpdate && results.content) {
                  options.streamingUpdates.onUpdate(results.content, {
                    tokens: chunkStats.totalTokens,
                    chars: chunkStats.totalChars
                  });
                }
              }
              
              // Keep only the potentially incomplete last event for the next iteration
              accumBuffer = events[events.length - 1];
            }
            
            // Close and release the file stream
            if (writeStream) {
              writeStream.end();
              if (releaseStream) {
                await releaseStream();
              }
            }
            
            // Save total stats
            totalTokens = chunkStats.totalTokens;
            totalChars = chunkStats.totalChars;
            
            // Update job as completed
            await sessionRepository.updateBackgroundJobStatus(
              job!.id,
              'completed',
              null,
              Date.now(),
              outputPath,
              `Successfully generated response. Tokens: ${totalTokens}, Characters: ${totalChars}`,
              { tokensReceived: totalTokens, charsReceived: totalChars }
            );
            
            // Call completion callback if provided
            if (options.streamingUpdates?.onComplete) {
              let finalContent = '';
              if (outputPath) {
                try {
                  finalContent = await fs.readFile(outputPath, 'utf8');
                } catch (readErr) {
                  console.error(`[Gemini Client] Error reading final content from ${outputPath}:`, readErr);
                }
              }
              
              options.streamingUpdates.onComplete(finalContent, {
                tokens: totalTokens,
                chars: totalChars
              });
            }
            
            // Return success
            return {
              isSuccess: true,
              message: "Gemini API streaming request completed successfully",
              data: { requestId: job!.id, savedFilePath: outputPath }
            };
          } catch (error) {
            console.error("[Gemini Client] Error in streaming request:", error);
            
            // Update job as failed
            if (job && job.id) {
              try {
                await sessionRepository.updateBackgroundJobStatus(
                  job.id,
                  'failed',
                  null,
                  Date.now(),
                  null,
                  `Error: ${error instanceof Error ? error.message : "Unknown error"}`.substring(0, 500),
                  { tokensReceived: totalTokens, charsReceived: totalChars }
                );
              } catch (updateError) {
                console.error("[Gemini Client] Error updating job status:", updateError);
              }
            }
            
            // Clean up resources
            if (writeStream) {
              writeStream.end();
              if (releaseStream) {
                try {
                  await releaseStream();
                } catch (releaseError) {
                  console.error("[Gemini Client] Error releasing stream:", releaseError);
                }
              }
            }
            
            // Call error callback if provided
            if (options.streamingUpdates?.onError) {
              options.streamingUpdates.onError(error instanceof Error ? error : new Error(String(error)));
            }
            
            // Return error response
            return {
              isSuccess: false,
              message: error instanceof Error ? error.message : "Unknown error during Gemini streaming request",
              data: { requestId: job!.id, savedFilePath: null }
            };
          }
        } catch (outerError) {
          console.error(`[Gemini Client] Outer streaming request error: ${outerError}`);
          
          // Update job status to failed if we have a job ID
          if (job && job.id) {
            await sessionRepository.updateBackgroundJobStatus(
              job.id,
              'failed',
              job.startTime || null,
              Date.now(),
              null,
              `Error: ${outerError instanceof Error ? outerError.message : String(outerError)}`
            );
          }
          
          return {
            isSuccess: false,
            message: outerError instanceof Error ? outerError.message : "Unknown error",
            error: outerError instanceof Error ? outerError : new Error("Unknown error")
          };
        }
      },
      {
        sessionId,
        requestId: job.id,
        requestType,
        options,
        priority
      }
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
   * Cancel a request by ID
   */
  async cancelRequest(requestId: string): Promise<ActionState<null>> {
    await setupDatabase();
    
    try {
      // Get the request to verify it exists
      const job = await sessionRepository.getBackgroundJob(requestId);
      
      if (!job) {
        return { isSuccess: false, message: `Request ${requestId} not found` };
      }
      
      if (job.status !== 'running' && job.status !== 'preparing') {
        return { isSuccess: false, message: `Request ${requestId} is not running (status: ${job.status})` };
      }
      
      // Update the request status to canceled
      await sessionRepository.updateBackgroundJobStatus(
        requestId,
        'canceled',
        job.startTime ? job.startTime : null,
        Date.now(),
        null,
        'Canceled by user'
      );
      
      // Cancel any pending requests in the pool
      streamingRequestPool.cancelQueuedRequestsById(job.sessionId, requestId);
      
      return { isSuccess: true, message: `Successfully canceled request ${requestId}` };
    } catch (error) {
      console.error(`[Gemini Client] Error canceling request ${requestId}:`, error);
      return { 
        isSuccess: false, 
        message: `Error canceling request: ${error instanceof Error ? error.message : "unknown error"}`
      };
    }
  }

  /**
   * Cancel all requests for a session
   */
  async cancelAllSessionRequests(sessionId: string): Promise<ActionState<null>> {
    await setupDatabase();
    
    try {
      // Cancel all running requests in the database
      await sessionRepository.cancelAllSessionBackgroundJobs(sessionId);
      
      // Cancel any pending requests in the pool
      streamingRequestPool.cancelQueuedSessionRequests(sessionId);
      
      return { isSuccess: true, message: `Successfully canceled all requests for session ${sessionId}` };
    } catch (error) {
      console.error(`[Gemini Client] Error canceling all requests for session ${sessionId}:`, error);
      return { 
        isSuccess: false, 
        message: `Error canceling requests: ${error instanceof Error ? error.message : "unknown error"}`
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