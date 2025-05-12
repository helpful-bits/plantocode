"use server";

import { ActionState } from "@/types";
import claudeClient from "@/lib/api/claude-client";
import { createBackgroundJob, updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '@/lib/jobs/job-helpers';
import { ensureSessionRecord } from '@/lib/db/utils/session-db-utils';

/**
 * Action to improve and correct transcribed text using Claude.
 *
 * This action creates a new 'voice_correction' job that is separate from but linked to
 * the original transcription job. This makes the job states clearer and avoids modifying
 * completed jobs.
 */
export async function correctTextAction(
  text: string,
  language: string = "en",
  sessionId: string | null,
  transcriptionJobId: string | null,
  projectDirectory: string
): Promise<ActionState<string>> {
  try {
    // Validate inputs
    if (!text || !text.trim()) {
      return {
        isSuccess: false,
        message: "No text provided for correction.",
        data: text // Return original text on error
      };
    }

    // Validate session ID
    if (!sessionId) {
      return {
        isSuccess: false,
        message: "A valid session ID is required for text correction",
        data: text
      };
    }

    // Ensure we have a valid session
    let dbSafeSessionId: string;
    try {
      dbSafeSessionId = await ensureSessionRecord(sessionId, projectDirectory, 'Text Correction');
    } catch (error) {
      console.error("[TextCorrection] Session validation error:", error);
      return {
        isSuccess: false,
        message: error instanceof Error ? error.message : "Invalid session ID",
        data: text
      };
    }

    // Create a new background job for correction, separate from the transcription job
    const correctionMetadata: Record<string, any> = {
      originalText: text.substring(0, 300) + (text.length > 300 ? '...' : ''),
      language
    };

    // Link to the original transcription job if provided
    if (transcriptionJobId) {
      correctionMetadata.originalTranscriptionJobId = transcriptionJobId;
    }

    // Create a dedicated voice_correction job
    const correctionJob = await createBackgroundJob(
      dbSafeSessionId,
      {
        apiType: "claude",
        taskType: "voice_correction",
        model: "claude-3-opus-20240229", // Use consistent model
        rawInput: `Text correction request for: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`,
        includeSyntax: false,
        temperature: 0.2,
        metadata: correctionMetadata
      },
      projectDirectory
    );

    console.log(`[TextCorrection] Created new correction job: ${correctionJob.id}${transcriptionJobId ? ` linked to transcription job: ${transcriptionJobId}` : ''}`);

    // Update job to running
    await updateJobToRunning(correctionJob.id, 'claude', 'Correcting transcribed text...');

    // Use Claude client to correct and improve the transcribed text
    try {
      const result = await claudeClient.correctTaskDescription(
        text,
        {
          sessionId: dbSafeSessionId,
          language,
          max_tokens: 2048,
          jobId: correctionJob.id // Use our new job ID for Claude client to update
        }
      );

      // Check if result contains a background job
      // (This is only for backward compatibility - in the new approach, we already have our own job)
      if (result.isSuccess && result.metadata?.isBackgroundJob && result.metadata?.jobId) {
        // This case should not happen anymore once Claude client is updated, but handle it just in case
        await updateJobToRunning(
          correctionJob.id,
          'claude',
          `Waiting for Claude correction to complete: ${result.metadata.jobId}`
        );

        return {
          isSuccess: true,
          message: "Text correction is being processed in the background.",
          data: text, // Return original text while waiting
          metadata: {
            isBackgroundJob: true,
            jobId: correctionJob.id,
            claudeJobId: result.metadata.jobId,
            originalTranscriptionJobId: transcriptionJobId
          }
        };
      }

      // If we got an immediate response
      if (result.isSuccess && result.data && typeof result.data === 'string') {
        // Update our correction job to completed with the corrected text
        await updateJobToCompleted(correctionJob.id, result.data);

        return {
          isSuccess: true,
          message: "Text correction completed.",
          data: result.data,
          metadata: {
            ...result.metadata || {},
            jobId: correctionJob.id,
            originalTranscriptionJobId: transcriptionJobId
          }
        };
      }

      // Handle error cases
      if (!result.isSuccess) {
        await updateJobToFailed(
          correctionJob.id,
          result.message || "Correction failed: Unknown Claude API error"
        );

        return {
          isSuccess: false,
          message: result.message || "Failed to correct text",
          data: text, // Return original text on error
          metadata: {
            jobId: correctionJob.id,
            originalTranscriptionJobId: transcriptionJobId
          }
        };
      }

      // Return any other type of result with the correction job ID attached
      return {
        ...result,
        data: typeof result.data === 'string' ? result.data : text,
        metadata: {
          ...result.metadata || {},
          jobId: correctionJob.id,
          originalTranscriptionJobId: transcriptionJobId
        }
      };
    } catch (claudeError) {
      // Handle Claude client errors
      console.error("[TextCorrection] Claude client error:", claudeError);

      // Update job to failed
      await updateJobToFailed(
        correctionJob.id,
        claudeError instanceof Error ? claudeError.message : "Correction failed: Claude client error"
      );

      return {
        isSuccess: false,
        message: claudeError instanceof Error ? claudeError.message : "Error calling Claude API",
        data: text, // Return original text on error
        metadata: {
          jobId: correctionJob.id,
          originalTranscriptionJobId: transcriptionJobId
        }
      };
    }
  } catch (error) {
    console.error("[TextCorrection] Error correcting text:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to correct text",
      data: text // Return original text on error
    };
  }
} 