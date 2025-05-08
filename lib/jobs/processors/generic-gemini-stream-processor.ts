import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { GenericGeminiStreamPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import { ActionState } from '@/types';
import { streamGeminiContentWithSDK, GeminiSdkRequestPayload } from '@/lib/api/clients/gemini/gemini-sdk-handler';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';

/**
 * Lazy-load the background job repository to avoid circular dependencies
 */
async function getBackgroundJobRepository() {
  const { backgroundJobRepository } = await import('@/lib/db/repositories/background-job-repository');
  return backgroundJobRepository;
}

/**
 * Generic Gemini Stream Processor
 * 
 * Handles general LLM streaming requests using the Gemini API without
 * application-specific concerns like file writing or transformation.
 */
export class GenericGeminiStreamProcessor implements JobProcessor<GenericGeminiStreamPayload> {
  async process(payload: GenericGeminiStreamPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId, 
      promptText,
      systemPrompt,
      model,
      temperature,
      maxOutputTokens,
      topP,
      topK,
      metadata
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Preparing Gemini API request');

      // Get API key from environment
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API key not found in environment variables");
      }

      // Get the background job repository
      const backgroundJobRepo = await getBackgroundJobRepository();

      // Update job status right before starting the request
      await updateJobToRunning(backgroundJobId, 'gemini', 'Sending request to Gemini API');
      
      // Create an AbortController for timeout/cancellation
      const abortController = new AbortController();
      
      // Build Gemini API payload
      const apiPayload: GeminiSdkRequestPayload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }]
          }
        ],
        generationConfig: {
          maxOutputTokens: maxOutputTokens || 60000,
          temperature: temperature || 0.7,
          topP: topP || 0.95,
          topK: topK || 40,
        }
      };
      
      // Add system instruction if provided
      if (systemPrompt) {
        apiPayload.systemInstruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      // Track aggregated response
      let aggregatedText = '';
      let tokenCount = 0;
      let charCount = 0;
      
      try {
        // Call the SDK-based streaming utility with callbacks to update the job in the database
        const result = await streamGeminiContentWithSDK(
          apiPayload,
          apiKey,
          model || GEMINI_FLASH_MODEL,
          {
            onData: async (content, tokens, totalLength) => {
              try {
                // Update the job in the database with the new chunk
                await backgroundJobRepo.appendToJobResponse(
                  backgroundJobId,
                  content,
                  tokens,
                  totalLength // Total length including this chunk
                );
                
                // Update our running counts
                aggregatedText += content;
                tokenCount += tokens;
                charCount += content.length;
              } catch (error) {
                console.error(`[GenericGeminiStreamProcessor] Error updating job with chunk:`, error);
                // Continue processing even if database update fails
              }
            },
            onComplete: (finalContent, stats) => {
              // The final content is provided here, but we also track it ourselves
              // in case there are any issues with the callback
              aggregatedText = finalContent;
              tokenCount = stats.tokens;
              charCount = stats.chars;
            },
            onError: (error) => {
              console.error(`[GenericGeminiStreamProcessor] Stream error:`, error);
              // We handle the error after the await below
            }
          },
          abortController.signal
        );
        
        // Update final aggregated text and stats from the result if needed
        if (result.finalContent && !aggregatedText) {
          aggregatedText = result.finalContent;
          tokenCount = result.stats.tokens;
          charCount = result.stats.chars;
        }
        
        // Mark job as completed with the aggregated text as response
        await updateJobToCompleted(backgroundJobId, aggregatedText, {
          tokensReceived: tokenCount,
          modelUsed: model,
          maxOutputTokens: maxOutputTokens
          // Don't include targetField as it's not in the JobToCompleted types
          // charsReceived will be updated in the background job repo metadata
        });
        
        return {
          success: true,
          message: "Successfully completed Gemini stream",
          data: {
            response: aggregatedText,
            tokens: tokenCount,
            chars: charCount
          }
        };
      } catch (error) {
        // Log the error
        console.error(`[GenericGeminiStreamProcessor] Gemini API request failed:`, error);
        
        // Update job status to failed
        await updateJobToFailed(
          backgroundJobId, 
          error instanceof Error ? error.message : String(error)
        );
        
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to process Gemini stream",
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
    } catch (error) {
      // Handle setup errors that occurred before starting the stream
      console.error(`[GenericGeminiStreamProcessor] Setup error:`, error);
      
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during Gemini stream setup";
      
      // Update job status to failed
      await updateJobToFailed(backgroundJobId, errorMessage);
      
      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'GENERIC_GEMINI_STREAM';