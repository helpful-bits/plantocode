import { createWriteStream, WriteStream } from "fs";
import fsPromises from 'fs/promises';
import { ActionState, BackgroundJob, JobStatus, ApiType, TaskType } from "@/types";
import { backgroundJobRepository } from '@/lib/db/repositories';
import streamingRequestPool, { RequestType } from "@/lib/api/streaming-request-pool";
import { getModelSettingsForProject } from "@/actions/project-settings-actions";
import { GEMINI_FLASH_MODEL, GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';
import path from 'path';
import { IMPLEMENTATION_PLANS_DIR_NAME } from '@/lib/path-utils';
import { 
  createBackgroundJob, 
  updateJobToRunning, 
  updateJobToCompleted, 
  updateJobToCancelled, 
  updateJobToFailed,
  handleApiError
} from '@/lib/jobs/job-helpers';
import { processSseEvent, SSEEventResult } from './utils/sse-processor';

// Constants
const GENERATE_CONTENT_API = "generateContent";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Default max tokens - adjust based on the model being used
const MAX_OUTPUT_TOKENS = 60000; // Default for Flash model
const GEMINI_PRO_MAX_OUTPUT_TOKENS = 65536; // For Pro Preview model

// Types for the API
export interface StreamingUpdateCallback {
  onStart?: () => void;
  onUpdate?: (content: string, stats: { tokens: number, chars: number }) => void;
  onComplete?: (finalContent: string, stats: { tokens: number, chars: number }) => void;
  onError?: (error: Error) => void;
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
  apiType?: ApiType;
  taskType?: string;
  projectDirectory?: string;
  includeSyntax?: boolean;
  metadata?: { [key: string]: any; };
}

/**
 * Send a streaming request to the Gemini API
 */
export async function sendStreamingRequest(
  promptText: string,
  sessionId: string,
  options: GeminiRequestOptions = {}
): Promise<ActionState<{ requestId: string; savedFilePath: string | null }>> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { isSuccess: false, message: "Gemini API key not found in environment variables" };
  }
  
  // Use request ID for tracking or create a new one
  const requestId = options.requestId || `gemini_stream_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  // Load project settings if projectDirectory is provided
  const taskType = options.taskType || 'streaming';
  const projectDirectory = options.projectDirectory;
  
  // Use existing request ID if provided
  
  if (projectDirectory && taskType) {
    try {
      const modelSettings = await getModelSettingsForProject(projectDirectory);
      if (modelSettings && modelSettings[taskType as keyof typeof modelSettings]) {
        const settings = modelSettings[taskType as keyof typeof modelSettings];
        
        // Apply settings if not explicitly overridden in options
        if (settings && settings.model && !options.model) {
          options.model = settings.model;
        }
        
        if (settings && settings.maxTokens && !options.maxOutputTokens) {
          options.maxOutputTokens = settings.maxTokens;
        }
        
        if (settings && settings.temperature !== undefined && !options.temperature) {
          options.temperature = settings.temperature;
        }
      }
    } catch (err) {
      console.warn(`Failed to load project settings for ${projectDirectory}:`, err);
    }
  }
  
  // Create a background job first - we want this to happen BEFORE we queue the task
  let job: BackgroundJob | null = null;
  let writeStream: WriteStream | null = null;
  let outputPath: string | null = null;
  
  // Extract options
  const modelId = options.model || GEMINI_FLASH_MODEL;
  const maxOutputTokens = options.maxOutputTokens || MAX_OUTPUT_TOKENS;
  const temperature = options.temperature || 0.7;
  const topP = options.topP || 0.95;
  const topK = options.topK || 40;
  const streamingUpdates = options.streamingUpdates;
  
  try {
    // If we have a request ID that looks like a job ID (starting with 'job_'),
    // use it instead of creating a new job
    if (options.requestId && options.requestId.startsWith('job_')) {
      
      // Get the job from the database to make sure it exists
      const existingJob = await backgroundJobRepository.getBackgroundJob(options.requestId);
      
      if (existingJob) {
        // Use the existing job
        job = existingJob;
        
        // Update to preparing status
        await backgroundJobRepository.updateBackgroundJobStatus({
          jobId: job.id,
          status: 'preparing' as JobStatus,
          statusMessage: 'Setting up Gemini API request'
        });
      } else {
        console.error(`[Gemini Streaming] Could not find job with ID ${options.requestId}, creating new job`);
        // Fall back to creating a new job
        job = await createBackgroundJob(
          sessionId,
          {
            apiType: options.apiType || 'gemini' as ApiType,
            taskType: options.taskType as TaskType || 'streaming' as TaskType,
            model: modelId,
            includeSyntax: !!options.includeSyntax,
            temperature: temperature
          }
        );
      }
    } else {
      // Create a new background job the normal way
      job = await createBackgroundJob(
        sessionId,
        {
          apiType: options.apiType || 'gemini' as ApiType,
          taskType: options.taskType as TaskType || 'streaming' as TaskType,
          model: modelId,
          includeSyntax: !!options.includeSyntax,
          temperature: temperature
        }
      );
      
      // Update to preparing status
      await backgroundJobRepository.updateBackgroundJobStatus({
        jobId: job?.id,
        status: 'preparing' as JobStatus,
        statusMessage: 'Setting up Gemini API request'
      });
    }
    
    // If the task type is for implementation plans, save to the appropriate directory
    if (options.taskType === 'implementation_plan') {
      // Determine the output directory based on task type
      const outputType = IMPLEMENTATION_PLANS_DIR_NAME;
      
      try {
        // Get the implementation plans directory
        const outputDir = path.join(projectDirectory!, IMPLEMENTATION_PLANS_DIR_NAME);
        
        // Ensure the directory exists
        await fsPromises.mkdir(outputDir, { recursive: true });
        
        // Define the output file path (include timestamp for uniqueness)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedPrompt = promptText.slice(0, 30)
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase();
        
        // Get session name from metadata if available
        const sessionName = options.metadata?.sessionName || '';
        const sanitizedSessionName = sessionName
          ? sessionName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase()
          : '';
        
        // Create appropriate filename with extension based on task type
        const fileExtension = options.taskType === 'implementation_plan' ? '.xml' : '.md';
        const filePrefix = options.taskType === 'implementation_plan' ? 'plan_' : 'output_';
        
        // Include session name in the filename if available
        const fileName = sanitizedSessionName
          ? `${filePrefix}${sanitizedSessionName}_${timestamp}${fileExtension}`
          : `${filePrefix}${timestamp}_${sanitizedPrompt}${fileExtension}`;
        
        outputPath = path.join(outputDir, fileName);
        
        
        // Create the write stream
        writeStream = createWriteStream(outputPath);
        
        // Update the job with the output file path
        if (job && job.id) {
          await backgroundJobRepository.updateBackgroundJobStatus({
            jobId: job.id,
            status: job.status,
            metadata: {
              outputFilePath: outputPath
            }
          });
        }
      } catch (error) {
        console.error(`[Gemini Streaming] Error setting up file output:`, error);
        // Continue without file output if there's an issue
        outputPath = null;
      }
    }
    
    // Track this request in the streaming pool but without using execute
    if (requestId) {
      streamingRequestPool.trackRequest(requestId, sessionId, RequestType.GEMINI_CHAT);
    }
    
    // Run the request directly
    try {
      // Update job status to running when it starts executing
      if (job && job.id) {
        await backgroundJobRepository.updateBackgroundJobStatus({
          jobId: job.id, 
          status: 'running' as JobStatus,
          startTime: Date.now(),
          statusMessage: 'Processing stream...'
        });
      }
      
      // Signal the start of streaming if a callback is provided
      if (streamingUpdates?.onStart) {
        streamingUpdates.onStart();
      }
      
      // Build the API URL
      const apiUrl = `${GEMINI_API_BASE}/${modelId}:${GENERATE_CONTENT_API}?key=${apiKey}&alt=sse`;
      
      // Build request payload
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
          maxOutputTokens,
          temperature,
          topP,
          topK,
        },
      };
          
          // Add system instruction if provided
          if (options.systemPrompt) {
            payload.systemInstruction = {
              parts: [{ text: options.systemPrompt }]
            };
          }
          
          // Set up vars to store aggregated content
          let aggregatedText = '';
          let totalTokens = 0;
          let totalChars = 0;
          
          // Make the API request
              const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Gemini Streaming] Error: ${response.status}`, errorText);
            
            // Update job status to failed
            if (job && job.id) {
              await backgroundJobRepository.updateBackgroundJobStatus({
                jobId: job.id,
                status: 'failed' as JobStatus,
                endTime: Date.now(),
                statusMessage: `API Error: ${response.status} ${errorText.substring(0, 100)}`,
                error_message: errorText
              });
            }
            
            // Invoke error callback if provided
            if (streamingUpdates?.onError) {
              streamingUpdates.onError(new Error(`API Error: ${response.status} ${errorText.substring(0, 100)}`));
            }
            
            // Close the stream if it's open
            if (writeStream) {
              (writeStream as WriteStream).end();
            }
            
            return {
              isSuccess: false,
              message: `API Error: ${response.status} ${errorText.substring(0, 100)}`,
              data: { requestId, savedFilePath: null },
              metadata: {
                errorType: "API_ERROR",
                statusCode: response.status,
              }
            };
          }
          
          // Process the SSE response
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          
          // Read chunks until done
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Decode the chunk and append to buffer
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete events from the buffer
            let eventStart = buffer.indexOf('data: ');
            while (eventStart >= 0) {
              const eventEnd = buffer.indexOf('\n\n', eventStart);
              if (eventEnd === -1) break; // Wait for more data
              
              // Extract the event data
              const eventText = buffer.substring(eventStart + 6, eventEnd).trim();
              buffer = buffer.substring(eventEnd + 2);
              
              // Skip empty or non-JSON events
              if (!eventText || eventText === '[DONE]') continue;
              
              // Process the event with task type
              const result = processSseEvent(eventText, writeStream, options.taskType);
              if (result.success && result.content) {
                // Aggregate content
                aggregatedText += result.content;
                totalTokens += result.tokenCount;
                totalChars += result.charCount;
                
                // Provide update callback if available
                if (streamingUpdates?.onUpdate) {
                  streamingUpdates.onUpdate(
                    result.content,
                    { tokens: result.tokenCount, chars: result.charCount }
                  );
                }
              }
              
              // Look for next event
              eventStart = buffer.indexOf('data: ');
            }
            
            // Cancel handling
            if (streamingRequestPool.isCancelled(requestId)) {
              reader.cancel();
              
              // Update job status to cancelled
              if (job && job.id) {
                await backgroundJobRepository.updateBackgroundJobStatus({
                  jobId: job.id,
                  status: 'canceled' as JobStatus,
                  endTime: Date.now(),
                  response: aggregatedText,
                  statusMessage: 'Cancelled by user'
                });
              }
              
              // Close the stream if it's open
              if (writeStream) {
                (writeStream as WriteStream).end();
              }
              
              return {
                isSuccess: false,
                message: "Request was cancelled",
                data: { requestId, savedFilePath: outputPath },
                metadata: {
                  errorType: "CANCELLED",
                  statusCode: 0,
                }
              };
            }
          }
          
          // Process any remaining data
          const remaining = decoder.decode();
          if (remaining) {
            buffer += remaining;
            
            // Process any complete events from the remaining buffer
            let eventStart = buffer.indexOf('data: ');
            while (eventStart >= 0) {
              const eventEnd = buffer.indexOf('\n\n', eventStart);
              if (eventEnd === -1) break;
              
              const eventText = buffer.substring(eventStart + 6, eventEnd).trim();
              buffer = buffer.substring(eventEnd + 2);
              
              if (!eventText || eventText === '[DONE]') continue;
              
              const result = processSseEvent(eventText, writeStream, options.taskType);
              if (result.success && result.content) {
                aggregatedText += result.content;
                totalTokens += result.tokenCount;
                totalChars += result.charCount;
                
                if (streamingUpdates?.onUpdate) {
                  streamingUpdates.onUpdate(
                    result.content,
                    { tokens: result.tokenCount, chars: result.charCount }
                  );
                }
              }
              
              eventStart = buffer.indexOf('data: ');
            }
          }
          
          // Close the write stream if open
          if (writeStream) {
            (writeStream as WriteStream).end();
          }
          
          // Provide completion callback if available
          if (streamingUpdates?.onComplete) {
            streamingUpdates.onComplete(
              aggregatedText,
              { tokens: totalTokens, chars: totalChars }
            );
          }
          
          // Update job status to completed
          if (job && job.id) {
            await backgroundJobRepository.updateBackgroundJobStatus({
              jobId: job.id,
              status: 'completed' as JobStatus,
              endTime: Date.now(),
              response: aggregatedText,
              statusMessage: 'Successfully completed',
              metadata: {
                tokensReceived: totalTokens,
                tokensSent: job.tokensSent || 0,
                charsReceived: totalChars,
                outputFilePath: outputPath,
                modelUsed: job.modelUsed || modelId,
                maxOutputTokens: job.maxOutputTokens || maxOutputTokens
              }
            });
          }
          
          return {
            isSuccess: true,
            message: "Streaming request completed successfully",
            data: { requestId, savedFilePath: outputPath },
            metadata: {
              tokens: totalTokens,
              chars: totalChars,
              model: modelId
            }
          };
        } catch (error) {
          console.error(`[Gemini Streaming] Error in streaming request:`, error);
          
          // Close the write stream if open
          if (writeStream) {
            (writeStream as WriteStream).end();
          }
          
          // Update job status to failed
          if (job && job.id) {
            await backgroundJobRepository.updateBackgroundJobStatus({
              jobId: job.id,
              status: 'failed' as JobStatus,
              endTime: Date.now(),
              statusMessage: error instanceof Error ? error.message : String(error),
              error_message: error instanceof Error ? error.message : String(error)
            });
          }
          
          // Invoke error callback if provided
          if (streamingUpdates?.onError) {
            streamingUpdates.onError(error instanceof Error ? error : new Error(String(error)));
          }
          
          return {
            isSuccess: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
            data: { requestId, savedFilePath: outputPath },
            metadata: {
              errorType: "RUNTIME_ERROR",
              statusCode: 0,
            }
          };
        }
      
      // Don't forget to untrack the request when it's done
      if (requestId) {
        streamingRequestPool.untrackRequest(requestId);
      }
      
      return {
        isSuccess: false,
        message: "Placeholder for success or failure",
        data: { requestId, savedFilePath: null }
      };
  } catch (error) {
    console.error(`[Gemini Streaming] Error setting up streaming request:`, error);
    
    // Close write stream if already opened
    if (writeStream !== null) {
      (writeStream as WriteStream).end();
    }
    
    // Update job status to failed if created
    if (job && job.id) {
      await backgroundJobRepository.updateBackgroundJobStatus({
        jobId: job.id,
        status: 'failed' as JobStatus,
        endTime: Date.now(),
        statusMessage: 'Failed to process event',
        error_message: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Invoke error callback if provided
    if (streamingUpdates?.onError) {
      streamingUpdates.onError(error instanceof Error ? error : new Error(String(error)));
    }
    
    return {
      isSuccess: false,
      message: `Error setting up streaming request: ${error instanceof Error ? error.message : String(error)}`,
      data: { requestId, savedFilePath: null },
      metadata: {
        errorType: "SETUP_ERROR",
        statusCode: 0,
      }
    };
  }
}

/**
 * Helper function to complete a job
 */
async function completeJob(job: BackgroundJob | null, finalContent: string = '', stats: {
  tokens: number;
  chars: number;
  tokensSent?: number;
  totalTokens?: number;
  modelUsed?: string;
  maxOutputTokens?: number;
  outputFilePath?: string;
} = {tokens: 0, chars: 0}) {
  if (job) {
    // Use centralized helper for updating job to completed
    await updateJobToCompleted(job.id, finalContent, {
      tokensReceived: stats.tokens,
      tokensSent: stats.tokensSent || job.tokensSent || 0,
      totalTokens: stats.totalTokens || ((stats.tokens || 0) + (stats.tokensSent || job.tokensSent || 0)),
      modelUsed: (stats.modelUsed || job.modelUsed) ?? undefined,
      maxOutputTokens: (stats.maxOutputTokens || job.maxOutputTokens) ?? undefined,
      outputFilePath: (stats.outputFilePath || job.outputFilePath) ?? undefined
    });
  }
}

/**
 * Helper to handle streaming errors
 */
async function handleStreamingError(
  error: unknown, 
  writeStream: WriteStream | null, 
  errorTimeoutId: NodeJS.Timeout | undefined, 
  job: BackgroundJob | null, 
  state: any, 
  reject: (reason?: any) => void
) {
  // Clear the error timeout if it exists
  if (errorTimeoutId) {
    clearTimeout(errorTimeoutId);
  }
  
  // Close the file stream if open
  if (writeStream) {
    writeStream.end();
  }
  
  // Mark the job as failed using the centralized helpers
  if (job) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Different handling for different types of errors
    if (errorMessage.startsWith('RATE_LIMIT:') || errorMessage.startsWith('QUOTA_EXCEEDED:')) {
      // API rate limit errors
      await updateJobToFailed(job.id, `Rate limit exceeded: ${errorMessage}`);
    } else if (errorMessage.startsWith('CANCELLED:')) {
      // Request cancelled by user
      await updateJobToCancelled(job.id);
    } else if (errorMessage.startsWith('API_ERROR:')) {
      // API errors with status code
      const errorParts = errorMessage.split(':');
      if (errorParts.length >= 3) {
        const statusCode = parseInt(errorParts[1], 10);
        const message = errorParts.slice(2).join(':');
        await handleApiError(job.id, statusCode, message, 'gemini');
      } else {
        // Fallback for malformed API error messages
        await updateJobToFailed(job.id, errorMessage);
      }
    } else {
      // Generic errors
      await updateJobToFailed(job.id, errorMessage);
    }
  }
  
  console.error(`[Gemini Streaming] Error in request ${state.requestId}:`, error);
  reject(error);
}