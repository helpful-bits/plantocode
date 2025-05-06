import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { VoiceCorrectionPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import claudeClient from '@/lib/api/claude-client';

/**
 * Voice Correction Processor
 * 
 * Processes jobs that correct and format voice-transcribed text
 */
export class VoiceCorrectionProcessor implements JobProcessor<VoiceCorrectionPayload> {
  async process(payload: VoiceCorrectionPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId,
      text,
      language,
      isTranscription,
      confidenceScore,
      speakerCount,
      originalAudioDuration,
      targetField
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'claude', 'Correcting voice transcription');

      // Call Claude API to correct the transcription
      const result = await claudeClient.correctTaskDescription(
        text,
        {
          language: language || 'en',
          sessionId
        }
      );

      if (!result.isSuccess) {
        await updateJobToFailed(
          backgroundJobId, 
          result.message || "Failed to correct voice transcription"
        );
        
        return {
          success: false,
          message: result.message || "Failed to correct voice transcription",
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
        message: "Successfully corrected voice transcription",
        data: result.data
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during voice correction";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[VoiceCorrectionProcessor] Error updating job status:", updateError);
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
export const PROCESSOR_TYPE = 'VOICE_CORRECTION';