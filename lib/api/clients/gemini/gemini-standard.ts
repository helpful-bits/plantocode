import { GEMINI_FLASH_MODEL } from "@/lib/constants";
import { ActionState } from "@/types";
import { RequestType } from "@/lib/api/streaming-request-pool-types";
import crypto from 'crypto';
import { updateJobToRunning, updateJobToCompleted, createBackgroundJob, handleApiError } from "@/lib/jobs/job-helpers";
import { BackgroundJob } from "@/types/session-types";
import { backgroundJobRepository } from '@/lib/db/repositories';

// Constants
const GENERATE_CONTENT_API = "generateContent";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_OUTPUT_TOKENS = 60000; // Default for Flash model

// Types for request and response
export interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
      role: string;
    };
  }[];
  usage?: {
    promptTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface GeminiRequestPayload {
  contents: {
    role: string;
    parts: { text: string }[];
  }[];
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    topK: number;
  };
  systemInstruction?: {
    parts: { text: string }[];
  };
}

/**
 * Send a request to Gemini API (non-streaming version)
 */
export async function sendRequest(
  userPromptContent: string,
  options: {
    sessionId?: string;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    apiType?: 'gemini' | 'claude' | 'whisper' | 'groq';
    requestType?: RequestType;
    requestId?: string;
    description?: string;
    priority?: number;
    job?: BackgroundJob;
    forceBackgroundJob?: boolean; // Whether to force using a background job
    [key: string]: any;
  } = {}
): Promise<ActionState<string>> {
  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { isSuccess: false, message: "Gemini API key not found in environment variables" };
  }
  
  // Extract job from options if present - use let instead of const so we can modify it
  let job = options.job;
  
  // Extract options
  const modelId = options.model || GEMINI_FLASH_MODEL;
  const maxOutputTokens = options.maxOutputTokens || MAX_OUTPUT_TOKENS;
  const temperature = options.temperature || 0.7;
  const topP = options.topP || 0.95;
  const topK = options.topK || 40;
  
  // Get the request type or default to GENERAL for non-streaming requests
  const requestType = options.requestType || RequestType.GENERAL;
  const priority = requestType === RequestType.CODE_ANALYSIS ? 10 : 5;
  
  // Create a unique request ID if not provided
  const requestId = options.requestId || `gemini_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  // Direct implementation without using the deprecated streaming request pool
  try {
    // Check if we need to force using a background job
    if (options.forceBackgroundJob && !job && options.sessionId) {
      // Create a background job if it doesn't exist yet
      console.log(`[Gemini Client] Force creating background job for ${options.taskType || 'unspecified task'}`);
      job = await createBackgroundJob(options.sessionId, {
        apiType: options.apiType || 'gemini',
        taskType: options.taskType || 'streaming',
        model: modelId,
        rawInput: userPromptContent,
        maxOutputTokens: maxOutputTokens,
        temperature: temperature,
        metadata: options.metadata || {}
      });
      console.log(`[Gemini Client] Created background job with ID: ${job.id}`);
    }
    
    // Update job status to running using the centralized helper
    if (job) {
      await updateJobToRunning(job.id, options.apiType || 'gemini');
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
      console.error(`[Gemini Client] Error: ${response.status}`, errorText);
      
      // If job exists, update its status to failed before throwing
      if (job) {
        await handleApiError(job.id, response.status, errorText, options.apiType || 'gemini');
      }
      
      let errorMessage = `API Error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          errorMessage += ` - ${errorJson.error.message}`;
        }
      } catch (e) {
        errorMessage += ` - ${errorText.substring(0, 100)}`;
      }
      
      return {
        isSuccess: false,
        message: errorMessage,
        data: "",
        metadata: {
          errorType: "API_ERROR",
          statusCode: response.status,
        }
      };
    }
    
    // Process the response
    const data: GeminiResponse & { usage?: { promptTokenCount?: number; totalTokenCount?: number } } = await response.json();
    
    // Extract the generated text from the response
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content || !data.candidates[0].content.parts) {
      // Return error if the response doesn't have the expected structure
      console.error(`[Gemini Client] Unexpected response format:`, data);
      
      // If job exists, update its status
      if (job) {
        await handleApiError(job.id, 200, 'Unexpected response format', options.apiType || 'gemini');
      }
      
      return {
        isSuccess: false,
        message: "Unexpected response format from Gemini API",
        data: "",
        metadata: {
          errorType: "RESPONSE_FORMAT_ERROR",
          statusCode: 200,
        }
      };
    }
    
    // Extract text from all parts (typically there's just one)
    const parts = data.candidates[0].content.parts;
    const generatedText = parts.map(part => part.text || '').join('');
    
    // Update job to completed with response
    if (job) {
      // Extract token counts from the response usage metadata
      const promptTokens = data.usage?.promptTokenCount || 0;
      const completionTokens = data.usage?.totalTokenCount 
        ? data.usage.totalTokenCount - promptTokens  // If we have total, use it to calculate completion
        : Math.ceil(generatedText.length / 3.5);     // Otherwise estimate based on output length
      
      // Ensure we have valid values
      const validPromptTokens = isNaN(promptTokens) ? 0 : promptTokens;
      const validCompletionTokens = isNaN(completionTokens) ? 0 : completionTokens;
      
      // Update the background job with complete information
      await updateJobToCompleted(job.id, generatedText, {
        tokensSent: validPromptTokens,
        tokensReceived: validCompletionTokens,
        totalTokens: validPromptTokens + validCompletionTokens,
        modelUsed: modelId,
        maxOutputTokens: maxOutputTokens
      });
      
      // If forceBackgroundJob was set, return a background job response instead
      if (options.forceBackgroundJob) {
        console.log(`[Gemini Client] Returning background job response (jobId: ${job.id})`);
        return {
          isSuccess: true,
          message: "Background job completed",
          data: generatedText, // Include the data anyway for immediate use if needed
          metadata: {
            jobId: job.id,
            model: modelId,
            chars: generatedText.length
          }
        };
      }
    }
    
    return {
      isSuccess: true,
      message: "Successfully generated content",
      data: generatedText,
      metadata: {
        model: modelId,
        chars: generatedText.length
      }
    };
  } catch (error) {
    console.error(`[Gemini Client] Error:`, error);
    
    // If job exists, update its status to failed
    if (job) {
      await handleApiError(job.id, 0, `Error: ${error instanceof Error ? error.message : String(error)}`, options.apiType || 'gemini');
    }
    
    return {
      isSuccess: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      data: "",
      metadata: {
        errorType: "RUNTIME_ERROR",
        statusCode: 0,
      }
    };
  }
}