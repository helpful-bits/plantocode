import { DEFAULT_TASK_SETTINGS } from "@/lib/constants";
import { ActionState, TaskSettings } from "@/types";
import { RequestType } from "@/lib/api/streaming-request-pool-types";
import { updateJobToRunning, updateJobToCompleted, createBackgroundJob, handleApiError } from "@/lib/jobs/job-helpers";
import { BackgroundJob, TaskType } from "@/types/session-types";
import { backgroundJobRepository } from '@/lib/db/repositories';
import { GoogleGenerativeAI, GenerateContentRequest } from '@google/generative-ai';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';

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
 * 
 * Uses Google Generative AI SDK instead of direct API calls for better integration
 * and more consistent error handling.
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
    projectDirectory?: string; // The project directory for fetching task-specific settings
    taskType?: TaskType; // The specific task type for settings selection
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
  
  // Get task-specific settings if projectDirectory and taskType are provided
  let taskConfig = null;
  
  if (options.projectDirectory && options.taskType) {
    try {
      const allProjectSettings = await getModelSettingsForProject(options.projectDirectory);
      taskConfig = allProjectSettings[options.taskType as keyof TaskSettings];
      
      if (!taskConfig) {
        console.warn(`[Gemini Client] Settings for task type ${options.taskType} not resolved, falling back to generic_llm_stream defaults.`);
        taskConfig = allProjectSettings.generic_llm_stream || DEFAULT_TASK_SETTINGS.generic_llm_stream;
      }
    } catch (error) {
      console.warn(`[Gemini Client] Error fetching project settings:`, error);
      // Continue with defaults if settings can't be fetched
      taskConfig = DEFAULT_TASK_SETTINGS[options.taskType as keyof TaskSettings] || DEFAULT_TASK_SETTINGS.generic_llm_stream;
    }
  } else {
    taskConfig = DEFAULT_TASK_SETTINGS.generic_llm_stream;
  }
  
  // Extract options, prioritizing explicit parameters over task settings
  const modelId = options.model || taskConfig.model;
  const maxOutputTokens = options.maxOutputTokens || taskConfig.maxTokens;
  const temperature = options.temperature !== undefined ? options.temperature : taskConfig.temperature;
  
  const topP = options.topP || 0.95;
  const topK = options.topK || 40;
  
  // Get the request type or default to GENERAL for non-streaming requests
  const requestType = options.requestType || RequestType.GENERAL;
  const priority = requestType === RequestType.CODE_ANALYSIS ? 10 : 5;
  
  // Create a unique request ID if not provided
  const requestId = options.requestId || `gemini_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  // Direct implementation using the Google Generative AI SDK
  try {
    // Check if we need to force using a background job
    if (options.forceBackgroundJob && !job && options.sessionId) {
      // Create a background job if it doesn't exist yet
      console.log(`[Gemini Client] Force creating background job for ${options.taskType || 'unspecified task'}`);
      job = await createBackgroundJob(options.sessionId, {
        apiType: options.apiType || 'gemini',
        taskType: options.taskType || 'generic_llm_stream',
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
    
    // Initialize the GenAI client
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Get the model
    const model = genAI.getGenerativeModel({ model: modelId });
    
    // Prepare the generation configuration
    const generationConfig = {
      maxOutputTokens,
      temperature,
      topP,
      topK
    };
    
    // Create the contents payload
    const contents = [
      {
        role: 'user',
        parts: [{ text: userPromptContent }]
      }
    ];
    
    // Prepare the request options
    const requestOptions: {
      contents: { role: string; parts: { text: string }[] }[];
      generationConfig: typeof generationConfig;
      systemInstruction?: string;
    } = {
      contents,
      generationConfig
    };
    
    // Add system instruction if provided
    if (options.systemPrompt) {
      requestOptions.systemInstruction = options.systemPrompt;
    }
    
    // Make the API request using the SDK
    console.log(`[Gemini Client] Calling ${modelId} using SDK`);
    const result = await model.generateContent(requestOptions);
    const response = result.response;
    
    // Check for content blocks
    if (response.promptFeedback?.blockReason) {
      const blockReason = response.promptFeedback.blockReason;
      const blockMessage = `Request blocked: ${blockReason}`;
      console.error(`[Gemini Client] ${blockMessage}`);
      
      // If job exists, update its status to failed
      if (job) {
        await handleApiError(job.id, 403, blockMessage, options.apiType || 'gemini');
      }
      
      return {
        isSuccess: false,
        message: blockMessage,
        data: "",
        metadata: {
          errorType: "CONTENT_BLOCKED",
          blockReason
        }
      };
    }
    
    // Extract text from the response
    const generatedText = response.text();
    
    // Update job to completed with response
    if (job) {
      // Extract token counts from the response usage metadata
      const usageMetadata = response.usageMetadata;
      const promptTokens = usageMetadata?.promptTokenCount || 0;
      const completionTokens = usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = usageMetadata?.totalTokenCount || 
        (promptTokens + completionTokens) || // Calculate from components if available
        Math.ceil(generatedText.length / 3.5); // Otherwise estimate based on length
      
      // Ensure we have valid values
      const validPromptTokens = isNaN(promptTokens) ? 0 : promptTokens;
      const validCompletionTokens = isNaN(completionTokens) ? 0 : completionTokens;
      
      // Update the background job with complete information
      await updateJobToCompleted(job.id, generatedText, {
        tokensSent: validPromptTokens,
        tokensReceived: validCompletionTokens,
        totalTokens: validPromptTokens + validCompletionTokens,
        modelUsed: modelId,
        maxOutputTokens: maxOutputTokens,
        temperatureUsed: temperature // Pass the actual temperature used
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
            chars: generatedText.length,
            tokens: totalTokens
          }
        };
      }
    }
    
    // Return the successful response
    return {
      isSuccess: true,
      message: "Successfully generated content",
      data: generatedText,
      metadata: {
        model: modelId,
        chars: generatedText.length,
        tokens: response.usageMetadata?.totalTokenCount
      }
    };
  } catch (error) {
    console.error(`[Gemini Client] Error:`, error);
    
    // Extract meaningful error details
    let errorMessage = '';
    let statusCode = 0;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Extract status code from error message if available (SDK format)
      const statusMatch = error.message.match(/status code (\d+)/i);
      if (statusMatch && statusMatch[1]) {
        statusCode = parseInt(statusMatch[1], 10);
      }
    } else {
      errorMessage = String(error);
    }
    
    // If job exists, update its status to failed
    if (job) {
      await handleApiError(job.id, statusCode, errorMessage, options.apiType || 'gemini');
    }
    
    // Return a standardized error response
    return {
      isSuccess: false,
      message: errorMessage,
      data: "",
      metadata: {
        errorType: "SDK_ERROR",
        statusCode: statusCode
      }
    };
  }
}