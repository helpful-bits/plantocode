import { ActionState, ApiType, TaskType, TaskSettings } from "@/types";
import { getModelSettingsForProject } from "@/actions/project-settings-actions";
import { DEFAULT_TASK_SETTINGS } from '@/lib/constants';
import { 
  streamGeminiContentWithSDK, 
  GeminiSdkRequestPayload, 
  StreamCallbacks 
} from './gemini-sdk-handler';

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
  apiType?: ApiType;
  taskType?: string;
  projectDirectory?: string;
  includeSyntax?: boolean;
  metadata?: { [key: string]: any; };
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Send a streaming request to the Gemini API
 *
 * This is a more focused version that removes job management and direct
 * file operations. Those concerns should now be handled by the caller
 * (typically a processor or server action).
 *
 * Uses the Google Generative AI SDK via the streamGeminiContentWithSDK handler.
 *
 * @deprecated For new implementations, prefer using streamGeminiCompletionWithSDK directly
 * as it provides an async generator interface that allows more direct control of
 * the streaming process. This wrapper is maintained for backward compatibility.
 */
export async function sendStreamingRequest(
  promptText: string,
  options: GeminiRequestOptions = {}
): Promise<ActionState<{ finalContent: string; stats: { tokens: number, chars: number, model: string } }>> {
  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { isSuccess: false, message: "Gemini API key not found in environment variables" };
  }
  
  // Load project settings if projectDirectory is provided
  const taskType = options.taskType || 'generic_llm_stream';
  const projectDirectory = options.projectDirectory;
  let taskConfig = null;

  if (projectDirectory && taskType) {
    try {
      const allProjectSettings = await getModelSettingsForProject(projectDirectory);
      taskConfig = allProjectSettings[taskType as keyof TaskSettings];

      if (!taskConfig) {
        console.warn(`[Gemini Streaming] Settings for task type ${taskType} not resolved, falling back to generic_llm_stream defaults.`);
        taskConfig = DEFAULT_TASK_SETTINGS.generic_llm_stream;
      }
    } catch (err) {
      console.warn(`[Gemini Streaming] Failed to load project settings for ${projectDirectory}:`, err);
      taskConfig = DEFAULT_TASK_SETTINGS[taskType as keyof TaskSettings] || DEFAULT_TASK_SETTINGS.generic_llm_stream;
    }
  } else {
    taskConfig = DEFAULT_TASK_SETTINGS.generic_llm_stream;
  }
  
  // Extract options for API request, prioritizing explicit parameters over resolved settings
  const modelId = options.model || taskConfig.model;
  const maxOutputTokens = options.maxOutputTokens || taskConfig.maxTokens;
  const temperature = options.temperature !== undefined ? options.temperature : taskConfig.temperature;
  const topP = options.topP || 0.95;
  const topK = options.topK || 40;
  const streamingUpdates = options.streamingUpdates;
  
  try {
    // Build the Gemini API payload
    const apiPayload: GeminiSdkRequestPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        maxOutputTokens,
        temperature,
        topP,
        topK
      }
    };
    
    // Add system instruction if provided
    if (options.systemPrompt) {
      apiPayload.systemInstruction = {
        parts: [{ text: options.systemPrompt }]
      };
    }
    
    // Map StreamingUpdateCallback to SDK StreamCallbacks
    const streamCallbacks: StreamCallbacks = {
      onData: async (textChunk, tokenCount, totalLength) => {
        if (streamingUpdates?.onUpdate) {
          streamingUpdates.onUpdate(textChunk, { 
            tokens: tokenCount, 
            chars: textChunk.length 
          });
        }
      },
      onComplete: (finalContent, stats) => {
        if (streamingUpdates?.onComplete) {
          streamingUpdates.onComplete(finalContent, { 
            tokens: stats.tokens, 
            chars: stats.chars 
          });
        }
      },
      onError: (error) => {
        if (streamingUpdates?.onError) {
          streamingUpdates.onError(error);
        }
      }
    };
    
    // Call onStart callback if provided
    if (streamingUpdates?.onStart) {
      streamingUpdates.onStart();
    }
    
    // Use the SDK-based stream handler
    const result = await streamGeminiContentWithSDK(
      apiPayload, 
      apiKey, 
      modelId, 
      streamCallbacks, 
      options.signal
    );
    
    // Return success with content and stats
    return {
      isSuccess: true,
      message: "Streaming request completed successfully",
      data: {
        finalContent: result.finalContent,
        stats: {
          tokens: result.stats.tokens,
          chars: result.stats.chars,
          model: modelId
        }
      }
    };
  } catch (error) {
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
    
    console.error(`[Gemini Streaming] Error in streaming request:`, error);
    
    // Return standardized error response
    return {
      isSuccess: false,
      message: errorMessage,
      data: { 
        finalContent: "",
        stats: { tokens: 0, chars: 0, model: modelId }
      },
      metadata: {
        errorType: "SDK_ERROR",
        statusCode: statusCode
      },
      error: error instanceof Error ? error : new Error(errorMessage)
    };
  }
}