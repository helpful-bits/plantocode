import { ActionState } from "@/types";
import streamingRequestPool, { RequestType } from "@/lib/api/streaming-request-pool";
import { getModelSettingsForProject } from "@/actions/project-settings-actions";
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import { ApiType, TaskType } from "@/types/session-types";
import crypto from 'crypto';
import { 
  createBackgroundJob,
  updateJobToRunning,
  updateJobToCompleted,
  handleApiError
} from '@/lib/jobs/job-helpers';

// Import common types
import { GeminiRequestPayload, GeminiRequestOptions } from './gemini-streaming';

// Constants
const GENERATE_CONTENT_API = "generateContent";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_OUTPUT_TOKENS = 60000; // Default for Flash model

export interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
      role: string;
    };
  }[];
}

/**
 * Send a standard (non-streaming) request to Gemini
 */
export async function sendRequest(
  userPromptContent: string,
  options: GeminiRequestOptions = {}
): Promise<ActionState<string>> {
  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { isSuccess: false, message: "Gemini API key not found in environment variables" };
  }
  
  // Create a job if sessionId and taskType are provided
  let job: any = null;
  
  // Load project settings if projectDirectory is provided
  const taskType = options.taskType || 'xml_generation';
  const projectDirectory = options.projectDirectory;
  
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
  
  // Create a background job if session ID is provided
  if (options.sessionId && options.taskType) {
    try {
      // Create the job first using the centralized helper
      job = await createBackgroundJob(
        options.sessionId,
        {
          apiType: options.apiType || 'gemini' as ApiType,
          taskType: options.taskType as TaskType,
          model: options.model || GEMINI_FLASH_MODEL,
          rawInput: userPromptContent,
          includeSyntax: options.includeSyntax || false,
          temperature: options.temperature || 0.7
        }
      );
    } catch (error) {
      console.error(`[Gemini Client] Error creating background job:`, error);
      return {
        isSuccess: false,
        message: `Error creating background job: ${error instanceof Error ? error.message : String(error)}`,
        data: "",
        metadata: {
          errorType: "JOB_CREATION_ERROR",
          statusCode: 0,
        }
      };
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
  const priority = requestType === RequestType.CODE_ANALYSIS ? 10 : 5;
  
  // Create a unique request ID if not provided
  const requestId = options.requestId || `gemini_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  // Use the streaming request pool instead of the request queue
  // This ensures proper prioritization alongside streaming requests
  const result = await streamingRequestPool.execute(
    async (): Promise<ActionState<string>> => {
      try {
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
          await updateJobToCompleted(job.id, generatedText, {
            completionTokens: Math.ceil(generatedText.length / 3.5),
            promptTokens: data.usage?.promptTokenCount,
            totalTokens: data.usage?.totalTokenCount
          });
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
    },
    {
      sessionId: options.sessionId || crypto.randomUUID(), // Ensure sessionId is always a string
      requestType: requestType,
      requestId: requestId,
      priority: priority,
      ...options
    }
  );
  
  return result;
} 