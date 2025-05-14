import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { TextImprovementPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import claudeClient from '@core/lib/api/claude-client';

/**
 * Text Improvement Processor
 * 
 * Processes jobs that improve text quality
 */
export class TextImprovementProcessor implements JobProcessor<TextImprovementPayload> {
  async process(payload: TextImprovementPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId,
      text,
      language,
      mode,
      targetField,
      apiType
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'claude', 'Improving text');

      // Call Claude API to improve the text
      const result = await claudeClient.improveText(text, sessionId, {
        preserveFormatting: true,
        max_tokens: 4096
      });

      if (!result.isSuccess) {
        await updateJobToFailed(
          backgroundJobId, 
          result.message || "Failed to improve text"
        );
        
        return {
          success: false,
          message: result.message || "Failed to improve text",
          error: result.error
        };
      }

      // Update job to completed
      await updateJobToCompleted(
        backgroundJobId,
        result.data as string,
        {
          tokensSent: result.metadata?.tokensSent || 0,
          tokensReceived: result.metadata?.tokensReceived || 0,
          totalTokens: result.metadata?.totalTokens || 0,
          modelUsed: result.metadata?.modelUsed
        }
      );

      return {
        success: true,
        message: "Successfully improved text",
        data: result.data
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during text improvement";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[TextImprovementProcessor] Error updating job status:", updateError);
      }

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'TEXT_IMPROVEMENT';