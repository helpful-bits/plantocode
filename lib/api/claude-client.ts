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

import { ActionState, BackgroundJob } from "@/types";
import crypto from 'crypto';
import { setupDatabase } from "@/lib/db";
import { backgroundJobRepository } from '@/lib/db/repositories';
import { getModelSettingsForProject } from "@/actions/project-settings-actions";
import { TaskType } from "@/types/session-types";
import streamingRequestPool, { RequestType } from '@/lib/api/streaming-request-pool';
import { ApiType } from '@/types/session-types';
import { 
  createBackgroundJob,
  updateJobToRunning,
  updateJobToCompleted,
  updateJobToFailed,
  handleApiError,
  cancelAllSessionJobs
} from '@/lib/jobs/job-helpers';
import { 
  generateVoiceCorrectionSystemPrompt, 
  generateVoiceCorrectionUserPrompt 
} from '@/lib/prompts/voice-correction-prompts';
import { generateTextImprovementPrompt } from '@/lib/prompts/text-improvement-prompts';

// Constants
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-3-7-sonnet-20250219";

// Types
export interface ClaudeRequestPayload {
  messages: { role: string; content: string }[];
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

class ClaudeClient {
  /**
   * Send a request to Claude API with automatic queueing, rate limiting and retries
   */
  async sendRequest(
    payload: ClaudeRequestPayload, 
    sessionId?: string,
    taskType: string = 'text_improvement',
    projectDirectory?: string
  ): Promise<ActionState<string | { isBackgroundJob: true, jobId: string }>> {
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
        return {
          isSuccess: false,
          message: result.message,
          error: result.error
        };
      }
      
      const data = result.data as ClaudeResponse;
      const responseText = data.content[0].text.trim();
      
      // Return immediately with the job ID if this is a background job
      if (job) {
        return { 
          isSuccess: true, 
          message: "Claude request processed successfully.",
          data: { isBackgroundJob: true, jobId: job.id },
          metadata: {
            isBackgroundJob: true,
            jobId: job.id,
            requestId: requestId,
            modelUsed: payload.model || DEFAULT_MODEL,
            maxOutputTokens: payload.max_tokens || 2048,
            temperature: payload.temperature || 0.7,
            projectDirectory: projectDirectory
          }
        };
      } else {
        // Extract token counts if available
        const tokensSent = data.usage?.input_tokens || 0;
        const tokensReceived = data.usage?.output_tokens || 0;
        
        return { 
          isSuccess: true, 
          message: "Claude request processed successfully.",
          data: responseText,
          metadata: {
            requestId: requestId,
            modelUsed: payload.model || DEFAULT_MODEL,
            maxOutputTokens: payload.max_tokens || 2048,
            temperature: payload.temperature || 0.7,
            tokensSent,
            tokensReceived,
            totalTokens: tokensSent + tokensReceived,
            chars: responseText.length
          }
        };
      }
    } catch (error) {
      console.error("Error executing Claude request:", error);
      
      // Even if we encounter an error at the pool level, we need to ensure the job is marked as failed
      if (job) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await updateJobToFailed(job.id, errorMessage);
        
        return {
          isSuccess: false,
          message: `Error executing Claude request: ${errorMessage}`,
          error: error instanceof Error ? error : new Error(errorMessage),
          metadata: {
            isBackgroundJob: true,
            jobId: job.id,
            errorType: "RUNTIME_ERROR",
            statusCode: 0,
            modelUsed: payload.model || DEFAULT_MODEL,
            maxOutputTokens: payload.max_tokens || 2048,
            temperature: payload.temperature || 0.7,
            projectDirectory: projectDirectory
          }
        };
      }
      
      return {
        isSuccess: false,
        message: `Error executing Claude request: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          errorType: "RUNTIME_ERROR",
          statusCode: 0,
          modelUsed: payload.model || DEFAULT_MODEL
        }
      };
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
      const result = await this.sendRequest(payload, sessionId, 'text_improvement', projectDirectory);
      
      // If this is a background job, return the jobId with a clear metadata structure
      if (result.isSuccess && result.metadata?.isBackgroundJob) {
        return {
          isSuccess: true,
          message: "Text improvement is being processed in the background.",
          data: { isBackgroundJob: true, jobId: result.metadata.jobId } as { isBackgroundJob: true, jobId: string },
          metadata: { 
            isBackgroundJob: true, 
            jobId: result.metadata.jobId,
            operationId: result.metadata.jobId, // Include operationId for backward compatibility
            modelUsed: result.metadata.modelUsed || options?.model || "claude-3-7-sonnet-20250219",
            maxOutputTokens: result.metadata.maxOutputTokens || options?.max_tokens || 2048,
            temperature: result.metadata.temperature || 0.7,
            projectDirectory: projectDirectory
          }
        };
      }
      
      // Otherwise return the immediate text result
      return result;
    } catch (error) {
      console.error("Error improving text with Claude:", error);
      return {
        isSuccess: false,
        message: error instanceof Error ? error.message : "Unknown error during text improvement",
      };
    }
  }

  /**
   * Processes and corrects raw task description text, improving its clarity and structure
   */
  async correctTaskDescription(
    rawText: string,
    options?: {
      sessionId?: string;
      language?: string;
      max_tokens?: number;
      model?: string;
      projectDirectory?: string;
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
    
    const { sessionId, language = 'en', max_tokens = 2048, model = "claude-3-7-sonnet-20250219", projectDirectory } = options || {};
    
    // Use centralized prompts
    const systemPrompt = generateVoiceCorrectionSystemPrompt(language);
    const userMessage = generateVoiceCorrectionUserPrompt(rawText);

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
      sessionId,
      'voice_correction',
      projectDirectory
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
   */
  async cancelAllSessionRequests(sessionId: string): Promise<ActionState<null>> {
    try {
      // Cancel any queued requests through the streaming request pool
      const cancelledCount = streamingRequestPool.cancelQueuedSessionRequests(sessionId);
      
      // Also cancel background jobs in the database
      await cancelAllSessionJobs(sessionId);
      
      return { 
        isSuccess: true, 
        message: `Cancelled ${cancelledCount} Claude requests for session ${sessionId}.`,
        data: null
      };
    } catch (error) {
      return { 
        isSuccess: false, 
        message: `Error cancelling Claude requests: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}

// Export singleton instance
const claudeClient = new ClaudeClient();
export default claudeClient; 