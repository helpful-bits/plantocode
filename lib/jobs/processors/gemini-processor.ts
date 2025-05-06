import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { GeminiRequestPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';

/**
 * Processor for Gemini API requests
 */
export class GeminiProcessor implements JobProcessor<GeminiRequestPayload> {
  /**
   * Process a Gemini API request job
   * 
   * @param payload The job payload
   */
  async process(payload: GeminiRequestPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      apiType, 
      promptText, 
      metadata, 
      maxOutputTokens, 
      temperature 
    } = payload;
    
    const model = metadata?.modelUsed || 'gemini-pro';
    
    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, apiType, `Running ${model} request`);
      
      // TODO: Implement the actual API call to Gemini
      // This implementation will be added when refactoring the Gemini client
      
      // For demonstration purposes:
      console.log(`[GeminiProcessor] Processing job ${backgroundJobId} with model ${model}`);
      console.log(`[GeminiProcessor] Prompt: ${promptText.substring(0, 100)}...`);
      
      // TODO: Replace with actual API call to Gemini
      // const response = await actualGeminiApiCall(promptText, model, maxOutputTokens, temperature);
      
      // Simulate API call (Remove in actual implementation)
      await new Promise(resolve => setTimeout(resolve, 1000));
      const mockResponse = `Mock response for: ${promptText.substring(0, 50)}...`;
      
      // Update job to completed
      await updateJobToCompleted(backgroundJobId, mockResponse, {
        tokensSent: promptText.length / 4, // Roughly estimate tokens
        tokensReceived: mockResponse.length / 4, // Roughly estimate tokens
        modelUsed: model,
        maxOutputTokens
      });
      
      // Return success result
      return {
        success: true,
        message: "Successfully processed Gemini API request",
        data: mockResponse
      };
      
    } catch (error) {
      console.error(`[GeminiProcessor] Error processing job ${backgroundJobId}:`, error);
      
      const errorMessage = error instanceof Error 
        ? `${error.name}: ${error.message}` 
        : 'Unknown error during Gemini API request';
      
      await updateJobToFailed(backgroundJobId, errorMessage);
      
      // Return error result
      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage),
        shouldRetry: this.isRetryableError(errorMessage)
      };
    }
  }
  
  /**
   * Determine if an error is retryable
   * 
   * @param errorMessage The error message
   * @returns True if the error is retryable, false otherwise
   */
  private isRetryableError(errorMessage: string): boolean {
    // Check for common retryable error messages
    const retryableErrorPatterns = [
      /timeout/i,
      /rate limit/i,
      /too many requests/i,
      /temporarily unavailable/i,
      /connection/i,
      /network/i
    ];

    return retryableErrorPatterns.some(pattern => pattern.test(errorMessage));
  }
}