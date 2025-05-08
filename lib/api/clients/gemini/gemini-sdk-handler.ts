import { GoogleGenerativeAI, GenerateContentRequest, GenerationConfig } from '@google/generative-ai';

// Types for the Gemini API
export interface GeminiSdkRequestPayload {
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

// Define a stream callback interface
export interface StreamCallbacks {
  onData?: (textChunk: string, tokenCount: number, totalLength: number) => Promise<void>;
  onComplete?: (totalContent: string, stats: { tokens: number, chars: number, model: string }) => void;
  onError?: (error: Error) => void;
}

/**
 * Converts our custom payload format to the format expected by the Google GenAI SDK
 */
function convertPayloadToSdkFormat(payload: GeminiSdkRequestPayload) {
  const { contents, generationConfig, systemInstruction } = payload;
  
  // The SDK expects a slightly different format for system instructions
  // Our format: systemInstruction.parts[].text
  // SDK format: systemInstruction as a string
  const systemInstructionText = systemInstruction?.parts[0]?.text || '';
  
  return {
    contents,
    generationConfig: generationConfig as GenerationConfig,
    systemInstruction: systemInstructionText
  };
}

/**
 * Stream content from Gemini API using the official Google SDK
 * 
 * @param payload The Gemini API request payload
 * @param apiKey Gemini API key
 * @param modelId Gemini model ID to use
 * @param callbacks Optional callbacks for processing the stream
 * @param abortSignal Optional abort signal to cancel the request
 * @returns A promise that resolves when the stream is complete
 */
export async function streamGeminiContentWithSDK(
  payload: GeminiSdkRequestPayload,
  apiKey: string,
  modelId: string,
  callbacks?: StreamCallbacks,
  abortSignal?: AbortSignal
): Promise<{ finalContent: string; stats: { tokens: number, chars: number, model: string } }> {
  if (!apiKey) {
    throw new Error('API key is required for Gemini API requests');
  }
  
  if (!payload || !payload.contents || payload.contents.length === 0) {
    throw new Error('Valid payload with contents is required for Gemini API requests');
  }
  
  try {
    // Initialize the GenAI client
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Get the model
    const model = genAI.getGenerativeModel({ model: modelId });
    
    // Convert payload to SDK format
    const sdkPayload = convertPayloadToSdkFormat(payload);
    
    // Create request object
    const request = {
      contents: sdkPayload.contents,
      generationConfig: sdkPayload.generationConfig,
      systemInstruction: sdkPayload.systemInstruction,
    };
    
    // Track content and stats
    let aggregatedText = '';
    let tokenCount = 0;
    let totalCharCount = 0;
    
    try {
      // Get the stream - using AbortController via SDK's internal mechanisms
      // Note: The abortSignal parameter isn't directly passed in options
      // but the SDK will still handle cancellation via AbortController
      const result = await model.generateContentStream(request);
      
      // Process the stream
      for await (const chunk of result.stream) {
        // Check if we've been asked to abort
        if (abortSignal?.aborted) {
          break;
        }
        
        const textChunk = chunk.text();
        
        // Skip empty chunks
        if (!textChunk) continue;
        
        // Calculate approximate token count (3-4 chars per token)
        const chunkTokens = Math.ceil(textChunk.length / 3.5);
        tokenCount += chunkTokens;
        totalCharCount += textChunk.length;
        
        // Append to aggregated text
        aggregatedText += textChunk;
        
        // Call onData callback if provided
        if (callbacks?.onData) {
          await callbacks.onData(textChunk, chunkTokens, aggregatedText.length);
        }
      }
      
      // Stream is complete
      const stats = {
        tokens: tokenCount,
        chars: totalCharCount,
        model: modelId
      };
      
      // Call onComplete callback if provided
      if (callbacks?.onComplete) {
        callbacks.onComplete(aggregatedText, stats);
      }
      
      return {
        finalContent: aggregatedText,
        stats
      };
    } catch (error) {
      // Handle stream errors
      if (error instanceof Error) {
        console.error('[Gemini SDK Stream] Error during streaming:', error);
        
        // Call onError callback if provided
        if (callbacks?.onError) {
          callbacks.onError(error);
        }
        
        throw error;
      }
      
      // Rethrow unknown errors
      throw new Error(`Unknown error during streaming: ${String(error)}`);
    }
  } catch (error) {
    // Handle setup errors
    console.error('[Gemini SDK] Error setting up stream:', error);
    
    // Call onError callback if provided
    if (callbacks?.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
    
    throw error;
  }
}

/**
 * Async generator version of streamGeminiContentWithSDK
 * This version yields chunks as they arrive, similar to the original streamGeminiCompletion
 * 
 * @param payload The Gemini API request payload
 * @param apiKey Gemini API key
 * @param modelId Gemini model ID to use
 * @param abortSignal Optional abort signal to cancel the request
 * @param onChunk Optional callback function to process each chunk as it arrives
 * @returns AsyncGenerator yielding text chunks as they arrive
 */
export async function* streamGeminiCompletionWithSDK(
  payload: GeminiSdkRequestPayload,
  apiKey: string,
  modelId: string,
  abortSignal?: AbortSignal,
  onChunk?: (chunk: string, tokenCount: number, totalLength: number) => Promise<void>
): AsyncGenerator<string, void, undefined> {
  if (!apiKey) {
    throw new Error('API key is required for Gemini API requests');
  }
  
  if (!payload || !payload.contents || payload.contents.length === 0) {
    throw new Error('Valid payload with contents is required for Gemini API requests');
  }
  
  try {
    // Initialize the GenAI client
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Get the model
    const model = genAI.getGenerativeModel({ model: modelId });
    
    // Convert payload to SDK format
    const sdkPayload = convertPayloadToSdkFormat(payload);
    
    // Create request object
    const request = {
      contents: sdkPayload.contents,
      generationConfig: sdkPayload.generationConfig,
      systemInstruction: sdkPayload.systemInstruction,
    };
    
    // Track total accumulated text for callbacks
    let totalAccumulatedText = '';
    
    try {
      // Get the stream - using AbortController via SDK's internal mechanisms
      // Note: The abortSignal parameter isn't directly passed in options
      // but the SDK will still handle cancellation via AbortController
      const result = await model.generateContentStream(request);
      
      // Process the stream
      for await (const chunk of result.stream) {
        // Check if we've been asked to abort
        if (abortSignal?.aborted) {
          break;
        }
        
        const textChunk = chunk.text();
        
        // Skip empty chunks
        if (!textChunk) continue;
        
        // Calculate approximate token count (3-4 chars per token)
        const chunkTokens = Math.ceil(textChunk.length / 3.5);
        
        // Update total text
        totalAccumulatedText += textChunk;
        
        // Call onChunk callback if provided
        if (onChunk) {
          await onChunk(textChunk, chunkTokens, totalAccumulatedText.length);
        }
        
        // Yield the chunk
        yield textChunk;
      }
    } catch (error) {
      // Handle stream errors
      console.error('[Gemini SDK Stream] Error during streaming:', error);
      throw error;
    }
  } catch (error) {
    // Handle setup errors
    console.error('[Gemini SDK] Error setting up stream:', error);
    throw error;
  }
}

/**
 * Extract and clean XML content from model output
 * Handles common issues like markdown fences, leading/trailing text, etc.
 * 
 * @param rawContent The raw content from the model
 * @returns Cleaned XML content or null if no valid XML found
 */
export async function extractXmlContent(rawContent: string): Promise<string | null> {
  if (!rawContent) return null;
  
  // 1. First, try to find content between markdown code fences
  const markdownMatch = rawContent.match(/```(?:xml)?([\s\S]*?)```/);
  const contentToProcess = markdownMatch ? markdownMatch[1].trim() : rawContent;
  
  // 2. Look for XML declaration and changes tag
  const xmlDeclMatch = contentToProcess.match(/<\?xml[^>]*\?>/);
  const changesTagMatch = contentToProcess.match(/<changes[^>]*>/);
  
  if (!xmlDeclMatch || !changesTagMatch) {
    // If we don't have both XML declaration and changes tag,
    // try a last resort approach to find anything that looks like XML
    const lastResortMatch = contentToProcess.match(/<\?xml[\s\S]*<\/changes>/);
    if (lastResortMatch) {
      return lastResortMatch[0];
    }
    return null;
  }
  
  // Get the positions of the XML declaration and changes tag
  const xmlDeclPos = contentToProcess.indexOf(xmlDeclMatch[0]);
  const changesOpenPos = contentToProcess.indexOf(changesTagMatch[0]);
  
  // Find the closing changes tag
  const changesClosePos = contentToProcess.lastIndexOf('</changes>');
  
  // If we have all the required parts, extract the XML
  if (xmlDeclPos >= 0 && changesOpenPos >= 0 && changesClosePos >= 0) {
    return contentToProcess.substring(xmlDeclPos, changesClosePos + 10); // 10 = '</changes>'.length
  }
  
  return null;
}