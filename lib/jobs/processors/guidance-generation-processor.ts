import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { GuidanceGenerationPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import geminiClient from '@/lib/api/clients/gemini';

/**
 * Guidance Generation Processor
 * 
 * Processes jobs that generate guidance for paths or tasks
 */
export class GuidanceGenerationProcessor implements JobProcessor<GuidanceGenerationPayload> {
  async process(payload: GuidanceGenerationPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId, 
      projectDirectory,
      promptText,
      systemPrompt,
      temperature,
      maxOutputTokens,
      model,
      paths
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Generating guidance');

      // Make request to Gemini API
      const result = await geminiClient.sendRequest(promptText, {
        model,
        systemPrompt,
        temperature,
        maxOutputTokens
      });

      if (!result.isSuccess) {
        await updateJobToFailed(
          backgroundJobId, 
          result.message || "Failed to generate guidance"
        );
        
        return {
          success: false,
          message: result.message || "Failed to generate guidance",
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
          modelUsed: result.metadata?.modelUsed || model,
          maxOutputTokens
        }
      );

      return {
        success: true,
        message: "Successfully generated guidance",
        data: result.data
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during guidance generation";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[GuidanceGenerationProcessor] Error updating job status:", updateError);
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
export const PROCESSOR_TYPE = 'GUIDANCE_GENERATION';