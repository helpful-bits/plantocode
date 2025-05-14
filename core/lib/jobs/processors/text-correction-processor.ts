import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { TextCorrectionPostTranscriptionPayload } from '../job-types';
import claudeClient from '@core/lib/api/claude-client';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import { backgroundJobRepository } from '@core/lib/db/repositories';

/**
 * Text Correction Processor
 * 
 * Handles post-transcription text correction jobs by improving the text
 * quality using Claude API
 */
export class TextCorrectionProcessor implements JobProcessor<TextCorrectionPostTranscriptionPayload> {
  async process(payload: TextCorrectionPostTranscriptionPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId,
      textToCorrect,
      language,
      originalTranscriptionJobId
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'claude', 'Correcting transcribed text');

      // Retrieve the original transcription job if provided
      let originalJob = null;
      if (originalTranscriptionJobId) {
        try {
          originalJob = await backgroundJobRepository.getBackgroundJob(originalTranscriptionJobId);
        } catch (error) {
          console.warn(`[TextCorrectionProcessor] Could not find original transcription job: ${originalTranscriptionJobId}`);
          // Continue without the original job
        }
      }

      // Determine the correction approach based on the available data
      let mode = 'general';
      let confidenceScore: number | undefined;
      let speakerCount: number | undefined;
      let originalAudioDuration: number | undefined;

      // Extract metadata from the original job if available
      if (originalJob?.metadata) {
        confidenceScore = originalJob.metadata.confidenceScore;
        speakerCount = originalJob.metadata.speakerCount;
        originalAudioDuration = originalJob.metadata.originalAudioDuration;

        if (originalJob.metadata.isTranscription) {
          mode = 'transcription';
        }
      }

      // Call Claude to correct the transcription
      const result = await claudeClient.correctTaskDescription(
        textToCorrect,
        {
          language,
          sessionId
        }
      );

      if (!result.isSuccess) {
        await updateJobToFailed(
          backgroundJobId, 
          result.message || "Failed to correct transcription"
        );
        
        return {
          success: false,
          message: result.message || "Failed to correct transcription",
          error: result.error
        };
      }

      // Update job to completed
      await updateJobToCompleted(
        backgroundJobId,
        typeof result.data === 'string' ? result.data : '',
        {
          tokensSent: result.metadata?.tokensSent || 0,
          tokensReceived: result.metadata?.tokensReceived || 0,
          totalTokens: result.metadata?.totalTokens || 0,
          modelUsed: result.metadata?.modelUsed,
          maxOutputTokens: result.metadata?.maxOutputTokens
        }
      );

      return {
        success: true,
        message: "Successfully corrected text",
        data: result.data
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during text correction";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[TextCorrectionProcessor] Error updating job status:", updateError);
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
export const PROCESSOR_TYPE = 'TEXT_CORRECTION_POST_TRANSCRIPTION';