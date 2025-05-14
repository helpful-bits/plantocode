/**
 * Claude API Client
 *
 * This client provides access to the Anthropic Claude API, handling:
 * - Background job management compatible with Gemini client
 * - Request prioritization via streaming request pool
 * - Token usage tracking
 * - Comprehensive job metadata
 * - Error handling and reporting
 * - Specialized methods for text improvement and voice correction
 */

import { ActionState, BackgroundJob } from "@core/types";
import crypto from 'crypto';
import { setupDatabase } from "@core/lib/db";
import { backgroundJobRepository } from '@core/lib/db/repositories';
import { getModelSettingsForProject } from "@core/actions/project-settings-actions";
import { TaskType } from "@core/types/session-types";
import streamingRequestPool, { RequestType } from '@core/lib/api/streaming-request-pool';
import { ApiType } from '@core/types/session-types';
import {
  createBackgroundJob,
  updateJobToRunning,
  updateJobToCompleted,
  updateJobToFailed,
  handleApiError,
  cancelAllSessionJobs
} from '@core/lib/jobs/job-helpers';
import {
  generateVoiceCorrectionSystemPrompt,
  generateVoiceCorrectionUserPrompt
} from '@core/lib/prompts/voice-correction-prompts';
import { generateTextImprovementPrompt } from '@core/lib/prompts/text-improvement-prompts';
import { ApiClient, ApiClientOptions } from './api-client-interface';
import {
  ApiErrorType,
  handleApiClientError,
  createApiSuccessResponse
} from './api-error-handling';

// Constants
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-3-7-sonnet-20250219";

// Types
export interface ClaudeRequestPayload {
  messages: { role: string; content: string | { type: string; text: string }[] }[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  system?: string;
  model?: string;
}

export interface ClaudeResponse {
  content: { type: string; text: string }[];
  usage?: { input_tokens: number, output_tokens: number };
}

class ClaudeClient implements ApiClient {
  /**
   * Send a request to Claude API with automatic queueing, rate limiting and retries
   */
  async sendRequest(
    input: ClaudeRequestPayload | string,
    options?: ApiClientOptions
  ): Promise<ActionState<string | { isBackgroundJob: true, jobId: string }>> {
    // Convert string input to payload if needed
    let payload: ClaudeRequestPayload;
    if (typeof input === 'string') {
      // Create a basic message for string inputs
      payload = {
        messages: [
          { role: "user", content: [{ type: "text", text: input }] }
        ]
      } as ClaudeRequestPayload;
    } else {
      payload = input;
    }

    // Extract options
    const sessionId = options?.sessionId;
    const taskType = options?.taskType || 'text_improvement';
    const projectDirectory = options?.projectDirectory;
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { isSuccess: false, message: "Anthropic API key is not configured." };
    }
    
    let job: BackgroundJob | null = null;
    
    // Load project settings if project directory is provided
    let modelSettings = null;
    if (projectDirectory) {
      try {
        modelSettings = await getModelSettingsForProject(projectDirectory);
        if (modelSettings && modelSettings[taskType as keyof typeof modelSettings]) {
          const settings = modelSettings[taskType as keyof typeof modelSettings];
          
          // Apply settings to payload if not explicitly overridden
          if (settings && settings.model && !payload.model) {
            payload.model = settings.model;
          }
          
          if (settings && settings.maxTokens && !payload.max_tokens) {
            payload.max_tokens = settings.maxTokens;
          }
          
          if (settings && settings.temperature !== undefined && !payload.temperature) {
            payload.temperature = settings.temperature;
          }
        }
      } catch (err) {
        console.warn(`Failed to load project settings for ${projectDirectory}:`, err);
      }
    }
    
    // Create a background job record if sessionId is provided
    if (sessionId) {
      await setupDatabase();
      try {
        // Extract the prompt text from the messages
        const promptText = payload.messages.map(m => `${m.role}: ${m.content}`).join('\n');
        
        // Create a comprehensive metadata object
        const combinedMetadata = {
          // Model configuration
          modelUsed: payload.model || DEFAULT_MODEL,
          maxOutputTokens: payload.max_tokens || 2048,
          temperature: payload.temperature || 0.7,
          
          // Project context
          projectDirectory: projectDirectory,
          
          // Request context
          requestType: RequestType.CLAUDE_REQUEST,
          requestId: crypto.randomUUID(),
        };
        
        // Create the job using the centralized helper
        job = await createBackgroundJob(
          sessionId,
          {
            apiType: 'claude',
            taskType: taskType as TaskType,
            model: payload.model || DEFAULT_MODEL,
            rawInput: promptText,
            includeSyntax: !!payload.messages,
            temperature: payload.temperature || 0.7,
            maxOutputTokens: payload.max_tokens || 2048,
            metadata: combinedMetadata
          }
        );
      } catch (err) {
        console.error("Error creating background job:", err);
        return { 
          isSuccess: false, 
          message: `Error creating background job: ${err instanceof Error ? err.message : String(err)}`,
          metadata: {
            errorType: "JOB_CREATION_ERROR",
            statusCode: 0,
          }
        };
      }
    }
    
    // Prepare the execution function that will be passed to streamingRequestPool
    const executeRequest = async (): Promise<ActionState<ClaudeResponse>> => {
      try {
        // Update job status to running
        if (job) {
          await updateJobToRunning(job.id, 'claude');
        }
        
        const response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: payload.model || DEFAULT_MODEL,
            max_tokens: payload.max_tokens ?? 2048,
            messages: payload.messages,
            temperature: payload.temperature,
            top_p: payload.top_p,
            top_k: payload.top_k,
            system: payload.system
          }),
        });
        
        if (!response.ok) {
          const errText = await response.text();
          console.error(`Anthropic API error: ${response.status} ${errText}`);
          
          // Update job status to failed before throwing
          if (job) {
            await handleApiError(job.id, response.status, errText, 'claude');
          }
          
          // Check for specific error types
          let errorJson: any = {};
          try {
            errorJson = JSON.parse(errText);
          } catch (e) {
            // Not valid JSON, ignore
          }
          
          // Handle different error types
          if (response.status === 429 || response.status === 529 || 
              (errorJson.error?.type === "rate_limit_error") || 
              (errorJson.error?.type === "overloaded_error" && errorJson.error?.message === "Overloaded")) {
            return {
              isSuccess: false,
              message: `Anthropic API is currently overloaded. Please try again in a few moments.`,
              error: new Error(`RATE_LIMIT:${response.status}:Anthropic API is currently overloaded.`),
              metadata: {
                errorType: "RATE_LIMIT_ERROR",
                statusCode: response.status,
                modelUsed: payload.model || DEFAULT_MODEL
              }
            };
          } else if (response.status >= 500) {
            return {
              isSuccess: false,
              message: `Anthropic API server error.`,
              error: new Error(`SERVER_ERROR:${response.status}:Anthropic API server error.`),
              metadata: {
                errorType: "SERVER_ERROR",
                statusCode: response.status,
                modelUsed: payload.model || DEFAULT_MODEL
              }
            };
          } else {
            return {
              isSuccess: false,
              message: `API error: ${errText.slice(0, 150)}`,
              error: new Error(`API_ERROR:${response.status}:${errText.slice(0, 150)}`),
              metadata: {
                errorType: "API_ERROR",
                statusCode: response.status,
                modelUsed: payload.model || DEFAULT_MODEL
              }
            };
          }
        }
        
        const data = await response.json();
        
        // Validate response
        if (!data.content || data.content.length === 0 || typeof data.content[0].text !== 'string') {
          console.error("Anthropic returned an empty or invalid response structure:", JSON.stringify(data).slice(0, 500));
          
          // Update job status to failed before throwing
          if (job) {
            await updateJobToFailed(job.id, "Anthropic returned an invalid response structure.");
          }
          
          return {
            isSuccess: false,
            message: "Anthropic returned an invalid response structure.",
            error: new Error("Anthropic returned an invalid response structure."),
            metadata: {
              errorType: "RESPONSE_FORMAT_ERROR",
              statusCode: 200,
              modelUsed: payload.model || DEFAULT_MODEL
            }
          };
        }
        
        // Update job status to completed
        if (job) {
          const responseText = data.content[0].text.trim();
          
          // Extract token counts from the response usage metadata
          const tokensSent = data.usage?.input_tokens || 0;
          const tokensReceived = data.usage?.output_tokens || 0;
          const totalTokens = tokensSent + tokensReceived;
          
          // Ensure we have valid values
          const validTokensSent = isNaN(tokensSent) ? 0 : tokensSent;
          const validTokensReceived = isNaN(tokensReceived) ? 0 : tokensReceived;
          
          // Update the background job with complete information
          await updateJobToCompleted(job.id, responseText, {
            tokensSent: validTokensSent,
            tokensReceived: validTokensReceived,
            totalTokens: validTokensSent + validTokensReceived,
            modelUsed: payload.model || DEFAULT_MODEL,
            maxOutputTokens: payload.max_tokens || 2048
          });
        }
        
        return {
          isSuccess: true,
          data: data,
          message: "Successfully processed with Claude API"
        };
      } catch (error) {
        console.error("Error during Claude API request execution:", error);
        
        // Ensure job status is updated to failed if any error occurs
        if (job) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await updateJobToFailed(job.id, errorMessage);
        }
        
        return {
          isSuccess: false,
          message: `Error during Claude API request: ${error instanceof Error ? error.message : String(error)}`,
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
    };
    
    // Use the streaming request pool instead of request queue
    const requestId = crypto.randomUUID();
    
    try {
      // Track this request in the streaming pool but execute directly
      streamingRequestPool.trackRequest(requestId, sessionId || 'anonymous', RequestType.CLAUDE_REQUEST);
      
      // Execute the request directly
      const result = await executeRequest();
      
      // Untrack the request when done
      streamingRequestPool.untrackRequest(requestId);
      
      if (!result.isSuccess) {
        return handleApiClientError(result.error || new Error(result.message), {
          jobId: job?.id,
          apiType: 'claude',
          logPrefix: '[Claude Client]'
        });
      }
      
      const data = result.data as ClaudeResponse;
      const responseText = data.content[0].text.trim();
      
      // Return immediately with the job ID if this is a background job
      if (job) {
        return createApiSuccessResponse(
          { isBackgroundJob: true, jobId: job.id },
          {
            message: "Claude request processed successfully.",
            jobId: job.id,
            isBackgroundJob: true,
            modelInfo: {
              modelUsed: payload.model || DEFAULT_MODEL,
              maxOutputTokens: payload.max_tokens || 2048,
              temperature: payload.temperature || 0.7
            },
            requestId: requestId,
            projectDirectory: projectDirectory
          }
        );
      } else {
        // Extract token counts if available
        const tokensSent = data.usage?.input_tokens || 0;
        const tokensReceived = data.usage?.output_tokens || 0;

        return createApiSuccessResponse(
          responseText,
          {
            message: "Claude request processed successfully.",
            modelInfo: {
              modelUsed: payload.model || DEFAULT_MODEL,
              maxOutputTokens: payload.max_tokens || 2048,
              temperature: payload.temperature || 0.7
            },
            tokenInfo: {
              tokensSent,
              tokensReceived,
              totalTokens: tokensSent + tokensReceived
            },
            requestId: requestId,
            chars: responseText.length
          }
        );
      }
    } catch (error) {
      console.error("Error executing Claude request:", error);

      // Even if we encounter an error at the pool level, we need to ensure the job is marked as failed
      if (job) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await updateJobToFailed(job.id, errorMessage);
      }

      return handleApiClientError(error, {
        jobId: job?.id,
        apiType: 'claude',
        logPrefix: '[Claude Client]',
        response: undefined,
      });
    }
  }
  
  /**
   * Simplified method to improve text using Claude
   */
  async improveText(
    text: string, 
    sessionId?: string,
    options?: {
      max_tokens?: number;
      preserveFormatting?: boolean;
      model?: string;
      targetField?: string;
    },
    projectDirectory?: string
  ): Promise<ActionState<string | { isBackgroundJob: true, jobId: string }>> {
    const preserveFormatting = options?.preserveFormatting !== false;
    
    // Skip empty or whitespace-only texts
    if (!text || text.trim() === '') {
      return { isSuccess: false, message: "No text provided for improvement." };
    }
    
    // Use centralized prompt
    const improvedTextPrompt = generateTextImprovementPrompt(text, preserveFormatting);
    
    const payload: ClaudeRequestPayload = {
      messages: [{
        role: "user",
        content: improvedTextPrompt
      }],
      max_tokens: options?.max_tokens || 2048,
      model: options?.model
    };
    
    try {
      // Execute the request and wait for response
      const result = await this.sendRequest(payload, {
        sessionId,
        taskType: 'text_improvement',
        projectDirectory
      });

      // If this is a background job, return the jobId with a clear metadata structure
      if (result.isSuccess && result.metadata?.isBackgroundJob) {
        return createApiSuccessResponse(
          { isBackgroundJob: true, jobId: result.metadata.jobId } as { isBackgroundJob: true, jobId: string },
          {
            message: "Text improvement is being processed in the background.",
            jobId: result.metadata.jobId,
            isBackgroundJob: true,
            operationId: result.metadata.jobId, // Include operationId for backward compatibility
            modelInfo: {
              modelUsed: result.metadata.modelUsed || options?.model || "claude-3-7-sonnet-20250219",
              maxOutputTokens: result.metadata.maxOutputTokens || options?.max_tokens || 2048,
              temperature: result.metadata.temperature || 0.7,
            },
            projectDirectory: projectDirectory
          }
        );
      }

      // Otherwise return the immediate text result
      return result;
    } catch (error) {
      console.error("Error improving text with Claude:", error);
      return handleApiClientError(error, {
        apiType: 'claude',
        logPrefix: '[Claude Text Improvement]'
      });
    }
  }

  /**
   * Processes and corrects raw task description text, improving its clarity and structure.
   *
   * This function now accepts an optional existing jobId parameter to update an existing job
   * rather than always creating a new one. This is used by the new correctTextAction approach
   * which creates its own dedicated voice_correction job.
   */
  async correctTaskDescription(
    rawText: string,
    options?: {
      sessionId?: string;
      language?: string;
      max_tokens?: number;
      model?: string;
      projectDirectory?: string;
      jobId?: string; // Optional existing job ID to update
    }
  ): Promise<ActionState<string | { isBackgroundJob: true, jobId: string }>> {
    console.log(`[Claude] Processing voice correction request for ${options?.sessionId || 'anonymous user'}`);

    // Parameter validation
    if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
      return {
        isSuccess: false,
        message: "No text provided for correction."
      };
    }

    const {
      sessionId,
      language = 'en',
      max_tokens = 2048,
      model = "claude-3-7-sonnet-20250219",
      projectDirectory,
      jobId
    } = options || {};

    // Use centralized prompts
    const systemPrompt = generateVoiceCorrectionSystemPrompt(language);
    const userMessage = generateVoiceCorrectionUserPrompt(rawText);

    // If we have a specific job ID, update it directly instead of creating a new one
    if (jobId && sessionId) {
      try {
        // Get the existing job
        await setupDatabase();
        const existingJob = await backgroundJobRepository.getBackgroundJob(jobId);

        if (!existingJob) {
          console.warn(`[correctTaskDescription] Job ${jobId} not found, falling back to creating a new job`);
        } else {
          console.log(`[correctTaskDescription] Using existing job ${jobId} for voice correction`);

          // Prepare the execution function that will be passed to streamingRequestPool
          const requestId = crypto.randomUUID();
          streamingRequestPool.trackRequest(requestId, sessionId, RequestType.CLAUDE_REQUEST);

          try {
            const response = await fetch(ANTHROPIC_API_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY || '',
                "anthropic-version": ANTHROPIC_VERSION,
              },
              body: JSON.stringify({
                model: model,
                max_tokens: max_tokens,
                messages: [{ role: "user", content: userMessage }],
                system: systemPrompt,
                temperature: 0.3 // Lower temperature for more predictable corrections
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              console.error(`[correctTaskDescription] Anthropic API error: ${response.status} ${errText}`);

              // Update job status to failed
              await updateJobToFailed(jobId, `API error: ${response.status} ${errText.substring(0, 100)}`);

              streamingRequestPool.untrackRequest(requestId);

              return {
                isSuccess: false,
                message: `API error: ${errText.slice(0, 150)}`,
                metadata: {
                  jobId
                }
              };
            }

            const data = await response.json();

            // Validate response
            if (!data.content || data.content.length === 0 || typeof data.content[0].text !== 'string') {
              const errorMsg = "Anthropic returned an invalid response structure.";
              console.error(`[correctTaskDescription] ${errorMsg}`, JSON.stringify(data).slice(0, 500));

              await updateJobToFailed(jobId, errorMsg);
              streamingRequestPool.untrackRequest(requestId);

              return {
                isSuccess: false,
                message: errorMsg,
                metadata: {
                  jobId
                }
              };
            }

            // Extract token counts from the response usage metadata
            const tokensSent = data.usage?.input_tokens || 0;
            const tokensReceived = data.usage?.output_tokens || 0;
            const responseText = data.content[0].text.trim();

            // Update the background job with complete information
            await updateJobToCompleted(jobId, responseText, {
              tokensSent,
              tokensReceived,
              totalTokens: tokensSent + tokensReceived,
              modelUsed: model,
              maxOutputTokens: max_tokens
            });

            streamingRequestPool.untrackRequest(requestId);

            return {
              isSuccess: true,
              message: "Text correction completed successfully.",
              data: responseText,
              metadata: {
                jobId,
                tokensSent,
                tokensReceived,
                totalTokens: tokensSent + tokensReceived,
                modelUsed: model
              }
            };
          } catch (error) {
            console.error("[correctTaskDescription] Error during Claude API request:", error);

            await updateJobToFailed(jobId, error instanceof Error ? error.message : String(error));
            streamingRequestPool.untrackRequest(requestId);

            return {
              isSuccess: false,
              message: `Error processing correction: ${error instanceof Error ? error.message : String(error)}`,
              metadata: {
                jobId
              }
            };
          }
        }
      } catch (err) {
        console.error("[correctTaskDescription] Error while handling existing job:", err);
        // Continue with creating a new job as fallback
      }
    }

    // Default path: Create a new job and use sendRequest
    return this.sendRequest(
      {
        model: model,
        messages: [
          { role: "user", content: userMessage }
        ],
        system: systemPrompt,
        max_tokens,
        temperature: 0.3 // Lower temperature for more predictable corrections
      },
      {
        sessionId,
        taskType: 'voice_correction',
        projectDirectory
      }
    );
  }
  
  /**
   * Get current queue stats
   */
  getQueueStats() {
    return streamingRequestPool.getStats();
  }
  
  /**
   * Cancel all requests for a specific session
   *
   * @param sessionId - The unique ID of the session to cancel all requests for
   * @returns Promise indicating success or failure with detailed metrics
   */
  async cancelAllSessionRequests(sessionId: string): Promise<ActionState<{
    cancelledQueueRequests: number;
    cancelledBackgroundJobs: number;
  }>> {
    try {
      // Cancel any queued requests through the streaming request pool
      const cancelledQueueRequests = streamingRequestPool.cancelQueuedSessionRequests(sessionId);

      // Also cancel background jobs in the database with the enhanced helper that returns count
      const cancelledBackgroundJobs = await cancelAllSessionJobs(sessionId, 'claude');

      return {
        isSuccess: true,
        message: `Cancelled ${cancelledQueueRequests} queued and ${cancelledBackgroundJobs} running Claude requests for session ${sessionId}.`,
        data: {
          cancelledQueueRequests,
          cancelledBackgroundJobs
        },
        metadata: {
          totalCancelled: cancelledQueueRequests + cancelledBackgroundJobs,
          sessionId,
          apiType: 'claude',
          cancelledAt: Date.now()
        }
      };
    } catch (error) {
      // Use the standard error handling system
      const errorResult = await handleApiClientError(error, {
        logPrefix: '[Claude Client]',
        apiType: 'claude'
      });

      return {
        isSuccess: false,
        message: errorResult.message,
        data: {
          cancelledQueueRequests: 0,
          cancelledBackgroundJobs: 0
        },
        metadata: {
          ...errorResult.metadata,
          sessionId
        },
        error: errorResult.error
      };
    }
  }
}

// Create singleton instance
const __claude = new ClaudeClient();

// Export singleton instance
export default __claude; 